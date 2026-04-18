import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Optional additional class for the sheet panel */
  className?: string;
  /** Style overrides for the sheet panel */
  style?: CSSProperties;
  /** Disable drag-to-dismiss (e.g. while submitting) */
  dismissDisabled?: boolean;
  /** Distance (px) past which a release dismisses the sheet */
  dismissThreshold?: number;
  /** Optional id used by aria-labelledby */
  labelledBy?: string;
}

/**
 * iOS-style bottom sheet with drag-to-dismiss.
 * - Tap backdrop to dismiss
 * - Drag the grabber (or swipe down on header area) to dismiss
 * - Body scroll is locked while open
 */
export function BottomSheet({
  open,
  onClose,
  children,
  className = '',
  style,
  dismissDisabled = false,
  dismissThreshold = 120,
  labelledBy,
}: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(0);
  const dragState = useRef<{ startY: number; active: boolean }>({ startY: 0, active: false });

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // ESC to dismiss
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !dismissDisabled) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, dismissDisabled]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (dismissDisabled) return;
    dragState.current = { startY: e.clientY, active: true };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current.active) return;
    const dy = e.clientY - dragState.current.startY;
    // rubber-band when dragging up
    setDrag(dy > 0 ? dy : dy * 0.2);
  };
  const onPointerUp = () => {
    if (!dragState.current.active) return;
    dragState.current.active = false;
    if (drag > dismissThreshold) {
      // animate out
      setDrag(window.innerHeight);
      setTimeout(() => { onClose(); setDrag(0); }, 180);
    } else {
      setDrag(0);
    }
  };

  if (!open) return null;

  const transform = drag > 0 ? `translateY(${drag}px)` : undefined;
  const transition = dragState.current.active
    ? 'none'
    : 'transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        className="lg-sheet-backdrop"
        onClick={() => { if (!dismissDisabled) onClose(); }}
      />
      <div
        ref={panelRef}
        className={`lg-sheet ${className}`}
        style={{ ...style, transform, transition }}
      >
        {/* Drag handle area — only this triggers drag, so body scroll works */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ touchAction: 'none', cursor: dismissDisabled ? 'default' : 'grab' }}
        >
          <div className="lg-sheet-grabber" />
        </div>
        {children}
      </div>
    </div>
  );
}
