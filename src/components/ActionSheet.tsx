import { Lock, LockOpen, Sun, Moon, X } from 'lucide-react';

interface ActionSheetProps {
  open: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
  locked: boolean;
  onToggleTheme: () => void;
  onToggleLock: () => void;
}

const ActionSheet = ({ open, onClose, theme, locked, onToggleTheme, onToggleLock }: ActionSheetProps) => {
  if (!open) return null;

  const actions = [
    {
      label: locked ? 'Unlock Month' : 'Lock Month',
      icon: locked ? LockOpen : Lock,
      action: () => { onToggleLock(); onClose(); },
      color: locked ? 'hsl(var(--stat-green))' : 'hsl(var(--stat-amber))',
    },
    {
      label: theme === 'light' ? 'Dark Mode' : 'Light Mode',
      icon: theme === 'light' ? Moon : Sun,
      action: () => { onToggleTheme(); onClose(); },
      color: 'hsl(var(--primary))',
    },
  ];

  return (
    /* Backdrop — heavier blur + darker scrim */
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
      style={{
        background: 'hsl(var(--foreground)/0.35)',
        backdropFilter: 'blur(24px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
      }}
      onClick={onClose}
    >
      {/* Modal card — bottom sheet on mobile, centered on desktop */}
      <div
        className="w-full sm:max-w-[340px] flex flex-col animate-in slide-in-from-bottom-4 duration-200"
        style={{
          maxWidth: '100%',
          background: 'hsl(var(--card)/0.92)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          borderRadius: '20px 20px 0 0',
          boxShadow:
            '0 -1px 0 hsl(var(--border)/0.5), ' +
            '0 -8px 32px hsl(var(--foreground)/0.08)',
          overflow: 'hidden',
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag indicator */}
        <div className="flex justify-center pt-3 pb-1">
          <div
            className="w-9 h-1 rounded-full"
            style={{ background: 'hsl(var(--muted-foreground)/0.25)' }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-2.5">
          <p className="text-[15px] font-bold text-foreground">Quick Actions</p>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full transition-colors"
            style={{ background: 'hsl(var(--muted)/0.8)', color: 'hsl(var(--muted-foreground))' }}
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* Action list */}
        <div className="px-3 pb-2 space-y-0.5">
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={a.action}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-[14px] font-semibold text-foreground transition-all active:scale-[0.98]"
              style={{ background: 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'hsl(var(--muted)/0.6)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${a.color}15`, color: a.color }}
              >
                <a.icon className="w-4 h-4" />
              </div>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ActionSheet;
