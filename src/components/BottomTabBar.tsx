import { LayoutDashboard, ClipboardList, BarChart2, FileText, Settings } from 'lucide-react';
import { useEffect, useRef } from 'react';

export type TabId = 'overview' | 'shifts' | 'analytics' | 'invoices' | 'settings';

interface BottomTabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  hidden?: boolean;
}

const tabs: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview',  label: 'Overview',  icon: LayoutDashboard },
  { id: 'shifts',    label: 'Shifts',    icon: ClipboardList   },
  { id: 'analytics', label: 'Analytics', icon: BarChart2       },
  { id: 'invoices',  label: 'Invoices',  icon: FileText        },
  { id: 'settings',  label: 'Settings',  icon: Settings        },
];

const BottomTabBar = ({ activeTab, onTabChange, hidden = false }: BottomTabBarProps) => {
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const prevTabRef = useRef<TabId>(activeTab);

  useEffect(() => {
    const pill = pillRef.current;
    const indicator = indicatorRef.current;
    if (!pill || !indicator) return;

    const activeBtn = pill.querySelector<HTMLButtonElement>(`[data-tab="${activeTab}"]`);
    if (!activeBtn) return;

    const pillRect = pill.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    const left = btnRect.left - pillRect.left;
    const width = btnRect.width;

    // No transition on first mount
    if (prevTabRef.current === activeTab && !indicator.style.transform) {
      indicator.style.transition = 'none';
    } else {
      indicator.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.2, 0.64, 1), width 0.22s ease, opacity 0.15s ease';
    }
    indicator.style.transform = `translateX(${left}px)`;
    indicator.style.width = `${width}px`;
    prevTabRef.current = activeTab;
  }, [activeTab]);

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 md:hidden no-print"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? 'none' : 'auto',
        transform: hidden ? 'translateY(100%)' : 'translateY(0)',
        transition: 'opacity 0.25s ease, transform 0.3s cubic-bezier(0.4,0,0.2,1)',
      }}
      aria-hidden={hidden}
      role="tablist"
      aria-label="Main navigation"
    >
      {/* outer glow fade */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to top, hsl(var(--background) / 0.6) 0%, transparent 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Pill container */}
      <div className="mx-3 mb-2.5 rounded-[28px] ios26-tab-pill relative overflow-hidden" ref={pillRef}>
        {/* Sliding active background */}
        <span
          ref={indicatorRef}
          aria-hidden="true"
          className="absolute top-[5px] h-[42px] rounded-[20px] ios26-active-pill pointer-events-none"
          style={{ willChange: 'transform, width' }}
        />

        <div className="flex items-center justify-around h-[52px] px-1 relative">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                data-tab={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-label={tab.label}
                onClick={() => onTabChange(tab.id)}
                className="relative flex flex-col items-center justify-center gap-[2px] z-10 min-h-[44px] min-w-[56px] px-2 rounded-[20px] select-none"
                style={{ transition: 'transform 0.12s ease', WebkitTapHighlightColor: 'transparent' }}
                onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.92)')}
                onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                onPointerLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <tab.icon
                  style={{
                    width: isActive ? 19 : 18,
                    height: isActive ? 19 : 18,
                    strokeWidth: isActive ? 2.3 : 1.6,
                    color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                    transition: 'color 0.2s ease, stroke-width 0.2s ease, width 0.2s ease',
                  }}
                />
                <span
                  style={{
                    fontSize: '0.5625rem',
                    fontWeight: isActive ? 700 : 500,
                    lineHeight: 1,
                    letterSpacing: isActive ? '0.01em' : '0',
                    color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                    transition: 'color 0.2s ease, font-weight 0.2s ease',
                  }}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default BottomTabBar;
