import { useState, useRef, useEffect } from 'react';
import { LogOut, ChevronDown } from 'lucide-react';
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
        className="flex items-center gap-1.5 transition-opacity hover:opacity-80"
        style={{
          background: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 999,
          padding: '5px 10px 5px 6px',
          minHeight: 36,
          boxShadow: 'var(--card-shadow-sm)',
        }}
        aria-label="Account menu"
        aria-expanded={open}
      >
        {auth.avatarUrl ? (
          <img src={auth.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
        ) : (
          <span
            className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
          >
            {initial}
          </span>
        )}
        <span className="max-w-[72px] truncate text-[13px] font-semibold text-foreground hidden sm:block">
          {auth.displayName ?? auth.user.email?.split('@')[0]}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Dropdown */}
          <div
            className="lg-settings-card absolute right-0 top-full mt-2 w-56 z-50"
            style={{
              borderRadius: 16,
              animation: 'dropdown-in 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {/* User info header */}
            <div className="px-4 py-3.5 flex items-center gap-3">
              {auth.avatarUrl ? (
                <img src={auth.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0 ring-2 ring-primary/20" />
              ) : (
                <span
                  className="w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-bold shrink-0"
                  style={{ background: 'hsl(var(--primary)/0.12)', color: 'hsl(var(--primary))' }}
                >
                  {initial}
                </span>
              )}
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-foreground truncate leading-tight">{auth.displayName ?? auth.user.email?.split('@')[0]}</p>
                <p className="text-[12px] text-muted-foreground truncate mt-0.5">{auth.user.email}</p>
              </div>
            </div>

            <div className="h-px mx-0" style={{ background: 'hsl(var(--divider))' }} />

            <button
              onClick={signOut}
              className="w-full flex items-center gap-3 px-4 py-3 text-[14px] font-semibold transition-colors active:bg-destructive/10"
              style={{ color: 'hsl(var(--destructive))' }}
            >
              <LogOut className="w-4 h-4 shrink-0" />
              Sign Out
            </button>
          </div>
        </>
      )}

      <style>{`
        @keyframes dropdown-in {
          from { opacity: 0; transform: scale(0.95) translateY(-4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default UserMenu;
