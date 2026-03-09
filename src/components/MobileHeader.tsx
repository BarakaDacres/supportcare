import { useState, useEffect, useRef } from 'react';
import { Ellipsis } from 'lucide-react';
import { MONTH_NAMES } from '@/lib/dateUtils';
import type { EntryMode } from '@/hooks/useIncomeStore';
import ActionSheet from './ActionSheet';

interface MobileHeaderProps {
  year: number;
  month: number;
  mode: EntryMode;
  theme: 'light' | 'dark';
  locked: boolean;
  onToggleTheme: () => void;
  onToggleLock: () => void;
}

const MobileHeader = ({ year, month, mode, theme, locked, onToggleTheme, onToggleLock }: MobileHeaderProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setCollapsed(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Scroll sentinel */}
      <div ref={sentinelRef} className="h-0 w-full" aria-hidden="true" />

      {/* Header */}
      <header
        className="sticky top-0 z-40 md:hidden no-print transition-all duration-300"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className={`header-glass px-4 transition-all duration-300 ${collapsed ? 'py-2' : 'pt-3 pb-2'}`}>
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <h1 className={`font-bold text-foreground tracking-tight transition-all duration-300 ${collapsed ? 'text-base' : 'text-2xl'}`}>
                Income Ledger
              </h1>
              {!collapsed && (
                <p className="text-xs text-muted-foreground font-medium mt-0.5">
                  Track your earnings with clarity
                </p>
              )}
            </div>
            <button
              onClick={() => setSheetOpen(true)}
              className="glass-chip hover:opacity-80 transition-opacity min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="More actions"
            >
              <Ellipsis className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sticky context row */}
        <div className="context-bar-glass px-4 py-2 flex items-center gap-2 text-xs font-semibold overflow-x-auto">
          <span className="glass-chip shrink-0">{year}</span>
          <span className="glass-chip shrink-0">{MONTH_NAMES[month]}</span>
          <span className="glass-chip shrink-0 capitalize">{mode}</span>
          <span
            className="glass-chip shrink-0"
            style={{ color: locked ? 'hsl(var(--destructive))' : 'hsl(var(--stat-green))' }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full inline-block mr-1"
              style={{ background: locked ? 'hsl(var(--destructive))' : 'hsl(var(--stat-green))' }}
            />
            {locked ? 'Locked' : 'Open'}
          </span>
        </div>
      </header>

      <ActionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        theme={theme}
        locked={locked}
        onToggleTheme={onToggleTheme}
        onToggleLock={onToggleLock}
      />
    </>
  );
};

export default MobileHeader;
