import { Sun, Moon, Printer, Lock, LockOpen } from 'lucide-react';
import type { EntryMode } from '@/hooks/useIncomeStore';
import { MONTH_NAMES } from '@/lib/dateUtils';

interface SettingsPanelProps {
  year: number;
  month: number;
  mode: EntryMode;
  taxRate: number;
  locked: boolean;
  theme: 'light' | 'dark';
  onYearChange: (y: number) => void;
  onMonthChange: (m: number) => void;
  onModeChange: (mode: EntryMode) => void;
  onTaxRateChange: (rate: number) => void;
  onToggleLock: () => void;
  onToggleTheme: () => void;
}

const SettingsPanel = ({
  year, month, mode, taxRate, locked, theme,
  onYearChange, onMonthChange, onModeChange, onTaxRateChange, onToggleLock, onToggleTheme,
}: SettingsPanelProps) => {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-foreground">Settings</h2>

      {/* Year */}
      <div className="glass-card p-4 space-y-3">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Year</label>
        <div className="flex items-center gap-3">
          <button onClick={() => onYearChange(year - 1)} className="glass-chip min-h-[44px] min-w-[44px] flex items-center justify-center">−</button>
          <span className="text-lg font-bold text-foreground flex-1 text-center">{year}</span>
          <button onClick={() => onYearChange(year + 1)} className="glass-chip min-h-[44px] min-w-[44px] flex items-center justify-center">+</button>
        </div>
      </div>

      {/* Month */}
      <div className="glass-card p-4 space-y-3">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Month</label>
        <select
          value={month}
          onChange={(e) => onMonthChange(parseInt(e.target.value))}
          className="glass-input w-full text-foreground min-h-[44px]"
        >
          {MONTH_NAMES.map((name, i) => (
            <option key={i} value={i}>{name}</option>
          ))}
        </select>
      </div>

      {/* Entry Mode */}
      <div className="glass-card p-4 space-y-3">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Entry Mode</label>
        <div className="segmented-control w-full">
          <button
            onClick={() => onModeChange('weekly')}
            className={`flex-1 ${mode === 'weekly' ? 'segmented-button-active' : 'segmented-button'}`}
          >
            Weekly
          </button>
          <button
            onClick={() => onModeChange('fortnightly')}
            className={`flex-1 ${mode === 'fortnightly' ? 'segmented-button-active' : 'segmented-button'}`}
          >
            Fortnightly
          </button>
        </div>
      </div>

      {/* Tax Rate */}
      <div className="glass-card p-4 space-y-3">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tax Rate</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={taxRate}
            onChange={(e) => onTaxRateChange(parseFloat(e.target.value) || 0)}
            className="glass-input flex-1 text-foreground min-h-[44px]"
          />
          <span className="text-sm font-semibold text-muted-foreground">%</span>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <button
          onClick={onToggleLock}
          className="w-full glass-card p-4 flex items-center gap-3 min-h-[44px] hover:opacity-80 transition-opacity"
        >
          {locked ? <Lock className="w-5 h-5 text-destructive" /> : <LockOpen className="w-5 h-5 text-muted-foreground" />}
          <span className="text-sm font-semibold text-foreground">
            {locked ? 'Unlock Month' : 'Lock Month'}
          </span>
        </button>
        <button
          onClick={onToggleTheme}
          className="w-full glass-card p-4 flex items-center gap-3 min-h-[44px] hover:opacity-80 transition-opacity"
        >
          {theme === 'light' ? <Moon className="w-5 h-5 text-muted-foreground" /> : <Sun className="w-5 h-5 text-muted-foreground" />}
          <span className="text-sm font-semibold text-foreground">
            {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
          </span>
        </button>
        <button
          onClick={() => window.print()}
          className="w-full glass-card p-4 flex items-center gap-3 min-h-[44px] hover:opacity-80 transition-opacity"
        >
          <Printer className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Print Report</span>
        </button>
      </div>
    </div>
  );
};

export default SettingsPanel;
