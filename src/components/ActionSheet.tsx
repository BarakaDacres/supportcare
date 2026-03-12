import { Printer, Lock, LockOpen, Sun, Moon, X } from 'lucide-react';

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
      label: 'Print Report',
      icon: Printer,
      action: () => { window.print(); onClose(); },
    },
    {
      label: locked ? 'Unlock Month' : 'Lock Month',
      icon: locked ? LockOpen : Lock,
      action: () => { onToggleLock(); onClose(); },
    },
    {
      label: theme === 'light' ? 'Dark Mode' : 'Light Mode',
      icon: theme === 'light' ? Moon : Sun,
      action: () => { onToggleTheme(); onClose(); },
    },
  ];

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      style={{ background: 'hsl(var(--foreground)/0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      {/* Modal card */}
      <div
        className="w-full flex flex-col"
        style={{
          maxWidth: 340,
          background: 'hsl(var(--card))',
          borderRadius: 24,
          boxShadow:
            '0 2px 8px hsl(var(--foreground)/0.08), ' +
            '0 16px 48px hsl(var(--foreground)/0.18), ' +
            '0 0 0 0.5px hsl(var(--border))',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '0.5px solid hsl(var(--border))' }}
        >
          <p className="text-base font-bold text-foreground">Actions</p>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors shrink-0"
            style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Action list */}
        <div className="p-3 space-y-1">
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={a.action}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-semibold text-foreground transition-colors min-h-[50px]"
              style={{ background: 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'hsl(var(--muted))')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <a.icon className="w-5 h-5 text-muted-foreground shrink-0" />
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ActionSheet;
