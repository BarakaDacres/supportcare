import { useMemo, useState, useEffect, useRef } from 'react';

// ── Haptic feedback ──────────────────────────────────────────────────────────
// Strategy:
//   1. iOS Capacitor / WKWebView: webkit.messageHandlers.hapticFeedback
//   2. Android & Chrome PWA: navigator.vibrate (requires user-gesture context)
//   3. Web fallback: tiny silent AudioContext click (perceived as "feel" on some devices)
function haptic(style: 'light' | 'medium' | 'selection' = 'light') {
  try {
    // 1. Native iOS WKWebView bridge
    const win = window as unknown as {
      webkit?: { messageHandlers?: { hapticFeedback?: { postMessage: (s: string) => void } } };
      DeviceMotionEvent?: { requestPermission?: () => Promise<string> };
    };
    if (win.webkit?.messageHandlers?.hapticFeedback) {
      win.webkit.messageHandlers.hapticFeedback.postMessage(style);
      return;
    }
    // 2. Vibration API (Android Chrome, some PWA contexts)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      const ms = style === 'medium' ? 18 : style === 'selection' ? 3 : 8;
      navigator.vibrate(ms);
      return;
    }
    // 3. Silent AudioContext micro-click — gives tactile feel on some hardware
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.002);
      ctx.close();
    }
  } catch { /* ignore */ }
}
export { haptic };
import {
  TrendingUp, Clock, Moon, CalendarDays, Zap, Target,
  ChevronLeft, ChevronRight, Users, FileText, ArrowUpRight, ArrowDownRight, X, Sunset,
} from 'lucide-react';
import { formatCurrency } from '@/lib/formatUtils';
import type { Shift } from '@/hooks/useShifts';
import { effectiveGrossPay } from '@/hooks/useShifts';
import type { Client } from '@/hooks/useClients';
import type { UserSettings } from '@/hooks/useUserSettings';
import { MONTH_NAMES, MONTH_SHORT } from '@/lib/dateUtils';
import { shiftHasEveningHours, getDayOfWeek } from '@/lib/shiftCalculator';

interface Invoice {
  id: string;
  status: string;
  total_amount: number;
  invoice_number: string;
}

interface OverviewPanelProps {
  shifts: Shift[];
  clients: Client[];
  invoices: Invoice[];
  settings: UserSettings | null;
  selectedYear: number;
  selectedMonth: number;
  onYearChange: (y: number) => void;
  onMonthChange: (m: number) => void;
  locked?: boolean;
}

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(t: string): string {
  return t.slice(0, 5);
}

// ── Count-up animation hook ──────────────────────────────────────────────────
function useCountUp(target: number, duration = 600, deps: unknown[] = []) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const startValRef = useRef(0);

  useEffect(() => {
    startValRef.current = 0;
    startRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    const animate = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(startValRef.current + (target - startValRef.current) * eased);
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
      else setValue(target);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration, ...deps]);

  return value;
}

// ── Animated currency display ─────────────────────────────────────────────────
const AnimatedCurrency = ({
  value,
  className,
  style,
  deps = [],
}: {
  value: number;
  className?: string;
  style?: React.CSSProperties;
  deps?: unknown[];
}) => {
  const animated = useCountUp(value, 620, deps);
  return (
    <span className={className} style={style}>
      {formatCurrency(animated)}
    </span>
  );
};

// ── Smooth sparkline with gradient fill + draw-on animation ──────────────────
const Sparkline = ({
  data,
  width = 200,
  height = 44,
  id = 'spark',
}: {
  data: number[];
  width?: number;
  height?: number;
  id?: string;
}) => {
  const lineRef = useRef<SVGPathElement>(null);
  const fillRef = useRef<SVGPathElement>(null);
  const dotsRef = useRef<SVGGElement>(null);
  const labelRef = useRef<SVGTextElement>(null);
  // Re-run animation whenever data identity changes (month/year switch)
  const dataKey = data.join(',');

  useEffect(() => {
    const line = lineRef.current;
    if (!line) return;
    const len = line.getTotalLength();
    // Start fully hidden
    line.style.strokeDasharray = `${len}`;
    line.style.strokeDashoffset = `${len}`;
    line.style.transition = 'none';
    // Fill starts transparent
    if (fillRef.current) {
      fillRef.current.style.opacity = '0';
      fillRef.current.style.transition = 'none';
    }
    // Dots + labels start invisible
    if (dotsRef.current) {
      dotsRef.current.style.opacity = '0';
      dotsRef.current.style.transition = 'none';
    }
    if (labelRef.current) {
      labelRef.current.style.opacity = '0';
      labelRef.current.style.transition = 'none';
    }

    // Force reflow, then animate
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        line.style.transition = 'stroke-dashoffset 680ms cubic-bezier(0.4,0,0.2,1)';
        line.style.strokeDashoffset = '0';
        if (fillRef.current) {
          fillRef.current.style.transition = 'opacity 500ms ease 300ms';
          fillRef.current.style.opacity = '1';
        }
        if (dotsRef.current) {
          dotsRef.current.style.transition = 'opacity 300ms ease 500ms';
          dotsRef.current.style.opacity = '1';
        }
        if (labelRef.current) {
          labelRef.current.style.transition = 'opacity 300ms ease 600ms';
          labelRef.current.style.opacity = '1';
        }
      });
    });
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  if (!data || data.length < 2) return null;

  const max = Math.max(...data, 1);
  const padX = 4;
  const padTop = 6;
  const padBottom = 16;
  const w = width - padX * 2;
  const h = height - padTop - padBottom;

  const pts = data.map((v, i) => ({
    x: padX + (i / (data.length - 1)) * w,
    y: padTop + h - (v / max) * h,
    v,
  }));

  // Build smooth cubic bezier path
  const linePath = pts.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    const prev = pts[i - 1];
    const cpX = (prev.x + p.x) / 2;
    return `${acc} C ${cpX.toFixed(2)} ${prev.y.toFixed(2)}, ${cpX.toFixed(2)} ${p.y.toFixed(2)}, ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }, '');

  const fillPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(2)} ${(padTop + h).toFixed(2)} L ${pts[0].x.toFixed(2)} ${(padTop + h).toFixed(2)} Z`;

  const last = pts[pts.length - 1];
  const gradId = `sg-${id}`;
  const weekLabels = ['W1', 'W2', 'W3', 'W4', 'W5'].slice(0, data.length);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {/* Filled area — fades in after line draws */}
      <path ref={fillRef} d={fillPath} fill={`url(#${gradId})`} style={{ opacity: 0 }} />

      {/* Smooth line — draws left to right */}
      <path
        ref={lineRef}
        d={linePath}
        stroke="#3B82F6"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.7"
      />

      {/* Dots + week labels — pop in after line */}
      <g ref={dotsRef} style={{ opacity: 0 }}>
        {pts.map((p, i) => {
          const isLast = i === pts.length - 1;
          const isEmpty = p.v === 0;
          return (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={isLast ? 2.5 : 1.8}
                fill={isEmpty ? '#93C5FD' : '#3B82F6'}
                opacity={isEmpty ? 0.3 : isLast ? 1 : 0.55}
              />
              <text
                x={p.x}
                y={padTop + h + 11}
                textAnchor="middle"
                fontSize="7"
                fill="#3B82F6"
                opacity="0.45"
                fontFamily="system-ui, -apple-system, sans-serif"
                fontWeight="600"
                letterSpacing="0.3"
              >
                {weekLabels[i]}
              </text>
            </g>
          );
        })}
      </g>

      {/* Last point value callout — appears last */}
      {last.v > 0 && (
        <text
          ref={labelRef}
          x={last.x}
          y={last.y - 5}
          textAnchor={last.x > width * 0.75 ? 'end' : 'middle'}
          fontSize="7.5"
          fill="#3B82F6"
          opacity="0.8"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="700"
          style={{ opacity: 0 }}
        >
          ${last.v >= 1000 ? `${(last.v / 1000).toFixed(1)}k` : last.v.toFixed(0)}
        </text>
      )}
    </svg>
  );
};

// ── Compact day popup (anchored inline) ──────────────────────────────────────
const DayPopup = ({
  dateStr, shifts, onClose,
}: {
  dateStr: string;
  shifts: Shift[];
  onClose: () => void;
}) => {
  const dayShifts = useMemo(() => shifts.filter(s => s.date === dateStr), [dateStr, shifts]);
  const total = dayShifts.reduce((s, sh) => s + effectiveGrossPay(sh), 0);

  const label = useMemo(() => {
    const d = parseDate(dateStr);
    return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
  }, [dateStr]);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'hsl(var(--card))',
        border: '0.5px solid hsl(var(--border))',
        boxShadow:
          '0 2px 12px hsl(var(--foreground)/0.07),' +
          '0 1px 3px hsl(var(--foreground)/0.04)',
        width: '100%',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3.5 py-2.5"
        style={{ borderBottom: '0.5px solid hsl(var(--border))' }}
      >
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">{label}</p>
          {dayShifts.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {dayShifts.length} shift{dayShifts.length !== 1 ? 's' : ''}{' '}
              <span className="opacity-40 mx-0.5">·</span>
              <span className="font-semibold money-text">{formatCurrency(total)}</span>
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="w-5 h-5 flex items-center justify-center rounded-full shrink-0 ml-2"
          style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
        >
          <X className="w-2.5 h-2.5" />
        </button>
      </div>

      {/* Shift rows */}
      <div className="py-1 px-3.5 max-h-52 overflow-y-auto">
        {dayShifts.length === 0 ? (
          <p className="text-[10px] text-muted-foreground py-3 text-center">No shifts recorded.</p>
        ) : (
          dayShifts.map(s => {
            const hasEvening = shiftHasEveningHours(s.start_time, s.end_time);
            return (
              <div
                key={s.id}
                className="py-2.5"
                style={{ borderBottom: '0.5px solid hsl(var(--border)/0.35)' }}
              >
                {/* Row 1: time + amount — primary info, slightly bolder */}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-foreground tracking-tight">
                    {formatTime(s.start_time)} – {formatTime(s.end_time)}
                  </p>
                  <span className="text-[11px] font-bold money-text shrink-0">
                    {formatCurrency(effectiveGrossPay(s))}
                  </span>
                </div>
                {/* Row 2: client name — dimmer secondary */}
                {s.client_name && (
                  <p className="text-[10px] mt-1" style={{ color: 'hsl(var(--muted-foreground)/0.75)' }}>
                    {s.client_name}
                  </p>
                )}
                {/* Row 3: type pills — softer, less "button-like" */}
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  {s.is_sleepover && (
                    <span
                      className="text-[9px] font-medium px-1.5 py-0.5 rounded-md whitespace-nowrap"
                      style={{
                        background: 'hsl(var(--sleepover-color)/0.12)',
                        color: 'hsl(var(--sleepover-color))',
                      }}
                    >
                      Sleepover
                    </span>
                  )}
                  {s.is_public_holiday && (
                    <span
                      className="text-[9px] font-medium px-1.5 py-0.5 rounded-md whitespace-nowrap"
                      style={{ background: 'hsl(var(--stat-amber)/0.12)', color: 'hsl(var(--stat-amber))' }}
                    >
                      Public Holiday
                    </span>
                  )}
                  {!s.is_sleepover && hasEvening && (
                    <span
                      className="text-[9px] font-medium px-1.5 py-0.5 rounded-md whitespace-nowrap"
                      style={{ background: 'hsl(var(--evening-color)/0.12)', color: 'hsl(var(--evening-color))' }}
                    >
                      Evening
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

// ── Elevated card wrapper ─────────────────────────────────────────────────────
const ElevatedCard = ({
  children,
  className = '',
  hero = false,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  hero?: boolean;
  style?: React.CSSProperties;
}) => (
  <div
    className={`${hero ? 'card-hero' : 'card-elevated'} ${className}`}
    style={{ padding: '20px 20px', ...style }}
  >
    {children}
  </div>
);

// ── Month navigator ──────────────────────────────────────────────────────────
const MonthNavigator = ({
  year, month, onYearChange, onMonthChange,
  monthGross, monthShifts, monthHours,
  mode, locked, onModeChange,
}: {
  year: number; month: number;
  onYearChange: (y: number) => void;
  onMonthChange: (m: number) => void;
  monthGross: number;
  monthShifts: number;
  monthHours: number;
  mode?: EntryMode;
  locked?: boolean;
  onModeChange?: (mode: EntryMode) => void;
}) => {
  const prev = () => {
    haptic('light');
    if (month === 0) { onYearChange(year - 1); onMonthChange(11); }
    else onMonthChange(month - 1);
  };
  const next = () => {
    haptic('light');
    if (month === 11) { onYearChange(year + 1); onMonthChange(0); }
    else onMonthChange(month + 1);
  };

  const touchStartX = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 48) { haptic('light'); dx < 0 ? next() : prev(); }
    touchStartX.current = null;
  };

  return (
    <div
      className="card-elevated overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex items-center justify-between px-3 py-3.5">
        <button
          onClick={prev}
          className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-secondary"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4 text-foreground" />
        </button>
        <div className="text-center">
          {/* Month + year + lock status inline */}
          <div className="flex items-center justify-center gap-1.5">
            <span className="text-base font-bold text-foreground tracking-tight">
              {MONTH_NAMES[month]} {year}
            </span>
            {locked !== undefined && (
              <span
                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{
                  background: locked
                    ? 'hsl(var(--destructive)/0.10)'
                    : 'hsl(var(--stat-green)/0.12)',
                  color: locked
                    ? 'hsl(var(--destructive))'
                    : 'hsl(var(--stat-green))',
                }}
              >
                {locked ? 'Locked' : 'Open'}
              </span>
            )}
          </div>
          {(monthGross > 0 || monthShifts > 0) && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              <span className="font-bold money-text">{formatCurrency(monthGross)}</span>
              <span className="mx-1 opacity-40">·</span>
              <span>{monthShifts} shift{monthShifts !== 1 ? 's' : ''}</span>
              <span className="mx-1 opacity-40">·</span>
              <span>{monthHours.toFixed(0)}h</span>
            </p>
          )}
          {/* Week / Month segmented toggle — desktop only (mobile handled in header) */}
          {onModeChange && mode && (
            <div
              className="hidden md:flex items-center mx-auto mt-2 rounded-[9px] p-[3px] gap-[2px]"
              style={{
                background: 'hsl(var(--secondary))',
                border: '0.5px solid hsl(var(--border))',
                width: 'fit-content',
              }}
            >
              {(['weekly', 'fortnightly'] as EntryMode[]).map((m) => {
                const label = m === 'weekly' ? 'Week' : 'Month';
                const isActive = mode === m;
                return (
                  <button
                    key={m}
                    onClick={() => onModeChange(m)}
                    className="px-3 py-0.5 rounded-[6px] text-[10px] font-semibold transition-all duration-150"
                    style={{
                      background: isActive ? 'hsl(var(--card))' : 'transparent',
                      color: isActive ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                      boxShadow: isActive ? '0 1px 3px hsl(var(--foreground)/0.08)' : 'none',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button
          onClick={next}
          className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-secondary"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4 text-foreground" />
        </button>
      </div>
    </div>
  );
};

// ── Interactive Earnings Calendar with inline tile popup ─────────────────────
const EarningsCalendarHeatmap = ({
  shifts, year, month,
}: {
  shifts: Shift[];
  year: number;
  month: number;
}) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [popupPos, setPopupPos] = useState<{ row: number; col: number } | null>(null);

  const grossByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of shifts) {
      const d = parseDate(s.date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        map[s.date] = (map[s.date] ?? 0) + effectiveGrossPay(s);
      }
    }
    return map;
  }, [shifts, year, month]);

  const shiftsByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of shifts) {
      const d = parseDate(s.date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        map[s.date] = (map[s.date] ?? 0) + 1;
      }
    }
    return map;
  }, [shifts, year, month]);

  const maxGross = Math.max(...Object.values(grossByDate), 1);

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();
  const offsetDays = startDow === 0 ? 6 : startDow - 1;
  const totalCells = offsetDays + lastDay.getDate();
  const rows = Math.ceil(totalCells / 7);
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const handleDayClick = (dateStr: string, cellIndex: number) => {
    haptic('selection');
    if (selectedDate === dateStr) {
      setSelectedDate(null);
      setPopupPos(null);
      return;
    }
    const rowIdx = Math.floor(cellIndex / 7);
    const colIdx = cellIndex % 7;
    setSelectedDate(dateStr);
    setPopupPos({ row: rowIdx, col: colIdx });
  };

  // 5-level blue heatmap scale (slightly desaturated at top end)
  const BLUE_SCALE = ['#EEF4FF', '#DCE9FF', '#B9D3FF', '#7FB0FF', '#5B9BF8'];

  const getHeatColor = (intensity: number): string => {
    if (intensity <= 0) return '';
    if (intensity < 0.2) return BLUE_SCALE[0];
    if (intensity < 0.4) return BLUE_SCALE[1];
    if (intensity < 0.6) return BLUE_SCALE[2];
    if (intensity < 0.8) return BLUE_SCALE[3];
    return BLUE_SCALE[4];
  };

  // Adaptive dot: light cells → medium blue, dark cells → white
  const getDotColor = (intensity: number): string => {
    if (intensity < 0.4) return '#93C0FF';
    if (intensity < 0.7) return '#3B82F6';
    return 'rgba(255,255,255,0.8)';
  };

  // Text color that stays readable on any heat level
  const getDayTextColor = (intensity: number, isSelected: boolean): string => {
    if (isSelected) return '#1E40AF';
    if (intensity >= 0.8) return '#1e3a5f';
    if (intensity >= 0.5) return '#1D4ED8';
    if (intensity >= 0.2) return '#2563EB';
    return 'hsl(var(--foreground))';
  };

  return (
    <div className="card-elevated" style={{ padding: '16px 14px 14px' }}>
      {/* Header — legend baseline-aligned with title */}
      <div className="flex items-center justify-between mb-3" style={{ lineHeight: 1 }}>
        <p className="section-label" style={{ lineHeight: 1 }}>Earnings Calendar</p>
        {/* Legend — tighter, lower opacity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
          <span style={{ fontSize: 8, color: 'hsl(var(--muted-foreground))', opacity: 0.5, lineHeight: 1 }}>Low</span>
          {BLUE_SCALE.map((color, i) => (
            <div key={i} style={{ width: 6, height: 6, borderRadius: 1.5, flexShrink: 0, background: color, opacity: 0.85 }} />
          ))}
          <span style={{ fontSize: 8, color: 'hsl(var(--muted-foreground))', opacity: 0.5, lineHeight: 1 }}>High</span>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1.5">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center" style={{ fontSize: 8, fontWeight: 600, color: 'hsl(var(--muted-foreground))', opacity: 0.7 }}>
            {d}
          </div>
        ))}
      </div>

      {/* Grid + inline popup rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => {
        const showPopupAfterRow =
          selectedDate !== null &&
          popupPos !== null &&
          popupPos.row === rowIdx;

        return (
          <div key={rowIdx}>
            {/* Row of 7 tiles */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {Array.from({ length: 7 }).map((_, colIdx) => {
                const cellIndex = rowIdx * 7 + colIdx;
                const dayNum = cellIndex - offsetDays + 1;

                if (dayNum < 1 || dayNum > lastDay.getDate()) {
                  return (
                    <div
                      key={colIdx}
                      style={{
                        aspectRatio: '1',
                        borderRadius: 8,
                        background: 'hsl(var(--muted)/0.12)',
                      }}
                    />
                  );
                }

                const dateStr = formatDateISO(new Date(year, month, dayNum));
                const gross = grossByDate[dateStr] ?? 0;
                const count = shiftsByDate[dateStr] ?? 0;
                const intensity = gross > 0 ? Math.max(0.18, gross / maxGross) : 0;
                const isToday =
                  today.getFullYear() === year &&
                  today.getMonth() === month &&
                  today.getDate() === dayNum;
                const isSelected = selectedDate === dateStr;

                return (
                  <button
                    key={colIdx}
                    onClick={() => handleDayClick(dateStr, cellIndex)}
                    aria-label={`${dayNum} ${MONTH_NAMES[month]}, ${gross > 0 ? formatCurrency(gross) : 'no shifts'}`}
                    style={{
                      aspectRatio: '1',
                      borderRadius: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 2,
                      position: 'relative',
                      transition: 'transform 0.15s cubic-bezier(0.25,0,0.1,1), background 0.15s ease, box-shadow 0.15s ease',
                      background: isSelected
                        ? '#DCE9FF'
                        : gross > 0
                        ? getHeatColor(intensity)
                        : 'hsl(var(--muted) / 0.35)',
                      border: isSelected
                        ? '1px solid #3B82F6'
                        : isToday && !isSelected
                        ? '1px solid hsl(var(--primary) / 0.4)'
                        : '1px solid transparent',
                      boxShadow: isSelected ? '0 1px 4px rgba(59,130,246,0.10)' : 'none',
                      cursor: 'pointer',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                    onPointerDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.9)'; }}
                    onPointerUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
                    onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
                  >
                    {/* Today indicator — small dot above number */}
                    {isToday && !isSelected && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 3,
                          width: 3,
                          height: 3,
                          borderRadius: '50%',
                          background: 'hsl(var(--primary))',
                          opacity: 0.7,
                        }}
                      />
                    )}
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 500,
                        lineHeight: 1,
                        color: getDayTextColor(intensity, isSelected),
                        fontFamily: '-apple-system, "SF Pro Text", system-ui, sans-serif',
                      }}
                    >
                      {dayNum}
                    </span>
                    {count > 0 && (
                      <span
                        style={{
                          width: 3.5,
                          height: 3.5,
                          borderRadius: '50%',
                          background: getDotColor(intensity),
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Inline popup anchored below the row — fade + scale in */}
            {showPopupAfterRow && selectedDate && (
              <div
                style={{
                  marginBottom: 6,
                  animation: 'popupIn 0.18s cubic-bezier(0.25,0,0.1,1)',
                }}
              >
                <DayPopup
                  dateStr={selectedDate}
                  shifts={shifts}
                  onClose={() => { setSelectedDate(null); setPopupPos(null); }}
                />
              </div>
            )}
          </div>
        );
      })}

      <style>{`
        @keyframes popupIn {
          from { opacity: 0; transform: translateY(-4px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
};

// ── Main OverviewPanel ────────────────────────────────────────────────────────
const OverviewPanel = ({
  shifts, clients, invoices, settings,
  selectedYear, selectedMonth, onYearChange, onMonthChange,
  mode, locked, onModeChange,
}: OverviewPanelProps) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Day popup is now handled inline inside EarningsCalendarHeatmap

  const stats = useMemo(() => {
    const weekStart = getMondayOf(today);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const thisWeekShifts = shifts.filter(s => {
      const d = parseDate(s.date);
      return d >= weekStart && d <= weekEnd;
    });

    const thisMonthShifts = shifts.filter(s => {
      const d = parseDate(s.date);
      return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    });

    const prevMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
    const prevYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
    const prevMonthShifts = shifts.filter(s => {
      const d = parseDate(s.date);
      return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
    });

    const thisYearShifts = shifts.filter(s => parseDate(s.date).getFullYear() === selectedYear);

    const gross = (arr: Shift[]) => arr.reduce((s, sh) => s + effectiveGrossPay(sh), 0);
    const hours = (arr: Shift[]) =>
      arr.filter(s => !s.is_sleepover).reduce((s, sh) => s + Number(sh.hours_worked), 0);

    // ── Weekly earnings breakdown by category (with hours) ──
    const weekBreakdown = (() => {
      let regularDay = 0,  regularDayH = 0;
      let evening = 0,     eveningH = 0;
      let satDay = 0,      satDayH = 0;
      let sunDay = 0,      sunDayH = 0;
      let weekdaySleepover = 0, weekdaySleepoverN = 0;
      let weekendSleepover = 0, weekendSleepoverN = 0;
      let publicHoliday = 0,    publicHolidayH = 0;

      for (const s of thisWeekShifts) {
        const pay = effectiveGrossPay(s);
        const h = Number(s.hours_worked);
        const dow = getDayOfWeek(s.date);

        if (s.is_public_holiday && !s.is_sleepover) {
          publicHoliday += pay; publicHolidayH += h; continue;
        }
        if (s.is_sleepover) {
          // weekend = Saturday (6) or Sunday (0)
          if (dow === 6 || dow === 0) { weekendSleepover += pay; weekendSleepoverN += 1; }
          else { weekdaySleepover += pay; weekdaySleepoverN += 1; }
          continue;
        }
        if (dow === 6) { satDay += pay; satDayH += h; continue; }
        if (dow === 0) { sunDay += pay; sunDayH += h; continue; }
        // weekday: check if purely evening shift
        const hasEvening = shiftHasEveningHours(s.start_time, s.end_time);
        const [startH] = s.start_time.split(':').map(Number);
        const [endH]   = s.end_time.split(':').map(Number);
        const purelyEvening = startH >= 18 && (endH <= 22 || endH < startH);
        if (hasEvening && purelyEvening) { evening += pay; eveningH += h; }
        else { regularDay += pay; regularDayH += h; }
      }
      return {
        regularDay, regularDayH,
        evening,    eveningH,
        satDay,     satDayH,
        sunDay,     sunDayH,
        weekdaySleepover, weekdaySleepoverN,
        weekendSleepover, weekendSleepoverN,
        publicHoliday,    publicHolidayH,
      };
    })();

    const byMonth = Array.from({ length: 12 }, (_, m) => {
      const ms = thisYearShifts.filter(s => parseDate(s.date).getMonth() === m);
      return { month: m, gross: gross(ms) };
    });
    const maxMonth = Math.max(...byMonth.map(b => b.gross), 1);

    const completedMonths = Math.max(1,
      selectedYear < today.getFullYear()
        ? 12
        : selectedYear > today.getFullYear()
        ? 1
        : today.getMonth() + 1
    );
    const projected = (gross(thisYearShifts) / completedMonths) * 12;

    // Use the actual current wall-clock time for accurate shift state detection
    const now = new Date();

    // Helper: build start/end datetimes for a shift
    const shiftWindow = (s: Shift) => {
      const [startH, startM] = s.start_time.split(':').map(Number);
      const [endH, endM] = s.end_time.split(':').map(Number);
      const [sy, sm, sd] = s.date.split('-').map(Number);
      const shiftStart = new Date(sy, sm - 1, sd, startH, startM, 0, 0);
      const endDayOffset = s.is_sleepover || endH < startH || (endH === startH && endM < startM) ? 1 : 0;
      const shiftEnd = new Date(sy, sm - 1, sd + endDayOffset, endH, endM, 0, 0);
      return { shiftStart, shiftEnd };
    };

    // Active shift: currently in progress right now
    const activeShift = shifts.find(s => {
      const { shiftStart, shiftEnd } = shiftWindow(s);
      return now >= shiftStart && now < shiftEnd;
    }) ?? null;

    // Next upcoming shift: starts in the future (already ended ones excluded)
    const futureShifts = shifts
      .filter(s => {
        const { shiftEnd } = shiftWindow(s);
        return shiftEnd > now;
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.start_time.localeCompare(b.start_time);
      });
    // nextShift should not be the same as the activeShift
    const nextShift = futureShifts.find(s => s.id !== activeShift?.id) ?? null;

    const clientGrossMap: Record<string, { name: string; gross: number; count: number }> = {};
    for (const s of thisMonthShifts) {
      if (!s.client_id || !s.client_name) continue;
      if (!clientGrossMap[s.client_id]) {
        clientGrossMap[s.client_id] = { name: s.client_name, gross: 0, count: 0 };
      }
      clientGrossMap[s.client_id].gross += effectiveGrossPay(s);
      clientGrossMap[s.client_id].count += 1;
    }
    const topClientEntry = Object.values(clientGrossMap).sort((a, b) => b.gross - a.gross)[0] ?? null;

    return {
      weekGross: gross(thisWeekShifts),
      weekHours: hours(thisWeekShifts),
      weekShiftCount: thisWeekShifts.length,
      weekSleepovers: thisWeekShifts.filter(s => s.is_sleepover).length,
      weekBreakdown,
      monthGross: gross(thisMonthShifts),
      monthHours: hours(thisMonthShifts),
      monthShiftCount: thisMonthShifts.length,
      prevMonthGross: gross(prevMonthShifts),
      prevMonth,
      yearGross: gross(thisYearShifts),
      projected,
      byMonth,
      maxMonth,
      activeShift,
      nextShift,
      topClient: topClientEntry,
      weeklySparkline: (() => {
        // Build calendar weeks for selected month and sum gross per week
        const firstDay = new Date(selectedYear, selectedMonth, 1);
        const lastDay = new Date(selectedYear, selectedMonth + 1, 0);
        // Find Monday on or before first of month
        const mondayOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
        const weekStart = new Date(firstDay);
        weekStart.setDate(weekStart.getDate() - mondayOffset);

        const weeks: number[] = [];
        const cursor = new Date(weekStart);
        while (cursor <= lastDay) {
          const wEnd = new Date(cursor);
          wEnd.setDate(wEnd.getDate() + 6);
          const weekGross = thisMonthShifts
            .filter(s => {
              const d = parseDate(s.date);
              return d >= cursor && d <= wEnd;
            })
            .reduce((sum, s) => sum + effectiveGrossPay(s), 0);
          weeks.push(weekGross);
          cursor.setDate(cursor.getDate() + 7);
        }
        return weeks;
      })(),
    };
  }, [shifts, selectedMonth, selectedYear]); // eslint-disable-line react-hooks/exhaustive-deps

  const unpaidStats = useMemo(() => {
    const unpaid = invoices.filter(inv => inv.status !== 'paid');
    return {
      count: unpaid.length,
      total: unpaid.reduce((s, inv) => s + Number(inv.total_amount), 0),
    };
  }, [invoices]);

  const weeklyGoal = settings?.weekly_goal ?? null;
  const monthlyGoal = settings?.monthly_goal ?? null;
  const yearlyGoal = settings?.yearly_goal ?? null;

  const weekGoalPct = weeklyGoal && weeklyGoal > 0
    ? Math.min(100, (stats.weekGross / weeklyGoal) * 100)
    : null;
  const goalPct = monthlyGoal && monthlyGoal > 0
    ? Math.min(100, (stats.monthGross / monthlyGoal) * 100)
    : null;
  const yearGoalPct = yearlyGoal && yearlyGoal > 0
    ? Math.min(100, (stats.yearGross / yearlyGoal) * 100)
    : null;

  const monthGrowthPct = stats.prevMonthGross > 0
    ? ((stats.monthGross - stats.prevMonthGross) / stats.prevMonthGross) * 100
    : null;
  const monthGrowthUp = monthGrowthPct !== null && monthGrowthPct >= 0;

  // Build a formatted shift info object from any shift
  const buildShiftInfo = (s: Shift) => {
    const d = parseDate(s.date);
    const dow = d.toLocaleDateString('en-AU', { weekday: 'short' });
    const dayNum = d.getDate();
    const mon = MONTH_SHORT[d.getMonth()];
    const dateLabel = `${dow} ${dayNum} ${mon}`;
    const timeLabel = `${formatTime(s.start_time)} – ${formatTime(s.end_time)}`;
    const isEvening = !s.is_sleepover && !s.is_public_holiday && shiftHasEveningHours(s.start_time, s.end_time);
    const typeLabel = s.is_sleepover
      ? 'Sleepover'
      : s.is_public_holiday
      ? 'Public Holiday'
      : isEvening
      ? 'Evening Shift'
      : s.client_name ?? 'Support Shift';
    return { dateLabel, timeLabel, typeLabel, isSleepover: s.is_sleepover, isEvening, isPublicHoliday: s.is_public_holiday };
  };

  const activeShiftInfo = useMemo(
    () => stats.activeShift ? buildShiftInfo(stats.activeShift) : null,
    [stats.activeShift], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const nextShiftInfo = useMemo(
    () => stats.nextShift ? buildShiftInfo(stats.nextShift) : null,
    [stats.nextShift], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Use month+year as animation deps so numbers animate on navigation
  const animDeps = [selectedMonth, selectedYear];

  return (
    <div className="space-y-4">

      {/* ──────────────────────────────────────────
          LAYER 3 — Dashboard context bar (Month selector)
          ────────────────────────────────────────── */}
      <MonthNavigator
        year={selectedYear}
        month={selectedMonth}
        onYearChange={onYearChange}
        onMonthChange={onMonthChange}
        monthGross={stats.monthGross}
        monthShifts={stats.monthShiftCount}
        monthHours={stats.monthHours}
        mode={mode}
        locked={locked}
        onModeChange={onModeChange}
      />

      {/* ── Weekly Earnings card (most prominent) ── */}
      <ElevatedCard hero>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" /> This Week
          </p>
          <span className="text-[10px] text-muted-foreground">Mon–Sun</span>
        </div>
        <div className="mb-4">
          <AnimatedCurrency
            value={stats.weekGross}
            className="text-4xl font-bold money-text leading-none tracking-tight"
            deps={animDeps}
          />
          <p className="text-xs text-muted-foreground mt-1.5">weekly gross</p>
        </div>
        <div
          className="grid grid-cols-3 gap-3 pt-4"
          style={{ borderTop: '0.5px solid hsl(var(--border))' }}
        >
          <div className="text-center">
            <Clock className="w-4 h-4 mx-auto mb-1" style={{ color: 'hsl(var(--muted-foreground))' }} />
            <p className="text-sm font-bold text-foreground">{stats.weekHours.toFixed(1)}h</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Hours</p>
          </div>
          <div className="text-center">
            <Zap className="w-4 h-4 mx-auto mb-1" style={{ color: 'hsl(var(--muted-foreground))' }} />
            <p className="text-sm font-bold text-foreground">{stats.weekShiftCount}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Shifts</p>
          </div>
          <div className="text-center">
            <Moon className="w-4 h-4 mx-auto mb-1" style={{ color: 'hsl(var(--muted-foreground))' }} />
            <p className="text-sm font-bold text-foreground">{stats.weekSleepovers}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Sleepovers</p>
          </div>
        </div>

        {/* ── Weekly earnings breakdown by category ── */}
        {stats.weekGross > 0 && (() => {
          const wb = stats.weekBreakdown;
          type BreakdownRow = { label: string; value: number; meta: string; color: string };
          const rows: BreakdownRow[] = [];
          if (wb.regularDay > 0)
            rows.push({ label: 'Weekday Day',        value: wb.regularDay,        meta: `${wb.regularDayH.toFixed(1)}h`,          color: 'hsl(var(--money-green))' });
          if (wb.evening > 0)
            rows.push({ label: 'Evening',            value: wb.evening,           meta: `${wb.eveningH.toFixed(1)}h`,              color: 'hsl(38 90% 45%)' });
          if (wb.satDay > 0)
            rows.push({ label: 'Saturday Day',       value: wb.satDay,            meta: `${wb.satDayH.toFixed(1)}h`,               color: 'hsl(var(--primary))' });
          if (wb.sunDay > 0)
            rows.push({ label: 'Sunday Day',         value: wb.sunDay,            meta: `${wb.sunDayH.toFixed(1)}h`,               color: 'hsl(271 91% 65%)' });
          if (wb.weekdaySleepover > 0)
            rows.push({ label: 'Weekday Sleepover',  value: wb.weekdaySleepover,  meta: `${wb.weekdaySleepoverN} night${wb.weekdaySleepoverN !== 1 ? 's' : ''}`, color: '#2563EB' });
          if (wb.weekendSleepover > 0)
            rows.push({ label: 'Weekend Sleepover',  value: wb.weekendSleepover,  meta: `${wb.weekendSleepoverN} night${wb.weekendSleepoverN !== 1 ? 's' : ''}`, color: '#7C3AED' });
          if (wb.publicHoliday > 0)
            rows.push({ label: 'Public Holiday',     value: wb.publicHoliday,     meta: `${wb.publicHolidayH.toFixed(1)}h`,         color: 'hsl(34 97% 48%)' });
          if (rows.length <= 1) return null;
          return (
            <div className="mt-4 pt-4 space-y-1.5" style={{ borderTop: '0.5px solid hsl(var(--border))' }}>
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Income Breakdown</p>
              {rows.map(row => (
                <div key={row.label} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: row.color }} />
                    <span className="text-xs text-muted-foreground truncate">{row.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-muted-foreground/70">{row.meta}</span>
                    <span className="text-xs font-semibold text-foreground">{formatCurrency(row.value)}</span>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ── Active Now / Next Shift — refined iOS-style status card ── */}
        {(activeShiftInfo || nextShiftInfo) && (() => {
          const info = activeShiftInfo ?? nextShiftInfo!;
          const isActive = !!activeShiftInfo;

          // Progress bar calculation for active shifts
          let progressPct = 0;
          if (isActive && stats.activeShift) {
            const s = stats.activeShift;
            const [startH, startM] = s.start_time.split(':').map(Number);
            const [endH, endM] = s.end_time.split(':').map(Number);
            const [sy, sm, sd] = s.date.split('-').map(Number);
            const shiftStart = new Date(sy, sm - 1, sd, startH, startM, 0, 0);
            const endDayOffset = s.is_sleepover || endH < startH ? 1 : 0;
            const shiftEnd = new Date(sy, sm - 1, sd + endDayOffset, endH, endM, 0, 0);
            const now = new Date();
            const total = shiftEnd.getTime() - shiftStart.getTime();
            const elapsed = now.getTime() - shiftStart.getTime();
            progressPct = Math.min(100, Math.max(0, (elapsed / total) * 100));
          }

          // Background and border colors
          const bgColor = isActive
            ? 'hsl(var(--stat-green)/0.06)'
            : info.isEvening
            ? 'hsl(38 90% 52% / 0.06)'
            : info.isPublicHoliday
            ? 'hsl(34 97% 52% / 0.06)'
            : 'hsl(var(--primary)/0.05)';

          const borderColor = isActive
            ? 'hsl(var(--stat-green)/0.18)'
            : info.isEvening
            ? 'hsl(38 90% 52% / 0.2)'
            : info.isPublicHoliday
            ? 'hsl(34 97% 52% / 0.2)'
            : 'hsl(var(--primary)/0.16)';

          // Progress bar color
          const progressColor = isActive
            ? 'hsl(var(--stat-green))'
            : info.isEvening
            ? 'hsl(38 90% 48%)'
            : 'hsl(var(--primary))';

          // Type tag colors — softer, label-style
          const tagStyle: React.CSSProperties = info.isSleepover ? {
            background: 'hsl(221 83% 53% / 0.12)',
            color: 'hsl(221 83% 48%)',
          } : info.isPublicHoliday ? {
            background: 'hsl(34 97% 52% / 0.12)',
            color: 'hsl(34 90% 40%)',
          } : info.isEvening ? {
            background: 'hsl(38 90% 52% / 0.12)',
            color: 'hsl(38 90% 38%)',
          } : isActive ? {
            background: 'hsl(var(--stat-green)/0.12)',
            color: 'hsl(var(--stat-green))',
          } : {
            background: 'hsl(var(--primary)/0.10)',
            color: 'hsl(var(--primary))',
          };

          return (
            <div className="pt-4 mt-1" style={{ borderTop: '0.5px solid hsl(var(--border))' }}>
              {/* Status label row with pulsing dot */}
              <div className="flex items-center gap-1.5 mb-3">
                {/* Pulsing dot */}
                <span
                  style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: isActive ? 'hsl(var(--stat-green))' : 'hsl(var(--muted-foreground))',
                    opacity: isActive ? 1 : 0.5,
                    animation: isActive ? 'shiftDotPulse 1.8s ease-in-out infinite' : 'none',
                    flexShrink: 0,
                  }}
                />
                <span
                  className="text-[9px] font-semibold uppercase tracking-widest"
                  style={{ color: isActive ? 'hsl(var(--stat-green))' : 'hsl(var(--muted-foreground))' }}
                >
                  {isActive ? 'In Progress' : 'Next Shift'}
                </span>
              </div>

              {/* The card itself */}
              <button
                className="w-full text-left overflow-hidden"
                style={{
                  borderRadius: 'var(--radius)',
                  background: bgColor,
                  border: `0.5px solid ${borderColor}`,
                  WebkitTapHighlightColor: 'transparent',
                  transition: 'transform 120ms ease-out, box-shadow 120ms ease-out',
                }}
                onPointerDown={e => {
                  haptic('light');
                  const el = e.currentTarget;
                  el.style.transform = 'scale(0.98)';
                  el.style.boxShadow = '0 4px 12px hsl(var(--foreground)/0.06)';
                }}
                onPointerUp={e => {
                  const el = e.currentTarget;
                  el.style.transform = '';
                  el.style.boxShadow = '';
                }}
                onPointerLeave={e => {
                  const el = e.currentTarget;
                  el.style.transform = '';
                  el.style.boxShadow = '';
                }}
              >
                {/* Card content */}
                <div className="px-4 pt-3.5 pb-3.5 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    {/* Date — medium/semibold, primary info */}
                    <p className="text-sm font-semibold text-foreground leading-snug tracking-tight">
                      {info.dateLabel}
                    </p>
                    {/* Time — regular weight, slightly muted */}
                    <p className="text-xs font-normal leading-snug" style={{ color: 'hsl(var(--muted-foreground)/0.8)' }}>
                      {info.timeLabel}
                    </p>
                    {/* Client name if available */}
                    {(isActive ? stats.activeShift?.client_name : stats.nextShift?.client_name) && (
                      <p className="text-[10px] font-normal" style={{ color: 'hsl(var(--muted-foreground)/0.55)' }}>
                        {isActive ? stats.activeShift?.client_name : stats.nextShift?.client_name}
                      </p>
                    )}
                  </div>

                  {/* Type tag — label-style, not button-like */}
                  <span
                    className="shrink-0 text-[10px] font-medium rounded-md"
                    style={{
                      ...tagStyle,
                      padding: '3px 8px',
                      letterSpacing: '0.01em',
                    }}
                  >
                    {info.typeLabel}
                  </span>
                </div>

                {/* Progress bar — active shifts only, 2px height at bottom */}
                {isActive && (
                  <div
                    style={{
                      height: 2,
                      background: 'hsl(var(--border)/0.5)',
                      borderRadius: 0,
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${progressPct}%`,
                        background: progressColor,
                        borderRadius: 0,
                        transition: 'width 1s linear',
                        opacity: 0.7,
                      }}
                    />
                  </div>
                )}
              </button>
            </div>
          );
        })()}
        {!activeShiftInfo && !nextShiftInfo && (
          <div className="pt-4 mt-1" style={{ borderTop: '0.5px solid hsl(var(--border))' }}>
            <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Next Shift</p>
            <p className="text-xs text-muted-foreground">No upcoming shifts scheduled.</p>
          </div>
        )}
        <style>{`
          @keyframes shiftDotPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.35; }
          }
        `}</style>
      </ElevatedCard>

      {/* ── Month summary card ── */}
      <ElevatedCard style={{ padding: '16px 18px 12px' }}>
        {/* Top row: label + trend badge */}
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            {MONTH_SHORT[selectedMonth]} Gross
          </p>
          {monthGrowthPct !== null && (
            <div className="flex items-center gap-0.5">
              {monthGrowthUp
                ? <ArrowUpRight className="w-3 h-3 shrink-0" style={{ color: 'hsl(var(--stat-green))' }} />
                : <ArrowDownRight className="w-3 h-3 shrink-0" style={{ color: 'hsl(var(--stat-red))' }} />
              }
              <span
                className="text-[10px] font-semibold"
                style={{ color: monthGrowthUp ? 'hsl(var(--stat-green))' : 'hsl(var(--stat-red))' }}
              >
                {Math.abs(monthGrowthPct).toFixed(0)}% vs {MONTH_SHORT[stats.prevMonth]}
              </span>
            </div>
          )}
        </div>

        {/* Amount + meta */}
        <AnimatedCurrency
          value={stats.monthGross}
          className="text-xl font-bold money-text leading-tight"
          deps={animDeps}
        />
        <p className="text-[10px] text-muted-foreground mt-0.5 mb-3">
          {stats.monthShiftCount} shifts · {stats.monthHours.toFixed(0)}h
        </p>

        {/* Full-width sparkline */}
        {stats.weeklySparkline.some(v => v > 0) && (
          <div style={{ margin: '0 -2px' }}>
            <Sparkline
              data={stats.weeklySparkline}
              width={340}
              height={52}
              id={`month-${selectedYear}-${selectedMonth}`}
            />
          </div>
        )}
      </ElevatedCard>

      {/* ── Tax Estimate card (shown only when enabled) ── */}
      {settings?.show_tax_estimate && settings.tax_rate > 0 && (
        <ElevatedCard style={{ padding: '16px 18px' }}>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Target className="w-3 h-3" /> Monthly Tax Estimate ({settings.tax_rate}%)
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Gross</p>
              <p className="text-sm font-bold money-text">{formatCurrency(stats.monthGross)}</p>
            </div>
            <div>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Est. Tax</p>
              <p className="text-sm font-bold" style={{ color: 'hsl(var(--stat-red))' }}>
                − {formatCurrency(stats.monthGross * (settings.tax_rate / 100))}
              </p>
            </div>
            <div>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Take-Home</p>
              <p className="text-sm font-bold text-foreground">
                {formatCurrency(stats.monthGross * (1 - settings.tax_rate / 100))}
              </p>
            </div>
          </div>
        </ElevatedCard>
      )}

      {/* ── Top client + Unpaid invoices row ── */}
      <div className="grid grid-cols-2 gap-3">
        {stats.topClient ? (
          <ElevatedCard style={{ padding: '16px 18px' }}>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1">
              <Users className="w-3 h-3" /> Top Client
            </p>
            <p className="text-sm font-bold text-foreground leading-tight truncate">{stats.topClient.name}</p>
            <p className="text-sm font-bold money-text mt-0.5">{formatCurrency(stats.topClient.gross)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {stats.topClient.count} shift{stats.topClient.count !== 1 ? 's' : ''} this month
            </p>
          </ElevatedCard>
        ) : clients.length > 0 ? (
          <ElevatedCard style={{ padding: '16px 18px' }}>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1">
              <Users className="w-3 h-3" /> Top Client
            </p>
            <p className="text-xs text-muted-foreground">No client shifts this month.</p>
          </ElevatedCard>
        ) : null}

        {invoices.length > 0 && (
          <ElevatedCard
            style={{ padding: '16px 18px' }}
            className={!stats.topClient && clients.length === 0 ? 'col-span-2' : ''}
          >
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1">
              <FileText className="w-3 h-3" /> Invoices
            </p>
            {unpaidStats.count > 0 ? (
              <>
                <p className="text-sm font-bold money-text">{formatCurrency(unpaidStats.total)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{unpaidStats.count} unpaid pending</p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-foreground">All paid</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} total
                </p>
              </>
            )}
          </ElevatedCard>
        )}
      </div>

      {/* ── Income Goals progress ── */}
      {(weekGoalPct !== null || goalPct !== null || yearGoalPct !== null) && (
        <ElevatedCard>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-3">
            <Target className="w-3.5 h-3.5" /> Income Goals
          </p>
          <div className="space-y-4">
            {weekGoalPct !== null && weeklyGoal && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Weekly</span>
                  <span className="text-xs font-bold money-text">
                    {formatCurrency(stats.weekGross)} / {formatCurrency(weeklyGoal)}
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted))' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${weekGoalPct.toFixed(1)}%`, background: 'hsl(var(--money-green))' }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground text-right">
                  {weekGoalPct.toFixed(0)}%
                  {weekGoalPct >= 100 ? ' · Goal reached! 🎉' : ` · ${formatCurrency(weeklyGoal - stats.weekGross)} to go`}
                </p>
              </div>
            )}
            {goalPct !== null && monthlyGoal && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Monthly</span>
                  <span className="text-xs font-bold money-text">
                    {formatCurrency(stats.monthGross)} / {formatCurrency(monthlyGoal)}
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted))' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${goalPct.toFixed(1)}%`, background: 'hsl(var(--money-green))' }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground text-right">
                  {goalPct.toFixed(0)}%
                  {goalPct >= 100 ? ' · Goal reached! 🎉' : ` · ${formatCurrency(monthlyGoal - stats.monthGross)} to go`}
                </p>
              </div>
            )}
            {yearGoalPct !== null && yearlyGoal && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Yearly</span>
                  <span className="text-xs font-bold money-text">
                    {formatCurrency(stats.yearGross)} / {formatCurrency(yearlyGoal)}
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted))' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${yearGoalPct.toFixed(1)}%`, background: 'hsl(var(--money-green))' }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground text-right">
                  {yearGoalPct.toFixed(0)}%
                  {yearGoalPct >= 100 ? ' · Goal reached! 🎉' : ` · ${formatCurrency(yearlyGoal - stats.yearGross)} to go`}
                </p>
              </div>
            )}
          </div>
        </ElevatedCard>
      )}


      <EarningsCalendarHeatmap
        shifts={shifts}
        year={selectedYear}
        month={selectedMonth}
      />


    </div>
  );
};

export default OverviewPanel;
