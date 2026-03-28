import { useMemo } from 'react';
import { TrendingUp, Moon, BarChart3, Target, Sunset, Star, DollarSign, Clock } from 'lucide-react';
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

/* ── Apple-style stat tile ── */
const StatTile = ({
  label, value, sub, icon: Icon, iconColor,
}: {
  label: string; value: string; sub?: string;
  icon?: React.ElementType; iconColor?: string;
}) => (
  <div className="card-elevated" style={{ padding: '14px 16px' }}>
    <div className="flex items-center gap-2 mb-1.5">
      {Icon && (
        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${iconColor ?? 'hsl(var(--money-green))'}15`, color: iconColor ?? 'hsl(var(--money-green))' }}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      )}
      <span className="section-label truncate">{label}</span>
    </div>
    <p className="font-bold leading-tight" style={{ fontSize: 'clamp(1rem, 3.5vw, 1.35rem)', color: 'hsl(var(--money-green))' }}>
      {value}
    </p>
    {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
  </div>
);

/* ── Goal progress row ── */
const GoalRow = ({ label, current, goal }: { label: string; current: number; goal: number }) => {
  const pct = Math.min(100, (current / goal) * 100);
  const done = pct >= 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-foreground">{label}</span>
        <span className="text-[12px] font-bold money-text">{formatCurrency(current)}<span className="text-muted-foreground font-normal"> / {formatCurrency(goal)}</span></span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted))' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct.toFixed(1)}%`, background: done ? 'hsl(142 71% 45%)' : 'hsl(var(--money-green))' }}
        />
      </div>
      <p className="text-[10px] text-right" style={{ color: done ? 'hsl(142 71% 45%)' : 'hsl(var(--muted-foreground))' }}>
        {done ? '✓ Goal reached' : `${pct.toFixed(0)}% · ${formatCurrency(goal - current)} to go`}
      </p>
    </div>
  );
};

/* ── Main ── */
const AnalyticsPanel = ({ shifts, settings, selectedYear, selectedMonth }: AnalyticsPanelProps) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const stats = useMemo(() => {
    const weekStart = getMondayOf(today);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const fortnightStart = new Date(today);
    fortnightStart.setDate(today.getDate() - 13);

    const thisWeekShifts = shifts.filter(s => { const d = parseDate(s.date); return d >= weekStart && d <= weekEnd; });
    const thisFortnightShifts = shifts.filter(s => { const d = parseDate(s.date); return d >= fortnightStart && d <= today; });
    const thisMonthShifts = shifts.filter(s => { const d = parseDate(s.date); return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear; });
    const thisYearShifts = shifts.filter(s => parseDate(s.date).getFullYear() === selectedYear);

    const gross = (arr: Shift[]) => arr.reduce((s, sh) => s + effectiveGrossPay(sh), 0);
    const workedHours = (arr: Shift[]) => arr.filter(s => !s.is_sleepover).reduce((s, sh) => s + Number(sh.hours_worked), 0);

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
      selectedYear < today.getFullYear() ? 12
      : selectedYear > today.getFullYear() ? 1
      : today.getMonth() + 1
    );
    const projected = (yearGross / completedMonths) * 12;

    const sleepoversWeekday = thisYearShifts.filter(s => { if (!s.is_sleepover) return false; const d = parseDate(s.date).getDay(); return d >= 1 && d <= 5; });
    const sleepoversWeekend = thisYearShifts.filter(s => { if (!s.is_sleepover) return false; const d = parseDate(s.date).getDay(); return d === 6 || d === 0; });
    const sleepoversIncome = thisYearShifts.filter(s => s.is_sleepover).reduce((s, sh) => s + effectiveGrossPay(sh), 0);
    const eveningShifts = thisYearShifts.filter(s => !s.is_sleepover && !s.is_public_holiday && shiftHasEveningHours(s.start_time, s.end_time));

    const dayTotals = [0, 0, 0, 0, 0, 0, 0];
    for (const s of thisYearShifts) {
      const [y, mm, dd] = s.date.split('-').map(Number);
      const dow = new Date(y, mm - 1, dd).getDay();
      dayTotals[dow] += effectiveGrossPay(s);
    }

    return {
      weeklyGross, fortnightGross, monthGross, yearGross,
      monthHours, avgHourly, totalShifts: thisYearShifts.length,
      bestMonth, maxMonthGross, projected, byMonth, completedMonths,
      sleepoversWeekday: sleepoversWeekday.length,
      sleepoversWeekend: sleepoversWeekend.length,
      sleepoversIncome,
      eveningShiftCount: eveningShifts.length,
      dayTotals,
    };
  }, [shifts, selectedMonth, selectedYear]); // eslint-disable-line react-hooks/exhaustive-deps

  const taxRate = settings?.tax_rate ?? 30;
  const showTax = settings?.show_tax_estimate ?? false;
  const weeklyGoal = settings?.weekly_goal ?? null;
  const monthlyGoal = settings?.monthly_goal ?? null;
  const yearlyGoal = settings?.yearly_goal ?? null;
  const hasGoals = (weeklyGoal && weeklyGoal > 0) || (monthlyGoal && monthlyGoal > 0) || (yearlyGoal && yearlyGoal > 0);

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const maxDay = Math.max(...stats.dayTotals, 1);

  return (
    <div className="space-y-4 pb-2">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-foreground">Analytics</h2>
        <span className="text-xs font-semibold text-muted-foreground">{selectedYear}</span>
      </div>

      {/* Period summary — 2×2 grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile label="This Week" value={formatCurrency(stats.weeklyGross)} icon={BarChart3} iconColor="hsl(var(--primary))" />
        <StatTile label="This Fortnight" value={formatCurrency(stats.fortnightGross)} icon={BarChart3} iconColor="hsl(var(--primary))" />
        <StatTile label="This Month" value={formatCurrency(stats.monthGross)} sub={`${stats.monthHours.toFixed(1)}h worked`} icon={DollarSign} iconColor="hsl(var(--money-green))" />
        <StatTile label={`${selectedYear} Total`} value={formatCurrency(stats.yearGross)} sub={`${stats.totalShifts} shifts`} icon={Star} iconColor="hsl(var(--stat-amber))" />
      </div>

      {/* Projected annual — hero card */}
      <div className="card-elevated" style={{ padding: '18px' }}>
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'hsl(var(--money-green)/0.12)' }}>
            <TrendingUp className="w-5 h-5 money-text" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">Projected Annual</p>
            <p className="text-2xl font-bold money-text leading-tight">{formatCurrency(stats.projected)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Based on {stats.completedMonths} month{stats.completedMonths !== 1 ? 's' : ''} ·{' '}
              <span className="font-semibold text-foreground">{formatCurrency(stats.avgHourly)}/hr avg</span>
            </p>
          </div>
        </div>
      </div>

      {/* Tax projection */}
      {showTax && taxRate > 0 && (
        <div className="card-elevated overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" /> Tax Estimate ({taxRate}%)
            </p>
          </div>
          <div className="px-4 pb-4 space-y-3">
            {[
              { label: 'Projected Year', gross: stats.projected },
              { label: 'This Month', gross: stats.monthGross },
            ].map(row => (
              <div key={row.label} className="rounded-xl p-3" style={{ background: 'hsl(var(--muted)/0.5)' }}>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">{row.label}</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-[9px] text-muted-foreground mb-0.5">Gross</p>
                    <p className="text-sm font-bold money-text">{formatCurrency(row.gross)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-muted-foreground mb-0.5">Est. Tax</p>
                    <p className="text-sm font-bold" style={{ color: 'hsl(var(--stat-red))' }}>−{formatCurrency(row.gross * taxRate / 100)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-muted-foreground mb-0.5">Take-home</p>
                    <p className="text-sm font-bold text-foreground">{formatCurrency(row.gross * (1 - taxRate / 100))}</p>
                  </div>
                </div>
              </div>
            ))}
            <p className="text-[9px] text-muted-foreground">Estimates only — not financial advice.</p>
          </div>
        </div>
      )}

      {/* Goals */}
      {hasGoals && (
        <div className="card-elevated overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" /> Income Goals
            </p>
          </div>
          <div className="px-4 pb-4 space-y-4">
            {weeklyGoal && weeklyGoal > 0 && <GoalRow label="Weekly" current={stats.weeklyGross} goal={weeklyGoal} />}
            {monthlyGoal && monthlyGoal > 0 && <GoalRow label="Monthly" current={stats.monthGross} goal={monthlyGoal} />}
            {yearlyGoal && yearlyGoal > 0 && <GoalRow label="Yearly" current={stats.yearGross} goal={yearlyGoal} />}
          </div>
        </div>
      )}

      {/* Monthly bar chart */}
      <div className="card-elevated overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Monthly Earnings {selectedYear}</p>
        </div>
        <div className="px-4 pb-4">
          <div className="flex items-end gap-1" style={{ height: 88 }}>
            {stats.byMonth.map(({ month, gross }) => {
              const pct = stats.maxMonthGross > 0 ? (gross / stats.maxMonthGross) * 100 : 0;
              const isBest = gross === stats.maxMonthGross && gross > 0;
              const isSelected = month === selectedMonth;
              return (
                <div key={month} className="flex-1 flex flex-col items-center gap-1 h-full">
                  <div className="w-full flex items-end flex-1">
                    <div
                      className="w-full rounded-t-md transition-all duration-500"
                      style={{
                        height: `${Math.max(pct, gross > 0 ? 4 : 0)}%`,
                        background: isBest
                          ? 'hsl(var(--money-green))'
                          : isSelected
                          ? 'hsl(var(--money-green)/0.55)'
                          : 'hsl(var(--muted-foreground)/0.18)',
                        borderRadius: '4px 4px 0 0',
                      }}
                    />
                  </div>
                  <span className="text-[8px] font-medium leading-none"
                    style={{ color: isSelected ? 'hsl(var(--money-green))' : 'hsl(var(--muted-foreground))' }}>
                    {MONTH_SHORT[month]}
                  </span>
                </div>
              );
            })}
          </div>
          {stats.bestMonth.gross > 0 && (
            <p className="text-[10px] text-muted-foreground mt-2">
              Best: <span className="font-semibold text-foreground">{MONTH_SHORT[stats.bestMonth.month]}</span> · {formatCurrency(stats.bestMonth.gross)}
            </p>
          )}
        </div>
      </div>

      {/* Day-of-week heatmap */}
      <div className="card-elevated overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Earnings by Day</p>
        </div>
        <div className="px-4 pb-4 space-y-2">
          {days.map((day, i) => {
            const pct = (stats.dayTotals[i] / maxDay) * 100;
            return (
              <div key={day} className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground w-7 shrink-0 font-medium">{day}</span>
                <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted))' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, background: `hsl(var(--money-green)/${(0.3 + (pct / 100) * 0.7).toFixed(2)})` }}
                  />
                </div>
                <span className="text-[11px] font-semibold money-text min-w-[64px] text-right">{formatCurrency(stats.dayTotals[i])}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sleepover summary */}
      {stats.sleepoversWeekday + stats.sleepoversWeekend > 0 && (
        <div className="card-elevated overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <Moon className="w-3.5 h-3.5" style={{ color: 'hsl(var(--sleepover-color))' }} /> Sleepover Summary
            </p>
          </div>
          <div className="px-4 pb-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xl font-bold text-foreground">{stats.sleepoversWeekday}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Mon–Fri</p>
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{stats.sleepoversWeekend}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Sat–Sun</p>
              </div>
              <div>
                <p className="text-xl font-bold money-text">{formatCurrency(stats.sleepoversIncome)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Total</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Evening shifts */}
      {stats.eveningShiftCount > 0 && (
        <div className="card-elevated overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <Sunset className="w-3.5 h-3.5" style={{ color: 'hsl(var(--evening-color))' }} /> Evening Shifts
            </p>
          </div>
          <div className="px-4 pb-4">
            <p className="text-sm font-semibold text-foreground">
              {stats.eveningShiftCount} shift{stats.eveningShiftCount !== 1 ? 's' : ''} with evening hours
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">18:00–22:00 Mon–Fri billed at the evening rate.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsPanel;
