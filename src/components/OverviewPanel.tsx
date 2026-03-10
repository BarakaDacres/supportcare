import { useMemo, useState, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, Clock, Moon, CalendarDays, Zap, Target,
  ChevronLeft, ChevronRight, Users, FileText, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { formatCurrency } from '@/lib/formatUtils';
import type { Shift } from '@/hooks/useShifts';
import { effectiveGrossPay } from '@/hooks/useShifts';
import type { Client } from '@/hooks/useClients';
import type { UserSettings } from '@/hooks/useUserSettings';
import { MONTH_NAMES, MONTH_SHORT } from '@/lib/dateUtils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';

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

// ── Day detail bottom sheet ──────────────────────────────────────────────────
const DayShiftSheet = ({
  open,
  onClose,
  dateStr,
  shifts,
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

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl pb-8" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)' }}>
        <SheetHeader className="mb-4">
          <SheetTitle className="text-base font-bold text-foreground">{label}</SheetTitle>
          <SheetDescription className="sr-only">Shift breakdown for this day</SheetDescription>
        </SheetHeader>

        {dayShifts.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No shifts recorded for this day.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {dayShifts.length} shift{dayShifts.length !== 1 ? 's' : ''}
              </span>
              <span className="text-sm font-bold money-text">{formatCurrency(total)} total</span>
            </div>
            {dayShifts.map(s => (
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
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'hsl(var(--primary)/0.12)', color: 'hsl(var(--primary))' }}>
                      Sleepover
                    </span>
                  )}
                  {s.is_public_holiday && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'hsl(38 92% 50% / 0.15)', color: 'hsl(38 92% 35%)' }}>
                      Public Holiday
                    </span>
                  )}
                  {!s.is_sleepover && (
                    <span className="text-xs text-muted-foreground">{Number(s.hours_worked).toFixed(1)}h</span>
                  )}
                </div>
                {s.notes && <p className="text-xs text-muted-foreground">{s.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

// ── Month navigator with inline summary ─────────────────────────────────────
const MonthNavigator = ({
  year, month, onYearChange, onMonthChange, monthGross, monthShifts, monthHours,
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

  return (
    <div className="glass-card p-1 space-y-1.5">
      <div className="flex items-center justify-between">
        <button
          onClick={prev}
          className="p-2 rounded-xl hover:bg-secondary transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4 text-foreground" />
        </button>
        <span className="text-sm font-bold text-foreground">
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          onClick={next}
          className="p-2 rounded-xl hover:bg-secondary transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4 text-foreground" />
        </button>
      </div>
      {/* Month quick summary */}
      {(monthGross > 0 || monthShifts > 0) && (
        <p className="text-center text-[11px] text-muted-foreground pb-1 leading-tight">
          <span className="font-semibold" style={{ color: 'hsl(var(--money-green))' }}>
            {formatCurrency(monthGross)}
          </span>
          {' '}earned · {monthShifts} shift{monthShifts !== 1 ? 's' : ''} · {monthHours.toFixed(0)}h
        </p>
      )}
    </div>
  );
};

// ── Interactive Earnings Calendar ────────────────────────────────────────────
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
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Earnings Calendar — {MONTH_NAMES[month]} {year}
        </p>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground">Low</span>
          {[0.15, 0.35, 0.55, 0.75, 1].map((o, i) => (
            <div key={i} className="w-3 h-3 rounded-sm" style={{ background: `hsl(var(--money-green) / ${o})` }} />
          ))}
          <span className="text-[9px] text-muted-foreground">High</span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((d, i) => (
          <div key={i} className="text-center text-[9px] font-bold text-muted-foreground">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
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
              className="aspect-square rounded-md flex flex-col items-center justify-center relative transition-opacity active:opacity-70"
              style={{
                background: gross > 0 ? `hsl(var(--money-green) / ${intensity.toFixed(2)})` : 'hsl(var(--muted)/0.4)',
                outline: isToday ? '1.5px solid hsl(var(--primary))' : undefined,
              }}
              title={gross > 0 ? `${formatCurrency(gross)} · ${count} shift${count !== 1 ? 's' : ''}` : undefined}
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
      <p className="text-[9px] text-muted-foreground text-center">Tap a day to see shift details</p>
    </div>
  );
};

// ── Growth indicator ─────────────────────────────────────────────────────────
const GrowthBadge = ({ current, previous }: { current: number; previous: number }) => {
  if (previous <= 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] font-semibold"
      style={{ color: up ? 'hsl(var(--stat-green))' : 'hsl(var(--stat-red))' }}
    >
      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(pct).toFixed(0)}% vs {MONTH_SHORT[previous > 0 ? 0 : 0]}
    </span>
  );
};

// ── Main OverviewPanel ───────────────────────────────────────────────────────
const OverviewPanel = ({
  shifts, clients, invoices, settings,
  selectedYear, selectedMonth, onYearChange, onMonthChange,
}: OverviewPanelProps) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [daySheetDate, setDaySheetDate] = useState<string | null>(null);

  const handleDayTap = useCallback((dateStr: string) => {
    setDaySheetDate(dateStr);
  }, []);

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

    // Previous month for comparison
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

    // Next upcoming shift (any future shift sorted ascending)
    const todayStr = formatDateISO(today);
    const futureShifts = shifts
      .filter(s => s.date >= todayStr)
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.start_time.localeCompare(b.start_time);
      });
    const nextShift = futureShifts.length > 0 ? futureShifts[0] : null;

    // Top client by gross in selected month
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
      nextShift,
      topClient: topClientEntry,
    };
  }, [shifts, selectedMonth, selectedYear]); // eslint-disable-line react-hooks/exhaustive-deps

  // Unpaid invoices
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

  // Month-over-month growth
  const monthGrowthPct = stats.prevMonthGross > 0
    ? ((stats.monthGross - stats.prevMonthGross) / stats.prevMonthGross) * 100
    : null;
  const monthGrowthUp = monthGrowthPct !== null && monthGrowthPct >= 0;

  // Format next shift label
  const nextShiftLabel = useMemo(() => {
    if (!stats.nextShift) return null;
    const d = parseDate(stats.nextShift.date);
    const dow = d.toLocaleDateString('en-AU', { weekday: 'short' });
    const dayNum = d.getDate();
    const mon = MONTH_SHORT[d.getMonth()];
    const timeStr = formatTime(stats.nextShift.start_time);
    return `${dow} ${dayNum} ${mon} · ${timeStr}${stats.nextShift.is_sleepover ? ' — Sleepover' : ''}`;
  }, [stats.nextShift]);

  return (
    <div className="space-y-5">

      {/* ── Month navigator with inline summary ── */}
      <MonthNavigator
        year={selectedYear}
        month={selectedMonth}
        onYearChange={onYearChange}
        onMonthChange={onMonthChange}
        monthGross={stats.monthGross}
        monthShifts={stats.monthShiftCount}
        monthHours={stats.monthHours}
      />

      {/* ── Weekly Earnings + Next Shift Preview ── */}
      <div className="glass-card-glow p-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" /> This Week
          </p>
          <span className="text-[10px] text-muted-foreground">Mon–Sun</span>
        </div>
        <div>
          <p className="text-3xl font-bold money-text leading-none">{formatCurrency(stats.weekGross)}</p>
          <p className="text-xs text-muted-foreground mt-1">weekly gross</p>
        </div>
        <div className="grid grid-cols-3 gap-3 pt-1 border-t border-border">
          <div className="text-center">
            <Clock className="w-4 h-4 mx-auto text-muted-foreground mb-0.5" />
            <p className="text-sm font-bold text-foreground">{stats.weekHours.toFixed(1)}h</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Hours</p>
          </div>
          <div className="text-center">
            <Zap className="w-4 h-4 mx-auto text-muted-foreground mb-0.5" />
            <p className="text-sm font-bold text-foreground">{stats.weekShiftCount}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Shifts</p>
          </div>
          <div className="text-center">
            <Moon className="w-4 h-4 mx-auto text-muted-foreground mb-0.5" />
            <p className="text-sm font-bold text-foreground">{stats.weekSleepovers}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Sleepovers</p>
          </div>
        </div>

        {/* Next shift preview */}
        <div className="pt-1 border-t border-border">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Next Shift</p>
          {nextShiftLabel ? (
            <p className="text-xs font-semibold text-foreground">{nextShiftLabel}</p>
          ) : (
            <p className="text-xs text-muted-foreground">No upcoming shifts scheduled.</p>
          )}
        </div>
      </div>

      {/* ── Month & Year summary with growth indicators ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card p-4">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            {MONTH_SHORT[selectedMonth]} Gross
          </p>
          <p className="text-xl font-bold money-text">{formatCurrency(stats.monthGross)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {stats.monthShiftCount} shifts · {stats.monthHours.toFixed(0)}h
          </p>
          {/* Growth indicator */}
          {monthGrowthPct !== null && (
            <div className="mt-1.5 flex items-center gap-0.5">
              {monthGrowthUp
                ? <ArrowUpRight className="w-3 h-3" style={{ color: 'hsl(var(--stat-green))' }} />
                : <ArrowDownRight className="w-3 h-3" style={{ color: 'hsl(var(--stat-red))' }} />
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
        <div className="glass-card p-4">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            {selectedYear} Gross
          </p>
          <p className="text-xl font-bold money-text">{formatCurrency(stats.yearGross)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            Proj. {formatCurrency(stats.projected)}
          </p>
        </div>
      </div>

      {/* ── Top client + Unpaid invoices row ── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Top client widget */}
        {stats.topClient ? (
          <div className="glass-card p-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
              <Users className="w-3 h-3" /> Top Client
            </p>
            <p className="text-sm font-bold text-foreground leading-tight truncate">{stats.topClient.name}</p>
            <p className="text-sm font-bold money-text mt-0.5">{formatCurrency(stats.topClient.gross)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{stats.topClient.count} shift{stats.topClient.count !== 1 ? 's' : ''} this month</p>
          </div>
        ) : clients.length > 0 ? (
          <div className="glass-card p-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
              <Users className="w-3 h-3" /> Top Client
            </p>
            <p className="text-xs text-muted-foreground">No client shifts this month.</p>
          </div>
        ) : null}

        {/* Unpaid invoices widget */}
        {invoices.length > 0 && (
          <div className={`glass-card p-4 ${!stats.topClient && clients.length === 0 ? 'col-span-2' : ''}`}>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
              <FileText className="w-3 h-3" /> Invoices
            </p>
            {unpaidStats.count > 0 ? (
              <>
                <p className="text-sm font-bold money-text">{formatCurrency(unpaidStats.total)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {unpaidStats.count} unpaid pending
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-foreground">All paid</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''} total</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Monthly goal progress ── */}
      {monthlyGoal && monthlyGoal > 0 && goalPct !== null && (
        <div className="glass-card p-4 space-y-2">
          <div className="flex items-center justify-between">
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
          <p className="text-[10px] text-muted-foreground text-right">
            {goalPct.toFixed(0)}%
            {goalPct >= 100
              ? ' · Goal reached! 🎉'
              : ` · ${formatCurrency(monthlyGoal - stats.monthGross)} remaining`}
          </p>
        </div>
      )}

      {/* ── Interactive Earnings calendar heatmap ── */}
      <EarningsCalendarHeatmap
        shifts={shifts}
        year={selectedYear}
        month={selectedMonth}
        onDayTap={handleDayTap}
      />

      {/* ── Monthly trend mini chart ── */}
      <div className="glass-card p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
      </div>

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
