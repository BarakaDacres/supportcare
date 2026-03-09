import { Printer, Lock, LockOpen, Sun, Moon, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';

interface ActionSheetProps {
  open: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
  locked: boolean;
  onToggleTheme: () => void;
  onToggleLock: () => void;
}

const ActionSheet = ({ open, onClose, theme, locked, onToggleTheme, onToggleLock }: ActionSheetProps) => {
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
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl pb-8" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)' }}>
        <SheetHeader className="sr-only">
          <SheetTitle>Actions</SheetTitle>
          <SheetDescription>Quick actions for Income Ledger</SheetDescription>
        </SheetHeader>
        <div className="space-y-1 mt-2">
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={a.action}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-semibold text-foreground hover:bg-secondary transition-colors min-h-[44px]"
            >
              <a.icon className="w-5 h-5 text-muted-foreground" />
              {a.label}
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ActionSheet;
