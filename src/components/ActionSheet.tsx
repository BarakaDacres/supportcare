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
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      style={{
        background: 'hsl(var(--foreground)/0.35)',
        backdropFilter: 'blur(28px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(28px) saturate(1.8)',
      }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[320px] animate-in zoom-in-95 fade-in duration-200"
        style={{
          background: 'hsl(var(--card)/0.88)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          borderRadius: 24,
          boxShadow:
            '0 0 0 0.5px hsl(var(--border)/0.5), ' +
            '0 20px 60px hsl(var(--foreground)/0.18), ' +
            '0 4px 16px hsl(var(--foreground)/0.06)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <p className="text-[15px] font-bold text-foreground">Quick Actions</p>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full transition-all active:scale-90"
            style={{ background: 'hsl(var(--muted)/0.8)', color: 'hsl(var(--muted-foreground))' }}
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* Action list */}
        <div className="px-3 pb-4 space-y-1">
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={a.action}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-[14px] font-semibold text-foreground transition-all duration-150 active:scale-[0.97]"
              style={{ background: 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'hsl(var(--muted)/0.5)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div
                className="w-9 h-9 rounded-[14px] flex items-center justify-center shrink-0 transition-transform"
                style={{ background: `${a.color}15`, color: a.color }}
              >
                <a.icon className="w-[18px] h-[18px]" />
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
