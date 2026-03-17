/**
 * BottomTabBar — iOS-style floating pill with a measured inset active capsule.
 * Settings tab shows user avatar. Icons use SF Symbols-inspired SVGs.
 */

import { useRef, useLayoutEffect, useState, useCallback } from 'react';
import type { AuthState } from '@/hooks/useAuth';

export type TabId = 'overview' | 'shifts' | 'analytics' | 'invoices' | 'settings';

// ── SF Symbols–inspired icon components ──────────────────────────────────────

const IconHome = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ display: 'block', flexShrink: 0 }}>
    <path
      d="M3 10.5L12 3L21 10.5V20C21 20.552 20.552 21 20 21H15V15H9V21H4C3.448 21 3 20.552 3 20V10.5Z"
      fill={active ? 'hsl(var(--primary))' : 'none'}
      stroke={active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
      strokeWidth={active ? 0 : 1.8}
      strokeLinejoin="round"
    />
  </svg>
);

const IconList = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ display: 'block', flexShrink: 0 }}>
    <rect x="3" y="5" width="18" height="2" rx="1"
      fill={active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
    />
    <rect x="3" y="11" width="18" height="2" rx="1"
      fill={active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
    />
    <rect x="3" y="17" width="12" height="2" rx="1"
      fill={active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
    />
  </svg>
);

const IconChart = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ display: 'block', flexShrink: 0 }}>
    <rect x="3" y="12" width="4" height="9" rx="1.5"
      fill={active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
    />
    <rect x="10" y="7" width="4" height="14" rx="1.5"
      fill={active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
    />
    <rect x="17" y="3" width="4" height="18" rx="1.5"
      fill={active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
    />
  </svg>
);

const IconInvoice = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ display: 'block', flexShrink: 0 }}>
    <path
      d="M6 2H15L20 7V22H4V2H6Z"
      fill={active ? 'hsl(var(--primary) / 0.15)' : 'none'}
      stroke={active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M14 2V8H20" stroke={active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} strokeWidth="1.8" strokeLinejoin="round" />
    <line x1="8" y1="13" x2="16" y2="13" stroke={active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} strokeWidth="1.6" strokeLinecap="round" />
    <line x1="8" y1="17" x2="13" y2="17" stroke={active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

// Avatar icon — shows user photo or initials circle
const AvatarIcon = ({ auth, active }: { auth: AuthState; active: boolean }) => {
  const initial = ((auth.displayName ?? auth.user?.email ?? '?')[0] ?? '?').toUpperCase();

  if (auth.avatarUrl) {
    return (
      <img
        src={auth.avatarUrl}
        alt={auth.displayName ?? 'Account'}
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
          display: 'block',
          outline: active ? '2px solid hsl(var(--primary))' : '1.5px solid hsl(var(--border))',
          outlineOffset: 1,
        }}
      />
    );
  }

  return (
    <span
      style={{
        width: 24,
        height: 24,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: 10,
        fontWeight: 700,
        background: active ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
        color: active ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
        outline: active ? '2px solid hsl(var(--primary))' : 'none',
        outlineOffset: 1,
        transition: 'background 0.18s ease, color 0.18s ease',
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
  { id: 'overview',  label: 'Home'      },
  { id: 'shifts',    label: 'Shifts'    },
  { id: 'analytics', label: 'Analytics' },
  { id: 'invoices',  label: 'Invoices'  },
  { id: 'settings',  label: 'Account'   },
];

const PAD_X = 12;
const INSET_Y = 5;

interface Rect { left: number; width: number; }

interface Props {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  hidden?: boolean;
  auth: AuthState;
}

const BottomTabBar = ({ activeTab, onTabChange, hidden = false, auth }: Props) => {
  const pillRef   = useRef<HTMLDivElement>(null);
  const stackRefs = useRef<Map<TabId, HTMLSpanElement>>(new Map());
  const [selector, setSelector] = useState<Rect | null>(null);
  const [ready, setReady]       = useState(false);

  const measure = useCallback((): Rect | null => {
    const pill  = pillRef.current;
    const stack = stackRefs.current.get(activeTab);
    if (!pill || !stack) return null;
    const pRect = pill.getBoundingClientRect();
    const sRect = stack.getBoundingClientRect();
    if (pRect.width === 0) return null;
    const rawLeft  = sRect.left - pRect.left - PAD_X;
    const rawWidth = sRect.width + PAD_X * 2;
    const minLeft  = 2;
    const maxRight = pRect.width - 2;
    const left     = Math.max(minLeft, rawLeft);
    const width    = Math.min(rawWidth, maxRight - left);
    return { left, width };
  }, [activeTab]);

  useLayoutEffect(() => {
    let raf1: number, raf2: number;
    const run = () => {
      const r = measure();
      if (r) { setSelector(r); setReady(true); }
    };
    raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(run); });
    const ro = new ResizeObserver(run);
    if (pillRef.current) ro.observe(pillRef.current);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      ro.disconnect();
    };
  }, [activeTab, measure]);

  return (
    <nav
      aria-label="Main navigation"
      role="tablist"
      className="fixed bottom-0 inset-x-0 z-50 md:hidden no-print"
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
        transition: 'opacity 0.2s ease, transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? 'none' : 'auto',
        transform: hidden ? 'translateY(110%)' : 'translateY(0)',
      }}
      aria-hidden={hidden}
    >
      <div
        ref={pillRef}
        role="presentation"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'stretch',
          margin: '0 auto 10px',
          width: '88%',
          maxWidth: 440,
          height: 64,
          borderRadius: 32,
          paddingLeft: 4,
          paddingRight: 4,
          background: 'hsl(var(--lg-pill-bg))',
          backdropFilter: 'blur(48px) saturate(180%)',
          WebkitBackdropFilter: 'blur(48px) saturate(180%)',
          border: '1px solid hsl(var(--lg-pill-border))',
          boxShadow: [
            '0 8px 32px hsl(var(--lg-pill-shadow-color))',
            '0 2px 8px hsl(var(--lg-pill-shadow-color))',
            'inset 0 1px 0 hsl(var(--lg-specular))',
            'inset 0 -0.5px 0 hsl(var(--lg-pill-border))',
          ].join(', '),
        }}
      >
        {ready && selector && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: INSET_Y,
              bottom: INSET_Y,
              left: selector.left,
              width: selector.width,
              borderRadius: 24,
              background: 'hsl(var(--lg-active-bg))',
              border: '1px solid hsl(var(--lg-active-border))',
              boxShadow: 'inset 0 0.5px 0 hsl(var(--lg-specular))',
              pointerEvents: 'none',
              transition: 'left 0.24s cubic-bezier(0.4,0,0.2,1), width 0.24s cubic-bezier(0.4,0,0.2,1)',
              zIndex: 0,
            }}
          />
        )}

        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-label={tab.label}
              onClick={() => onTabChange(tab.id)}
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
                transition: 'transform 0.12s cubic-bezier(0.34,1.2,0.64,1)',
              }}
              onPointerDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.88)'; }}
              onPointerUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
              onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
              onPointerCancel={e => { (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
            >
              <span
                ref={el => { if (el) stackRefs.current.set(tab.id, el); }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  pointerEvents: 'none',
                }}
              >
                {tab.id === 'overview'  && <IconHome    active={isActive} />}
                {tab.id === 'shifts'    && <IconList    active={isActive} />}
                {tab.id === 'analytics' && <IconChart   active={isActive} />}
                {tab.id === 'invoices'  && <IconInvoice active={isActive} />}
                {tab.id === 'settings'  && <AvatarIcon  auth={auth} active={isActive} />}
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    lineHeight: 1,
                    letterSpacing: '0.01em',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    color: isActive
                      ? 'hsl(var(--primary))'
                      : 'hsl(var(--muted-foreground))',
                    transition: 'color 0.18s ease',
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
