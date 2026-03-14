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
  const pressTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handlePointerDown = (id: string, el: HTMLButtonElement) => {
    pressTimers.current[id] = setTimeout(() => {}, 0);
    el.style.transform = 'scale(0.86)';
  };

  const handlePointerUp = (el: HTMLButtonElement) => {
    el.style.transform = 'scale(1)';
  };

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 md:hidden no-print"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? 'none' : 'auto',
        transform: hidden ? 'translateY(100%)' : 'translateY(0)',
        transition: 'opacity 0.22s ease, transform 0.28s cubic-bezier(0.4,0,0.2,1)',
      }}
      aria-hidden={hidden}
      role="tablist"
      aria-label="Main navigation"
    >
      {/* ── Floating pill ── */}
      <div
        className="mx-auto mb-3"
        style={{
          width: '88%',
          maxWidth: 430,
          height: 72,
          borderRadius: 36,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingLeft: 8,
          paddingRight: 8,
          /* Glass surface */
          background: 'hsl(var(--lg-pill-bg))',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
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
                gap: 4,
                zIndex: 10,
                flex: 1,
                height: '100%',
                borderRadius: 28,
                userSelect: 'none',
                WebkitTapHighlightColor: 'transparent',
                transition: 'transform 0.14s cubic-bezier(0.34,1.3,0.64,1)',
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                padding: 0,
              }}
              onPointerDown={e => handlePointerDown(tab.id, e.currentTarget)}
              onPointerUp={e => handlePointerUp(e.currentTarget)}
              onPointerLeave={e => handlePointerUp(e.currentTarget)}
              onPointerCancel={e => handlePointerUp(e.currentTarget)}
            >
              {/* ── Circular active highlight ── */}
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -54%)',
                  width: 46,
                  height: 46,
                  borderRadius: '50%',
                  background: isActive ? 'hsl(var(--lg-active-bg))' : 'transparent',
                  border: isActive ? '1px solid hsl(var(--lg-active-border))' : '1px solid transparent',
                  transition: 'background 0.25s ease, border-color 0.25s ease, transform 0.25s cubic-bezier(0.34,1.3,0.64,1)',
                  pointerEvents: 'none',
                }}
              />

              {/* ── Icon ── */}
              <tab.icon
                style={{
                  position: 'relative',
                  zIndex: 1,
                  width: isActive ? 22 : 20,
                  height: isActive ? 22 : 20,
                  strokeWidth: isActive ? 2.2 : 1.6,
                  color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                  transition: 'color 0.2s ease, stroke-width 0.2s ease, width 0.2s ease, height 0.2s ease',
                  marginBottom: -1,
                }}
              />

              {/* ── Label ── */}
              <span
                style={{
                  position: 'relative',
                  zIndex: 1,
                  fontSize: '0.5625rem',
                  fontWeight: isActive ? 700 : 500,
                  lineHeight: 1,
                  letterSpacing: isActive ? '0.01em' : '0',
                  color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                  transition: 'color 0.2s ease',
                  marginTop: 1,
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
