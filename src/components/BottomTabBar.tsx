/**
 * BottomTabBar — Apple-style floating tab bar with spring animations.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { AuthState } from '@/hooks/useAuth';
import { haptic } from '@/components/OverviewPanel';

export type TabId = 'overview' | 'shifts' | 'analytics' | 'clients' | 'invoices' | 'settings';

const IconHome = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    {active ? (
      <path d="M3 10.5L12 3L21 10.5V20C21 20.552 20.552 21 20 21H15V15H9V21H4C3.448 21 3 20.552 3 20V10.5Z"
        fill="hsl(var(--primary))" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinejoin="round" />
    ) : (
      <path d="M3 10.5L12 3L21 10.5V20C21 20.552 20.552 21 20 21H15V15H9V21H4C3.448 21 3 20.552 3 20V10.5Z"
        stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    )}
  </svg>
);

const IconList = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="5.5" width="18" height="1.8" rx="0.9" fill={active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} />
    <rect x="3" y="11.1" width="18" height="1.8" rx="0.9" fill={active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} />
    <rect x="3" y="16.7" width="12" height="1.8" rx="0.9" fill={active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} />
  </svg>
);

const IconPeople = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    {active ? (
      <>
        <circle cx="9" cy="8" r="3.5" fill="hsl(var(--primary))" />
        <path d="M2.5 20C2.5 16.5 5 14 9 14s6.5 2.5 6.5 6H2.5Z" fill="hsl(var(--primary))" />
        <circle cx="17" cy="8" r="2.5" fill="hsl(var(--primary))" opacity="0.55" />
        <path d="M15.5 20c.3-2 1.8-3.5 4-3.8l.8.1c1.8.4 2.7 1.5 2.7 2.5V20H15.5Z" fill="hsl(var(--primary))" opacity="0.55" />
      </>
    ) : (
      <>
        <circle cx="9" cy="8" r="3.5" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" />
        <path d="M2.5 20C2.5 16.5 5 14 9 14s6.5 2.5 6.5 6H2.5Z" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="17" cy="8" r="2.5" stroke="hsl(var(--muted-foreground))" strokeWidth="1.3" />
        <path d="M15.5 20c.3-2 1.8-3.5 4-3.8l.8.1c1.8.4 2.7 1.5 2.7 2.5" stroke="hsl(var(--muted-foreground))" strokeWidth="1.3" strokeLinecap="round" />
      </>
    )}
  </svg>
);

const IconInvoice = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    {active ? (
      <>
        <path d="M6 2H14L20 8V22H4V2H6Z" fill="hsl(var(--primary)/0.15)" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M14 2V8H20" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinejoin="round" />
        <line x1="8" y1="13" x2="16" y2="13" stroke="hsl(var(--primary))" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="8" y1="17" x2="13" y2="17" stroke="hsl(var(--primary))" strokeWidth="1.4" strokeLinecap="round" />
      </>
    ) : (
      <>
        <path d="M6 2H14L20 8V22H4V2H6Z" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M14 2V8H20" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeLinejoin="round" />
        <line x1="8" y1="13" x2="16" y2="13" stroke="hsl(var(--muted-foreground))" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="8" y1="17" x2="13" y2="17" stroke="hsl(var(--muted-foreground))" strokeWidth="1.4" strokeLinecap="round" />
      </>
    )}
  </svg>
);

const AvatarIcon = ({ auth, active }: { auth: AuthState; active: boolean }) => {
  const initial = ((auth.displayName ?? auth.user?.email ?? '?')[0] ?? '?').toUpperCase();
  if (auth.avatarUrl) {
    return (
      <img src={auth.avatarUrl} alt="Profile"
        style={{
          width: 23, height: 23, borderRadius: '50%', objectFit: 'cover', display: 'block',
          outline: active ? '2px solid hsl(var(--primary))' : '1.5px solid hsl(var(--border))',
          outlineOffset: 1.5, transition: 'outline 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }} />
    );
  }
  return (
    <span style={{
      width: 23, height: 23, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 10, fontWeight: 700,
      background: active ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
      color: active ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
      transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
    }}>
      {initial}
    </span>
  );
};

interface Tab { id: TabId; label: string; }

const TABS: Tab[] = [
  { id: 'overview', label: 'Home' },
  { id: 'shifts', label: 'Shifts' },
  { id: 'clients', label: 'Clients' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'settings', label: 'Profile' },
];

interface Props {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  hidden?: boolean;
  auth: AuthState;
}

const BottomTabBar = ({ activeTab, onTabChange, hidden = false, auth }: Props) => {
  const [scrollDepth, setScrollDepth] = useState(0);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const tabRefs = useRef<Map<TabId, HTMLButtonElement>>(new Map());

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          setScrollDepth(Math.min(window.scrollY / 200, 1));
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Animate the indicator pill to the active tab
  const updateIndicator = useCallback(() => {
    const btn = tabRefs.current.get(activeTab);
    const indicator = indicatorRef.current;
    if (!btn || !indicator) return;
    const container = btn.parentElement;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const left = btnRect.left - containerRect.left + (btnRect.width - 44) / 2;
    indicator.style.transform = `translateX(${left}px) translateY(0)`;
    indicator.style.opacity = '1';
  }, [activeTab]);

  useEffect(() => {
    updateIndicator();
  }, [activeTab, updateIndicator]);

  // Also update on resize
  useEffect(() => {
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [updateIndicator]);

  const blur = 48 + scrollDepth * 12;
  const bgOp = 0.82 + scrollDepth * 0.13;

  const setTabRef = useCallback((id: TabId) => (el: HTMLButtonElement | null) => {
    if (el) tabRefs.current.set(id, el);
    else tabRefs.current.delete(id);
  }, []);

  return (
    <>
      {/* Bottom fade */}
      <div className="fixed bottom-0 inset-x-0 z-40 md:hidden no-print pointer-events-none"
        style={{
          height: 90,
          background: `linear-gradient(to top, hsl(var(--background)) ${8 + scrollDepth * 12}%, transparent)`,
          opacity: 0.65 + scrollDepth * 0.3,
        }} aria-hidden />

      <nav aria-label="Main navigation" role="tablist"
        className="fixed bottom-0 inset-x-0 z-50 md:hidden no-print"
        style={{
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
          transition: 'opacity 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
          opacity: hidden ? 0 : 1,
          pointerEvents: hidden ? 'none' : 'auto',
          transform: hidden ? 'translateY(110%)' : 'translateY(0)',
        }}
        aria-hidden={hidden}>
        <div style={{
          display: 'flex', alignItems: 'stretch', position: 'relative',
          margin: '0 auto', width: '92%', maxWidth: 440,
          height: 56, borderRadius: 28,
          background: `hsl(var(--card) / ${bgOp})`,
          backdropFilter: `blur(${blur}px) saturate(${170 + scrollDepth * 15}%)`,
          WebkitBackdropFilter: `blur(${blur}px) saturate(${170 + scrollDepth * 15}%)`,
          border: '0.5px solid hsl(var(--border)/0.5)',
          boxShadow: `0 2px 20px hsl(0 0% 0% / ${0.08 + scrollDepth * 0.12}), 0 0.5px 0 inset hsl(0 0% 100% / 0.08)`,
        }}>
          {/* Sliding indicator pill */}
          <span
            ref={indicatorRef}
            style={{
              position: 'absolute', top: '50%', left: 0,
              width: 44, height: 44, borderRadius: 12,
              marginTop: -22,
              background: 'hsl(var(--primary)/0.1)',
              transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease',
              opacity: 0,
              pointerEvents: 'none',
            }}
          />

          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} role="tab" aria-selected={isActive} aria-label={tab.label}
                ref={setTabRef(tab.id)}
                onClick={() => { haptic('selection'); onTabChange(tab.id); }}
                style={{
                  flex: 1, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative', background: 'transparent', border: 'none', outline: 'none',
                  padding: 0, cursor: 'pointer', userSelect: 'none', WebkitTapHighlightColor: 'transparent',
                  transition: 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
                onPointerDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.85)'; }}
                onPointerUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
                onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
                onPointerCancel={e => { (e.currentTarget as HTMLButtonElement).style.transform = ''; }}>

                <span style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, pointerEvents: 'none' }}>
                  <span style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: isActive ? 1 : 0.6,
                    transform: isActive ? 'scale(1.08)' : 'scale(1)',
                    transition: 'opacity 0.25s ease, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }}>
                    {tab.id === 'overview' && <IconHome active={isActive} />}
                    {tab.id === 'shifts' && <IconList active={isActive} />}
                    {tab.id === 'clients' && <IconPeople active={isActive} />}
                    {tab.id === 'invoices' && <IconInvoice active={isActive} />}
                    {tab.id === 'settings' && <AvatarIcon auth={auth} active={isActive} />}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: isActive ? 600 : 400, lineHeight: 1,
                    letterSpacing: '0.01em', whiteSpace: 'nowrap',
                    color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                    transition: 'color 0.2s ease, font-weight 0.2s ease',
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
