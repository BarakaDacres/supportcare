import { LayoutDashboard, PenLine, CalendarDays, Settings } from 'lucide-react';

export type TabId = 'overview' | 'entries' | 'yearly' | 'settings';

interface BottomTabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const tabs: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview',  label: 'Overview', icon: LayoutDashboard },
  { id: 'entries',   label: 'Entries',  icon: PenLine        },
  { id: 'yearly',    label: 'Yearly',   icon: CalendarDays   },
  { id: 'settings',  label: 'Settings', icon: Settings       },
];

const BottomTabBar = ({ activeTab, onTabChange }: BottomTabBarProps) => {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 md:hidden no-print ios26-tab-bar"
      role="tablist"
      aria-label="Main navigation"
    >
      {/* Liquid glass pill row */}
      <div
        className="mx-4 mb-3 rounded-[28px] ios26-tab-pill"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 8px), 8px)' }}
      >
        <div className="flex items-center justify-around h-[56px] px-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-label={tab.label}
                onClick={() => onTabChange(tab.id)}
                className={`relative flex flex-col items-center justify-center gap-[3px] min-h-[44px] min-w-[68px] px-3 rounded-[22px] transition-all duration-300 ease-out select-none
                  ${isActive ? 'ios26-tab-active' : 'ios26-tab-inactive'}`}
              >
                {/* Active pill background */}
                {isActive && (
                  <span
                    className="absolute inset-0 rounded-[22px] ios26-active-pill"
                    aria-hidden="true"
                  />
                )}
                <tab.icon
                  className={`relative w-[22px] h-[22px] transition-all duration-300 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
                  strokeWidth={isActive ? 2.2 : 1.7}
                />
                <span
                  className={`relative text-[10px] font-semibold leading-none transition-all duration-300 ${
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  }`}
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
