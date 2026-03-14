import { LayoutDashboard, ClipboardList, BarChart2, FileText, Settings } from 'lucide-react';
import { useRef, useLayoutEffect, useState, useCallback } from 'react';

export type TabId = 'overview' | 'shifts' | 'analytics' | 'invoices' | 'settings';

interface BottomTabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  hidden?: boolean;
}

const TABS: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview',  label: 'Overview',  icon: LayoutDashboard },
  { id: 'shifts',    label: 'Shifts',    icon: ClipboardList   },
  { id: 'analytics', label: 'Analytics', icon: BarChart2       },
  { id: 'invoices',  label: 'Invoices',  icon: FileText        },
  { id: 'settings',  label: 'Settings',  icon: Settings        },
];

// Horizontal padding added on each side of the content stack inside the selector
const SELECTOR_PAD_X = 14;
// Height of the selector capsule
const SELECTOR_H = 44;
const SELECTOR_RADIUS = 12;

interface SelectorRect { left: number; width: number }

const BottomTabBar = ({ activeTab, onTabChange, hidden = false }: BottomTabBarProps) => {
  const pillRef  = useRef<HTMLDivElement>(null);
  // Refs for the inner content stacks (icon+label wrappers) — these are what we measure
  const stackRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  // Refs for the outer tab buttons (for press animation only)
  const btnRefs   = useRef<Record<string, HTMLButtonElement | null>>({});

  const [selector, setSelector] = useState<SelectorRect | null>(null);
  const [ready, setReady]       = useState(false);

  // Measure the content stack of a tab relative to the pill container
  const measure = useCallback((tabId: string): SelectorRect | null => {
    const pill  = pillRef.current;
    const stack = stackRefs.current[tabId];
    if (!pill || !stack) return null;

    const pillRect  = pill.getBoundingClientRect();
    const stackRect = stack.getBoundingClientRect();

    const left  = stackRect.left - pillRect.left - SELECTOR_PAD_X;
    const width = stackRect.width + SELECTOR_PAD_X * 2;

    // Clamp to stay inside pill (account for border)
    const minLeft = 2;
    const maxRight = pillRect.width - 2;
    const clampedLeft  = Math.max(minLeft, left);
    const clampedWidth = Math.min(width, maxRight - clampedLeft);

    return { left: clampedLeft, width: clampedWidth };
  }, []);

  // Re-measure whenever activeTab changes or on resize
  useLayoutEffect(() => {
    const run = () => {
      const rect = measure(activeTab);
      if (rect) {
        setSelector(rect);
        setReady(true);
      }
    };

    // First paint — double rAF to ensure layout is fully settled
    let raf1: number, raf2: number;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(run);
    });

    const ro = new ResizeObserver(run);
    if (pillRef.current) ro.observe(pillRef.current);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      ro.disconnect();
    };
  }, [activeTab, measure]);

  const handlePointerDown = (id: string) => {
    const el = btnRefs.current[id];
    if (el) el.style.transform = 'scale(0.87)';
  };
  const handlePointerUp = (id: string) => {
    const el = btnRefs.current[id];
    if (el) el.style.transform = '';
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
      {/* ── Floating pill ── */}
      <div
        ref={pillRef}
        className="mx-auto"
        style={{
          position: 'relative',       // anchor for the absolutely-positioned selector
          width: '88%',
          maxWidth: 430,
          height: 68,
          borderRadius: 34,
          display: 'flex',
          alignItems: 'stretch',
          paddingLeft: 4,
          paddingRight: 4,
          marginBottom: 10,
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
        {/* ── Animated selector — absolutely positioned, driven by measurement ── */}
        {ready && selector && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '50%',
              transform: 'translateY(-50%)',
              left: selector.left,
              width: selector.width,
              height: SELECTOR_H,
              borderRadius: SELECTOR_RADIUS,
              background: 'hsl(var(--lg-active-bg))',
              border: '1px solid hsl(var(--lg-active-border))',
              pointerEvents: 'none',
              // Animate position & width changes
              transition: 'left 0.22s cubic-bezier(0.4,0,0.2,1), width 0.22s cubic-bezier(0.4,0,0.2,1)',
              zIndex: 0,
            }}
          />
        )}

        {/* ── Tab buttons ── */}
        {TABS.map((tab) => {
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
                // Equal slots — flex:1 so each tab gets identical width
                flex: 1,
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                zIndex: 1,
                userSelect: 'none',
                WebkitTapHighlightColor: 'transparent',
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                padding: 0,
                // Only animate the press scale — NOT layout properties
                transition: 'transform 0.14s cubic-bezier(0.34,1.2,0.64,1)',
              }}
              onPointerDown={() => handlePointerDown(tab.id)}
              onPointerUp={() => handlePointerUp(tab.id)}
              onPointerLeave={() => handlePointerUp(tab.id)}
              onPointerCancel={() => handlePointerUp(tab.id)}
            >
              {/*
                ── Inner content stack ──
                This is the element we measure. Its width is the natural rendered
                width of the icon+label stack, which drives the selector sizing.
                It must NOT change size between active/inactive states.
              */}
              <span
                ref={el => { stackRefs.current[tab.id] = el; }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  // Fixed dimensions prevent any layout shift on active toggle
                  // We use a stable font-weight to keep text width constant
                  pointerEvents: 'none',
                }}
              >
                {/* ── Icon ── */}
                <tab.icon
                  style={{
                    width: 20,
                    height: 20,
                    // Keep strokeWidth change subtle so icon bbox stays ~same
                    strokeWidth: isActive ? 2.2 : 1.7,
                    color: isActive
                      ? 'hsl(var(--primary))'
                      : 'hsl(var(--muted-foreground))',
                    transition: 'color 0.18s ease',
                    flexShrink: 0,
                    display: 'block',
                  }}
                />

                {/* ── Label — fixed font-weight to prevent reflow ── */}
                <span
                  style={{
                    fontSize: 10,
                    // Use a stable weight; color change only — no width change
                    fontWeight: 500,
                    lineHeight: 1,
                    letterSpacing: '0.01em',
                    color: isActive
                      ? 'hsl(var(--primary))'
                      : 'hsl(var(--muted-foreground))',
                    transition: 'color 0.18s ease',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
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
