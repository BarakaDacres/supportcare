import { useState, useRef, useEffect } from 'react';
import { LogOut, User, ChevronDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { AuthState } from '@/hooks/useAuth';

interface UserMenuProps {
  auth: AuthState;
}

const UserMenu = ({ auth }: UserMenuProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setOpen(false);
  };

  if (!auth.user) return null;

  const initial = (auth.displayName ?? auth.user.email ?? '?')[0].toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="glass-chip gap-2 min-h-[36px] hover:opacity-80 transition-opacity"
        aria-label="Account menu"
        aria-expanded={open}
      >
        {auth.avatarUrl ? (
          <img src={auth.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
        ) : (
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
          >
            {initial}
          </span>
        )}
        <span className="max-w-[80px] truncate text-xs">{auth.displayName ?? auth.user.email?.split('@')[0]}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 glass-card py-2 shadow-xl z-50">
          <div className="px-4 py-2 border-b border-border/50">
            <p className="text-xs font-semibold text-foreground truncate">{auth.displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{auth.user.email}</p>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
