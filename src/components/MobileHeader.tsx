import { useState, useEffect, useRef } from 'react';
import { Ellipsis, Sun, Moon } from 'lucide-react';
import ActionSheet from './ActionSheet';

interface MobileHeaderProps {
  year: number;
  month: number;
  theme: 'light' | 'dark';
  locked: boolean;
  onToggleTheme: () => void;
  onToggleLock: () => void;
}

const MobileHeader = ({
  year, month, mode, theme, locked, onToggleTheme, onToggleLock, onModeChange,
}: MobileHeaderProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // suppress unused vars for year/month — kept in props for future use
  void year; void month;

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
            {/* Left: logo + title */}
            <div className="min-w-0 flex items-center gap-3">
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

            {/* Right: Week/Month toggle + action buttons */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Compact Week / Month segmented toggle */}
              <div
                className="flex items-center rounded-[10px] p-[3px] gap-[2px]"
                style={{
                  background: 'hsl(var(--secondary))',
                  border: '0.5px solid hsl(var(--border))',
                }}
              >
                {(['weekly', 'fortnightly'] as EntryMode[]).map((m) => {
                  const label = m === 'weekly' ? 'Week' : 'Month';
                  const isActive = mode === m;
                  return (
                    <button
                      key={m}
                      onClick={() => onModeChange(m)}
                      className="px-2.5 py-1 rounded-[7px] text-[10px] font-semibold transition-all duration-150"
                      style={{
                        background: isActive ? 'hsl(var(--card))' : 'transparent',
                        color: isActive ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                        boxShadow: isActive ? '0 1px 3px hsl(var(--foreground)/0.08)' : 'none',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

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
