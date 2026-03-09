import { useMemo } from 'react';
import { TrendingUp, Moon, Clock, Zap, BarChart3, Award, Target, CalendarDays } from 'lucide-react';
import { formatCurrency } from '@/lib/formatUtils';
import type { Shift } from '@/hooks/useShifts';
import type { UserSettings } from '@/hooks/useUserSettings';
import { MONTH_SHORT } from '@/lib/dateUtils';

interface AnalyticsPanelProps {
  shifts: Shift[];
  settings: UserSettings | null;
}

const AnalyticsPanel = ({ shifts, settings }: AnalyticsPanelProps) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const stats = useMemo(() => {
    const thisMonthShifts = shifts.filter(s => {
      const d = new Date(s.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const thisYearShifts = shifts.filter(s => new Date(s.date).getFullYear() === currentYear);

    // Weekly
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
    startOfWeek.setHours(0, 0, 0, 0);
    const thisWeekShifts = shifts.filter(s => new Date(s.date + 'T00:00:00') >= startOfWeek);

    // Fortnight
    const startOfFortnight = new Date(now);
    startOfFortnight.setDate(now.getDate() - 13);
    startOfFortnight.setHours(0, 0, 0, 0);
    const thisFortnightShifts = shifts.filter(s => new Date(s.date + 'T00:00:00') >= startOfFortnight);

    const gross = (arr: Shift[]) => arr.reduce((s, sh) => s + Number(sh.gross_pay), 0);
    const hours = (arr: Shift[]) => arr.filter(s => !s.is_sleepover).reduce((s, sh) => s + Number(sh.hours_worked), 0);

    const weeklyGross = gross(thisWeekShifts);
    const fortnightGross = gross(thisFortnightShifts);
    const monthGross = gross(thisMonthShifts);
    const yearGross = gross(thisYearShifts);

    const monthHours = hours(thisMonthShifts);
    const avgHourly = monthHours > 0 ? monthGross / monthHours : 0;

    // Monthly by month for year
    const byMonth = Array.from({ length: 12 }, (_, m) => {
      const ms = thisYearShifts.filter(s => new Date(s.date).getMonth() === m);
      return { month: m, gross: gross(ms), count: ms.length };
    });
    const bestMonth = byMonth.reduce((a, b) => a.gross >= b.gross ? a : b, byMonth[0]);

    // Projected yearly (based on completed months)
    const completedMonths = Math.max(1, currentMonth + 1);
    const projected = (yearGross / completedMonths) * 12;

    // Sleepover stats
    const sleepoversWeekday = thisYearShifts.filter(s => {
      if (!s.is_sleepover) return false;
      const d = new Date(s.date).getDay();
      return d !== 5 && d !== 6 && d !== 0;
    });
    const sleepoversWeekend = thisYearShifts.filter(s => {
      if (!s.is_sleepover) return false;
      const d = new Date(s.date).getDay();
      return d === 5 || d === 6 || d === 0;
    });
    const sleepoversIncome = thisYearShifts.filter(s => s.is_sleepover).reduce((s, sh) => s + Number(sh.gross_pay), 0);

    return {
      weeklyGross, fortnightGross, monthGross, yearGross,
      monthHours, avgHourly,
      totalShifts: thisYearShifts.length,
      bestMonth,
      projected,
      byMonth,
      sleepoversWeekday: sleepoversWeekday.length,
      sleepoversWeekend: sleepoversWeekend.length,
      sleepoversIncome,
    };
  }, [shifts, currentMonth, currentYear]);

  const monthlyGoal = settings?.monthly_goal ?? null;
  const yearlyGoal = settings?.yearly_goal ?? null;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-foreground">Analytics</h2>

      {/* Period breakdown */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'This Week', value: stats.weeklyGross, icon: CalendarDays },
          { label: 'This Fortnight', value: stats.fortnightGross, icon: CalendarDays },
          { label: 'This Month', value: stats.monthGross, icon: TrendingUp, glow: true },
          { label: 'This Year', value: stats.yearGross, icon: BarChart3, glow: true },
        ].map(card => (
          <div key={card.label} className={card.glow ? 'glass-card-glow p-4' : 'glass-card p-4'}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <card.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">{card.label}</span>
            </div>
            <p className="font-bold text-foreground" style={{ fontSize: 'clamp(0.9rem, 3vw, 1.25rem)' }}>
              {formatCurrency(card.value)}
            </p>
          </div>
        ))}
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card p-4 text-center">
          <Clock className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Avg Hourly</p>
          <p className="text-base font-bold text-foreground mt-0.5">{formatCurrency(stats.avgHourly)}</p>
        </div>
        <div className="glass-card p-4 text-center">
          <Zap className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Shifts</p>
          <p className="text-base font-bold text-foreground mt-0.5">{stats.totalShifts}</p>
        </div>
        <div className="glass-card p-4 text-center">
          <Award className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Best Month</p>
          <p className="text-base font-bold text-foreground mt-0.5">
            {stats.bestMonth.gross > 0 ? MONTH_SHORT[stats.bestMonth.month] : '—'}
          </p>
        </div>
      </div>

      {/* Projected yearly */}
      <div className="glass-card-glow p-4 flex items-center gap-4">
        <TrendingUp className="w-6 h-6 shrink-0" style={{ color: 'hsl(var(--primary))' }} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Projected Year Income</p>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(stats.projected)}</p>
          <p className="text-xs text-muted-foreground">Based on {Math.max(1, new Date().getMonth() + 1)} months of data</p>
        </div>
      </div>

      {/* Goals progress */}
      {(monthlyGoal || yearlyGoal) && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Target className="w-4 h-4" /> Goals
          </h3>
          {monthlyGoal && (
            <div className="glass-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Monthly Goal</span>
                <span className="text-xs font-bold text-foreground">
                  {formatCurrency(stats.monthGross)} / {formatCurrency(monthlyGoal)}
                </span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${Math.min(100, (stats.monthGross / monthlyGoal) * 100).toFixed(1)}%`,
                    background: stats.monthGross >= monthlyGoal
                      ? 'hsl(var(--stat-green))'
                      : 'hsl(var(--primary))',
                  }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground text-right">
                {Math.min(100, (stats.monthGross / monthlyGoal * 100)).toFixed(0)}%
                {stats.monthGross >= monthlyGoal ? ' · Goal reached! 🎉' : ` · ${formatCurrency(monthlyGoal - stats.monthGross)} to go`}
              </p>
            </div>
          )}
          {yearlyGoal && (
            <div className="glass-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Yearly Goal</span>
                <span className="text-xs font-bold text-foreground">
                  {formatCurrency(stats.yearGross)} / {formatCurrency(yearlyGoal)}
                </span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${Math.min(100, (stats.yearGross / yearlyGoal) * 100).toFixed(1)}%`,
                    background: stats.yearGross >= yearlyGoal
                      ? 'hsl(var(--stat-green))'
                      : 'hsl(var(--primary))',
                  }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground text-right">
                {Math.min(100, (stats.yearGross / yearlyGoal * 100)).toFixed(0)}%
                {stats.yearGross >= yearlyGoal ? ' · Goal reached! 🎉' : ` · ${formatCurrency(yearlyGoal - stats.yearGross)} to go`}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Monthly bar chart */}
      <div className="glass-card p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Monthly Earnings {now.getFullYear()}</p>
        <div className="flex items-end gap-1 h-24">
          {stats.byMonth.map(({ month, gross }) => {
            const maxGross = Math.max(...stats.byMonth.map(b => b.gross), 1);
            const pct = (gross / maxGross) * 100;
            const isBest = gross === Math.max(...stats.byMonth.map(b => b.gross)) && gross > 0;
            const isCurrent = month === currentMonth;
            return (
              <div key={month} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end justify-center" style={{ height: '80px' }}>
                  <div
                    className="w-full rounded-t-lg transition-all duration-500"
                    style={{
                      height: `${Math.max(pct, gross > 0 ? 4 : 0)}%`,
                      background: isBest
                        ? 'hsl(var(--primary))'
                        : isCurrent
                        ? 'hsl(var(--primary)/0.6)'
                        : 'hsl(var(--muted-foreground)/0.3)',
                      boxShadow: isBest ? '0 0 12px hsl(var(--primary)/0.4)' : undefined,
                    }}
                  />
                </div>
                <span className={`text-[8px] font-semibold ${isCurrent ? 'text-primary' : 'text-muted-foreground'}`}>
                  {MONTH_SHORT[month]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sleepover section */}
      {(stats.sleepoversWeekday + stats.sleepoversWeekend > 0) && (
        <div className="glass-card p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Moon className="w-3.5 h-3.5" /> Sleepover Summary ({now.getFullYear()})
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">{stats.sleepoversWeekday}</p>
              <p className="text-[10px] text-muted-foreground">Weekday nights</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">{stats.sleepoversWeekend}</p>
              <p className="text-[10px] text-muted-foreground">Weekend nights</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold" style={{ color: 'hsl(var(--primary))' }}>{formatCurrency(stats.sleepoversIncome)}</p>
              <p className="text-[10px] text-muted-foreground">Total income</p>
            </div>
          </div>
        </div>
      )}

      {/* Earnings heatmap by day of week */}
      <DayHeatmap shifts={shifts.filter(s => new Date(s.date).getFullYear() === currentYear)} />
    </div>
  );
};

const DayHeatmap = ({ shifts }: { shifts: Shift[] }) => {
  const dayTotals = useMemo(() => {
    const totals = [0, 0, 0, 0, 0, 0, 0]; // Sun–Sat
    for (const s of shifts) {
      const dow = new Date(s.date).getDay();
      totals[dow] += Number(s.gross_pay);
    }
    return totals;
  }, [shifts]);

  const max = Math.max(...dayTotals, 1);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="glass-card p-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Earnings by Day of Week</p>
      <div className="space-y-2">
        {days.map((day, i) => {
          const pct = (dayTotals[i] / max) * 100;
          return (
            <div key={day} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-7 shrink-0">{day}</span>
              <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted))' }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${pct}%`,
                    background: `hsl(var(--primary) / ${0.3 + (pct / 100) * 0.7})`,
                    boxShadow: pct > 70 ? '0 0 8px hsl(var(--primary)/0.4)' : undefined,
                  }}
                />
              </div>
              <span className="text-xs font-semibold text-foreground min-w-[72px] text-right">
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
