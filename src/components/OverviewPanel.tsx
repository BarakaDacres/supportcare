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
  ChevronLeft, ChevronRight, Users, FileText, ArrowUpRight, ArrowDownRight, X, Sunset, Sun,
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

// ── Week breakdown helper (shared) ────────────────────────────────────────────
function computeWeekBreakdown(weekShifts: Shift[], settings: UserSettings | null) {
  let regularDay = 0, regularDayH = 0;
  let evening = 0, eveningH = 0;
  let satDay = 0, satDayH = 0;
  let sunDay = 0, sunDayH = 0;
  let weekdaySleepover = 0, weekdaySleepoverN = 0;
  let weekendSleepover = 0, weekendSleepoverN = 0;
  let publicHoliday = 0, publicHolidayH = 0;
  let phSleepover = 0, phSleepoverN = 0;

  const userRates: PayRates = settings ? {
    rate_weekday: settings.rate_weekday,
    rate_saturday: settings.rate_saturday,
    rate_sunday: settings.rate_sunday,
    rate_sleepover_weekday: settings.rate_sleepover_weekday,
    rate_sleepover_weekend: settings.rate_sleepover_weekend,
    rate_public_holiday: settings.rate_public_holiday,
    rate_evening: settings.rate_evening,
  } : DEFAULT_RATES;

  for (const s of weekShifts) {
    const dow = getDayOfWeek(s.date);
    if (s.is_sleepover) {
      const pay = effectiveGrossPay(s);
      if (s.is_public_holiday) { phSleepover += pay; phSleepoverN += 1; }
      else if (dow === 6 || dow === 0) { weekendSleepover += pay; weekendSleepoverN += 1; }
      else { weekdaySleepover += pay; weekdaySleepoverN += 1; }
      continue;
    }
    if (s.is_public_holiday) {
      publicHoliday += effectiveGrossPay(s);
      publicHolidayH += Number(s.hours_worked);
      continue;
    }
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
  const [fabOpen, setFabOpen] = useState(false);
  const fabRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!fabOpen) return;

    const handler = (e: MouseEvent | TouchEvent) => {
      if (fabRef.current && !fabRef.current.contains(e.target as Node)) setFabOpen(false);
    };

    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler, { passive: true });

    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [fabOpen]);

  useEffect(() => {
    setFabOpen(false);
  }, [selectedDate]);

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

  // Day label helpers
  const dayOfWeekFull = selectedDateObj.toLocaleDateString('en-AU', { weekday: 'long' });
  const isToday2 = selectedDate === todayStr;
  const isTomorrow = (() => {
    const tmr = new Date(todayDate);
    tmr.setDate(tmr.getDate() + 1);
    return selectedDate === formatDateISO(tmr);
  })();
  const dayLabel = isToday2 ? 'TODAY' : isTomorrow ? 'TOMORROW' : dayOfWeekFull.toUpperCase();
  const dayLabelDate = `${selectedDateObj.getDate()}/${selectedDateObj.getMonth() + 1}/${selectedDateObj.getFullYear()}`;

  // FAB actions
  const fabActions = [
    onAddShift && {
      label: 'New Shift',
      icon: (<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="7" y="3" width="2" height="10" rx="1" fill="currentColor"/><rect x="3" y="7" width="10" height="2" rx="1" fill="currentColor"/></svg>),
      primary: true,
      action: () => { haptic('light'); onAddShift(selectedDate); setFabOpen(false); },
    },
    onAddFromTemplate && {
      label: 'Template',
      icon: (<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="1.5" fill="currentColor" opacity="0.7"/><rect x="9" y="2" width="5" height="5" rx="1.5" fill="currentColor" opacity="0.5"/><rect x="2" y="9" width="5" height="5" rx="1.5" fill="currentColor" opacity="0.5"/><rect x="9" y="9" width="5" height="5" rx="1.5" fill="currentColor" opacity="0.3"/></svg>),
      primary: false,
      action: () => { haptic('light'); onAddFromTemplate(selectedDate); setFabOpen(false); },
    },
    onDuplicateShift && lastShift && {
      label: 'Duplicate',
      icon: (<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="9" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/><path d="M6 3V2.5A1.5 1.5 0 0 1 7.5 1H13a1.5 1.5 0 0 1 1.5 1.5V10A1.5 1.5 0 0 1 13 11.5H12" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>),
      primary: false,
      action: () => { haptic('selection'); onDuplicateShift(lastShift.id); setFabOpen(false); },
    },
  ].filter(Boolean) as { label: string; icon: React.ReactNode; primary: boolean; action: () => void }[];

  // ── Calendar Grid ──
  const calendarGrid = (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-7" style={{ gap: 2, marginBottom: 4 }}>
        {DAY_LABELS.map((d, i) => {
          const currentDow = selectedDateObj.getDay();
          const mondayIdx = currentDow === 0 ? 6 : currentDow - 1;
          const isActiveDay = i === mondayIdx;
          return (
            <div key={i} style={{
              textAlign: 'center', fontSize: 10, fontWeight: 600,
              color: isActiveDay ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
              opacity: isActiveDay ? 1 : 0.4,
              padding: '2px 0',
              letterSpacing: '0.02em',
            }}>
              {d}
            </div>
          );
        })}
      </div>

      {/* Grid rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => {
        // Highlight the row containing selected date
        const rowDays = Array.from({ length: 7 }).map((_, colIdx) => {
          const cellIndex = rowIdx * 7 + colIdx;
          return cellIndex - offsetDays + 1;
        });
        const selectedDayNum = selectedDateObj.getDate();
        const isSelectedRow = rowDays.includes(selectedDayNum) && selectedDateObj.getMonth() === month && selectedDateObj.getFullYear() === year;

        return (
          <div key={rowIdx} className="grid grid-cols-7" style={{
            gap: 2, marginBottom: 2,
            background: isSelectedRow ? 'hsl(var(--foreground)/0.08)' : 'transparent',
            borderRadius: 8,
            transition: 'background 0.2s ease',
          }}>
            {Array.from({ length: 7 }).map((_, colIdx) => {
              const cellIndex = rowIdx * 7 + colIdx;
              const dayNum = cellIndex - offsetDays + 1;

              if (dayNum < 1 || dayNum > lastDay.getDate()) {
                // Show outside-month days faintly
                const prevMonth = new Date(year, month, 0);
                const nextFirst = new Date(year, month + 1, 1);
                let outsideNum: number | null = null;
                if (dayNum < 1) outsideNum = prevMonth.getDate() + dayNum;
                else outsideNum = dayNum - lastDay.getDate();

                return (
                  <div key={colIdx} style={{
                    aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {outsideNum && (
                      <span style={{ fontSize: 11, color: 'hsl(var(--foreground)/0.15)', fontWeight: 400 }}>
                        {outsideNum}
                      </span>
                    )}
                  </div>
                );
              }

              const dateStr = formatDateISO(new Date(year, month, dayNum));
              const dayData = shiftsByDate[dateStr];
              const hasShifts = !!dayData && dayData.length > 0;
              const isToday = dateStr === todayStr;
              const isSelected = selectedDate === dateStr;

              return (
                <button
                  key={colIdx}
                  onClick={() => handleDayClick(dateStr)}
                  style={{
                    width: '100%', aspectRatio: '1', borderRadius: 8,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 1,
                    position: 'relative',
                    transition: 'all 0.15s cubic-bezier(0.25,0.1,0.25,1)',
                    transform: isSelected ? 'scale(1.08)' : 'scale(1)',
                    background: isSelected ? 'hsl(var(--primary))' : 'transparent',
                    boxShadow: isSelected
                      ? '0 2px 10px hsl(var(--primary)/0.4)'
                      : isToday
                      ? 'inset 0 0 0 1.5px hsl(var(--primary)/0.3)'
                      : 'none',
                    cursor: 'pointer', border: 'none',
                    WebkitTapHighlightColor: 'transparent', padding: 0,
                  }}
                  onPointerDown={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.88)'; }}
                  onPointerUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = isSelected ? 'scale(1.08)' : ''; }}
                  onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = isSelected ? 'scale(1.08)' : ''; }}
                >
                  <span style={{
                    fontSize: 12, lineHeight: 1,
                    fontWeight: isSelected ? 700 : isToday ? 600 : hasShifts ? 500 : 400,
                    color: isSelected ? 'white'
                      : isToday ? 'hsl(var(--primary))'
                      : hasShifts ? 'hsl(var(--foreground))' : 'hsl(var(--foreground)/0.35)',
                  }}>
                    {dayNum}
                  </span>
                  {hasShifts && !isSelected && (
                    <div style={{ display: 'flex', gap: 2, height: 3.5 }}>
                      {[...new Set(dayData.map(s => shiftDotColor(s)))].slice(0, 3).map((color, i) => (
                        <span key={i} style={{
                          width: 3.5, height: 3.5, borderRadius: '50%', background: color,
                        }} />
                      ))}
                    </div>
                  )}
                  {isSelected && hasShifts && (
                    <div style={{
                      width: 4, height: 4, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.8)',
                      position: 'absolute', bottom: 4,
                    }} />
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  // ── Composite Layout — Apple Calendar Style ──
  return (
    <div className="card-elevated overflow-hidden" style={{ padding: 0 }}>
      {/* ─── Top: Date Info Left + Calendar Grid Right ─── */}
      <div style={{
        display: 'grid', gridTemplateColumns: '110px 1fr',
        borderBottom: '1px solid hsl(var(--border)/0.12)',
      }}>
        {/* Left — Month + Day display */}
        <div style={{
          padding: '16px 14px',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          borderRight: '1px solid hsl(var(--border)/0.1)',
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'hsl(var(--muted-foreground))', opacity: 0.5,
          }}>
            {MONTH_NAMES[month].toUpperCase()}
          </span>
          <span style={{
            fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em',
            color: 'hsl(var(--primary))',
            marginTop: 2,
          }}>
            {dayOfWeekFull}
          </span>
          <span style={{
            fontSize: 48, fontWeight: 700, letterSpacing: '-0.04em',
            lineHeight: 1,
            color: 'hsl(var(--foreground))',
            marginTop: 4,
          }}>
            {selectedDateObj.getDate()}
          </span>
          {/* Earnings badge */}
          {dayShifts.length > 0 && (
            <div style={{
              marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              <span className="money-text" style={{ fontSize: 14, fontWeight: 700 }}>
                {formatCurrency(dayTotal)}
              </span>
              <span style={{ fontSize: 9, color: 'hsl(var(--muted-foreground))' }}>
                {dayShifts.length} shift{dayShifts.length !== 1 ? 's' : ''}
                {dayHours > 0 ? ` · ${dayHours.toFixed(1)}h` : ''}
              </span>
            </div>
          )}
        </div>

        {/* Right — Calendar Grid */}
        <div style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
          {calendarGrid}
        </div>
      </div>

      {/* ─── Bottom: Events List ─── */}
      <div
        key={`${selectedDate}-${animKey}`}
        style={{
          padding: '12px 16px',
          minHeight: 80,
          animation: 'calPanelIn 0.22s cubic-bezier(0.25,0.1,0.25,1)',
          position: 'relative',
        }}
      >
        {/* Day label header */}
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          marginBottom: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{
              fontSize: 11, fontWeight: 800, letterSpacing: '0.05em',
              color: isToday2 ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
            }}>
              {dayLabel}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 400, color: 'hsl(var(--muted-foreground))', opacity: 0.6,
            }}>
              {dayLabelDate}
            </span>
          </div>
          {daySleepoverCount > 0 && (
            <span style={{ fontSize: 9, color: 'hsl(var(--sleepover-color))', fontWeight: 600 }}>
              {daySleepoverCount} sleepover{daySleepoverCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Shift events */}
        {dayShifts.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '20px 8px', opacity: 0.4,
          }}>
            <CalendarDays className="w-5 h-5 mb-2" style={{ color: 'hsl(var(--muted-foreground))' }} />
            <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', textAlign: 'center' }}>
              No shifts scheduled
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
                      height: 1, margin: '0 0',
                      background: 'hsl(var(--border)/0.1)',
                    }} />
                  )}
                  <div
                    style={{
                      display: 'flex', alignItems: 'stretch', gap: 12,
                      padding: '10px 4px',
                      animation: `calItemSlide 0.2s cubic-bezier(0.25,0.1,0.25,1) ${idx * 35}ms both`,
                      borderRadius: 10,
                      background: active ? 'hsl(var(--stat-green)/0.06)' : 'transparent',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    {/* Dot indicator */}
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: shiftDotColor(s),
                      marginTop: 4,
                    }} />

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                          {formatTime(s.start_time)} – {formatTime(s.end_time)}
                        </span>
                        {!s.is_sleepover && s.hours_worked > 0 && (
                          <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', fontWeight: 400 }}>
                            {Number(s.hours_worked).toFixed(1)}h
                          </span>
                        )}
                      </div>
                      {s.client_name && (
                        <p style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--foreground))', marginTop: 2, letterSpacing: '-0.01em' }}>
                          {s.client_name}
                        </p>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
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

                    {/* Earnings right-aligned */}
                    <span className="money-text" style={{
                      fontSize: 13, fontWeight: 700, flexShrink: 0, alignSelf: 'flex-start', marginTop: 2,
                    }}>
                      {formatCurrency(effectiveGrossPay(s))}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* FAB */}
        {(onAddShift || onDuplicateShift || onAddFromTemplate) && (
          <div ref={fabRef} style={{ position: 'absolute', bottom: 12, right: 16 }}>
            <button
              onClick={() => { haptic('light'); setFabOpen(p => !p); }}
              className="active:scale-[0.92]"
              style={{
                width: 40, height: 40, borderRadius: '50%', border: '1px solid hsl(var(--border)/0.3)', cursor: 'pointer',
                background: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                boxShadow: '0 4px 14px hsl(var(--primary)/0.4), 0 1px 3px hsl(var(--foreground)/0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)',
                transform: fabOpen ? 'rotate(45deg)' : 'rotate(0deg)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="7" y="2.5" width="2" height="11" rx="1" fill="currentColor"/>
                <rect x="2.5" y="7" width="11" height="2" rx="1" fill="currentColor"/>
              </svg>
            </button>

            {fabOpen && (
              <div style={{
                position: 'absolute', bottom: 'calc(100% + 8px)', right: 0,
                width: 186,
                background: 'hsl(var(--card)/0.95)',
                backdropFilter: 'blur(24px) saturate(1.6)',
                WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
                borderRadius: 14,
                boxShadow: '0 0 0 0.5px hsl(var(--border)/0.3), 0 12px 40px hsl(var(--foreground)/0.15)',
                overflow: 'hidden',
                animation: 'fab-menu-in 0.22s cubic-bezier(0.34,1.56,0.64,1)',
              }}>
                {fabActions.map((a, i) => (
                  <button
                    key={a.label}
                    onClick={a.action}
                    className="active:scale-[0.97]"
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '11px 14px', border: 'none', cursor: 'pointer',
                      background: 'transparent',
                      color: a.primary ? 'hsl(var(--primary))' : 'hsl(var(--foreground))',
                      fontSize: 13, fontWeight: a.primary ? 600 : 500,
                      borderBottom: i < fabActions.length - 1 ? '1px solid hsl(var(--border)/0.08)' : 'none',
                      transition: 'background 0.12s',
                      animation: `fab-menu-in 0.22s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.04}s both`,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'hsl(var(--muted)/0.5)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: a.primary ? 'hsl(var(--primary)/0.1)' : 'hsl(var(--muted)/0.5)',
                      color: a.primary ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                      flexShrink: 0,
                    }}>
                      {a.icon}
                    </div>
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
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
        @keyframes fab-menu-in {
          from { opacity: 0; transform: scale(0.8) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
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

  // ── Multi-week stats for swipeable carousel ───────────────────────────────
  const allWeeksStats = useMemo(() => {
    const today2 = new Date();
    today2.setHours(0, 0, 0, 0);
    const currentWeekStart = getMondayOf(today2);

    const gross = (arr: Shift[]) => arr.reduce((s, sh) => s + effectiveGrossPay(sh), 0);
    const hours = (arr: Shift[]) =>
      arr.filter(s => !s.is_sleepover).reduce((s, sh) => s + Number(sh.hours_worked), 0);

    return Array.from({ length: 5 }, (_, i) => {
      const ws = new Date(currentWeekStart);
      ws.setDate(ws.getDate() - i * 7);
      const we = new Date(ws);
      we.setDate(we.getDate() + 6);

      const weekShifts = shifts.filter(s => {
        const d = parseDate(s.date);
        return d >= ws && d <= we;
      });

      const pws = new Date(ws);
      pws.setDate(pws.getDate() - 7);
      const pwe = new Date(pws);
      pwe.setDate(pwe.getDate() + 6);
      const prevWeekShifts = shifts.filter(s => {
        const d = parseDate(s.date);
        return d >= pws && d <= pwe;
      });

      return {
        weekStart: ws,
        weekEnd: we,
        weekGross: gross(weekShifts),
        prevWeekGross: gross(prevWeekShifts),
        weekHours: hours(weekShifts),
        weekShiftCount: weekShifts.length,
        weekSleepovers: weekShifts.filter(s => s.is_sleepover).length,
        weekBreakdown: computeWeekBreakdown(weekShifts, settings),
      };
    });
  }, [shifts, settings]);

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

  // ── Active shift live progress (0..1) for in-progress bar ───────────────
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!stats.activeShift) return;
    const t = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [stats.activeShift]);
  const activeProgress = useMemo(() => {
    const s = stats.activeShift;
    if (!s) return 0;
    const [sh, sm] = s.start_time.split(':').map(Number);
    const [eh, em] = s.end_time.split(':').map(Number);
    const [yy, mm, dd] = s.date.split('-').map(Number);
    const start = new Date(yy, mm - 1, dd, sh, sm, 0, 0).getTime();
    let end = new Date(yy, mm - 1, dd, eh, em, 0, 0).getTime();
    if (end <= start) end += 24 * 60 * 60 * 1000;
    const p = (nowTick - start) / (end - start);
    return Math.min(Math.max(p, 0), 1);
  }, [stats.activeShift, nowTick]);
  const activeTimeLabel = useMemo(() => {
    const s = stats.activeShift;
    if (!s) return null;
    const [sh, sm] = s.start_time.split(':').map(Number);
    const [eh, em] = s.end_time.split(':').map(Number);
    const [yy, mm, dd] = s.date.split('-').map(Number);
    const start = new Date(yy, mm - 1, dd, sh, sm, 0, 0).getTime();
    let end = new Date(yy, mm - 1, dd, eh, em, 0, 0).getTime();
    if (end <= start) end += 24 * 60 * 60 * 1000;
    const remainingMin = Math.max(0, Math.round((end - nowTick) / 60000));
    const hrs = Math.floor(remainingMin / 60);
    const mins = remainingMin % 60;
    return hrs > 0 ? `${hrs}h ${mins}m left` : `${mins}m left`;
  }, [stats.activeShift, nowTick]);

  // ── Weekly card swipe state ─────────────────────────────────────────────
  const [weekIndex, setWeekIndex] = useState(0);
  const [dragDx, setDragDx] = useState(0);
  const weekDragStartX = useRef<number | null>(null);
  const weekDragStartY = useRef<number | null>(null);
  const weekDragLocked = useRef<'h' | 'v' | null>(null);

  // ── Per-slide height tracking so empty weeks don't reserve unused space ─
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [slideHeights, setSlideHeights] = useState<number[]>([]);
  useEffect(() => {
    const els = slideRefs.current;
    if (!els.length) return;
    const measure = () => {
      const heights = els.map(el => el?.offsetHeight ?? 0);
      setSlideHeights(prev => {
        if (prev.length === heights.length && prev.every((h, i) => h === heights[i])) return prev;
        return heights;
      });
    };
    measure();
    const observers = els.map(el => {
      if (!el) return null;
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return ro;
    });
    return () => { observers.forEach(o => o?.disconnect()); };
  }, [allWeeksStats.length]);
  const carouselHeight = slideHeights[weekIndex] || undefined;


  const canPrevWeek = weekIndex > 0;                            // newer (swipe right)
  const canNextWeek = weekIndex < allWeeksStats.length - 1;     // older (swipe left)

  const gotoWeek = (next: number) => {
    const clamped = Math.max(0, Math.min(allWeeksStats.length - 1, next));
    if (clamped !== weekIndex) {
      haptic('light');
      setWeekIndex(clamped);
    }
  };

  const onWeekPointerDown = (e: React.PointerEvent) => {
    weekDragStartX.current = e.clientX;
    weekDragStartY.current = e.clientY;
    weekDragLocked.current = null;
    setDragDx(0);
  };
  const onWeekPointerMove = (e: React.PointerEvent) => {
    if (weekDragStartX.current === null || weekDragStartY.current === null) return;
    const dx = e.clientX - weekDragStartX.current;
    const dy = e.clientY - weekDragStartY.current;
    if (weekDragLocked.current === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      weekDragLocked.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    if (weekDragLocked.current === 'h') {
      // Resistance at edges
      let adj = dx;
      if ((dx > 0 && !canPrevWeek) || (dx < 0 && !canNextWeek)) adj = dx * 0.25;
      setDragDx(adj);
    }
  };
  const onWeekPointerUp = (e: React.PointerEvent) => {
    if (weekDragStartX.current === null) return;
    const dx = e.clientX - weekDragStartX.current;
    weekDragStartX.current = null;
    weekDragStartY.current = null;
    setDragDx(0);
    if (weekDragLocked.current !== 'h') return;
    weekDragLocked.current = null;
    if (Math.abs(dx) > 40) {
      if (dx < 0 && canNextWeek) gotoWeek(weekIndex + 1);
      else if (dx > 0 && canPrevWeek) gotoWeek(weekIndex - 1);
    }
  };

  const onWeekKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); if (canPrevWeek) gotoWeek(weekIndex - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); if (canNextWeek) gotoWeek(weekIndex + 1); }
  };


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

      {/* ── Weekly Earnings cards (swipeable) ── */}
      <ElevatedCard hero>
        <div
          className="overflow-hidden touch-pan-y select-none outline-none"
          role="region"
          aria-roledescription="carousel"
          aria-label="Weekly earnings, swipe left or right to navigate"
          tabIndex={0}
          onKeyDown={onWeekKeyDown}
          onPointerDown={onWeekPointerDown}
          onPointerMove={onWeekPointerMove}
          onPointerUp={onWeekPointerUp}
          onPointerCancel={onWeekPointerUp}
          style={{
            cursor: dragDx !== 0 ? 'grabbing' : 'grab',
            height: carouselHeight,
            transition: dragDx !== 0 ? 'none' : 'height 320ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <div
            className="flex items-start"
            style={{
              transform: `translateX(calc(-${weekIndex * 100}% + ${dragDx}px))`,
              transition: dragDx !== 0 ? 'none' : 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >


            {allWeeksStats.map((weekStat, i) => {
              const isCurrent = i === 0;
              const rangeLabel = `${weekStat.weekStart.getDate()} ${MONTH_SHORT[weekStat.weekStart.getMonth()]} – ${weekStat.weekEnd.getDate()} ${MONTH_SHORT[weekStat.weekEnd.getMonth()]}`;
              const label = isCurrent
                ? 'This Week'
                : i === 1
                ? 'Last Week'
                : `${i} weeks ago`;
              return (
                <div
                  key={i}
                  ref={el => { slideRefs.current[i] = el; }}
                  className="w-full flex-shrink-0"
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${label} (${rangeLabel})`}
                  aria-hidden={i !== weekIndex}
                >

                  <div className="flex items-center justify-between mb-3">
                    <div className="flex flex-col">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5" /> {label}
                      </p>
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">{rangeLabel}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground">Mon–Sun</span>
                  </div>

                  <div className="mb-4">
                    <AnimatedCurrency value={weekStat.weekGross} className="text-4xl font-bold money-text leading-none tracking-tight" deps={animDeps} />
                    <div className="flex items-center gap-2 mt-1.5">
                      <p className="text-xs text-muted-foreground">weekly gross</p>
                      {weekStat.prevWeekGross > 0 && (() => {
                        const diff = weekStat.weekGross - weekStat.prevWeekGross;
                        const pct = (diff / weekStat.prevWeekGross) * 100;
                        const isUp = diff >= 0;
                        return (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold rounded-full px-1.5 py-0.5" style={{ background: isUp ? 'hsl(var(--stat-green)/0.10)' : 'hsl(var(--stat-red)/0.10)', color: isUp ? 'hsl(var(--stat-green))' : 'hsl(var(--stat-red))' }}>
                            {isUp ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                            {Math.abs(pct).toFixed(0)}%
                          </span>
                        );
                      })()}
                    </div>
                    {weekStat.prevWeekGross > 0 && (
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">Last week: {formatCurrency(weekStat.prevWeekGross)}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3 pt-4" style={{ borderTop: '0.5px solid hsl(var(--border))' }}>
                    <div className="text-center">
                      <Clock className="w-4 h-4 mx-auto mb-1" style={{ color: 'hsl(var(--muted-foreground))' }} />
                      <p className="text-sm font-bold text-foreground">{weekStat.weekHours.toFixed(1)}h</p>
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Hours</p>
                    </div>
                    <div className="text-center">
                      <Zap className="w-4 h-4 mx-auto mb-1" style={{ color: 'hsl(var(--muted-foreground))' }} />
                      <p className="text-sm font-bold text-foreground">{weekStat.weekShiftCount}</p>
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Shifts</p>
                    </div>
                    <div className="text-center">
                      <Moon className="w-4 h-4 mx-auto mb-1" style={{ color: 'hsl(var(--muted-foreground))' }} />
                      <p className="text-sm font-bold text-foreground">{weekStat.weekSleepovers}</p>
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Sleepovers</p>
                    </div>
                  </div>
                  {weekStat.weekGross > 0 && (() => {
                    const wb = weekStat.weekBreakdown;
                    type BreakdownRow = { label: string; value: number; meta: string; color: string };
                    const rows: BreakdownRow[] = [];
                    if (wb.regularDay > 0) rows.push({ label: 'Weekday Day', value: wb.regularDay, meta: `${wb.regularDayH.toFixed(1)}h`, color: 'hsl(var(--money-green))' });
                    if (wb.evening > 0) rows.push({ label: 'Evening', value: wb.evening, meta: `${wb.eveningH.toFixed(1)}h`, color: 'hsl(38 90% 45%)' });
                    if (wb.satDay > 0) rows.push({ label: 'Saturday Day', value: wb.satDay, meta: `${wb.satDayH.toFixed(1)}h`, color: 'hsl(var(--primary))' });
                    if (wb.sunDay > 0) rows.push({ label: 'Sunday Day', value: wb.sunDay, meta: `${wb.sunDayH.toFixed(1)}h`, color: 'hsl(271 91% 65%)' });
                    if (wb.weekdaySleepover > 0) rows.push({ label: 'Weekday Sleepover', value: wb.weekdaySleepover, meta: `${wb.weekdaySleepoverN} night${wb.weekdaySleepoverN !== 1 ? 's' : ''}`, color: '#2563EB' });
                    if (wb.weekendSleepover > 0) rows.push({ label: 'Weekend Sleepover', value: wb.weekendSleepover, meta: `${wb.weekendSleepoverN} night${wb.weekendSleepoverN !== 1 ? 's' : ''}`, color: '#7C3AED' });
                    if (wb.publicHoliday > 0) rows.push({ label: 'Public Holiday', value: wb.publicHoliday, meta: `${wb.publicHolidayH.toFixed(1)}h`, color: 'hsl(34 97% 48%)' });
                    if (wb.phSleepover > 0) rows.push({ label: 'PH Sleepover', value: wb.phSleepover, meta: `${wb.phSleepoverN} night${wb.phSleepoverN !== 1 ? 's' : ''}`, color: 'hsl(34 90% 38%)' });
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

                  {/* ── Active Now / Next Shift status (current week only) ── */}
                  {isCurrent && (activeShiftInfo || nextShiftInfo) && (() => {
                    const info = activeShiftInfo ?? nextShiftInfo!;
                    const isActive = !!activeShiftInfo;
                    const clientName = isActive ? stats.activeShift?.client_name : stats.nextShift?.client_name;

                    const bgColor = isActive
                      ? 'hsl(var(--stat-green)/0.06)'
                      : info.isEvening ? 'hsl(38 90% 52% / 0.06)'
                      : info.isPublicHoliday ? 'hsl(34 97% 52% / 0.06)'
                      : 'hsl(var(--primary)/0.05)';
                    const borderColor = isActive
                      ? 'hsl(var(--stat-green)/0.20)'
                      : info.isEvening ? 'hsl(38 90% 52% / 0.22)'
                      : info.isPublicHoliday ? 'hsl(34 97% 52% / 0.22)'
                      : 'hsl(var(--primary)/0.18)';
                    const chipStyle: React.CSSProperties = info.isSleepover
                      ? { background: '#2563EB', color: '#fff' }
                      : info.isPublicHoliday ? { background: 'hsl(34 97% 48%)', color: '#fff' }
                      : info.isEvening ? { background: 'hsl(38 90% 44%)', color: '#fff' }
                      : isActive ? { background: 'hsl(var(--stat-green))', color: '#fff' }
                      : { background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' };

                    return (
                      <div className="mt-4 pt-4" style={{ borderTop: '0.5px solid hsl(var(--border))' }}>
                        <div className="flex items-center gap-1.5 mb-2.5">
                          <span style={{
                            display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                            background: isActive ? 'hsl(var(--stat-green))' : 'hsl(var(--muted-foreground))',
                            opacity: isActive ? 1 : 0.6,
                            animation: isActive ? 'calPulse 1.8s ease-in-out infinite' : 'none',
                          }} />
                          <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: isActive ? 'hsl(var(--stat-green))' : 'hsl(var(--muted-foreground))' }}>
                            {isActive ? 'In Progress' : 'Next Shift'}
                          </span>
                          {!isActive && countdown && (
                            <span className="ml-auto text-[10px] font-semibold text-muted-foreground/80 tabular-nums">in {countdown}</span>
                          )}
                        </div>
                        <div
                          className="rounded-2xl px-3.5 py-3 flex items-center justify-between gap-3"
                          style={{ background: bgColor, border: `0.5px solid ${borderColor}` }}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground leading-snug tracking-tight">{info.dateLabel}</p>
                            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{info.timeLabel}</p>
                            {clientName && (
                              <p className="text-[10px] mt-1 truncate" style={{ color: 'hsl(var(--muted-foreground)/0.7)' }}>{clientName}</p>
                            )}
                          </div>
                          <span className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full" style={chipStyle}>
                            {info.typeLabel}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Carousel controls: chevrons + dots ── */}
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            type="button"
            onClick={() => gotoWeek(weekIndex - 1)}
            disabled={!canPrevWeek}
            aria-label="Newer week"
            className="w-7 h-7 rounded-full flex items-center justify-center active:scale-90 transition-all disabled:opacity-30"
            style={{ background: 'hsl(var(--muted)/0.5)', color: 'hsl(var(--foreground))' }}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Weeks">
            {allWeeksStats.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === weekIndex}
                aria-label={i === 0 ? 'This week' : i === 1 ? 'Last week' : `${i} weeks ago`}
                onClick={() => gotoWeek(i)}
                className="rounded-full transition-all duration-300 active:scale-90"
                style={{
                  width: i === weekIndex ? 18 : 6, height: 6,
                  background: i === weekIndex ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground)/0.3)',
                  border: 'none', padding: 0, cursor: 'pointer',
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => gotoWeek(weekIndex + 1)}
            disabled={!canNextWeek}
            aria-label="Older week"
            className="w-7 h-7 rounded-full flex items-center justify-center active:scale-90 transition-all disabled:opacity-30"
            style={{ background: 'hsl(var(--muted)/0.5)', color: 'hsl(var(--foreground))' }}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

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
