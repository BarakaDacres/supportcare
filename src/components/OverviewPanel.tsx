import { useMemo, useState, useEffect, useRef } from 'react';
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
        border: '1px solid hsl(var(--border))',
        boxShadow:
          '0 4px 24px hsl(var(--foreground)/0.12),' +
          '0 1px 4px hsl(var(--foreground)/0.06),' +
          'inset 0 0.5px 0 hsl(0 0% 100% / 0.08)',
        // Take full available width — the calendar grid constrains it naturally
        width: '100%',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5"
        style={{ borderBottom: '0.5px solid hsl(var(--border))' }}
      >
        <div className="min-w-0">
          <p className="text-xs font-bold text-foreground">{label}</p>
          {dayShifts.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {dayShifts.length} shift{dayShifts.length !== 1 ? 's' : ''} ·{' '}
              <span className="font-semibold money-text">{formatCurrency(total)}</span>
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="w-6 h-6 flex items-center justify-center rounded-full shrink-0 ml-2"
          style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Shift rows */}
      <div className="py-1.5 px-3 space-y-0 max-h-52 overflow-y-auto">
        {dayShifts.length === 0 ? (
          <p className="text-[10px] text-muted-foreground py-3 text-center">No shifts recorded.</p>
        ) : (
          dayShifts.map(s => {
            const hasEvening = shiftHasEveningHours(s.start_time, s.end_time);
            return (
              <div key={s.id} className="py-2" style={{ borderBottom: '0.5px solid hsl(var(--border)/0.4)' }}>
                {/* Row 1: time + amount */}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold text-foreground">
                    {formatTime(s.start_time)} – {formatTime(s.end_time)}
                  </p>
                  <span className="text-[10px] font-bold money-text shrink-0">{formatCurrency(effectiveGrossPay(s))}</span>
                </div>
                {/* Row 2: client + type badges — wraps cleanly */}
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {s.client_name && (
                    <span className="text-[9px] text-muted-foreground">{s.client_name}</span>
                  )}
                  {s.is_sleepover && (
                    <span
                      className="text-[9px] font-bold px-2 py-0.5 rounded-full text-white whitespace-nowrap"
                      style={{ background: 'hsl(var(--sleepover-color))' }}
                    >
                      Sleepover
                    </span>
                  )}
                  {s.is_public_holiday && (
                    <span
                      className="text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                      style={{ background: 'hsl(var(--stat-amber)/0.18)', color: 'hsl(var(--stat-amber))' }}
                    >
                      Public Holiday
                    </span>
                  )}
                  {!s.is_sleepover && hasEvening && (
                    <span
                      className="text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                      style={{ background: 'hsl(var(--evening-color)/0.18)', color: 'hsl(var(--evening-color))' }}
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
          <span className="text-base font-bold text-foreground tracking-tight">
            {MONTH_NAMES[month]} {year}
          </span>
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

  return (
    <div className="card-elevated" style={{ padding: '18px 16px' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="section-label">Earnings Calendar</p>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground">Low</span>
          {[0.15, 0.35, 0.55, 0.75, 1].map((o, i) => (
            <div key={i} className="w-2 h-2 rounded-[3px]" style={{ background: `hsl(var(--money-green) / ${o})` }} />
          ))}
          <span className="text-[9px] text-muted-foreground">High</span>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1.5">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center" style={{ fontSize: 8, fontWeight: 700, color: 'hsl(var(--muted-foreground))' }}>
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
                        borderRadius: 10,
                        background: 'hsl(var(--muted)/0.15)',
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
                      borderRadius: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 1,
                      position: 'relative',
                      transition: 'transform 0.12s ease, box-shadow 0.12s ease',
                      background: gross > 0
                        ? `hsl(var(--money-green) / ${intensity.toFixed(2)})`
                        : 'hsl(var(--muted) / 0.45)',
                      outline: isToday
                        ? '1.5px solid hsl(var(--primary))'
                        : isSelected
                        ? '1.5px solid hsl(var(--foreground)/0.5)'
                        : 'none',
                      outlineOffset: '-1px',
                      boxShadow: isSelected
                        ? '0 2px 8px hsl(var(--foreground)/0.12)'
                        : 'none',
                      transform: isSelected ? 'scale(0.94)' : 'scale(1)',
                      cursor: 'pointer',
                      border: 'none',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        lineHeight: 1,
                        color: intensity > 0.5
                          ? 'hsl(var(--money-green-fg))'
                          : 'hsl(var(--muted-foreground))',
                      }}
                    >
                      {dayNum}
                    </span>
                    {count > 0 && (
                      <span
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: '50%',
                          background: intensity > 0.5
                            ? 'hsl(var(--money-green-fg))'
                            : 'hsl(var(--money-green))',
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Inline popup anchored below the row */}
            {showPopupAfterRow && selectedDate && (
              <div
                style={{
                  marginBottom: 8,
                  animation: 'fadeSlideIn 0.18s ease',
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
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
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

    </div>
  );
};

export default OverviewPanel;
