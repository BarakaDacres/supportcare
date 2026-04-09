import { useMemo, useState, useEffect, useRef } from 'react';
import {
  TrendingUp, Moon, BarChart3, Target, Sunset, Star, DollarSign, Clock,
  Zap, Award, ArrowUpRight, ArrowDownRight, Calendar, Flame,
} from 'lucide-react';
import { formatCurrency } from '@/lib/formatUtils';
import type { Shift } from '@/hooks/useShifts';
import { effectiveGrossPay } from '@/hooks/useShifts';
import type { UserSettings } from '@/hooks/useUserSettings';
import { MONTH_SHORT } from '@/lib/dateUtils';
import { shiftHasEveningHours, calculateShiftPay, getDayOfWeek, type PayRates, DEFAULT_RATES } from '@/lib/shiftCalculator';

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

// ── Count-up animation ──
function useCountUp(target: number, duration = 700) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const from = 0;
    const animate = (ts: number) => {
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + (target - from) * eased);
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return value;
}

// ── Animated currency ──
const AnimatedCurrency = ({ value, className, style }: {
  value: number; className?: string; style?: React.CSSProperties;
}) => {
  const animated = useCountUp(value, 800);
  return <span className={className} style={style}>{formatCurrency(animated)}</span>;
};

// ── Insight pill ──
const InsightPill = ({ icon: Icon, text, color, delay = 0 }: {
  icon: React.ElementType; text: string; color: string; delay?: number;
}) => (
  <div
    className="flex items-center gap-2 rounded-2xl px-3.5 py-2.5"
    style={{
      background: `${color}08`,
      border: `1px solid ${color}18`,
      animation: `insightFadeIn 0.4s ease ${delay}ms both`,
    }}
  >
    <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
    <span className="text-[11px] font-medium text-foreground leading-snug">{text}</span>
  </div>
);

/* ── Stat tile with press feedback ── */
const StatTile = ({
  label, value, sub, icon: Icon, iconColor, animateValue,
}: {
  label: string; value: string; sub?: string;
  icon?: React.ElementType; iconColor?: string;
  animateValue?: number;
}) => (
  <div
    className="card-elevated transition-transform duration-150 active:scale-[0.97]"
    style={{ padding: '14px 16px' }}
  >
    <div className="flex items-center gap-2 mb-1.5">
      {Icon && (
        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${iconColor ?? 'hsl(var(--money-green))'}15`, color: iconColor ?? 'hsl(var(--money-green))' }}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      )}
      <span className="section-label truncate">{label}</span>
    </div>
    {animateValue !== undefined ? (
      <AnimatedCurrency
        value={animateValue}
        className="font-bold leading-tight"
        style={{ fontSize: 'clamp(1rem, 3.5vw, 1.35rem)', color: 'hsl(var(--money-green))' }}
      />
    ) : (
      <p className="font-bold leading-tight" style={{ fontSize: 'clamp(1rem, 3.5vw, 1.35rem)', color: 'hsl(var(--money-green))' }}>
        {value}
      </p>
    )}
    {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
  </div>
);

/* ── Goal progress row ── */
const GoalRow = ({ label, current, goal }: { label: string; current: number; goal: number }) => {
  const pct = Math.min(100, (current / goal) * 100);
  const done = pct >= 100;
  const [animPct, setAnimPct] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setAnimPct(pct), 100);
    return () => clearTimeout(timer);
  }, [pct]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-foreground">{label}</span>
        <span className="text-[12px] font-bold money-text">{formatCurrency(current)}<span className="text-muted-foreground font-normal"> / {formatCurrency(goal)}</span></span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted))' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${animPct.toFixed(1)}%`,
            background: done ? 'hsl(142 71% 45%)' : 'hsl(var(--money-green))',
            transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
      </div>
      <p className="text-[10px] text-right" style={{ color: done ? 'hsl(142 71% 45%)' : 'hsl(var(--muted-foreground))' }}>
        {done ? '✓ Goal reached' : `${pct.toFixed(0)}% · ${formatCurrency(goal - current)} to go`}
      </p>
    </div>
  );
};

/* ── Animated bar chart ── */
const AnimatedBarChart = ({
  data, selectedMonth, maxGross,
}: {
  data: { month: number; gross: number }[];
  selectedMonth: number;
  maxGross: number;
}) => {
  const [animate, setAnimate] = useState(false);
  useEffect(() => { 
    const t = setTimeout(() => setAnimate(true), 100);
    return () => clearTimeout(t);
  }, [data]);

  const bestGross = Math.max(...data.map(d => d.gross));

  return (
    <div className="flex items-end gap-1" style={{ height: 100 }}>
      {data.map(({ month, gross }) => {
        const pct = maxGross > 0 ? (gross / maxGross) * 100 : 0;
        const isBest = gross === bestGross && gross > 0;
        const isSelected = month === selectedMonth;
        return (
          <div key={month} className="flex-1 flex flex-col items-center gap-1 h-full group">
            <div className="w-full flex items-end flex-1">
              <div
                className="w-full transition-all duration-700 ease-out relative overflow-hidden"
                style={{
                  height: animate ? `${Math.max(pct, gross > 0 ? 4 : 0)}%` : '0%',
                  borderRadius: '5px 5px 0 0',
                  background: isBest
                    ? 'linear-gradient(to top, hsl(var(--money-green)), hsl(var(--money-green)/0.7))'
                    : isSelected
                    ? 'hsl(var(--money-green)/0.55)'
                    : 'hsl(var(--muted-foreground)/0.15)',
                  boxShadow: isBest ? '0 0 12px hsl(var(--money-green)/0.2)' : 'none',
                  transitionDelay: `${month * 40}ms`,
                }}
              >
                {/* Gradient overlay for depth */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'linear-gradient(to right, transparent, hsl(0 0% 100% / 0.08), transparent)',
                  }}
                />
              </div>
            </div>
            <span className="text-[8px] font-medium leading-none transition-colors"
              style={{ color: isSelected ? 'hsl(var(--money-green))' : 'hsl(var(--muted-foreground))' }}>
              {MONTH_SHORT[month]}
            </span>
          </div>
        );
      })}
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

    // Previous month
    const prevMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
    const prevYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
    const prevMonthShifts = shifts.filter(s => {
      const d = parseDate(s.date);
      return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
    });

    const gross = (arr: Shift[]) => arr.reduce((s, sh) => s + effectiveGrossPay(sh), 0);
    const workedHours = (arr: Shift[]) => arr.filter(s => !s.is_sleepover).reduce((s, sh) => s + Number(sh.hours_worked), 0);

    const weeklyGross = gross(thisWeekShifts);
    const fortnightGross = gross(thisFortnightShifts);
    const monthGross = gross(thisMonthShifts);
    const yearGross = gross(thisYearShifts);
    const prevMonthGross = gross(prevMonthShifts);
    const monthHours = workedHours(thisMonthShifts);
    const avgHourly = monthHours > 0 ? monthGross / monthHours : 0;

    const byMonth = Array.from({ length: 12 }, (_, m) => {
      const ms = thisYearShifts.filter(s => parseDate(s.date).getMonth() === m);
      return { month: m, gross: gross(ms), count: ms.length };
    });

    const maxMonthGross = Math.max(...byMonth.map(b => b.gross), 0);
    const bestMonth = byMonth.reduce((a, b) => (b.gross > a.gross ? b : a), byMonth[0]);

    const currentYear = today.getFullYear();
    const completedMonths = Math.max(1,
      selectedYear < currentYear ? 12
      : selectedYear > currentYear ? 1
      : today.getMonth() + 1
    );
    const projected = (yearGross / completedMonths) * 12;

    // Month-over-month growth
    const monthGrowthPct = prevMonthGross > 0
      ? ((monthGross - prevMonthGross) / prevMonthGross) * 100
      : null;

    const sleepoversWeekday = thisYearShifts.filter(s => { if (!s.is_sleepover) return false; const d = parseDate(s.date).getDay(); return d >= 1 && d <= 5; });
    const sleepoversWeekend = thisYearShifts.filter(s => { if (!s.is_sleepover) return false; const d = parseDate(s.date).getDay(); return d === 6 || d === 0; });
    const sleepoversIncome = thisYearShifts.filter(s => s.is_sleepover).reduce((s, sh) => s + effectiveGrossPay(sh), 0);
    const eveningShifts = thisYearShifts.filter(s => !s.is_sleepover && !s.is_public_holiday && shiftHasEveningHours(s.start_time, s.end_time));

    // Calculate actual evening hours and income using the shift calculator
    const userRates: PayRates = settings ? {
      rate_weekday: settings.rate_weekday,
      rate_saturday: settings.rate_saturday,
      rate_sunday: settings.rate_sunday,
      rate_sleepover_weekday: settings.rate_sleepover_weekday,
      rate_sleepover_weekend: settings.rate_sleepover_weekend,
      rate_public_holiday: settings.rate_public_holiday,
      rate_evening: settings.rate_evening,
    } : DEFAULT_RATES;

    let eveningHours = 0;
    let eveningIncome = 0;
    for (const s of thisYearShifts) {
      if (s.is_sleepover || s.is_public_holiday) continue;
      const calc = calculateShiftPay(s.date, s.start_time, s.end_time, false, userRates, false);
      for (const seg of calc.breakdown) {
        if (seg.label.includes('Evening')) {
          eveningHours += seg.hours ?? 0;
          eveningIncome += seg.amount;
        }
      }
    }

    // Sleepover income breakdown by type
    const sleepoversWeekdayIncome = sleepoversWeekday.reduce((s, sh) => s + effectiveGrossPay(sh), 0);
    const sleepoversWeekendIncome = sleepoversWeekend.reduce((s, sh) => s + effectiveGrossPay(sh), 0);

    const dayTotals = [0, 0, 0, 0, 0, 0, 0];
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    for (const s of thisYearShifts) {
      const [y, mm, dd] = s.date.split('-').map(Number);
      const dow = new Date(y, mm - 1, dd).getDay();
      dayTotals[dow] += effectiveGrossPay(s);
      dayCounts[dow] += 1;
    }

    // Most active day
    const mostActiveDay = dayCounts.indexOf(Math.max(...dayCounts));
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return {
      weeklyGross, fortnightGross, monthGross, yearGross,
      monthHours, avgHourly, totalShifts: thisYearShifts.length,
      bestMonth, maxMonthGross, projected, byMonth, completedMonths,
      sleepoversWeekday: sleepoversWeekday.length,
      sleepoversWeekend: sleepoversWeekend.length,
      sleepoversIncome,
      sleepoversWeekdayIncome,
      sleepoversWeekendIncome,
      eveningShiftCount: eveningShifts.length,
      eveningHours,
      eveningIncome,
      dayTotals,
      monthGrowthPct,
      prevMonth,
      prevMonthGross,
      mostActiveDay: dayNames[mostActiveDay],
      mostActiveDayCount: Math.max(...dayCounts),
    };
  }, [shifts, selectedMonth, selectedYear, settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const taxRate = settings?.tax_rate ?? 30;
  const showTax = settings?.show_tax_estimate ?? false;
  const weeklyGoal = settings?.weekly_goal ?? null;
  const monthlyGoal = settings?.monthly_goal ?? null;
  const yearlyGoal = settings?.yearly_goal ?? null;
  const hasGoals = (weeklyGoal && weeklyGoal > 0) || (monthlyGoal && monthlyGoal > 0) || (yearlyGoal && yearlyGoal > 0);

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const maxDay = Math.max(...stats.dayTotals, 1);

  // Build smart insights
  const insights = useMemo(() => {
    const items: { icon: React.ElementType; text: string; color: string }[] = [];

    if (stats.bestMonth.gross > 0) {
      items.push({
        icon: Award,
        text: `Best month: ${MONTH_SHORT[stats.bestMonth.month]} (${formatCurrency(stats.bestMonth.gross)})`,
        color: 'hsl(var(--money-green))',
      });
    }

    if (stats.monthGrowthPct !== null) {
      const up = stats.monthGrowthPct >= 0;
      items.push({
        icon: up ? ArrowUpRight : ArrowDownRight,
        text: `${up ? '↑' : '↓'} ${Math.abs(stats.monthGrowthPct).toFixed(0)}% ${up ? 'higher' : 'lower'} than ${MONTH_SHORT[stats.prevMonth]}`,
        color: up ? 'hsl(var(--stat-green))' : 'hsl(var(--stat-red))',
      });
    }

    if (stats.avgHourly > 0) {
      items.push({
        icon: Zap,
        text: `Avg ${formatCurrency(stats.avgHourly)}/hr this month`,
        color: 'hsl(var(--primary))',
      });
    }

    if (stats.mostActiveDayCount > 0) {
      items.push({
        icon: Flame,
        text: `Most active day: ${stats.mostActiveDay}`,
        color: 'hsl(var(--stat-amber))',
      });
    }

    return items;
  }, [stats]);

  // Projected trend insight
  const projectedInsight = useMemo(() => {
    if (stats.projected <= 0) return null;
    const monthAvg = stats.projected / 12;
    if (stats.monthGross >= monthAvg * 0.9) return '↑ On track based on current monthly average';
    if (stats.monthGross >= monthAvg * 0.6) return '→ Slightly below monthly target pace';
    return '↓ Below average — consider logging more shifts';
  }, [stats]);

  return (
    <div className="space-y-5 pb-2">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-foreground">Analytics</h2>
        <span className="text-xs font-semibold text-muted-foreground">{selectedYear}</span>
      </div>

      {/* ── HERO: Projected Annual ── */}
      <div
        className="card-elevated relative overflow-hidden"
        style={{
          padding: '22px 20px',
          animation: 'heroFadeIn 0.5s ease both',
        }}
      >
        {/* Subtle gradient glow behind icon */}
        <div
          className="absolute pointer-events-none"
          style={{
            top: -20, left: -20,
            width: 120, height: 120,
            borderRadius: '50%',
            background: 'radial-gradient(circle, hsl(var(--money-green)/0.08), transparent 70%)',
            filter: 'blur(20px)',
          }}
        />
        <div className="relative flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              background: 'linear-gradient(135deg, hsl(var(--money-green)/0.15), hsl(var(--money-green)/0.05))',
              boxShadow: '0 0 24px hsl(var(--money-green)/0.08)',
            }}>
            <TrendingUp className="w-5.5 h-5.5 money-text" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Projected Annual</p>
            <AnimatedCurrency
              value={stats.projected}
              className="text-[28px] font-bold money-text leading-none tracking-tight"
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Based on {stats.completedMonths} month{stats.completedMonths !== 1 ? 's' : ''} ·{' '}
              <span className="font-semibold text-foreground">{formatCurrency(stats.avgHourly)}/hr</span>
            </p>
            {projectedInsight && (
              <p className="text-[10px] mt-1" style={{ color: 'hsl(var(--money-green)/0.8)' }}>
                {projectedInsight}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── SMART INSIGHTS ── */}
      {insights.length > 0 && (
        <div className="space-y-2" style={{ animation: 'heroFadeIn 0.5s ease 0.1s both' }}>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Insights</p>
          <div className="space-y-1.5">
            {insights.map((insight, i) => (
              <InsightPill key={i} icon={insight.icon} text={insight.text} color={insight.color} delay={i * 80} />
            ))}
          </div>
        </div>
      )}

      {/* Period summary — 2×2 grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile label="This Week" animateValue={stats.weeklyGross} value="" icon={BarChart3} iconColor="hsl(var(--primary))" />
        <StatTile label="This Fortnight" animateValue={stats.fortnightGross} value="" icon={BarChart3} iconColor="hsl(var(--primary))" />
        <StatTile label="This Month" animateValue={stats.monthGross} value="" sub={`${stats.monthHours.toFixed(1)}h worked`} icon={DollarSign} iconColor="hsl(var(--money-green))" />
        <StatTile label={`${selectedYear} Total`} animateValue={stats.yearGross} value="" sub={`${stats.totalShifts} shifts`} icon={Star} iconColor="hsl(var(--stat-amber))" />
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

      {/* Monthly bar chart — animated */}
      <div className="card-elevated overflow-hidden">
        <div className="px-4 pt-4 pb-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Monthly Earnings {selectedYear}</p>
        </div>
        <div className="px-4 pb-4">
          <AnimatedBarChart
            data={stats.byMonth}
            selectedMonth={selectedMonth}
            maxGross={stats.maxMonthGross}
          />
          {stats.bestMonth.gross > 0 && (
            <p className="text-[10px] text-muted-foreground mt-3">
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
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: `hsl(var(--money-green)/${(0.3 + (pct / 100) * 0.7).toFixed(2)})`,
                      transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
                    }}
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

      <style>{`
        @keyframes heroFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes insightFadeIn {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
};

export default AnalyticsPanel;
