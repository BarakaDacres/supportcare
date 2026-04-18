import { useEffect, useRef, useState } from 'react';
import { formatCurrency } from '@/lib/formatUtils';
import { DollarSign, TrendingUp, Calculator, Wallet } from 'lucide-react';

interface StatsCardsProps {
  monthGross: number;
  taxRate: number;
  yearGross: number;
  onTaxRateChange: (rate: number) => void;
  locked: boolean;
}

// Local count-up hook — ease-out cubic, 620ms
function useCountUp(target: number, duration = 620) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    fromRef.current = 0;
    startRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const p = Math.min((ts - startRef.current) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(fromRef.current + (target - fromRef.current) * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else setValue(target);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return value;
}

const AnimatedAmount = ({ value, className, style }: { value: number; className?: string; style?: React.CSSProperties }) => {
  const v = useCountUp(value);
  return <span className={className} style={style}>{formatCurrency(v)}</span>;
};

const StatsCards = ({ monthGross, taxRate, yearGross, onTaxRateChange, locked }: StatsCardsProps) => {
  const monthTax = monthGross * (taxRate / 100);
  const yearNet = yearGross - yearGross * (taxRate / 100);

  const cards = [
    { label: 'Month Gross',   value: monthGross, icon: DollarSign,  money: true,  accent: 'hsl(var(--money-green))' },
    { label: 'Month Tax',     value: monthTax,   icon: Calculator,  money: false, accent: 'hsl(var(--stat-red))' },
    { label: 'Year Gross',    value: yearGross,  icon: TrendingUp,  money: true,  accent: 'hsl(var(--money-green))' },
    { label: 'Year Net Est.', value: yearNet,    icon: Wallet,      money: false, accent: 'hsl(var(--primary))' },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {cards.map(card => (
          <div
            key={card.label}
            className="card-elevated overflow-hidden lg-tap"
            style={{ padding: '14px 14px' }}
          >
            <div className="flex items-center gap-1.5 mb-2 min-w-0">
              <div
                className="w-5 h-5 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${card.accent.replace(')', ' / 0.12)')}` }}
              >
                <card.icon className="w-3 h-3" style={{ color: card.accent }} />
              </div>
              <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
                {card.label}
              </span>
            </div>
            <AnimatedAmount
              value={card.value}
              className={`font-bold tracking-tight truncate block ${card.money ? 'money-text' : 'text-foreground'}`}
              style={{ fontSize: 'clamp(0.9rem, 3.4vw, 1.3rem)', letterSpacing: '-0.02em' }}
            />
          </div>
        ))}
      </div>

      {/* Tax rate row */}
      <div className="flex items-center gap-2.5 no-print">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
          Tax Rate
        </label>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={taxRate}
            onChange={e => onTaxRateChange(parseFloat(e.target.value) || 0)}
            disabled={locked}
            className="glass-input w-16 text-center text-foreground disabled:opacity-50"
            style={{ minHeight: 34, fontSize: '0.8rem' }}
          />
          <span className="text-xs font-semibold text-muted-foreground">%</span>
        </div>
      </div>
    </div>
  );
};

export default StatsCards;
