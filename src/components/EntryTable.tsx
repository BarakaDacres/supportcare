import { getWeekRangesForMonth, getFortnightRanges } from '@/lib/dateUtils';
import { formatCurrency, safeNum } from '@/lib/formatUtils';
import type { EntryMode } from '@/hooks/useIncomeStore';
import { useIsMobile } from '@/hooks/use-mobile';

interface EntryTableProps {
  year: number;
  month: number;
  mode: EntryMode;
  weeklyEntries: number[];
  fortnightlyEntries: number[];
  locked: boolean;
  onWeeklyChange: (index: number, value: number) => void;
  onFortnightlyChange: (index: number, value: number) => void;
}

const EntryTable = ({
  year, month, mode, weeklyEntries, fortnightlyEntries, locked,
  onWeeklyChange, onFortnightlyChange,
}: EntryTableProps) => {
  const weeks = getWeekRangesForMonth(year, month);
  const fortnights = getFortnightRanges(year, month);
  const isMobile = useIsMobile();

  if (mode === 'weekly') {
    // Mobile: card layout
    if (isMobile) {
      return (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Weekly Income
          </h3>
          {weeks.map((week, i) => (
            <div key={i} className="entry-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground">W{i + 1}</span>
                <span className="text-xs text-muted-foreground">{week.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  inputMode="decimal"
                  value={safeNum(weeklyEntries[i]) || ''}
                  placeholder="0.00"
                  onChange={(e) => onWeeklyChange(i, parseFloat(e.target.value) || 0)}
                  disabled={locked}
                  className="glass-input flex-1 text-foreground disabled:opacity-50 min-h-[44px] text-base"
                />
                <span className="text-sm font-semibold text-foreground min-w-[70px] text-right">
                  {formatCurrency(safeNum(weeklyEntries[i]))}
                </span>
              </div>
            </div>
          ))}
        </div>
      );
    }

    // Desktop: row layout
    return (
      <div className="glass-card p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Weekly Income
        </h3>
        <div className="space-y-3">
          {weeks.map((week, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs font-bold text-muted-foreground w-6 shrink-0">W{i + 1}</span>
              <span className="text-xs text-muted-foreground min-w-[140px]">{week.label}</span>
              <div className="flex-1 flex items-center gap-2">
                <span className="text-muted-foreground text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={safeNum(weeklyEntries[i]) || ''}
                  placeholder="0.00"
                  onChange={(e) => onWeeklyChange(i, parseFloat(e.target.value) || 0)}
                  disabled={locked}
                  className="glass-input flex-1 text-foreground disabled:opacity-50"
                />
              </div>
              <span className="text-sm font-semibold text-foreground min-w-[80px] text-right">
                {formatCurrency(safeNum(weeklyEntries[i]))}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Fortnightly mode
  if (isMobile) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Fortnightly Income
        </h3>
        {fortnights.map((fn, i) => {
          const derivedValue = fn.weeks.reduce((s, wi) => s + safeNum(weeklyEntries[wi]), 0);
          const explicitValue = safeNum(fortnightlyEntries[i]);
          const displayValue = explicitValue > 0 ? explicitValue : derivedValue;
          const isDerived = explicitValue === 0 && derivedValue > 0;

          return (
            <div key={i} className="entry-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground">F{i + 1}</span>
                <span className="text-xs text-muted-foreground">{fn.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  inputMode="decimal"
                  value={explicitValue || ''}
                  placeholder={derivedValue > 0 ? derivedValue.toFixed(2) : '0.00'}
                  onChange={(e) => onFortnightlyChange(i, parseFloat(e.target.value) || 0)}
                  disabled={locked}
                  className="glass-input flex-1 text-foreground disabled:opacity-50 min-h-[44px] text-base"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">
                  {formatCurrency(displayValue)}
                </span>
                {isDerived && (
                  <span className="text-[10px] text-muted-foreground">auto-derived</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Desktop fortnightly
  return (
    <div className="glass-card p-4 sm:p-6">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        Fortnightly Income
      </h3>
      <div className="space-y-3">
        {fortnights.map((fn, i) => {
          const derivedValue = fn.weeks.reduce((s, wi) => s + safeNum(weeklyEntries[wi]), 0);
          const explicitValue = safeNum(fortnightlyEntries[i]);
          const displayValue = explicitValue > 0 ? explicitValue : derivedValue;
          const isDerived = explicitValue === 0 && derivedValue > 0;

          return (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs font-bold text-muted-foreground w-6 shrink-0">F{i + 1}</span>
              <span className="text-xs text-muted-foreground min-w-[140px]">{fn.label}</span>
              <div className="flex-1 flex items-center gap-2">
                <span className="text-muted-foreground text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={explicitValue || ''}
                  placeholder={derivedValue > 0 ? derivedValue.toFixed(2) : '0.00'}
                  onChange={(e) => onFortnightlyChange(i, parseFloat(e.target.value) || 0)}
                  disabled={locked}
                  className="glass-input flex-1 text-foreground disabled:opacity-50"
                />
              </div>
              <div className="text-right min-w-[80px]">
                <span className="text-sm font-semibold text-foreground">
                  {formatCurrency(displayValue)}
                </span>
                {isDerived && (
                  <span className="block text-[10px] text-muted-foreground">auto</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default EntryTable;
