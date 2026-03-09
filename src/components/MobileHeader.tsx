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

const MobileHeader = ({
  year, month, mode, theme, locked, onToggleTheme, onToggleLock,
}: MobileHeaderProps) => {
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

      <header
        className="sticky top-0 z-40 md:hidden no-print transition-all duration-300"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        {/* Title row */}
        <div
          className={`header-glass px-4 transition-all duration-300 ${
            collapsed ? 'py-2' : 'pb-2 pt-2.5'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1
                className="font-bold text-foreground tracking-tight transition-all duration-300 leading-tight"
                style={{ fontSize: collapsed ? '1rem' : '1.35rem' }}
              >
                Income Ledger
              </h1>
              {!collapsed && (
                <p className="text-[11px] text-muted-foreground font-medium mt-0.5 leading-none">
                  Track your earnings
                </p>
              )}
            </div>
            <button
              onClick={() => setSheetOpen(true)}
              className="glass-chip shrink-0 flex items-center justify-center"
              style={{ minHeight: 36, minWidth: 36, padding: 0 }}
              aria-label="More actions"
            >
              <Ellipsis className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Context chips row */}
        <div
          className="context-bar-glass px-4 py-1.5 flex items-center gap-1.5 overflow-x-auto scrollbar-none"
        >
          <span className="glass-chip shrink-0 text-[11px] py-1 px-2.5">{year}</span>
          <span className="glass-chip shrink-0 text-[11px] py-1 px-2.5">{MONTH_NAMES[month]}</span>
          <span className="glass-chip shrink-0 text-[11px] py-1 px-2.5 capitalize">{mode}</span>
          <span
            className="glass-chip shrink-0 text-[11px] py-1 px-2.5"
            style={{ color: locked ? 'hsl(var(--destructive))' : 'hsl(var(--stat-green))' }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full inline-block mr-1 shrink-0"
              style={{
                background: locked ? 'hsl(var(--destructive))' : 'hsl(var(--stat-green))',
              }}
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
