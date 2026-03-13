import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
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
import { shiftHasEveningHours } from '@/lib/shiftCalculator';

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

// ── Day detail centered modal ─────────────────────────────────────────────────
const DayShiftSheet = ({
  open, onClose, dateStr, shifts,
}: {
  open: boolean;
  onClose: () => void;
  dateStr: string | null;
  shifts: Shift[];
}) => {
  const dayShifts = useMemo(() => {
    if (!dateStr) return [];
    return shifts.filter(s => s.date === dateStr);
  }, [dateStr, shifts]);

  const total = dayShifts.reduce((s, sh) => s + effectiveGrossPay(sh), 0);

  const label = useMemo(() => {
    if (!dateStr) return '';
    const d = parseDate(dateStr);
    return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }, [dateStr]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'hsl(var(--foreground)/0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full flex flex-col"
        style={{
          maxWidth: 420,
          maxHeight: '80dvh',
          background: 'hsl(var(--card))',
          borderRadius: 24,
          boxShadow:
            '0 2px 8px hsl(var(--foreground)/0.08), ' +
            '0 16px 48px hsl(var(--foreground)/0.18), ' +
            '0 0 0 0.5px hsl(var(--border))',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '0.5px solid hsl(var(--border))' }}
        >
          <div>
            <p className="text-base font-bold text-foreground">{label}</p>
            {dayShifts.length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {dayShifts.length} shift{dayShifts.length !== 1 ? 's' : ''} ·{' '}
                <span className="font-semibold money-text">{formatCurrency(total)}</span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors shrink-0"
            style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3">
          {dayShifts.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">No shifts recorded for this day.</p>
            </div>
          ) : (
            dayShifts.map(s => (
              <div key={s.id} className="glass-card p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">
                    {formatTime(s.start_time)} – {formatTime(s.end_time)}
                  </span>
                  <span className="text-sm font-bold money-text">{formatCurrency(effectiveGrossPay(s))}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {s.client_name && (
                    <span className="text-xs text-muted-foreground">{s.client_name}</span>
                  )}
                  {s.is_sleepover && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white"
                      style={{ background: '#2563EB' }}>
                      Sleepover
                    </span>
                  )}
                  {s.is_public_holiday && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'hsl(34 97% 52% / 0.15)', color: 'hsl(34 97% 40%)' }}>
                      Public Holiday
                    </span>
                  )}
                  {!s.is_sleepover && !s.is_public_holiday && shiftHasEveningHours(s.start_time, s.end_time) && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'hsl(38 90% 52% / 0.18)', color: 'hsl(38 90% 38%)' }}>
                      Evening Shift
                    </span>
                  )}
                  {!s.is_sleepover && (
                    <span className="text-xs text-muted-foreground">{Number(s.hours_worked).toFixed(1)}h</span>
                  )}
                </div>
                {s.notes && <p className="text-xs text-muted-foreground">{s.notes}</p>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// ── Elevated card wrapper ─────────────────────────────────────────────────────
const ElevatedCard = ({
  children,
  className = '',
  glow = false,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  style?: React.CSSProperties;
}) => (
  <div
    className={`${glow ? 'glass-card-glow' : 'glass-card'} ${className}`}
    style={{
      borderRadius: 24,
      padding: '18px 20px',
      boxShadow: glow
        ? '0 2px 8px hsl(var(--glass-shadow)), 0 8px 32px hsl(var(--glass-shadow)), 0 0 48px hsl(var(--glow-primary))'
        : '0 1px 4px hsl(var(--glass-shadow)), 0 6px 24px hsl(var(--glass-shadow))',
      ...style,
    }}
  >
    {children}
  </div>
);

// ── Month navigator (Layer 3) ─────────────────────────────────────────────────
const MonthNavigator = ({
  year, month, onYearChange, onMonthChange,
  monthGross, monthShifts, monthHours,
}: {
  year: number; month: number;
  onYearChange: (y: number) => void;
  onMonthChange: (m: number) => void;
  monthGross: number;
  monthShifts: number;
  monthHours: number;
}) => {
  const prev = () => {
    if (month === 0) { onYearChange(year - 1); onMonthChange(11); }
    else onMonthChange(month - 1);
  };
  const next = () => {
    if (month === 11) { onYearChange(year + 1); onMonthChange(0); }
    else onMonthChange(month + 1);
  };

  // Swipe support
  const touchStartX = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 48) { dx < 0 ? next() : prev(); }
    touchStartX.current = null;
  };

  return (
    <div
      className="glass-card overflow-hidden"
      style={{ borderRadius: 22, boxShadow: '0 1px 4px hsl(var(--glass-shadow)), 0 6px 24px hsl(var(--glass-shadow))' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Month row */}
      <div className="flex items-center justify-between px-2 py-3">
        <button
          onClick={prev}
          className="p-2.5 rounded-xl hover:bg-secondary transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4 text-foreground" />
        </button>
        <span className="text-base font-bold text-foreground tracking-tight">
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          onClick={next}
          className="p-2.5 rounded-xl hover:bg-secondary transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4 text-foreground" />
        </button>
      </div>

      {/* Month summary line */}
      {(monthGross > 0 || monthShifts > 0) && (
        <div
          className="px-4 pb-3.5 pt-0 text-center"
          style={{ borderTop: '0.5px solid hsl(var(--border))' }}
        >
          <p className="text-[12px] text-muted-foreground leading-snug mt-2.5">
            <span className="font-bold" style={{ color: 'hsl(var(--money-green))' }}>
              {formatCurrency(monthGross)}
            </span>
            <span className="mx-1.5 text-muted-foreground/50">·</span>
            <span>{monthShifts} shift{monthShifts !== 1 ? 's' : ''}</span>
            <span className="mx-1.5 text-muted-foreground/50">·</span>
            <span>{monthHours.toFixed(0)}h</span>
          </p>
        </div>
      )}
    </div>
  );
};

// ── Interactive Earnings Calendar ─────────────────────────────────────────────
const EarningsCalendarHeatmap = ({
  shifts, year, month, onDayTap,
}: {
  shifts: Shift[];
  year: number;
  month: number;
  onDayTap: (dateStr: string) => void;
}) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <div
      style={{
        borderRadius: 26,
        padding: 4,
        background: 'hsl(var(--border)/0.6)',
        boxShadow:
          '0 1px 0 hsl(var(--glass-border)) inset, ' +
          '0 2px 8px hsl(var(--glass-shadow)), ' +
          '0 8px 28px hsl(var(--glass-shadow))',
      }}
    >
      <div
        className="glass-card"
        style={{ borderRadius: 22, padding: '20px 18px' }}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Earnings Calendar
          </p>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-muted-foreground">Low</span>
            {[0.15, 0.35, 0.55, 0.75, 1].map((o, i) => (
              <div key={i} className="w-3 h-3 rounded-sm" style={{ background: `hsl(var(--money-green) / ${o})` }} />
            ))}
            <span className="text-[9px] text-muted-foreground">High</span>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 mb-1.5">
          {days.map((d, i) => (
            <div key={i} className="text-center text-[9px] font-bold text-muted-foreground">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: rows * 7 }).map((_, i) => {
            const dayNum = i - offsetDays + 1;
            if (dayNum < 1 || dayNum > lastDay.getDate()) return <div key={i} className="aspect-square" />;

            const dateStr = formatDateISO(new Date(year, month, dayNum));
            const gross = grossByDate[dateStr] ?? 0;
            const count = shiftsByDate[dateStr] ?? 0;
            const intensity = gross > 0 ? Math.max(0.15, gross / maxGross) : 0;
            const isToday =
              today.getFullYear() === year &&
              today.getMonth() === month &&
              today.getDate() === dayNum;

            return (
              <button
                key={i}
                onClick={() => onDayTap(dateStr)}
                className="aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all duration-150 active:scale-90"
                style={{
                  background: gross > 0 ? `hsl(var(--money-green) / ${intensity.toFixed(2)})` : 'hsl(var(--muted)/0.5)',
                  outline: isToday ? '1.5px solid hsl(var(--primary))' : undefined,
                  boxShadow: gross > 0 ? `0 1px 4px hsl(var(--money-green) / ${(intensity * 0.4).toFixed(2)})` : undefined,
                }}
                aria-label={`${dayNum} ${MONTH_NAMES[month]}, ${gross > 0 ? formatCurrency(gross) : 'no shifts'}`}
              >
                <span
                  className="text-[9px] font-semibold leading-none"
                  style={{ color: intensity > 0.5 ? 'hsl(var(--money-green-fg))' : 'hsl(var(--muted-foreground))' }}
                >
                  {dayNum}
                </span>
                {count > 1 && (
                  <span
                    className="text-[6px] leading-none mt-0.5 font-bold"
                    style={{ color: intensity > 0.5 ? 'hsl(var(--money-green-fg))' : 'hsl(var(--muted-foreground))' }}
                  >
                    ×{count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-[9px] text-muted-foreground text-center mt-3.5">Tap a day to see shift details</p>
      </div>
    </div>
  );
};

// ── Main OverviewPanel ────────────────────────────────────────────────────────
const OverviewPanel = ({
  shifts, clients, invoices, settings,
  selectedYear, selectedMonth, onYearChange, onMonthChange,
}: OverviewPanelProps) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [daySheetDate, setDaySheetDate] = useState<string | null>(null);
  const handleDayTap = useCallback((dateStr: string) => setDaySheetDate(dateStr), []);

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
    };
  }, [shifts, selectedMonth, selectedYear]); // eslint-disable-line react-hooks/exhaustive-deps

  const unpaidStats = useMemo(() => {
    const unpaid = invoices.filter(inv => inv.status !== 'paid');
    return {
      count: unpaid.length,
      total: unpaid.reduce((s, inv) => s + Number(inv.total_amount), 0),
    };
  }, [invoices]);

  const monthlyGoal = settings?.monthly_goal;
  const goalPct = monthlyGoal && monthlyGoal > 0
    ? Math.min(100, (stats.monthGross / monthlyGoal) * 100)
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
      />

      {/* ── Weekly Earnings card (most prominent) ── */}
      <ElevatedCard glow>
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

        {/* Active Now / Next Shift capsule — priority: active → next → empty */}
        <div className="pt-4 mt-1" style={{ borderTop: '0.5px solid hsl(var(--border))' }}>
          {activeShiftInfo ? (
            <>
              {/* Active Now label row */}
              <div className="flex items-center gap-2 mb-2.5">
                <span
                  className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                  style={{
                    background: 'hsl(var(--stat-green)/0.15)',
                    color: 'hsl(var(--stat-green))',
                  }}
                >
                  ● Active Now
                </span>
              </div>
              {/* Active shift card */}
              <div
                className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
                style={{
                  background: 'hsl(var(--stat-green)/0.09)',
                  border: '1px solid hsl(var(--stat-green)/0.25)',
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground leading-snug">
                    {activeShiftInfo.dateLabel}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {activeShiftInfo.timeLabel}
                  </p>
                </div>
                {/* Strong-contrast chip for active shift type */}
                <span
                  className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full text-white"
                  style={{
                    background: activeShiftInfo.isSleepover
                      ? '#2563EB'
                      : activeShiftInfo.isPublicHoliday
                      ? 'hsl(34 97% 48%)'
                      : activeShiftInfo.isEvening
                      ? 'hsl(38 90% 44%)'
                      : 'hsl(var(--stat-green))',
                  }}
                >
                  {activeShiftInfo.typeLabel}
                </span>
              </div>
            </>
          ) : (
            <>
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-2.5">
                Next Shift
              </p>
              {nextShiftInfo ? (
                <div
                  className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
                  style={{
                    background: nextShiftInfo.isEvening
                      ? 'hsl(38 90% 52% / 0.1)'
                      : nextShiftInfo.isPublicHoliday
                      ? 'hsl(34 97% 52% / 0.1)'
                      : 'hsl(var(--primary)/0.08)',
                    border: nextShiftInfo.isEvening
                      ? '1px solid hsl(38 90% 52% / 0.3)'
                      : nextShiftInfo.isPublicHoliday
                      ? '1px solid hsl(34 97% 52% / 0.3)'
                      : '1px solid hsl(var(--primary)/0.22)',
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground leading-snug">
                      {nextShiftInfo.dateLabel}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {nextShiftInfo.timeLabel}
                    </p>
                  </div>
                  {/* Type chip — high-contrast on every variant */}
                  <span
                    className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full"
                    style={
                      nextShiftInfo.isSleepover ? {
                        background: '#2563EB',
                        color: '#ffffff',
                      } : nextShiftInfo.isPublicHoliday ? {
                        background: 'hsl(34 97% 52%)',
                        color: '#ffffff',
                      } : nextShiftInfo.isEvening ? {
                        background: 'hsl(38 90% 44%)',
                        color: '#ffffff',
                      } : {
                        // Support Shift / client name — solid primary for readability
                        background: 'hsl(var(--primary))',
                        color: 'hsl(var(--primary-foreground))',
                      }
                    }
                  >
                    {nextShiftInfo.typeLabel}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No upcoming shifts scheduled.</p>
              )}
            </>
          )}
        </div>
      </ElevatedCard>

      {/* ── Month & Year summary cards ── */}
      <div className="grid grid-cols-2 gap-3">
        <ElevatedCard style={{ padding: '16px 18px' }}>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
            {MONTH_SHORT[selectedMonth]} Gross
          </p>
          <AnimatedCurrency
            value={stats.monthGross}
            className="text-xl font-bold money-text leading-tight"
            deps={animDeps}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            {stats.monthShiftCount} shifts · {stats.monthHours.toFixed(0)}h
          </p>
          {monthGrowthPct !== null && (
            <div className="mt-2 flex items-center gap-0.5">
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
        </ElevatedCard>

        <ElevatedCard style={{ padding: '16px 18px' }}>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
            {selectedYear} Gross
          </p>
          <AnimatedCurrency
            value={stats.yearGross}
            className="text-xl font-bold money-text leading-tight"
            deps={animDeps}
          />
          <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 shrink-0" />
            Proj. {formatCurrency(stats.projected)}
          </p>
        </ElevatedCard>
      </div>

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

      {/* ── Monthly goal progress ── */}
      {monthlyGoal && monthlyGoal > 0 && goalPct !== null && (
        <ElevatedCard>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <Target className="w-3.5 h-3.5" /> Monthly Goal
            </p>
            <p className="text-xs font-bold money-text">
              {formatCurrency(stats.monthGross)} / {formatCurrency(monthlyGoal)}
            </p>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted))' }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${goalPct.toFixed(1)}%`, background: 'hsl(var(--money-green))' }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground text-right mt-2">
            {goalPct.toFixed(0)}%
            {goalPct >= 100
              ? ' · Goal reached! 🎉'
              : ` · ${formatCurrency(monthlyGoal - stats.monthGross)} remaining`}
          </p>
        </ElevatedCard>
      )}

      {/* ── Interactive Earnings calendar heatmap ── */}
      <EarningsCalendarHeatmap
        shifts={shifts}
        year={selectedYear}
        month={selectedMonth}
        onDayTap={handleDayTap}
      />

      {/* ── Monthly trend mini chart ── */}
      <ElevatedCard>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          {selectedYear} Monthly Earnings
        </p>
        <div className="flex items-end gap-1" style={{ height: 72 }}>
          {stats.byMonth.map(({ month, gross }) => {
            const pct = stats.maxMonth > 0 ? (gross / stats.maxMonth) * 100 : 0;
            const isSelected = month === selectedMonth;
            const hasPay = gross > 0;
            return (
              <div key={month} className="flex-1 flex flex-col items-center gap-1 h-full">
                <div className="w-full flex items-end justify-center flex-1">
                  <div
                    className="w-full rounded-t transition-all duration-500"
                    style={{
                      height: `${Math.max(pct, hasPay ? 6 : 0)}%`,
                      background: isSelected
                        ? 'hsl(var(--money-green))'
                        : hasPay
                        ? 'hsl(var(--money-green)/0.45)'
                        : 'hsl(var(--muted-foreground)/0.15)',
                    }}
                  />
                </div>
                <span
                  className="text-[7px] font-semibold"
                  style={{ color: isSelected ? 'hsl(var(--money-green))' : 'hsl(var(--muted-foreground))' }}
                >
                  {MONTH_SHORT[month]}
                </span>
              </div>
            );
          })}
        </div>
      </ElevatedCard>

      {/* ── Day shift detail sheet ── */}
      <DayShiftSheet
        open={!!daySheetDate}
        onClose={() => setDaySheetDate(null)}
        dateStr={daySheetDate}
        shifts={shifts}
      />

    </div>
  );
};

export default OverviewPanel;
