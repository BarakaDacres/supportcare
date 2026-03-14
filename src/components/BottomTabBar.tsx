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
  const mountedRef = useRef(false);

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

    if (!mountedRef.current) {
      // No transition on very first mount
      indicator.style.transition = 'none';
      mountedRef.current = true;
    } else {
      indicator.style.transition =
        'transform 0.32s cubic-bezier(0.34, 1.3, 0.64, 1), width 0.24s ease, opacity 0.15s ease';
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
      {/* Pill container — floating, sculpted, glass morphic */}
      <div
        className="mx-4 mb-3"
        ref={pillRef}
        style={{
          position: 'relative',
          borderRadius: 36,
          background: 'hsl(var(--lg-pill-bg))',
          backdropFilter: 'blur(48px) saturate(200%) brightness(1.04)',
          WebkitBackdropFilter: 'blur(48px) saturate(200%) brightness(1.04)',
          border: '1px solid hsl(var(--lg-pill-border))',
          boxShadow:
            '0 12px 40px hsl(var(--lg-pill-shadow-color)),' +
            '0 4px 12px hsl(var(--lg-pill-shadow-color)),' +
            'inset 0 1px 0 hsl(var(--lg-specular)),' +
            'inset 0 -0.5px 0 hsl(var(--lg-pill-border))',
          overflow: 'hidden',
        }}
      >
        {/* Sliding active background — lives inside the pill */}
        <span
          ref={indicatorRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 5,
            height: 44,
            borderRadius: 28,
            background: 'hsl(var(--lg-active-bg))',
            border: '1px solid hsl(var(--lg-active-border))',
            boxShadow: 'inset 0 0.5px 0 hsl(var(--lg-specular))',
            willChange: 'transform, width',
            pointerEvents: 'none',
          }}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-around',
            height: 56,
            paddingLeft: 4,
            paddingRight: 4,
            position: 'relative',
          }}
        >
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
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  zIndex: 10,
                  minHeight: 44,
                  minWidth: 56,
                  paddingLeft: 8,
                  paddingRight: 8,
                  borderRadius: 28,
                  userSelect: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  transition: 'transform 0.1s ease',
                  cursor: 'pointer',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                }}
                onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.88)')}
                onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                onPointerLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <tab.icon
                  style={{
                    width: isActive ? 20 : 18,
                    height: isActive ? 20 : 18,
                    strokeWidth: isActive ? 2.4 : 1.6,
                    color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                    transition: 'color 0.22s ease, stroke-width 0.22s ease, width 0.22s ease, height 0.22s ease',
                  }}
                />
                <span
                  style={{
                    fontSize: '0.5625rem',
                    fontWeight: isActive ? 700 : 500,
                    lineHeight: 1,
                    letterSpacing: isActive ? '0.01em' : '0',
                    color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                    transition: 'color 0.22s ease, font-weight 0.1s ease',
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
