import { LayoutDashboard, ClipboardList, BarChart2, FileText, Settings } from 'lucide-react';
import { useRef } from 'react';

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
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const handlePointerDown = (id: string) => {
    const el = btnRefs.current[id];
    if (el) el.style.transform = 'scale(0.88)';
  };
  const handlePointerUp = (id: string) => {
    const el = btnRefs.current[id];
    if (el) el.style.transform = 'scale(1)';
  };

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 md:hidden no-print"
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? 'none' : 'auto',
        transform: hidden ? 'translateY(110%)' : 'translateY(0)',
        transition: 'opacity 0.2s ease, transform 0.25s cubic-bezier(0.4,0,0.2,1)',
      }}
      aria-hidden={hidden}
      role="tablist"
      aria-label="Main navigation"
    >
      {/* ── Floating pill container ── */}
      <div
        className="mx-auto"
        style={{
          width: '87%',
          maxWidth: 420,
          height: 64,
          borderRadius: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: 6,
          paddingRight: 6,
          marginBottom: 10,
          /* Glass surface */
          background: 'hsl(var(--lg-pill-bg))',
          backdropFilter: 'blur(48px) saturate(200%)',
          WebkitBackdropFilter: 'blur(48px) saturate(200%)',
          border: '1px solid hsl(var(--lg-pill-border))',
          boxShadow:
            '0 4px 24px hsl(var(--lg-pill-shadow-color)),' +
            '0 1px 6px hsl(var(--lg-pill-shadow-color)),' +
            'inset 0 1px 0 hsl(var(--lg-specular)),' +
            'inset 0 -0.5px 0 hsl(var(--lg-pill-border))',
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={el => { btnRefs.current[tab.id] = el; }}
              role="tab"
              aria-selected={isActive}
              aria-label={tab.label}
              onClick={() => onTabChange(tab.id)}
              style={{
                /* Each tab takes equal space */
                flex: 1,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                position: 'relative',
                borderRadius: 28,
                userSelect: 'none',
                WebkitTapHighlightColor: 'transparent',
                transition: 'transform 0.15s cubic-bezier(0.34,1.2,0.64,1)',
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                padding: 0,
              }}
              onPointerDown={() => handlePointerDown(tab.id)}
              onPointerUp={() => handlePointerUp(tab.id)}
              onPointerLeave={() => handlePointerUp(tab.id)}
              onPointerCancel={() => handlePointerUp(tab.id)}
            >
              {/* ── Compact capsule/pill highlight — active only ── */}
              {isActive && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    /* Tight horizontal padding, fixed height — no overflow */
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 52,
                    height: 44,
                    borderRadius: 16,
                    background: 'hsl(var(--lg-active-bg))',
                    border: '1px solid hsl(var(--lg-active-border))',
                    pointerEvents: 'none',
                    transition: 'opacity 0.2s ease',
                  }}
                />
              )}

              {/* ── Icon ── */}
              <tab.icon
                style={{
                  position: 'relative',
                  zIndex: 1,
                  width: 20,
                  height: 20,
                  strokeWidth: isActive ? 2.1 : 1.5,
                  color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                  transition: 'color 0.18s ease, stroke-width 0.18s ease',
                  flexShrink: 0,
                }}
              />

              {/* ── Label ── */}
              <span
                style={{
                  position: 'relative',
                  zIndex: 1,
                  fontSize: 10,
                  fontWeight: isActive ? 600 : 500,
                  lineHeight: 1,
                  letterSpacing: '0.01em',
                  color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                  transition: 'color 0.18s ease',
                  flexShrink: 0,
                }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomTabBar;
