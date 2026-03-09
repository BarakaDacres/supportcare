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

const YearlyOverview = ({
  year, activeMonth, getMonthGross, isMonthLocked, onMonthClick,
}: YearlyOverviewProps) => {
  const monthTotals = Array.from({ length: 12 }, (_, i) => getMonthGross(year, i));
  const yearTotal = monthTotals.reduce((s, v) => s + v, 0);
  const nonZeroMonths = monthTotals.filter(v => v > 0);
  const avgMonth = nonZeroMonths.length > 0 ? yearTotal / nonZeroMonths.length : 0;
  const bestMonthValue = Math.max(...monthTotals, 0);
  const bestMonthIndex = monthTotals.indexOf(bestMonthValue);
  const maxForBar = bestMonthValue || 1;

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold text-foreground">{year} Overview</h2>

      {/* KPI cards — compact on mobile */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { Icon: TrendingUp, label: 'Year Total', value: formatCurrency(yearTotal), glow: true },
          { Icon: BarChart3,  label: 'Avg Month',  value: formatCurrency(avgMonth),  glow: false },
          { Icon: Award,      label: 'Best Month', value: bestMonthValue > 0 ? MONTH_SHORT[bestMonthIndex] : '—', glow: false },
        ].map(({ Icon, label, value, glow }) => (
          <div
            key={label}
            className={glow ? 'glass-card-glow text-center' : 'glass-card text-center'}
            style={{ padding: '10px 8px' }}
          >
            <Icon className="w-4 h-4 mx-auto mb-1" style={{ color: glow ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }} />
            <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider leading-none mb-1">{label}</p>
            <p className="text-sm font-bold text-foreground leading-tight">{value}</p>
          </div>
        ))}
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {MONTH_SHORT.map((name, i) => {
          const total = monthTotals[i];
          const pct = yearTotal > 0 ? (total / yearTotal) * 100 : 0;
          const barWidth = (total / maxForBar) * 100;
          const isLocked = isMonthLocked(year, i);
          const isActive = i === activeMonth;

          return (
            <button
              key={name}
              onClick={() => onMonthClick(i)}
              className={isActive ? 'month-card-active' : 'month-card'}
              style={{ padding: '10px 10px 8px' }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-foreground">{name}</span>
                {isLocked ? (
                  <Lock className="w-2.5 h-2.5 text-muted-foreground" />
                ) : (
                  <Unlock className="w-2.5 h-2.5 text-muted-foreground opacity-30" />
                )}
              </div>
              <p className="text-xs font-semibold text-foreground mb-1.5 leading-none">
                {formatCurrency(total)}
              </p>
              <div className="progress-bar" style={{ height: 3 }}>
                <div className="progress-fill" style={{ width: `${barWidth}%` }} />
              </div>
              <p className="text-[9px] text-muted-foreground mt-1 font-medium leading-none">
                {pct.toFixed(0)}%
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default YearlyOverview;
