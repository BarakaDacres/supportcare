import { MONTH_SHORT } from '@/lib/dateUtils';
import { formatCurrency } from '@/lib/formatUtils';
import { Lock, Unlock, TrendingUp, BarChart3, Award } from 'lucide-react';

interface YearlyOverviewProps {
  year: number;
  activeMonth: number;
  getMonthGross: (year: number, month: number) => number;
  isMonthLocked: (year: number, month: number) => boolean;
  onMonthClick: (month: number) => void;
}

const YearlyOverview = ({ year, activeMonth, getMonthGross, isMonthLocked, onMonthClick }: YearlyOverviewProps) => {
  const monthTotals = Array.from({ length: 12 }, (_, i) => getMonthGross(year, i));
  const yearTotal = monthTotals.reduce((s, v) => s + v, 0);
  const nonZeroMonths = monthTotals.filter(v => v > 0);
  const avgMonth = nonZeroMonths.length > 0 ? yearTotal / nonZeroMonths.length : 0;
  const bestMonthValue = Math.max(...monthTotals, 0);
  const bestMonthIndex = monthTotals.indexOf(bestMonthValue);
  const maxForBar = bestMonthValue || 1;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-foreground">
        {year} Overview
      </h2>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card-glow p-4 text-center">
          <TrendingUp className="w-5 h-5 mx-auto text-primary mb-1" />
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Year Total</p>
          <p className="text-lg font-bold text-foreground mt-0.5">{formatCurrency(yearTotal)}</p>
        </div>
        <div className="glass-card p-4 text-center">
          <BarChart3 className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Avg Month</p>
          <p className="text-lg font-bold text-foreground mt-0.5">{formatCurrency(avgMonth)}</p>
        </div>
        <div className="glass-card p-4 text-center">
          <Award className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Best Month</p>
          <p className="text-lg font-bold text-foreground mt-0.5">
            {bestMonthValue > 0 ? MONTH_SHORT[bestMonthIndex] : '—'}
          </p>
        </div>
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {MONTH_SHORT.map((name, i) => {
          const total = monthTotals[i];
          const pct = yearTotal > 0 ? ((total / yearTotal) * 100) : 0;
          const barWidth = (total / maxForBar) * 100;
          const locked = isMonthLocked(year, i);
          const isActive = i === activeMonth;

          return (
            <button
              key={name}
              onClick={() => onMonthClick(i)}
              className={isActive ? 'month-card-active' : 'month-card'}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-foreground">{name}</span>
                {locked ? (
                  <Lock className="w-3 h-3 text-muted-foreground" />
                ) : (
                  <Unlock className="w-3 h-3 text-muted-foreground opacity-40" />
                )}
              </div>
              <p className="text-sm font-semibold text-foreground mb-1.5">
                {formatCurrency(total)}
              </p>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${barWidth}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 font-medium">
                {pct.toFixed(1)}% of year
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default YearlyOverview;
