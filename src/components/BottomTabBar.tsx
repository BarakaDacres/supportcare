/**
 * BottomTabBar — iOS-style floating pill with a measured inset active capsule.
 *
 * Architecture:
 * - Each tab button gets flex:1 (equal slots), keeping sibling layout stable.
 * - Inside every button is a "stack" span (icon + label). Its rendered bbox is
 *   what we measure to drive the selector — NOT the button width.
 * - The selector is absolutely positioned inside the pill. It is sized and
 *   translated purely by measured values so it never clips the pill boundary.
 * - font-weight is fixed at 500 for both active/inactive so text never reflows.
 * - A ResizeObserver re-measures on container resize (orientation change, etc.)
 */

import { LayoutDashboard, ClipboardList, BarChart2, FileText, Settings } from 'lucide-react';
import { useRef, useLayoutEffect, useState, useCallback } from 'react';

export type TabId = 'overview' | 'shifts' | 'analytics' | 'invoices' | 'settings';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const TABS: Tab[] = [
  { id: 'overview',   label: 'Overview',   icon: LayoutDashboard },
  { id: 'shifts',     label: 'Shifts',     icon: ClipboardList   },
  { id: 'analytics',  label: 'Analytics',  icon: BarChart2       },
  { id: 'invoices',   label: 'Invoices',   icon: FileText        },
  { id: 'settings',   label: 'Settings',   icon: Settings        },
];

// Horizontal padding added to each side of the measured content stack
const PAD_X = 12;
// Vertical inset from pill edge (keeps capsule clearly inside the pill)
const INSET_Y = 5;

interface Rect { left: number; width: number; }

interface Props {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  hidden?: boolean;
}

const BottomTabBar = ({ activeTab, onTabChange, hidden = false }: Props) => {
  const pillRef  = useRef<HTMLDivElement>(null);
  // We measure these inner stacks, not the outer button slots
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

    // Clamp so the selector stays fully inside the pill (2px inner border margin)
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

    // Double rAF: first frame triggers layout, second reads settled geometry
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
      {/* ── Floating pill container ── */}
      <div
        ref={pillRef}
        role="presentation"
        style={{
          position: 'relative',        // anchor for absolute selector
          display: 'flex',
          alignItems: 'stretch',
          margin: '0 auto 10px',
          width: '88%',
          maxWidth: 440,
          height: 64,
          borderRadius: 32,
          paddingLeft: 4,
          paddingRight: 4,
          // Glass pill surface
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
        {/* ── Active capsule — absolutely inset, driven by measurement ── */}
        {ready && selector && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              // Vertically centered with INSET_Y gap from pill top/bottom
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

        {/* ── Tab buttons — equal flex slots ── */}
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
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
                // Only animate scale on press — NOT layout properties
                transition: 'transform 0.12s cubic-bezier(0.34,1.2,0.64,1)',
              }}
              onPointerDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.88)'; }}
              onPointerUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
              onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
              onPointerCancel={e => { (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
            >
              {/*
                Inner content stack — this is the ONLY element we measure.
                It must be width-stable between active and inactive states.
                ➜ font-weight 500 always, color-only transition.
              */}
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
                <Icon
                  style={{
                    width: 20,
                    height: 20,
                    flexShrink: 0,
                    display: 'block',
                    // strokeWidth is kept close together so icon bbox stays stable
                    strokeWidth: isActive ? 2.2 : 1.8,
                    color: isActive
                      ? 'hsl(var(--primary))'
                      : 'hsl(var(--muted-foreground))',
                    transition: 'color 0.18s ease',
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 500, // fixed — no weight change between states
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
