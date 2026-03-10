import { useMemo } from 'react';
import { TrendingUp, Clock, Moon, CalendarDays, Zap, Target, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/lib/formatUtils';
import type { Shift } from '@/hooks/useShifts';
import { effectiveGrossPay } from '@/hooks/useShifts';
import type { UserSettings } from '@/hooks/useUserSettings';
import { MONTH_NAMES, MONTH_SHORT } from '@/lib/dateUtils';

interface OverviewPanelProps {
  shifts: Shift[];
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

/** Month/Year navigator pill */
const MonthNavigator = ({
  year, month, onYearChange, onMonthChange,
}: {
  year: number; month: number;
  onYearChange: (y: number) => void;
  onMonthChange: (m: number) => void;
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
    <div className="glass-card flex items-center justify-between p-1">
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
  );
};

/**
 * EarningsCalendarHeatmap — month calendar with colour intensity per day
 */
const EarningsCalendarHeatmap = ({
  shifts, year, month,
}: { shifts: Shift[]; year: number; month: number }) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const grossByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of shifts) {
      const d = parseDate(s.date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        map[s.date] = (map[s.date] ?? 0) + Number(s.gross_pay);
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
          const intensity = gross > 0 ? Math.max(0.15, gross / maxGross) : 0;
          const isToday =
            today.getFullYear() === year &&
            today.getMonth() === month &&
            today.getDate() === dayNum;

          return (
            <div
              key={i}
              className="aspect-square rounded-md flex items-center justify-center relative"
              style={{
                background: gross > 0 ? `hsl(var(--money-green) / ${intensity.toFixed(2)})` : 'hsl(var(--muted)/0.4)',
                outline: isToday ? '1.5px solid hsl(var(--primary))' : undefined,
              }}
              title={gross > 0 ? formatCurrency(gross) : undefined}
            >
              <span
                className="text-[9px] font-semibold leading-none"
                style={{ color: intensity > 0.5 ? 'hsl(var(--money-green-fg))' : 'hsl(var(--muted-foreground))' }}
              >
                {dayNum}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * OverviewPanel — live dashboard summary driven by selectedYear/Month
 */
const OverviewPanel = ({ shifts, settings, selectedYear, selectedMonth, onYearChange, onMonthChange }: OverviewPanelProps) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const stats = useMemo(() => {
    // "This week" is always the real current calendar week
    const weekStart = getMondayOf(today);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const thisWeekShifts = shifts.filter(s => {
      const d = parseDate(s.date);
      return d >= weekStart && d <= weekEnd;
    });

    // Month/year stats use selected month
    const thisMonthShifts = shifts.filter(s => {
      const d = parseDate(s.date);
      return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    });

    const thisYearShifts = shifts.filter(s => parseDate(s.date).getFullYear() === selectedYear);

    const gross = (arr: Shift[]) => arr.reduce((s, sh) => s + Number(sh.gross_pay), 0);
    const hours = (arr: Shift[]) =>
      arr.filter(s => !s.is_sleepover).reduce((s, sh) => s + Number(sh.hours_worked), 0);

    const byMonth = Array.from({ length: 12 }, (_, m) => {
      const ms = thisYearShifts.filter(s => parseDate(s.date).getMonth() === m);
      return { month: m, gross: gross(ms) };
    });
    const maxMonth = Math.max(...byMonth.map(b => b.gross), 1);

    // Projection: based on how many months of the selected year have passed (up to today)
    const completedMonths = Math.max(1,
      selectedYear < today.getFullYear()
        ? 12
        : selectedYear > today.getFullYear()
        ? 1
        : today.getMonth() + 1
    );
    const projected = (gross(thisYearShifts) / completedMonths) * 12;

    return {
      weekGross: gross(thisWeekShifts),
      weekHours: hours(thisWeekShifts),
      weekShiftCount: thisWeekShifts.length,
      weekSleepovers: thisWeekShifts.filter(s => s.is_sleepover).length,
      monthGross: gross(thisMonthShifts),
      monthHours: hours(thisMonthShifts),
      monthShiftCount: thisMonthShifts.length,
      yearGross: gross(thisYearShifts),
      projected,
      byMonth,
      maxMonth,
    };
  }, [shifts, selectedMonth, selectedYear]); // eslint-disable-line react-hooks/exhaustive-deps

  const monthlyGoal = settings?.monthly_goal;
  const goalPct = monthlyGoal && monthlyGoal > 0
    ? Math.min(100, (stats.monthGross / monthlyGoal) * 100)
    : null;

  return (
    <div className="space-y-5">

      {/* ── Month navigator ── */}
      <MonthNavigator
        year={selectedYear}
        month={selectedMonth}
        onYearChange={onYearChange}
        onMonthChange={onMonthChange}
      />

      {/* ── Weekly Earnings Widget ── */}
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
      </div>

      {/* ── Month & Year summary ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card p-4">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            {MONTH_NAMES[selectedMonth]} Gross
          </p>
          <p className="text-xl font-bold money-text">{formatCurrency(stats.monthGross)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {stats.monthShiftCount} shifts · {stats.monthHours.toFixed(0)}h
          </p>
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

      {/* ── Earnings calendar heatmap ── */}
      <EarningsCalendarHeatmap shifts={shifts} year={selectedYear} month={selectedMonth} />

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

    </div>
  );
};

export default OverviewPanel;
