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
          width: '88%',
          maxWidth: 430,
          height: 68,
          borderRadius: 34,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingLeft: 8,
          paddingRight: 8,
          marginBottom: 10,
          /* Glass surface */
          background: 'hsl(var(--lg-pill-bg))',
          backdropFilter: 'blur(48px) saturate(180%)',
          WebkitBackdropFilter: 'blur(48px) saturate(180%)',
          border: '1px solid hsl(var(--lg-pill-border))',
          boxShadow:
            '0 8px 32px hsl(var(--lg-pill-shadow-color)),' +
            '0 2px 8px hsl(var(--lg-pill-shadow-color)),' +
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
                /* Each tab takes equal space, content centered */
                flex: 1,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                position: 'relative',
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
              {/* ── Active highlight: padding-based capsule so it auto-sizes to content ── */}
              {isActive && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    /* Span full width of the flex cell minus small side margins */
                    left: '10%',
                    right: '10%',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    height: 46,
                    borderRadius: 14,
                    background: 'hsl(var(--lg-active-bg))',
                    border: '1px solid hsl(var(--lg-active-border))',
                    pointerEvents: 'none',
                    transition: 'opacity 0.18s ease',
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
                  strokeWidth: isActive ? 2.2 : 1.6,
                  color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                  transition: 'color 0.18s ease',
                  flexShrink: 0,
                }}
              />

              {/* ── Label ── */}
              <span
                style={{
                  position: 'relative',
                  zIndex: 1,
                  fontSize: 10,
                  fontWeight: isActive ? 650 : 500,
                  lineHeight: 1,
                  letterSpacing: '0.01em',
                  color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                  transition: 'color 0.18s ease, font-weight 0.18s ease',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
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
