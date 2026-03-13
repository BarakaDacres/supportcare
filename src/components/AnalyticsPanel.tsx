import { useMemo } from 'react';
import { TrendingUp, Moon, Clock, Zap, BarChart3, Award, Target, CalendarDays, Sunset } from 'lucide-react';
import { formatCurrency } from '@/lib/formatUtils';
import type { Shift } from '@/hooks/useShifts';
import { effectiveGrossPay } from '@/hooks/useShifts';
import type { UserSettings } from '@/hooks/useUserSettings';
import { MONTH_SHORT } from '@/lib/dateUtils';
import { shiftHasEveningHours } from '@/lib/shiftCalculator';

interface AnalyticsPanelProps {
  shifts: Shift[];
  settings: UserSettings | null;
  selectedYear: number;
  selectedMonth: number;
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

// ── Progress bar row ──────────────────────────────────────────────────────────
const GoalRow = ({
  label, current, goal,
}: { label: string; current: number; goal: number }) => {
  const pct = Math.min(100, (current / goal) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        <span className="text-xs font-bold money-text">
          {formatCurrency(current)} / {formatCurrency(goal)}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted))' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct.toFixed(1)}%`, background: 'hsl(var(--money-green))' }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground text-right">
        {pct.toFixed(0)}%
        {pct >= 100 ? ' · Goal reached! 🎉' : ` · ${formatCurrency(goal - current)} to go`}
      </p>
    </div>
  );
};

const AnalyticsPanel = ({ shifts, settings, selectedYear, selectedMonth }: AnalyticsPanelProps) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const stats = useMemo(() => {
    const weekStart = getMondayOf(today);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const fortnightStart = new Date(today);
    fortnightStart.setDate(today.getDate() - 13);

    const thisWeekShifts = shifts.filter(s => {
      const d = parseDate(s.date);
      return d >= weekStart && d <= weekEnd;
    });

    const thisFortnightShifts = shifts.filter(s => {
      const d = parseDate(s.date);
      return d >= fortnightStart && d <= today;
    });

    const thisMonthShifts = shifts.filter(s => {
      const d = parseDate(s.date);
      return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    });

    const thisYearShifts = shifts.filter(s => parseDate(s.date).getFullYear() === selectedYear);

    const gross = (arr: Shift[]) => arr.reduce((s, sh) => s + effectiveGrossPay(sh), 0);
    const workedHours = (arr: Shift[]) =>
      arr.filter(s => !s.is_sleepover).reduce((s, sh) => s + Number(sh.hours_worked), 0);

    const weeklyGross = gross(thisWeekShifts);
    const fortnightGross = gross(thisFortnightShifts);
    const monthGross = gross(thisMonthShifts);
    const yearGross = gross(thisYearShifts);

    const monthHours = workedHours(thisMonthShifts);
    const avgHourly = monthHours > 0 ? monthGross / monthHours : 0;

    const byMonth = Array.from({ length: 12 }, (_, m) => {
      const ms = thisYearShifts.filter(s => parseDate(s.date).getMonth() === m);
      return { month: m, gross: gross(ms), count: ms.length };
    });

    const maxMonthGross = Math.max(...byMonth.map(b => b.gross), 0);
    const bestMonth = byMonth.reduce((a, b) => (b.gross > a.gross ? b : a), byMonth[0]);

    const completedMonths = Math.max(1,
      selectedYear < today.getFullYear()
        ? 12
        : selectedYear > today.getFullYear()
        ? 1
        : today.getMonth() + 1
    );
    const projected = (yearGross / completedMonths) * 12;

    const sleepoversWeekday = thisYearShifts.filter(s => {
      if (!s.is_sleepover) return false;
      const d = parseDate(s.date).getDay();
      return d >= 1 && d <= 5;
    });
    const sleepoversWeekend = thisYearShifts.filter(s => {
      if (!s.is_sleepover) return false;
      const d = parseDate(s.date).getDay();
      return d === 6 || d === 0;
    });
    const sleepoversIncome = thisYearShifts
      .filter(s => s.is_sleepover)
      .reduce((s, sh) => s + effectiveGrossPay(sh), 0);

    const eveningShifts = thisYearShifts.filter(
      s => !s.is_sleepover && !s.is_public_holiday && shiftHasEveningHours(s.start_time, s.end_time)
    );

    return {
      weeklyGross,
      fortnightGross,
      monthGross,
      yearGross,
      monthHours,
      avgHourly,
      totalShifts: thisYearShifts.length,
      bestMonth,
      maxMonthGross,
      projected,
      byMonth,
      sleepoversWeekday: sleepoversWeekday.length,
      sleepoversWeekend: sleepoversWeekend.length,
      sleepoversIncome,
      eveningShiftCount: eveningShifts.length,
      completedMonths,
    };
  }, [shifts, selectedMonth, selectedYear]); // eslint-disable-line react-hooks/exhaustive-deps

  const taxRate = settings?.tax_rate ?? 30;
  const showTax = settings?.show_tax_estimate ?? false;
  const weeklyGoal = settings?.weekly_goal ?? null;
  const monthlyGoal = settings?.monthly_goal ?? null;
  const yearlyGoal = settings?.yearly_goal ?? null;

  const hasGoals = (weeklyGoal && weeklyGoal > 0) || (monthlyGoal && monthlyGoal > 0) || (yearlyGoal && yearlyGoal > 0);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-foreground">Analytics</h2>

      {/* Period breakdown */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'This Week', value: stats.weeklyGross, icon: CalendarDays },
          { label: 'This Fortnight', value: stats.fortnightGross, icon: CalendarDays },
          { label: 'This Month', value: stats.monthGross, icon: TrendingUp },
          { label: `${selectedYear} Total`, value: stats.yearGross, icon: BarChart3 },
        ].map(card => (
          <div key={card.label} className="card-elevated" style={{ padding: '16px 16px' }}>
            <div className="flex items-center gap-1.5 mb-2">
              <card.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="section-label truncate">{card.label}</span>
            </div>
            <p className="font-bold money-text" style={{ fontSize: 'clamp(0.9rem, 3vw, 1.2rem)' }}>
              {formatCurrency(card.value)}
            </p>
          </div>
        ))}
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card-elevated text-center" style={{ padding: '14px 10px' }}>
          <Clock className="w-4 h-4 mx-auto text-muted-foreground mb-1.5" />
          <p className="section-label">Avg/hr</p>
          <p className="text-sm font-bold money-text mt-0.5">{formatCurrency(stats.avgHourly)}</p>
        </div>
        <div className="card-elevated text-center" style={{ padding: '14px 10px' }}>
          <Zap className="w-4 h-4 mx-auto text-muted-foreground mb-1.5" />
          <p className="section-label">Shifts</p>
          <p className="text-base font-bold text-foreground mt-0.5">{stats.totalShifts}</p>
        </div>
        <div className="card-elevated text-center" style={{ padding: '14px 10px' }}>
          <Award className="w-4 h-4 mx-auto text-muted-foreground mb-1.5" />
          <p className="section-label">Best Mo.</p>
          <p className="text-base font-bold text-foreground mt-0.5">
            {stats.bestMonth.gross > 0 ? MONTH_SHORT[stats.bestMonth.month] : '—'}
          </p>
        </div>
      </div>

      {/* Projected yearly income */}
      <div className="card-elevated" style={{ padding: '18px 18px' }}>
        <div className="flex items-center gap-4">
          <div
            className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
            style={{ background: 'hsl(var(--money-green) / 0.12)' }}
          >
            <TrendingUp className="w-5 h-5 money-text" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="section-label mb-1">Projected Year Income</p>
            <p className="text-2xl font-bold money-text leading-tight">{formatCurrency(stats.projected)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Based on {stats.completedMonths} completed month{stats.completedMonths !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Tax Projection Insight — shown only when enabled */}
      {showTax && taxRate > 0 && (
        <div className="card-elevated p-4 space-y-3">
          <p className="section-label flex items-center gap-1.5 mb-1">
            <Target className="w-3.5 h-3.5" /> Tax Projection ({taxRate}% estimate)
          </p>
          <div className="space-y-3">
            <div className="rounded-2xl p-3 space-y-2" style={{ background: 'hsl(var(--muted)/0.5)' }}>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Projected Year</p>
              <div className="grid grid-cols-3 gap-2">
                <div><p className="text-[9px] text-muted-foreground mb-0.5">Gross</p><p className="text-sm font-bold money-text">{formatCurrency(stats.projected)}</p></div>
                <div><p className="text-[9px] text-muted-foreground mb-0.5">Est. Tax</p><p className="text-sm font-bold" style={{ color: 'hsl(var(--stat-red))' }}>− {formatCurrency(stats.projected * (taxRate / 100))}</p></div>
                <div><p className="text-[9px] text-muted-foreground mb-0.5">Net Income</p><p className="text-sm font-bold text-foreground">{formatCurrency(stats.projected * (1 - taxRate / 100))}</p></div>
              </div>
            </div>
            <div className="rounded-2xl p-3 space-y-2" style={{ background: 'hsl(var(--muted)/0.5)' }}>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">This Month</p>
              <div className="grid grid-cols-3 gap-2">
                <div><p className="text-[9px] text-muted-foreground mb-0.5">Gross</p><p className="text-sm font-bold money-text">{formatCurrency(stats.monthGross)}</p></div>
                <div><p className="text-[9px] text-muted-foreground mb-0.5">Est. Tax</p><p className="text-sm font-bold" style={{ color: 'hsl(var(--stat-red))' }}>− {formatCurrency(stats.monthGross * (taxRate / 100))}</p></div>
                <div><p className="text-[9px] text-muted-foreground mb-0.5">Take-Home</p><p className="text-sm font-bold text-foreground">{formatCurrency(stats.monthGross * (1 - taxRate / 100))}</p></div>
              </div>
            </div>
            <p className="text-[9px] text-muted-foreground">Estimates only — not tax advice.</p>
          </div>
        </div>
      )}

      {/* Goals progress */}
      {hasGoals && (
        <div className="card-elevated p-4 space-y-4">
          <h3 className="section-label flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" /> Income Goals
          </h3>
          {weeklyGoal && weeklyGoal > 0 && <GoalRow label="Weekly" current={stats.weeklyGross} goal={weeklyGoal} />}
          {monthlyGoal && monthlyGoal > 0 && <GoalRow label="Monthly" current={stats.monthGross} goal={monthlyGoal} />}
          {yearlyGoal && yearlyGoal > 0 && <GoalRow label="Yearly" current={stats.yearGross} goal={yearlyGoal} />}
        </div>
      )}

      {/* Monthly bar chart */}
      <div className="card-elevated p-4 space-y-3">
        <p className="section-label">Monthly Earnings {selectedYear}</p>
        <div className="flex items-end gap-1" style={{ height: '90px' }}>
          {stats.byMonth.map(({ month, gross }) => {
            const pct = stats.maxMonthGross > 0 ? (gross / stats.maxMonthGross) * 100 : 0;
            const isBest = gross === stats.maxMonthGross && gross > 0;
            const isSelected = month === selectedMonth;
            return (
              <div key={month} className="flex-1 flex flex-col items-center gap-1 h-full">
                <div className="w-full flex items-end justify-center flex-1">
                  <div
                    className="w-full rounded-t transition-all duration-500"
                    style={{
                      height: `${Math.max(pct, gross > 0 ? 5 : 0)}%`,
                      background: isBest
                        ? 'hsl(var(--money-green))'
                        : isSelected
                        ? 'hsl(var(--money-green) / 0.55)'
                        : 'hsl(var(--muted-foreground) / 0.22)',
                    }}
                  />
                </div>
                <span
                  className="text-[8px] font-semibold leading-none"
                  style={{ color: isSelected ? 'hsl(var(--money-green))' : 'hsl(var(--muted-foreground))' }}
                >
                  {MONTH_SHORT[month]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sleepover section */}
      {stats.sleepoversWeekday + stats.sleepoversWeekend > 0 && (
        <div className="card-elevated p-4 space-y-3">
          <p className="section-label flex items-center gap-1.5">
            <Moon className="w-3.5 h-3.5" /> Sleepover Summary ({selectedYear})
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">{stats.sleepoversWeekday}</p>
              <p className="text-[10px] text-muted-foreground">Mon–Fri nights</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">{stats.sleepoversWeekend}</p>
              <p className="text-[10px] text-muted-foreground">Sat–Sun nights</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold money-text">{formatCurrency(stats.sleepoversIncome)}</p>
              <p className="text-[10px] text-muted-foreground">Total income</p>
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground border-t border-border pt-2">
            Friday is counted as weekday ($300 flat). Weekend rate ($350) applies to Sat & Sun nights only.
          </p>
        </div>
      )}

      {/* Evening shifts summary */}
      {stats.eveningShiftCount > 0 && (
        <div className="card-elevated p-4 space-y-2">
          <p className="section-label flex items-center gap-1.5">
            <Sunset className="w-3.5 h-3.5" style={{ color: 'hsl(var(--evening-color))' }} />
            <span style={{ color: 'hsl(var(--evening-color))' }}>Evening Shifts ({selectedYear})</span>
          </p>
          <p className="text-sm font-bold text-foreground">
            {stats.eveningShiftCount} shift{stats.eveningShiftCount !== 1 ? 's' : ''} with evening hours (18:00–22:00)
          </p>
          <p className="text-[9px] text-muted-foreground">
            Evening hours on Mon–Fri use the evening rate. Sat/Sun use their own day rates.
          </p>
        </div>
      )}

      {/* Earnings heatmap by day of week */}
      <DayHeatmap shifts={shifts.filter(s => {
        const [y] = s.date.split('-').map(Number);
        return y === selectedYear;
      })} />
    </div>
  );
};

const DayHeatmap = ({ shifts }: { shifts: Shift[] }) => {
  const dayTotals = useMemo(() => {
    const totals = [0, 0, 0, 0, 0, 0, 0];
    for (const s of shifts) {
      const [y, m, d] = s.date.split('-').map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      totals[dow] += effectiveGrossPay(s);
    }
    return totals;
  }, [shifts]);

  const max = Math.max(...dayTotals, 1);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="card-elevated p-4 space-y-3">
      <p className="section-label">Earnings by Day of Week</p>
      <div className="space-y-2">
        {days.map((day, i) => {
          const pct = (dayTotals[i] / max) * 100;
          return (
            <div key={day} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-7 shrink-0">{day}</span>
              <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted))' }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${pct}%`,
                    background: `hsl(var(--money-green) / ${(0.35 + (pct / 100) * 0.65).toFixed(2)})`,
                  }}
                />
              </div>
              <span className="text-xs font-semibold money-text min-w-[68px] text-right">
                {formatCurrency(dayTotals[i])}
              </span>
            </div>
          );
        })}
      </div>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${pct}%`,
                    background: `hsl(var(--money-green) / ${(0.3 + (pct / 100) * 0.7).toFixed(2)})`,
                    boxShadow: pct > 70 ? '0 0 8px hsl(var(--money-green)/0.4)' : undefined,
                  }}
                />
              </div>
              <span className="text-xs font-semibold money-text min-w-[72px] text-right">
                {formatCurrency(dayTotals[i])}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AnalyticsPanel;
