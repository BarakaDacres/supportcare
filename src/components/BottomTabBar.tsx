/**
 * BottomTabBar — Native iOS dark-glass tab bar with scroll-aware depth.
 * Content behind softly blurs/dims more as user scrolls, creating layered premium feel.
 */

import { useState, useEffect } from 'react';
import type { AuthState } from '@/hooks/useAuth';
import { haptic } from '@/components/OverviewPanel';

export type TabId = 'overview' | 'shifts' | 'analytics' | 'clients' | 'invoices' | 'settings';

// ── SF Symbols–style icons (regular weight, 22px) ────────────────────────────

const IconHome = ({ active }: { active: boolean }) => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" style={{ display: 'block', flexShrink: 0 }}>
    {active ? (
      <path d="M12 2.5L2.5 10.5V21.5H9V15.5H15V21.5H21.5V10.5L12 2.5Z" fill="hsl(var(--primary))" />
    ) : (
      <path d="M3 10.5L12 3L21 10.5V20C21 20.552 20.552 21 20 21H15V15H9V21H4C3.448 21 3 20.552 3 20V10.5Z"
        stroke="hsl(var(--muted-foreground))" strokeWidth="1.65" strokeLinejoin="round" strokeLinecap="round" />
    )}
  </svg>
);

const IconList = ({ active }: { active: boolean }) => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" style={{ display: 'block', flexShrink: 0 }}>
    <rect x="3" y="5.5" width="18" height="2" rx="1" fill={active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} />
    <rect x="3" y="11" width="18" height="2" rx="1" fill={active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} />
    <rect x="3" y="16.5" width="12" height="2" rx="1" fill={active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} />
  </svg>
);

const IconPeople = ({ active }: { active: boolean }) => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" style={{ display: 'block', flexShrink: 0 }}>
    {active ? (
      <>
        <circle cx="8" cy="7" r="3.5" fill="hsl(var(--primary))" />
        <path d="M2 19.5C2 16.46 4.46 14 8 14s6 2.46 6 5.5H2Z" fill="hsl(var(--primary))" />
        <circle cx="16" cy="7" r="2.5" fill="hsl(var(--primary))" opacity="0.7" />
        <path d="M14.5 19.5c.3-1.7 1.6-2.9 3.5-3.2l1 .2c2.2.5 3.5 1.9 3.5 3H14.5Z" fill="hsl(var(--primary))" opacity="0.7" />
      </>
    ) : (
      <>
        <circle cx="8" cy="7" r="3.5" stroke="hsl(var(--muted-foreground))" strokeWidth="1.65" />
        <path d="M2 19.5C2 16.46 4.46 14 8 14s6 2.46 6 5.5H2Z" stroke="hsl(var(--muted-foreground))" strokeWidth="1.65" strokeLinejoin="round" />
        <circle cx="16" cy="7" r="2.5" stroke="hsl(var(--muted-foreground))" strokeWidth="1.4" />
        <path d="M14.5 19.5c.3-1.7 1.6-2.9 3.5-3.2l1 .2c2.2.5 3.5 1.9 3.5 3" stroke="hsl(var(--muted-foreground))" strokeWidth="1.4" strokeLinecap="round" />
      </>
    )}
  </svg>
);

const IconInvoice = ({ active }: { active: boolean }) => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" style={{ display: 'block', flexShrink: 0 }}>
    {active ? (
      <>
        <path d="M6 2H14L20 8V22H4V2H6Z" fill="hsl(var(--primary) / 0.18)" stroke="hsl(var(--primary))" strokeWidth="1.65" strokeLinejoin="round" />
        <path d="M14 2V8H20" stroke="hsl(var(--primary))" strokeWidth="1.65" strokeLinejoin="round" />
        <line x1="8" y1="13" x2="16" y2="13" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="8" y1="17" x2="13" y2="17" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" />
      </>
    ) : (
      <>
        <path d="M6 2H14L20 8V22H4V2H6Z" stroke="hsl(var(--muted-foreground))" strokeWidth="1.65" strokeLinejoin="round" />
        <path d="M14 2V8H20" stroke="hsl(var(--muted-foreground))" strokeWidth="1.65" strokeLinejoin="round" />
        <line x1="8" y1="13" x2="16" y2="13" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="8" y1="17" x2="13" y2="17" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeLinecap="round" />
      </>
    )}
  </svg>
);

const AvatarIcon = ({ auth, active }: { auth: AuthState; active: boolean }) => {
  const initial = ((auth.displayName ?? auth.user?.email ?? '?')[0] ?? '?').toUpperCase();
  const ringColor = active ? 'hsl(var(--primary))' : 'hsl(var(--border))';

  if (auth.avatarUrl) {
    return (
      <img src={auth.avatarUrl} alt={auth.displayName ?? 'Profile'}
        style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, display: 'block',
          outline: `1.25px solid ${ringColor}`, outlineOffset: 1.5, transition: 'outline-color 0.2s ease' }} />
    );
  }

  return (
    <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, fontSize: 9, fontWeight: 600, letterSpacing: '0.01em',
      background: active ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
      color: active ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
      outline: `1.25px solid ${ringColor}`, outlineOffset: 1.5,
      transition: 'background 0.2s ease, color 0.2s ease, outline-color 0.2s ease' }}>
      {initial}
    </span>
  );
};

interface Tab { id: TabId; label: string; }

const TABS: Tab[] = [
  { id: 'overview',  label: 'Home' },
  { id: 'shifts',    label: 'Shifts' },
  { id: 'clients',   label: 'Clients' },
  { id: 'invoices',  label: 'Invoices' },
  { id: 'settings',  label: 'Profile' },
];

interface Props {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  hidden?: boolean;
  auth: AuthState;
}

const BottomTabBar = ({ activeTab, onTabChange, hidden = false, auth }: Props) => {
  // Track scroll position for dynamic depth effect
  const [scrollDepth, setScrollDepth] = useState(0);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          // Clamp scroll progress 0→1 over 200px of scrolling
          const progress = Math.min(window.scrollY / 200, 1);
          setScrollDepth(progress);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Dynamic values based on scroll depth — darker, smokier glass
  const blurAmount = 44 + scrollDepth * 16; // 44px → 60px
  const bgOpacity = 0.85 + scrollDepth * 0.10; // 0.85 → 0.95
  const shadowOpacity = 0.18 + scrollDepth * 0.22; // subtle → stronger

  return (
    <>
      {/* Bottom fade gradient — content softly dims behind tab bar */}
      <div
        className="fixed bottom-0 inset-x-0 z-40 md:hidden no-print pointer-events-none"
        style={{
          height: 100,
          background: `linear-gradient(to top, hsl(var(--background)) ${10 + scrollDepth * 15}%, transparent)`,
          opacity: 0.7 + scrollDepth * 0.25,
          transition: 'opacity 0.3s ease',
        }}
        aria-hidden
      />

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
            background: `hsl(var(--lg-pill-bg) / ${bgOpacity})`,
            backdropFilter: `blur(${blurAmount}px) saturate(${180 + scrollDepth * 20}%)`,
            WebkitBackdropFilter: `blur(${blurAmount}px) saturate(${180 + scrollDepth * 20}%)`,
            border: '0.5px solid hsl(var(--lg-pill-border))',
            boxShadow: [
              `0 2px 12px hsl(0 0% 0% / ${shadowOpacity})`,
              `0 8px 32px hsl(0 0% 0% / ${shadowOpacity * 0.6})`,
              '0 1px 3px hsl(0 0% 0% / 0.04)',
              'inset 0 0.5px 0 hsl(var(--lg-specular))',
            ].join(', '),
            transition: 'backdrop-filter 0.3s ease, background 0.3s ease, box-shadow 0.3s ease',
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
                  flex: 1, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative', zIndex: 1, background: 'transparent', border: 'none', outline: 'none',
                  padding: 0, cursor: 'pointer', userSelect: 'none', WebkitTapHighlightColor: 'transparent',
                  transition: 'transform 0.15s cubic-bezier(0.25,0,0.1,1)',
                }}
                onPointerDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.92)'; }}
                onPointerUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
                onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
                onPointerCancel={e => { (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, pointerEvents: 'none' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity 0.18s ease', opacity: isActive ? 1 : 0.72 }}>
                    {tab.id === 'overview'  && <IconHome    active={isActive} />}
                    {tab.id === 'shifts'    && <IconList    active={isActive} />}
                    {tab.id === 'clients'   && <IconPeople  active={isActive} />}
                    {tab.id === 'invoices'  && <IconInvoice active={isActive} />}
                    {tab.id === 'settings'  && <AvatarIcon  auth={auth} active={isActive} />}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: isActive ? 600 : 400, lineHeight: 1,
                    letterSpacing: '0.01em', whiteSpace: 'nowrap', flexShrink: 0,
                    color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                    transition: 'color 0.18s ease',
                    fontFamily: '-apple-system, "SF Pro Text", BlinkMacSystemFont, system-ui, sans-serif',
                  }}>
                    {tab.label}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};

export default BottomTabBar;
