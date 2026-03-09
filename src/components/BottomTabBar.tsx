import { LayoutDashboard, ClipboardList, BarChart2, FileText, Settings } from 'lucide-react';

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
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 md:hidden no-print transition-all duration-200"
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
      {/* Pill container — sits above the safe area */}
      <div className="mx-3 mb-2 rounded-[26px] ios26-tab-pill">
        <div className="flex items-center justify-around h-[50px] px-1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-label={tab.label}
                onClick={() => onTabChange(tab.id)}
                className={[
                  'relative flex flex-col items-center justify-center gap-[2px]',
                  'min-h-[42px] min-w-[52px] px-1.5 rounded-[20px]',
                  'transition-all duration-250 ease-out select-none',
                  isActive ? 'ios26-tab-active' : 'ios26-tab-inactive',
                ].join(' ')}
              >
                {isActive && (
                  <span
                    className="absolute inset-0 rounded-[20px] ios26-active-pill"
                    aria-hidden="true"
                  />
                )}
                <tab.icon
                  className="relative transition-all duration-250"
                  style={{
                    width: 18,
                    height: 18,
                    strokeWidth: isActive ? 2.2 : 1.7,
                    color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                  }}
                />
                <span
                  className="relative text-[9px] font-semibold leading-none transition-all duration-250"
                  style={{ color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}
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
