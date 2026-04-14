import { useMemo, useState, useEffect, useRef } from 'react';
import { calculateShiftPay, type PayRates, DEFAULT_RATES } from '@/lib/shiftCalculator';

// ── Haptic feedback ──────────────────────────────────────────────────────────
// Strategy:
//   1. iOS Capacitor / WKWebView: webkit.messageHandlers.hapticFeedback
//   2. Android & Chrome PWA: navigator.vibrate (requires user-gesture context)
//   3. Web fallback: tiny silent AudioContext click (perceived as "feel" on some devices)
function haptic(style: 'light' | 'medium' | 'selection' = 'light') {
  try {
    // Check if haptics are disabled in preferences
    if (localStorage.getItem('pref_haptics') === 'false') return;

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
  displayName?: string | null;
  onAddShiftForDate?: (prefillDate: string) => void;
  onDuplicateShift?: (shiftId: string) => void;
  onAddFromTemplate?: (prefillDate: string) => void;
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
  height = 64,
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
  // Re-run animation whenever data identity changes (month/year switch)
  const dataKey = data.join(',');

  useEffect(() => {
    const line = lineRef.current;
    if (!line) return;
    const len = line.getTotalLength();
    line.style.strokeDasharray = `${len}`;
    line.style.strokeDashoffset = `${len}`;
    line.style.transition = 'none';
    if (fillRef.current) {
      fillRef.current.style.opacity = '0';
      fillRef.current.style.transition = 'none';
    }
    if (dotsRef.current) {
      dotsRef.current.style.opacity = '0';
      dotsRef.current.style.transition = 'none';
    }

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
      });
    });
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  if (!data || data.length < 2) return null;

  const max = Math.max(...data, 1);
  const padX = 8;
  const padTop = 22;   // extra room above dots for $$ labels
  const padBottom = 6;  // tight bottom — no W-labels inside SVG
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

      {/* Filled area */}
      <path ref={fillRef} d={fillPath} fill={`url(#${gradId})`} style={{ opacity: 0 }} />

      {/* Line */}
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

      {/* Dots + $$ labels above + W-labels below — pop in after line */}
      <g ref={dotsRef} style={{ opacity: 0 }}>
        {pts.map((p, i) => {
          const isLast = i === pts.length - 1;
          const isEmpty = p.v === 0;
          const valLabel = p.v >= 1000
            ? `$${(p.v / 1000).toFixed(1)}k`
            : p.v > 0
            ? `$${p.v.toFixed(0)}`
            : '';
          // Clamp label x so it doesn't bleed off edges
          const labelX = Math.max(padX + 2, Math.min(width - padX - 2, p.x));
          const labelAnchor = p.x < padX + 10 ? 'start' : p.x > width - padX - 10 ? 'end' : 'middle';

          return (
            <g key={i}>
              {/* $$ label above dot */}
              {valLabel && (
                <text
                  x={labelX}
                  y={p.y - 5}
                  textAnchor={labelAnchor}
                  fontSize={isLast ? '7.5' : '6.5'}
                  fill="#3B82F6"
                  opacity={isLast ? '0.9' : '0.6'}
                  fontFamily="system-ui, -apple-system, sans-serif"
                  fontWeight={isLast ? '700' : '600'}
                  style={{
                    animation: `sparkLabelRise 0.4s cubic-bezier(0.34,1.56,0.64,1) ${300 + i * 60}ms both`,
                  }}
                >
                  {valLabel}
                </text>
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={isLast ? 2.5 : 1.8}
                fill={isEmpty ? '#93C5FD' : '#3B82F6'}
                opacity={isEmpty ? 0.3 : isLast ? 1 : 0.55}
              />
            </g>
          );
        })}
      </g>

      <style>{`
        @keyframes sparkLabelRise {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </svg>
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

// ── Shift type dot color ──────────────────────────────────────────────────────
function shiftDotColor(s: Shift): string {
  if (s.is_public_holiday) return 'hsl(var(--stat-amber))';
  if (s.is_sleepover) return 'hsl(var(--sleepover-color))';
  if (shiftHasEveningHours(s.start_time, s.end_time)) return 'hsl(var(--evening-color))';
  return 'hsl(var(--primary))';
}

function shiftTypeLabel(s: Shift): { label: string; bg: string; fg: string; border: string } {
  if (s.is_public_holiday) return { label: 'Public Holiday', bg: 'hsl(var(--stat-amber)/0.12)', fg: 'hsl(var(--stat-amber))', border: 'hsl(var(--stat-amber)/0.2)' };
  if (s.is_sleepover) return { label: 'Sleepover', bg: 'hsl(var(--sleepover-color)/0.12)', fg: 'hsl(var(--sleepover-color))', border: 'hsl(var(--sleepover-color)/0.2)' };
  if (shiftHasEveningHours(s.start_time, s.end_time)) return { label: 'Evening', bg: 'hsl(var(--evening-color)/0.12)', fg: 'hsl(var(--evening-color))', border: 'hsl(var(--evening-color)/0.2)' };
  return { label: 'Day', bg: 'hsl(var(--muted))', fg: 'hsl(var(--muted-foreground))', border: 'hsl(var(--border))' };
}

// ── Split-layout Calendar ────────────────────────────────────────────────────
const EarningsCalendarHeatmap = ({
  shifts, year, month,
  onAddShift,
  onDuplicateShift,
  onAddFromTemplate,
}: {
  shifts: Shift[];
  year: number;
  month: number;
  onAddShift?: (prefillDate: string) => void;
  onDuplicateShift?: (shiftId: string) => void;
  onAddFromTemplate?: (prefillDate: string) => void;
}) => {
  const now = new Date();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayStr = formatDateISO(todayDate);

  // Selected date state — smart defaults on month change
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [animKey, setAnimKey] = useState(0);

  // On month/year change, pick the best default day
  useEffect(() => {
    const isCurrentMonth = year === todayDate.getFullYear() && month === todayDate.getMonth();
    if (isCurrentMonth) {
      setSelectedDate(todayStr);
    } else {
      // Find first day with shifts, otherwise 1st of month
      const firstShiftDay = shifts
        .filter(s => {
          const d = parseDate(s.date);
          return d.getFullYear() === year && d.getMonth() === month;
        })
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      setSelectedDate(firstShiftDay?.date ?? formatDateISO(new Date(year, month, 1)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  // Index shifts by date for this month
  const shiftsByDate = useMemo(() => {
    const map: Record<string, Shift[]> = {};
    for (const s of shifts) {
      const d = parseDate(s.date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        if (!map[s.date]) map[s.date] = [];
        map[s.date].push(s);
      }
    }
    // Sort each day's shifts by start_time
    for (const key in map) map[key].sort((a, b) => a.start_time.localeCompare(b.start_time));
    return map;
  }, [shifts, year, month]);

  // Calendar grid math
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();
  const offsetDays = startDow === 0 ? 6 : startDow - 1; // Monday-start
  const totalCells = offsetDays + lastDay.getDate();
  const rows = Math.ceil(totalCells / 7);
  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const handleDayClick = (dateStr: string) => {
    haptic('selection');
    setSelectedDate(dateStr);
    setAnimKey(k => k + 1);
  };

  // Selected day data — always derived from current shifts
  const dayShifts = shiftsByDate[selectedDate] ?? [];
  const dayTotal = dayShifts.reduce((s, sh) => s + effectiveGrossPay(sh), 0);
  const dayHours = dayShifts.filter(s => !s.is_sleepover).reduce((s, sh) => s + Number(sh.hours_worked), 0);
  const daySleepoverCount = dayShifts.filter(s => s.is_sleepover).length;
  const selectedDateObj = parseDate(selectedDate);

  // Active shift detection — real current time
  const [currentTime, setCurrentTime] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 30_000); // update every 30s
    return () => clearInterval(timer);
  }, []);

  const isShiftActive = (s: Shift): boolean => {
    if (s.date !== todayStr) return false;
    const nowDate = new Date(currentTime);
    const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();
    const startMin = timeToMin(s.start_time);
    let endMin = timeToMin(s.end_time);
    if (endMin <= startMin) endMin += 1440; // overnight
    const adjustedNow = nowMin < startMin && endMin > 1440 ? nowMin + 1440 : nowMin;
    return adjustedNow >= startMin && adjustedNow < endMin;
  };

  const shiftProgress = (s: Shift): number => {
    if (!isShiftActive(s)) return 0;
    const nowDate = new Date(currentTime);
    const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();
    const startMin = timeToMin(s.start_time);
    let endMin = timeToMin(s.end_time);
    if (endMin <= startMin) endMin += 1440;
    const adjustedNow = nowMin < startMin ? nowMin + 1440 : nowMin;
    return Math.min(Math.max((adjustedNow - startMin) / (endMin - startMin), 0), 1);
  };

  // Last shift for duplicate action
  const lastShift = dayShifts.length > 0 ? dayShifts[dayShifts.length - 1] : null;

  // ── Detail Panel ──
  const detailPanel = (
    <div
      key={`${selectedDate}-${animKey}`}
      style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        animation: 'calPanelIn 0.22s cubic-bezier(0.25,0.1,0.25,1)',
      }}
    >
      {/* ── Day Summary Header ── */}
      <div style={{ marginBottom: 14, flexShrink: 0 }}>
        <p style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
          textTransform: 'uppercase', color: 'hsl(var(--muted-foreground))',
          opacity: 0.6, marginBottom: 2,
        }}>
          {selectedDateObj.toLocaleDateString('en-AU', { weekday: 'long' })}
        </p>
        <p style={{
          fontSize: 20, fontWeight: 700, color: 'hsl(var(--foreground))',
          lineHeight: 1.15, letterSpacing: '-0.01em',
        }}>
          {selectedDateObj.getDate()} {selectedDateObj.toLocaleDateString('en-AU', { month: 'short' })}
        </p>
        {dayShifts.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <span className="money-text" style={{ fontSize: 15, fontWeight: 700 }}>
              {formatCurrency(dayTotal)}
            </span>
            <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>
              {dayShifts.length} shift{dayShifts.length !== 1 ? 's' : ''}
            </span>
            {dayHours > 0 && (
              <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>
                {dayHours.toFixed(1)}h
              </span>
            )}
            {daySleepoverCount > 0 && (
              <span style={{ fontSize: 10, color: 'hsl(var(--sleepover-color))' }}>
                {daySleepoverCount} sleepover{daySleepoverCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Shift List ── */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {dayShifts.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '28px 8px', opacity: 0.5,
          }}>
            <CalendarDays className="w-5 h-5 mb-2" style={{ color: 'hsl(var(--muted-foreground))' }} />
            <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', textAlign: 'center' }}>
              No shifts for this day
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {dayShifts.map((s, idx) => {
              const type = shiftTypeLabel(s);
              const active = isShiftActive(s);
              const progress = shiftProgress(s);

              return (
                <div key={s.id}>
                  {idx > 0 && (
                    <div style={{
                      height: 1, margin: '0 4px',
                      background: 'hsl(var(--border)/0.2)',
                    }} />
                  )}
                  <div
                    style={{
                      display: 'flex', alignItems: 'stretch', gap: 10,
                      padding: '10px 6px',
                      position: 'relative',
                      animation: `calItemSlide 0.2s cubic-bezier(0.25,0.1,0.25,1) ${idx * 35}ms both`,
                      borderRadius: 8,
                      background: active ? 'hsl(var(--stat-green)/0.06)' : 'transparent',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    {/* Left accent bar */}
                    <div style={{
                      width: 3, borderRadius: 2, flexShrink: 0,
                      background: shiftDotColor(s), opacity: 0.8,
                      alignSelf: 'stretch', minHeight: 28,
                    }} />

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                          {formatTime(s.start_time)} – {formatTime(s.end_time)}
                          {!s.is_sleepover && s.hours_worked > 0 && (
                            <span style={{
                              color: 'hsl(var(--muted-foreground))',
                              fontWeight: 400, marginLeft: 4, fontSize: 10,
                            }}>
                              {Number(s.hours_worked).toFixed(1)}h
                            </span>
                          )}
                        </span>
                        <span className="money-text" style={{ fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                          {formatCurrency(effectiveGrossPay(s))}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        {s.client_name && (
                          <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>
                            {s.client_name}
                          </span>
                        )}
                        <span style={{
                          fontSize: 8, fontWeight: 600, padding: '1.5px 5px', borderRadius: 5,
                          background: type.bg, color: type.fg,
                          border: `1px solid ${type.border}`,
                          lineHeight: '14px',
                        }}>
                          {type.label}
                        </span>
                        {active && (
                          <span style={{
                            fontSize: 8, fontWeight: 700, padding: '1.5px 5px', borderRadius: 5,
                            background: 'hsl(var(--stat-green)/0.15)',
                            color: 'hsl(var(--stat-green))',
                            lineHeight: '14px',
                            display: 'flex', alignItems: 'center', gap: 3,
                          }}>
                            <span style={{
                              width: 5, height: 5, borderRadius: '50%',
                              background: 'hsl(var(--stat-green))',
                              animation: 'calPulse 1.5s ease-in-out infinite',
                            }} />
                            Active
                          </span>
                        )}
                      </div>

                      {/* Active shift progress bar */}
                      {active && (
                        <div style={{
                          marginTop: 6, height: 3, borderRadius: 2,
                          background: 'hsl(var(--muted)/0.3)', overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%', borderRadius: 2,
                            background: 'hsl(var(--stat-green))',
                            width: `${(progress * 100).toFixed(1)}%`,
                            transition: 'width 1s ease',
                          }} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Quick Actions — Modern inline row ── */}
      {(onAddShift || onDuplicateShift || onAddFromTemplate) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexShrink: 0, paddingTop: 12,
          borderTop: '1px solid hsl(var(--border)/0.08)',
        }}>
          {onAddShift && (
            <button
              onClick={() => { haptic('light'); onAddShift(selectedDate); }}
              className="active:scale-[0.96]"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                fontSize: 12, fontWeight: 600, padding: '9px 16px',
                borderRadius: 22, border: 'none', cursor: 'pointer',
                background: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
                boxShadow: '0 2px 8px hsl(var(--primary)/0.3)',
                transition: 'transform 0.15s cubic-bezier(0.22,1,0.36,1), box-shadow 0.15s',
                letterSpacing: '-0.01em',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>+</span>
              New Shift
            </button>
          )}
          {onAddFromTemplate && (
            <button
              onClick={() => { haptic('light'); onAddFromTemplate(selectedDate); }}
              className="active:scale-[0.96]"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                fontSize: 12, fontWeight: 600, padding: '9px 14px',
                borderRadius: 22, border: '1px solid hsl(var(--primary)/0.2)',
                cursor: 'pointer',
                background: 'hsl(var(--primary)/0.06)',
                color: 'hsl(var(--primary))',
                transition: 'transform 0.15s cubic-bezier(0.22,1,0.36,1), background 0.15s',
                letterSpacing: '-0.01em',
                whiteSpace: 'nowrap',
              }}
            >
              Template
            </button>
          )}
          {onDuplicateShift && lastShift && (
            <button
              onClick={() => { haptic('selection'); onDuplicateShift(lastShift.id); }}
              className="active:scale-[0.96]"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 500, padding: '9px 14px',
                borderRadius: 22, border: 'none', cursor: 'pointer',
                background: 'hsl(var(--muted)/0.3)',
                color: 'hsl(var(--muted-foreground)/0.8)',
                transition: 'transform 0.15s cubic-bezier(0.22,1,0.36,1), background 0.15s',
                letterSpacing: '-0.01em',
                whiteSpace: 'nowrap',
              }}
            >
              Duplicate
            </button>
          )}
        </div>
      )}
    </div>
  );

  // ── Calendar Grid ──
  const calendarGrid = (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-7" style={{ gap: 2, marginBottom: 4 }}>
        {DAY_LABELS.map((d, i) => (
          <div key={i} style={{
            textAlign: 'center', fontSize: 9, fontWeight: 600,
            color: 'hsl(var(--muted-foreground))', opacity: 0.4,
            padding: '2px 0',
          }}>
            {d}
          </div>
        ))}
      </div>

      {/* Grid rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="grid grid-cols-7" style={{ gap: 2, marginBottom: 2 }}>
          {Array.from({ length: 7 }).map((_, colIdx) => {
            const cellIndex = rowIdx * 7 + colIdx;
            const dayNum = cellIndex - offsetDays + 1;

            if (dayNum < 1 || dayNum > lastDay.getDate()) {
              return <div key={colIdx} style={{ aspectRatio: '1' }} />;
            }

            const dateStr = formatDateISO(new Date(year, month, dayNum));
            const dayData = shiftsByDate[dateStr];
            const hasShifts = !!dayData && dayData.length > 0;
            const isToday = dateStr === todayStr;
            const isSelected = selectedDate === dateStr;

            // Unique shift type colors as dots (max 3)
            const dots = hasShifts
              ? [...new Set(dayData.map(s => shiftDotColor(s)))].slice(0, 3)
              : [];

            return (
              <button
                key={colIdx}
                onClick={() => handleDayClick(dateStr)}
                style={{
                  width: '100%',
                  aspectRatio: '1',
                  borderRadius: '50%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                  position: 'relative',
                  transition: 'all 0.15s cubic-bezier(0.25,0.1,0.25,1)',
                  transform: isSelected ? 'scale(1.08)' : 'scale(1)',
                  background: isSelected
                    ? 'hsl(var(--primary))'
                    : 'transparent',
                  boxShadow: isSelected
                    ? '0 2px 8px hsl(var(--primary)/0.3)'
                    : isToday
                    ? 'inset 0 0 0 1.5px hsl(var(--primary)/0.3)'
                    : 'none',
                  cursor: 'pointer',
                  border: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  padding: 0,
                  overflow: 'hidden',
                }}
                onPointerDown={e => {
                  if (!isSelected) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.88)';
                }}
                onPointerUp={e => {
                  (e.currentTarget as HTMLButtonElement).style.transform = isSelected ? 'scale(1.08)' : '';
                }}
                onPointerLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.transform = isSelected ? 'scale(1.08)' : '';
                }}
              >
                <span style={{
                  fontSize: 11, lineHeight: 1,
                  fontWeight: isSelected ? 700 : isToday ? 600 : 400,
                  color: isSelected
                    ? 'white'
                    : isToday
                    ? 'hsl(var(--primary))'
                    : hasShifts
                    ? 'hsl(var(--foreground))'
                    : 'hsl(var(--foreground)/0.35)',
                }}>
                  {dayNum}
                </span>
                {dots.length > 0 && (
                  <div style={{ display: 'flex', gap: 2, height: 3.5 }}>
                    {dots.map((color, i) => (
                      <span key={i} style={{
                        width: 3.5, height: 3.5, borderRadius: '50%',
                        background: isSelected ? 'rgba(255,255,255,0.65)' : color,
                        transition: 'background 0.12s ease',
                      }} />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );

  // ── Composite Layout ──
  return (
    <div className="card-elevated overflow-hidden" style={{ padding: 0 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        minHeight: 280,
      }}>
        {/* Left: Detail panel */}
        <div style={{
          padding: '14px 12px',
          borderRight: '1px solid hsl(var(--border)/0.2)',
          display: 'flex', flexDirection: 'column',
          maxHeight: 400, overflowY: 'auto',
        }}>
          {detailPanel}
        </div>
        {/* Right: Calendar */}
        <div style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
          {calendarGrid}
        </div>
      </div>

      <style>{`
        @keyframes calPanelIn {
          from { opacity: 0; transform: translateY(5px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes calItemSlide {
          from { opacity: 0; transform: translateX(-4px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes calPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
};

// helper used by active-shift detection
function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

// ── Month navigator ──────────────────────────────────────────────────────────
const MonthNavigator = ({
  year, month, onYearChange, onMonthChange,
  monthGross, monthShifts, monthHours,
  locked,
}: {
  year: number; month: number;
  onYearChange: (y: number) => void;
  onMonthChange: (m: number) => void;
  monthGross: number;
  monthShifts: number;
  monthHours: number;
  locked?: boolean;
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
          <div className="flex items-center justify-center gap-1.5">
            <span className="text-base font-bold text-foreground tracking-tight">
              {MONTH_NAMES[month]} {year}
            </span>
            {locked !== undefined && (
              <span
                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{
                  background: locked ? 'hsl(var(--destructive)/0.10)' : 'hsl(var(--stat-green)/0.12)',
                  color: locked ? 'hsl(var(--destructive))' : 'hsl(var(--stat-green))',
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

// ── Main OverviewPanel ────────────────────────────────────────────────────────
const OverviewPanel = ({
  shifts, clients, invoices, settings,
  selectedYear, selectedMonth, onYearChange, onMonthChange,
  locked, displayName,
  onAddShiftForDate, onDuplicateShift: onDuplicateShiftProp, onAddFromTemplate,
}: OverviewPanelProps) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Day popup is now handled inline inside EarningsCalendarHeatmap

      const stats = useMemo(() => {
    const weekStart = getMondayOf(today);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // Previous week
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekEnd = new Date(prevWeekStart);
    prevWeekEnd.setDate(prevWeekEnd.getDate() + 6);

    const thisWeekShifts = shifts.filter(s => {
      const d = parseDate(s.date);
      return d >= weekStart && d <= weekEnd;
    });

    const prevWeekShifts = shifts.filter(s => {
      const d = parseDate(s.date);
      return d >= prevWeekStart && d <= prevWeekEnd;
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

    const currentYear = today.getFullYear();
    const thisYearShifts = shifts.filter(s => parseDate(s.date).getFullYear() === selectedYear);

    const gross = (arr: Shift[]) => arr.reduce((s, sh) => s + effectiveGrossPay(sh), 0);
    const hours = (arr: Shift[]) =>
      arr.filter(s => !s.is_sleepover).reduce((s, sh) => s + Number(sh.hours_worked), 0);

    // ── Weekly earnings breakdown by category (with hours) ──
    // Uses the actual shift calculator to properly split evening vs daytime hours
    const weekBreakdown = (() => {
      let regularDay = 0,  regularDayH = 0;
      let evening = 0,     eveningH = 0;
      let satDay = 0,      satDayH = 0;
      let sunDay = 0,      sunDayH = 0;
      let weekdaySleepover = 0, weekdaySleepoverN = 0;
      let weekendSleepover = 0, weekendSleepoverN = 0;
      let publicHoliday = 0,    publicHolidayH = 0;
      let phSleepover = 0,      phSleepoverN = 0;

      const userRates: PayRates = settings ? {
        rate_weekday: settings.rate_weekday,
        rate_saturday: settings.rate_saturday,
        rate_sunday: settings.rate_sunday,
        rate_sleepover_weekday: settings.rate_sleepover_weekday,
        rate_sleepover_weekend: settings.rate_sleepover_weekend,
        rate_public_holiday: settings.rate_public_holiday,
        rate_evening: settings.rate_evening,
      } : DEFAULT_RATES;

      for (const s of thisWeekShifts) {
        const dow = getDayOfWeek(s.date);

        // Sleepover shifts are flat-rate, categorize directly
        if (s.is_sleepover) {
          const pay = effectiveGrossPay(s);
          if (s.is_public_holiday) { phSleepover += pay; phSleepoverN += 1; }
          else if (dow === 6 || dow === 0) { weekendSleepover += pay; weekendSleepoverN += 1; }
          else { weekdaySleepover += pay; weekdaySleepoverN += 1; }
          continue;
        }

        // Public holiday hourly — all segments use PH rate
        if (s.is_public_holiday) {
          publicHoliday += effectiveGrossPay(s);
          publicHolidayH += Number(s.hours_worked);
          continue;
        }

        // Use the calculator to split this shift into segments
        const calc = calculateShiftPay(s.date, s.start_time, s.end_time, false, userRates, false);
        for (const seg of calc.breakdown) {
          const segHours = seg.hours ?? 0;
          const segAmount = seg.amount;
          const isEveningSeg = seg.label.includes('Evening');
          const isSat = seg.label.startsWith('Sat');
          const isSun = seg.label.startsWith('Sun');

          if (isSat) { satDay += segAmount; satDayH += segHours; }
          else if (isSun) { sunDay += segAmount; sunDayH += segHours; }
          else if (isEveningSeg) { evening += segAmount; eveningH += segHours; }
          else { regularDay += segAmount; regularDayH += segHours; }
        }
      }
      return {
        regularDay, regularDayH,
        evening,    eveningH,
        satDay,     satDayH,
        sunDay,     sunDayH,
        weekdaySleepover, weekdaySleepoverN,
        weekendSleepover, weekendSleepoverN,
        publicHoliday,    publicHolidayH,
        phSleepover,      phSleepoverN,
      };
    })();

    const byMonth = Array.from({ length: 12 }, (_, m) => {
      const ms = thisYearShifts.filter(s => parseDate(s.date).getMonth() === m);
      return { month: m, gross: gross(ms) };
    });
    const maxMonth = Math.max(...byMonth.map(b => b.gross), 1);

    // For projected annual, always use current year's data and completed months
    const currentYearShifts = selectedYear === currentYear
      ? thisYearShifts
      : shifts.filter(s => parseDate(s.date).getFullYear() === currentYear);
    const completedMonths = Math.max(1, today.getMonth() + 1);
    const projected = (gross(currentYearShifts) / completedMonths) * 12;

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
      prevWeekGross: gross(prevWeekShifts),
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
  }, [shifts, selectedMonth, selectedYear, settings]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Countdown to next shift ──────────────────────────────────────────────
  const [countdown, setCountdown] = useState<string | null>(null);
  useEffect(() => {
    if (!stats.nextShift || stats.activeShift) { setCountdown(null); return; }
    const calcCountdown = () => {
      const s = stats.nextShift!;
      const [h, m] = s.start_time.split(':').map(Number);
      const [sy, sm, sd] = s.date.split('-').map(Number);
      const shiftStart = new Date(sy, sm - 1, sd, h, m, 0, 0);
      const diff = shiftStart.getTime() - Date.now();
      if (diff <= 0) { setCountdown(null); return; }
      const totalMinutes = Math.floor(diff / 60000);
      const days = Math.floor(totalMinutes / 1440);
      const hrs  = Math.floor((totalMinutes % 1440) / 60);
      const mins = totalMinutes % 60;
      if (days > 0) setCountdown(`${days}d ${hrs}h`);
      else if (hrs > 0) setCountdown(`${hrs}h ${mins}m`);
      else setCountdown(`${mins}m`);
    };
    calcCountdown();
    const timer = setInterval(calcCountdown, 30000);
    return () => clearInterval(timer);
  }, [stats.nextShift, stats.activeShift]);

  return (
    <div className="space-y-4">
      {/* ── Welcome greeting ── */}
      {displayName && (
        <div style={{ paddingTop: 2, paddingBottom: 4 }}>
          <p style={{
            fontSize: 13, fontWeight: 400,
            color: 'hsl(var(--muted-foreground))',
            letterSpacing: '-0.01em',
          }}>
            {(() => {
              const h = new Date().getHours();
              if (h < 12) return 'Good morning,';
              if (h < 17) return 'Good afternoon,';
              if (h < 21) return 'Good evening,';
              return 'Good night,';
            })()}
          </p>
          <p style={{
            fontSize: 26, fontWeight: 700,
            color: 'hsl(var(--foreground))',
            letterSpacing: '-0.025em',
            lineHeight: 1.15,
            marginTop: 1,
          }}>
            {displayName.split(' ')[0]}
          </p>
        </div>
      )}

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
        locked={locked}
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
          <div className="flex items-center gap-2 mt-1.5">
            <p className="text-xs text-muted-foreground">weekly gross</p>
            {stats.prevWeekGross > 0 && (() => {
              const diff = stats.weekGross - stats.prevWeekGross;
              const pct = (diff / stats.prevWeekGross) * 100;
              const isUp = diff >= 0;
              return (
                <span
                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold rounded-full px-1.5 py-0.5"
                  style={{
                    background: isUp ? 'hsl(var(--stat-green)/0.10)' : 'hsl(var(--stat-red)/0.10)',
                    color: isUp ? 'hsl(var(--stat-green))' : 'hsl(var(--stat-red))',
                  }}
                >
                  {isUp ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                  {Math.abs(pct).toFixed(0)}%
                </span>
              );
            })()}
          </div>
          {stats.prevWeekGross > 0 && (
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
              Last week: {formatCurrency(stats.prevWeekGross)}
            </p>
          )}
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
            rows.push({ label: 'Weekday Day',           value: wb.regularDay,        meta: `${wb.regularDayH.toFixed(1)}h`,           color: 'hsl(var(--money-green))' });
          if (wb.evening > 0)
            rows.push({ label: 'Evening',               value: wb.evening,           meta: `${wb.eveningH.toFixed(1)}h`,              color: 'hsl(38 90% 45%)' });
          if (wb.satDay > 0)
            rows.push({ label: 'Saturday Day',          value: wb.satDay,            meta: `${wb.satDayH.toFixed(1)}h`,               color: 'hsl(var(--primary))' });
          if (wb.sunDay > 0)
            rows.push({ label: 'Sunday Day',            value: wb.sunDay,            meta: `${wb.sunDayH.toFixed(1)}h`,               color: 'hsl(271 91% 65%)' });
          if (wb.weekdaySleepover > 0)
            rows.push({ label: 'Weekday Sleepover',     value: wb.weekdaySleepover,  meta: `${wb.weekdaySleepoverN} night${wb.weekdaySleepoverN !== 1 ? 's' : ''}`, color: '#2563EB' });
          if (wb.weekendSleepover > 0)
            rows.push({ label: 'Weekend Sleepover',     value: wb.weekendSleepover,  meta: `${wb.weekendSleepoverN} night${wb.weekendSleepoverN !== 1 ? 's' : ''}`, color: '#7C3AED' });
          if (wb.publicHoliday > 0)
            rows.push({ label: 'Public Holiday',        value: wb.publicHoliday,     meta: `${wb.publicHolidayH.toFixed(1)}h`,        color: 'hsl(34 97% 48%)' });
          if (wb.phSleepover > 0)
            rows.push({ label: 'PH Sleepover',          value: wb.phSleepover,       meta: `${wb.phSleepoverN} night${wb.phSleepoverN !== 1 ? 's' : ''}`,          color: 'hsl(34 90% 38%)' });
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

        {/* ── Active Now / Next Shift — refined iOS-style status card with countdown ── */}
        {(activeShiftInfo || nextShiftInfo) && (() => {
          const info = activeShiftInfo ?? nextShiftInfo!;
          const isActive = !!activeShiftInfo;
          const shift = isActive ? stats.activeShift : stats.nextShift;

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

          // Background and border colors — stronger in light mode for Next Shift
          const bgColor = isActive
            ? 'hsl(var(--stat-green)/0.06)'
            : info.isEvening
            ? 'hsl(38 90% 52% / 0.08)'
            : info.isPublicHoliday
            ? 'hsl(34 97% 52% / 0.08)'
            : 'hsl(var(--primary)/0.08)';

          const borderColor = isActive
            ? 'hsl(var(--stat-green)/0.25)'
            : info.isEvening
            ? 'hsl(38 90% 52% / 0.30)'
            : info.isPublicHoliday
            ? 'hsl(34 97% 52% / 0.30)'
            : 'hsl(var(--primary)/0.25)';

          const accentColor = isActive
            ? 'hsl(var(--stat-green))'
            : info.isEvening
            ? 'hsl(38 90% 48%)'
            : info.isPublicHoliday
            ? 'hsl(34 90% 40%)'
            : 'hsl(var(--primary))';

          // Progress bar color
          const progressColor = isActive
            ? 'hsl(var(--stat-green))'
            : info.isEvening
            ? 'hsl(38 90% 48%)'
            : 'hsl(var(--primary))';

          // Type tag colors
          const tagStyle: React.CSSProperties = info.isSleepover ? {
            background: 'hsl(221 83% 53% / 0.14)',
            color: 'hsl(221 83% 45%)',
            border: '1px solid hsl(221 83% 53% / 0.25)',
          } : info.isPublicHoliday ? {
            background: 'hsl(34 97% 52% / 0.14)',
            color: 'hsl(34 90% 38%)',
            border: '1px solid hsl(34 97% 52% / 0.25)',
          } : info.isEvening ? {
            background: 'hsl(38 90% 52% / 0.14)',
            color: 'hsl(38 90% 35%)',
            border: '1px solid hsl(38 90% 52% / 0.25)',
          } : isActive ? {
            background: 'hsl(var(--stat-green)/0.14)',
            color: 'hsl(var(--stat-green))',
            border: '1px solid hsl(var(--stat-green)/0.25)',
          } : {
            background: 'hsl(var(--primary)/0.12)',
            color: 'hsl(var(--primary))',
            border: '1px solid hsl(var(--primary)/0.22)',
          };

          return (
            <div className="pt-4 mt-1" style={{ borderTop: '0.5px solid hsl(var(--border))' }}>
              {/* Status label row with pulsing dot */}
              <div className="flex items-center gap-1.5 mb-3">
                <span
                  style={{
                    display: 'inline-block',
                    width: 6, height: 6, borderRadius: '50%',
                    background: isActive ? 'hsl(var(--stat-green))' : accentColor,
                    opacity: isActive ? 1 : 0.8,
                    animation: isActive ? 'shiftDotPulse 1.8s ease-in-out infinite' : 'none',
                    flexShrink: 0,
                  }}
                />
                <span
                  className="text-[9px] font-semibold uppercase tracking-widest"
                  style={{ color: isActive ? 'hsl(var(--stat-green))' : accentColor }}
                >
                  {isActive ? 'In Progress' : 'Next Shift'}
                </span>
              </div>

              {/* The card itself */}
              <div
                className="w-full text-left overflow-hidden"
                style={{
                  borderRadius: 'var(--radius)',
                  background: bgColor,
                  border: `1px solid ${borderColor}`,
                }}
              >
                {/* Card content */}
                <div className="px-4 pt-3.5 pb-3.5 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    {/* Date — medium/semibold, primary info */}
                    <p className="text-sm font-semibold text-foreground leading-snug tracking-tight">
                      {info.dateLabel}
                    </p>
                    {/* Time — regular weight */}
                    <p className="text-xs font-normal leading-snug" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {info.timeLabel}
                    </p>
                    {/* Client name if available */}
                    {shift?.client_name && (
                      <p className="text-[10px] font-normal" style={{ color: 'hsl(var(--muted-foreground)/0.7)' }}>
                        {shift.client_name}
                      </p>
                    )}
                  </div>

                  {/* Right side: type tag + countdown */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span
                      className="text-[10px] font-medium rounded-lg"
                      style={{ ...tagStyle, padding: '3px 8px', letterSpacing: '0.01em' }}
                    >
                      {info.typeLabel}
                    </span>
                    {/* Countdown — only for next shift, not active */}
                    {!isActive && countdown && (
                      <div
                        className="flex items-center gap-1 rounded-lg px-2 py-1"
                        style={{
                          background: 'hsl(var(--primary)/0.10)',
                          border: '1px solid hsl(var(--primary)/0.18)',
                        }}
                      >
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                          <circle cx="12" cy="12" r="9" stroke="hsl(var(--primary))" strokeWidth="2" />
                          <path d="M12 7v5l3 3" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                        <span
                          className="text-[10px] font-bold tabular-nums"
                          style={{ color: 'hsl(var(--primary))', letterSpacing: '-0.01em' }}
                        >
                          {countdown}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress bar — active shifts only, 2px height at bottom */}
                {isActive && (
                  <div style={{ height: 2, background: 'hsl(var(--border)/0.5)', borderRadius: 0 }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${progressPct}%`,
                        background: progressColor,
                        borderRadius: 0,
                        transition: 'width 1s linear',
                        opacity: 0.75,
                      }}
                    />
                  </div>
                )}
              </div>
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

        {/* Full-width sparkline — $$ labels rendered above each dot inside SVG */}
        {stats.weeklySparkline.some(v => v > 0) && (
          <div style={{ margin: '0 -2px' }}>
            <Sparkline
              data={stats.weeklySparkline}
              width={340}
              height={68}
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
          <div className="card-elevated" style={{ padding: '14px 16px' }}>
            <div className="flex items-center gap-1.5 mb-2.5">
              <div
                className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-[11px] font-bold"
                style={{ background: 'hsl(var(--primary)/0.1)', color: 'hsl(var(--primary))' }}
              >
                {stats.topClient.name[0]?.toUpperCase()}
              </div>
              <span className="section-label">Top Client</span>
            </div>
            <p className="text-sm font-bold text-foreground leading-tight truncate">{stats.topClient.name}</p>
            <p className="text-base font-bold money-text mt-0.5 leading-tight">{formatCurrency(stats.topClient.gross)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {stats.topClient.count} shift{stats.topClient.count !== 1 ? 's' : ''} · {MONTH_SHORT[selectedMonth]}
            </p>
          </div>
        ) : clients.length > 0 ? (
          <div className="card-elevated" style={{ padding: '14px 16px' }}>
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'hsl(var(--muted))' }}>
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <span className="section-label">Top Client</span>
            </div>
            <p className="text-xs text-muted-foreground">No client shifts this month.</p>
          </div>
        ) : null}

        {invoices.length > 0 && (
          <div
            className={`card-elevated ${!stats.topClient && clients.length === 0 ? 'col-span-2' : ''}`}
            style={{ padding: '14px 16px' }}
          >
            <div className="flex items-center gap-1.5 mb-2.5">
              <div
                className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: unpaidStats.count > 0
                    ? 'hsl(var(--stat-amber)/0.12)'
                    : 'hsl(var(--stat-green)/0.12)',
                }}
              >
                <FileText
                  className="w-3.5 h-3.5"
                  style={{
                    color: unpaidStats.count > 0 ? 'hsl(var(--stat-amber))' : 'hsl(var(--stat-green))',
                  }}
                />
              </div>
              <span className="section-label">Invoices</span>
            </div>
            {unpaidStats.count > 0 ? (
              <>
                <p className="text-base font-bold leading-tight" style={{ color: 'hsl(var(--stat-amber))' }}>
                  {formatCurrency(unpaidStats.total)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {unpaidStats.count} unpaid pending
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold money-text leading-tight">All paid ✓</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} total
                </p>
              </>
            )}
          </div>
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
        onAddShift={onAddShiftForDate}
        onDuplicateShift={onDuplicateShiftProp}
        onAddFromTemplate={onAddFromTemplate}
      />


    </div>
  );
};

export default OverviewPanel;
