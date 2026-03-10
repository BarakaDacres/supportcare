import { formatCurrency } from '@/lib/formatUtils';
import { DollarSign, TrendingUp, Calculator, Wallet } from 'lucide-react';

interface StatsCardsProps {
  monthGross: number;
  taxRate: number;
  yearGross: number;
  onTaxRateChange: (rate: number) => void;
  locked: boolean;
}

const StatsCards = ({ monthGross, taxRate, yearGross, onTaxRateChange, locked }: StatsCardsProps) => {
  const monthTax = monthGross * (taxRate / 100);
  const yearNet = yearGross - yearGross * (taxRate / 100);

  const cards = [
    { label: 'Month Gross',   value: formatCurrency(monthGross), icon: DollarSign,  money: true,  glow: true  },
    { label: 'Month Tax',     value: formatCurrency(monthTax),   icon: Calculator,  money: false, glow: false },
    { label: 'Year Gross',    value: formatCurrency(yearGross),  icon: TrendingUp,  money: true,  glow: true  },
    { label: 'Year Net Est.', value: formatCurrency(yearNet),    icon: Wallet,      money: true,  glow: false },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {cards.map(card => (
          <div
            key={card.label}
            className={card.glow ? 'glass-card-glow overflow-hidden' : 'glass-card overflow-hidden'}
            style={{ padding: '12px 14px' }}
          >
            <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
              <card.icon className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
                {card.label}
              </span>
            </div>
            <p
              className={`font-bold tracking-tight truncate ${card.money ? 'money-text' : 'text-foreground'}`}
              style={{ fontSize: 'clamp(0.85rem, 3.2vw, 1.25rem)' }}
            >
              {card.value}
            </p>
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
