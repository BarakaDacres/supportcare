import { useState, useEffect, useRef } from 'react';
import { Ellipsis, Sun, Moon, SunMoon } from 'lucide-react';
import ActionSheet from './ActionSheet';

interface MobileHeaderProps {
  year: number;
  month: number;
  theme: 'light' | 'dark';
  themeOverride: 'light' | 'dark' | 'system';
  locked: boolean;
  onToggleTheme: () => void;
  onToggleLock: () => void;
}

const MobileHeader = ({
  year, month, theme, themeOverride, locked, onToggleTheme, onToggleLock,
}: MobileHeaderProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

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
        className="sticky top-0 z-40 md:hidden no-print lg-header"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div
          className="px-4 transition-all duration-300"
          style={{
            paddingTop: collapsed ? 8 : 12,
            paddingBottom: collapsed ? 8 : 8,
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-3">
              <div
                className="shrink-0 rounded-[10px] flex items-center justify-center"
                style={{
                  width: 30, height: 30,
                  background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.78))',
                  boxShadow: '0 4px 12px hsl(var(--primary) / 0.4), 0 1px 0 hsl(0 0% 100% / 0.25) inset',
                  transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  transform: collapsed ? 'scale(0.85)' : 'scale(1)',
                }}
              >
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>SC</span>
              </div>
              <div className="min-w-0">
                <h1
                  className="font-bold text-foreground tracking-tight leading-tight transition-all duration-300"
                  style={{
                    fontSize: collapsed ? '0.95rem' : '1.3125rem',
                    letterSpacing: '-0.022em',
                  }}
                >
                  Support Care
                </h1>
                <p
                  className="text-[10.5px] text-muted-foreground font-medium leading-none transition-all duration-300"
                  style={{
                    marginTop: 2,
                    opacity: collapsed ? 0 : 1,
                    maxHeight: collapsed ? 0 : 14,
                    overflow: 'hidden',
                  }}
                >
                  Shift &amp; earnings tracker
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button onClick={onToggleTheme} className="lg-icon-btn" aria-label="Toggle theme">
                {themeOverride === 'system'
                  ? <SunMoon className="w-4 h-4 text-muted-foreground" />
                  : theme === 'light'
                    ? <Moon className="w-4 h-4 text-muted-foreground" />
                    : <Sun className="w-4 h-4 text-muted-foreground" />
                }
              </button>

              <button onClick={() => setSheetOpen(true)} className="lg-icon-btn" aria-label="More actions">
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
