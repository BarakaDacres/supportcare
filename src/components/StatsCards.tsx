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
    {
      label: 'Month Gross',
      value: formatCurrency(monthGross),
      icon: DollarSign,
      glow: true,
    },
    {
      label: 'Month Est. Tax',
      value: formatCurrency(monthTax),
      icon: Calculator,
      glow: false,
    },
    {
      label: 'Year Gross',
      value: formatCurrency(yearGross),
      icon: TrendingUp,
      glow: true,
    },
    {
      label: 'Year Net (Est.)',
      value: formatCurrency(yearNet),
      icon: Wallet,
      glow: false,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className={card.glow ? 'glass-card-glow p-4 overflow-hidden' : 'glass-card p-4 overflow-hidden'}>
            <div className="flex items-center gap-1.5 mb-2 min-w-0">
              <card.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
                {card.label}
              </span>
            </div>
            <p
              className="font-bold tracking-tight text-foreground truncate"
              style={{
                fontSize: 'clamp(0.9rem, 3.5vw, 1.375rem)',
                textShadow: card.glow ? '0 0 24px hsl(var(--primary) / 0.45)' : undefined,
              }}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 no-print">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Tax Rate
        </label>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={taxRate}
            onChange={(e) => onTaxRateChange(parseFloat(e.target.value) || 0)}
            disabled={locked}
            className="glass-input w-20 text-center text-foreground disabled:opacity-50"
          />
          <span className="text-sm font-semibold text-muted-foreground">%</span>
        </div>
      </div>
    </div>
  );
};

export default StatsCards;
