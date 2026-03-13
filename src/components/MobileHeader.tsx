import { useState, useEffect, useRef } from 'react';
import { Ellipsis, Sun, Moon } from 'lucide-react';
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
      <div ref={sentinelRef} className="h-0 w-full" aria-hidden="true" />

      <header
        className="sticky top-0 z-40 md:hidden no-print"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="header-glass px-4 transition-all duration-200" style={{ paddingTop: collapsed ? 8 : 10, paddingBottom: collapsed ? 8 : 6 }}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-3">
              {/* Logo dot */}
              <div
                className="shrink-0 w-7 h-7 rounded-[9px] flex items-center justify-center"
                style={{
                  background: 'hsl(var(--primary))',
                  boxShadow: '0 2px 8px hsl(var(--primary) / 0.35)',
                  transition: 'transform 0.2s ease',
                  transform: collapsed ? 'scale(0.85)' : 'scale(1)',
                }}
              >
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>SC</span>
              </div>
              <div>
                <h1
                  className="font-bold text-foreground tracking-tight leading-tight transition-all duration-200"
                  style={{ fontSize: collapsed ? '0.9375rem' : '1.25rem' }}
                >
                  Support Care
                </h1>
                {!collapsed && (
                  <p className="text-[10px] text-muted-foreground font-medium mt-0 leading-none">
                    Shift &amp; earnings tracker
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Theme toggle */}
              <button
                onClick={onToggleTheme}
                className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                style={{ background: 'hsl(var(--secondary))', border: '1px solid hsl(var(--border))' }}
                aria-label="Toggle theme"
              >
                {theme === 'light'
                  ? <Moon className="w-3.5 h-3.5 text-muted-foreground" />
                  : <Sun className="w-3.5 h-3.5 text-muted-foreground" />
                }
              </button>
              {/* More actions */}
              <button
                onClick={() => setSheetOpen(true)}
                className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                style={{ background: 'hsl(var(--secondary))', border: '1px solid hsl(var(--border))' }}
                aria-label="More actions"
              >
                <Ellipsis className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>

        {/* Context chips row */}
        <div className="context-bar-glass px-4 py-1.5 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold"
            style={{ background: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}
          >
            {MONTH_NAMES[month]} {year}
          </span>
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize"
            style={{ background: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }}
          >
            {mode}
          </span>
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold flex items-center gap-1"
            style={{
              background: locked ? 'hsl(var(--destructive) / 0.1)' : 'hsl(var(--stat-green) / 0.12)',
              color: locked ? 'hsl(var(--destructive))' : 'hsl(var(--stat-green))',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
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
