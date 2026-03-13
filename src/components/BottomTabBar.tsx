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
  // Animate the active indicator pill sliding between tabs
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pill = pillRef.current;
    const indicator = indicatorRef.current;
    if (!pill || !indicator) return;
    const buttons = pill.querySelectorAll<HTMLButtonElement>('[data-tab]');
    const activeBtn = pill.querySelector<HTMLButtonElement>(`[data-tab="${activeTab}"]`);
    if (!activeBtn) return;

    const pillRect = pill.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    const left = btnRect.left - pillRect.left;
    const width = btnRect.width;

    indicator.style.transform = `translateX(${left}px)`;
    indicator.style.width = `${width}px`;
  }, [activeTab]);

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 md:hidden no-print transition-all duration-300"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? 'none' : 'auto',
        transform: hidden ? 'translateY(100%)' : 'translateY(0)',
      }}
      aria-hidden={hidden}
      role="tablist"
      aria-label="Main navigation"
    >
      {/* Pill container */}
      <div className="mx-3 mb-2 rounded-[26px] ios26-tab-pill relative" ref={pillRef}>
        {/* Sliding active background indicator */}
        <span
          ref={indicatorRef}
          aria-hidden="true"
          className="absolute top-[5px] h-[40px] rounded-[18px] ios26-active-pill pointer-events-none"
          style={{
            transition: 'transform 0.28s cubic-bezier(0.34, 1.3, 0.64, 1), width 0.22s ease',
            willChange: 'transform, width',
          }}
        />

        <div className="flex items-center justify-around h-[50px] px-1 relative">
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
                className={[
                  'relative flex flex-col items-center justify-center gap-[2px] z-10',
                  'min-h-[42px] min-w-[52px] px-1.5 rounded-[18px]',
                  'select-none active:scale-95',
                ].join(' ')}
                style={{ transition: 'transform 0.15s ease' }}
              >
                <tab.icon
                  style={{
                    width: 18,
                    height: 18,
                    strokeWidth: isActive ? 2.2 : 1.7,
                    color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                    transition: 'color 0.2s ease, stroke-width 0.2s ease',
                  }}
                />
                <span
                  className="text-[9px] font-semibold leading-none"
                  style={{
                    color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                    transition: 'color 0.2s ease',
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
