import { MONTH_NAMES } from '@/lib/dateUtils';
import { ChevronLeft, ChevronRight, Lock, LockOpen } from 'lucide-react';
import type { EntryMode } from '@/hooks/useIncomeStore';

interface ControlsBarProps {
  year: number;
  month: number;
  mode: EntryMode;
  locked: boolean;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  onModeChange: (mode: EntryMode) => void;
  onToggleLock: () => void;
}

const ControlsBar = ({
  year,
  month,
  mode,
  locked,
  onYearChange,
  onMonthChange,
  onModeChange,
  onToggleLock,
}: ControlsBarProps) => {
  const prevMonth = () => {
    if (month === 0) {
      onYearChange(year - 1);
      onMonthChange(11);
    } else {
      onMonthChange(month - 1);
    }
  };

  const nextMonth = () => {
    if (month === 11) {
      onYearChange(year + 1);
      onMonthChange(0);
    } else {
      onMonthChange(month + 1);
    }
  };

  return (
    <div className="no-print flex flex-wrap items-center gap-3">
      {/* Month navigation */}
      <div className="glass-card flex items-center gap-1 p-1">
        <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-secondary transition-colors">
          <ChevronLeft className="w-4 h-4 text-foreground" />
        </button>
        <span className="px-3 text-sm font-bold text-foreground min-w-[130px] text-center">
          {MONTH_NAMES[month]} {year}
        </span>
        <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-secondary transition-colors">
          <ChevronRight className="w-4 h-4 text-foreground" />
        </button>
      </div>

      {/* Segmented toggle */}
      <div className="segmented-control">
        <button
          onClick={() => onModeChange('weekly')}
          className={mode === 'weekly' ? 'segmented-button-active' : 'segmented-button'}
        >
          Weekly
        </button>
        <button
          onClick={() => onModeChange('fortnightly')}
          className={mode === 'fortnightly' ? 'segmented-button-active' : 'segmented-button'}
        >
          Fortnightly
        </button>
      </div>

      {/* Lock control */}
      <button onClick={onToggleLock} className="glass-chip hover:opacity-80 transition-opacity">
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: locked ? 'hsl(var(--destructive))' : 'hsl(var(--stat-green))' }}
        />
        {locked ? (
          <>
            <Lock className="w-3 h-3" />
            <span>Month Locked</span>
          </>
        ) : (
          <>
            <LockOpen className="w-3 h-3" />
            <span>Month Open</span>
          </>
        )}
      </button>
    </div>
  );
};

export default ControlsBar;
