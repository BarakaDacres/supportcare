/**
 * BottomTabBar — Native iOS-style pill tab bar.
 * Active state: blue icon + blue label only (no background fill).
 * Icons: SF Symbols-inspired SVGs, consistent 1.65px stroke weight.
 */

import type { AuthState } from '@/hooks/useAuth';
import { haptic } from '@/components/OverviewPanel';

export type TabId = 'overview' | 'shifts' | 'analytics' | 'invoices' | 'settings';

// ── SF Symbols–style icons (regular weight, 22px) ────────────────────────────

// house / house.fill
const IconHome = ({ active }: { active: boolean }) => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" style={{ display: 'block', flexShrink: 0 }}>
    {active ? (
      // house.fill
      <path
        d="M12 2.5L2.5 10.5V21.5H9V15.5H15V21.5H21.5V10.5L12 2.5Z"
        fill="hsl(var(--primary))"
      />
    ) : (
      // house outline
      <>
        <path
          d="M3 10.5L12 3L21 10.5V20C21 20.552 20.552 21 20 21H15V15H9V21H4C3.448 21 3 20.552 3 20V10.5Z"
          stroke="hsl(var(--muted-foreground))"
          strokeWidth="1.65"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </>
    )}
  </svg>
);

// list.bullet / list.bullet.fill
const IconList = ({ active }: { active: boolean }) => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" style={{ display: 'block', flexShrink: 0 }}>
    {active ? (
      <>
        <rect x="3" y="5.5" width="18" height="2" rx="1" fill="hsl(var(--primary))" />
        <rect x="3" y="11" width="18" height="2" rx="1" fill="hsl(var(--primary))" />
        <rect x="3" y="16.5" width="12" height="2" rx="1" fill="hsl(var(--primary))" />
      </>
    ) : (
      <>
        <rect x="3" y="5.5" width="18" height="2" rx="1" fill="hsl(var(--muted-foreground))" />
        <rect x="3" y="11" width="18" height="2" rx="1" fill="hsl(var(--muted-foreground))" />
        <rect x="3" y="16.5" width="12" height="2" rx="1" fill="hsl(var(--muted-foreground))" />
      </>
    )}
  </svg>
);

// chart.bar / chart.bar.fill
const IconChart = ({ active }: { active: boolean }) => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" style={{ display: 'block', flexShrink: 0 }}>
    {active ? (
      <>
        <rect x="3" y="12" width="4.5" height="9" rx="1.5" fill="hsl(var(--primary))" />
        <rect x="9.75" y="7" width="4.5" height="14" rx="1.5" fill="hsl(var(--primary))" />
        <rect x="16.5" y="3" width="4.5" height="18" rx="1.5" fill="hsl(var(--primary))" />
      </>
    ) : (
      <>
        <rect x="3" y="12" width="4.5" height="9" rx="1.5" fill="hsl(var(--muted-foreground))" />
        <rect x="9.75" y="7" width="4.5" height="14" rx="1.5" fill="hsl(var(--muted-foreground))" />
        <rect x="16.5" y="3" width="4.5" height="18" rx="1.5" fill="hsl(var(--muted-foreground))" />
      </>
    )}
  </svg>
);

// doc.text / doc.text.fill
const IconInvoice = ({ active }: { active: boolean }) => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" style={{ display: 'block', flexShrink: 0 }}>
    {active ? (
      <>
        <path
          d="M6 2H14L20 8V22H4V2H6Z"
          fill="hsl(var(--primary) / 0.18)"
          stroke="hsl(var(--primary))"
          strokeWidth="1.65"
          strokeLinejoin="round"
        />
        <path d="M14 2V8H20" stroke="hsl(var(--primary))" strokeWidth="1.65" strokeLinejoin="round" />
        <line x1="8" y1="13" x2="16" y2="13" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="8" y1="17" x2="13" y2="17" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" />
      </>
    ) : (
      <>
        <path
          d="M6 2H14L20 8V22H4V2H6Z"
          stroke="hsl(var(--muted-foreground))"
          strokeWidth="1.65"
          strokeLinejoin="round"
        />
        <path d="M14 2V8H20" stroke="hsl(var(--muted-foreground))" strokeWidth="1.65" strokeLinejoin="round" />
        <line x1="8" y1="13" x2="16" y2="13" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="8" y1="17" x2="13" y2="17" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeLinecap="round" />
      </>
    )}
  </svg>
);

// Avatar — perfectly circular, thin ring border, matches icon visual weight
const AvatarIcon = ({ auth, active }: { auth: AuthState; active: boolean }) => {
  const initial = ((auth.displayName ?? auth.user?.email ?? '?')[0] ?? '?').toUpperCase();
  const ringColor = active ? 'hsl(var(--primary))' : 'hsl(var(--border))';

  if (auth.avatarUrl) {
    return (
      <img
        src={auth.avatarUrl}
        alt={auth.displayName ?? 'Profile'}
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
          display: 'block',
          outline: `1.25px solid ${ringColor}`,
          outlineOffset: 1.5,
          transition: 'outline-color 0.2s ease',
        }}
      />
    );
  }

  return (
    <span
      style={{
        width: 22,
        height: 22,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '0.01em',
        background: active ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
        color: active ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
        outline: `1.25px solid ${ringColor}`,
        outlineOffset: 1.5,
        transition: 'background 0.2s ease, color 0.2s ease, outline-color 0.2s ease',
      }}
    >
      {initial}
    </span>
  );
};

interface Tab {
  id: TabId;
  label: string;
}

const TABS: Tab[] = [
  { id: 'overview',  label: 'Home'     },
  { id: 'shifts',    label: 'Shifts'   },
  { id: 'clients',   label: 'Clients'  },
  { id: 'invoices',  label: 'Invoices' },
  { id: 'settings',  label: 'Profile'  },
];

interface Props {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  hidden?: boolean;
  auth: AuthState;
}

const BottomTabBar = ({ activeTab, onTabChange, hidden = false, auth }: Props) => {
  return (
    <nav
      aria-label="Main navigation"
      role="tablist"
      className="fixed bottom-0 inset-x-0 z-50 md:hidden no-print"
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 6px)',
        transition: 'opacity 0.22s ease, transform 0.28s cubic-bezier(0.4,0,0.2,1)',
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? 'none' : 'auto',
        transform: hidden ? 'translateY(110%)' : 'translateY(0)',
      }}
      aria-hidden={hidden}
    >
      <div
        role="presentation"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'stretch',
          margin: '0 auto 8px',
          width: '88%',
          maxWidth: 430,
          height: 52,
          borderRadius: 26,
          paddingLeft: 2,
          paddingRight: 2,
          background: 'hsl(var(--lg-pill-bg))',
          backdropFilter: 'blur(48px) saturate(200%)',
          WebkitBackdropFilter: 'blur(48px) saturate(200%)',
          border: '0.5px solid hsl(var(--lg-pill-border))',
          boxShadow: [
            '0 2px 12px hsl(var(--lg-pill-shadow-color))',
            '0 1px 3px hsl(0 0% 0% / 0.04)',
            'inset 0 0.5px 0 hsl(var(--lg-specular))',
          ].join(', '),
        }}
      >
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-label={tab.label}
              onClick={() => { haptic('selection'); onTabChange(tab.id); }}
              style={{
                flex: 1,
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                zIndex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                padding: 0,
                cursor: 'pointer',
                userSelect: 'none',
                WebkitTapHighlightColor: 'transparent',
                transition: 'transform 0.15s cubic-bezier(0.25,0,0.1,1)',
              }}
              onPointerDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.92)'; }}
              onPointerUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
              onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
              onPointerCancel={e => { (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
            >
              <span
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  pointerEvents: 'none',
                }}
              >
                {/* Icon with smooth opacity crossfade */}
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'opacity 0.18s ease',
                    opacity: isActive ? 1 : 0.72,
                  }}
                >
                  {tab.id === 'overview'  && <IconHome    active={isActive} />}
                  {tab.id === 'shifts'    && <IconList    active={isActive} />}
                  {tab.id === 'analytics' && <IconChart   active={isActive} />}
                  {tab.id === 'invoices'  && <IconInvoice active={isActive} />}
                  {tab.id === 'settings'  && <AvatarIcon  auth={auth} active={isActive} />}
                </span>

                {/* Label — SF Pro system font */}
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: isActive ? 600 : 400,
                    lineHeight: 1,
                    letterSpacing: '0.01em',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    color: isActive
                      ? 'hsl(var(--primary))'
                      : 'hsl(var(--muted-foreground))',
                    transition: 'color 0.18s ease',
                    fontFamily: '-apple-system, "SF Pro Text", BlinkMacSystemFont, system-ui, sans-serif',
                  }}
                >
                  {tab.label}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomTabBar;
