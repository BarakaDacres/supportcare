import { Sun, Moon, Printer } from 'lucide-react';
import UserMenu from '@/components/UserMenu';
import type { AuthState } from '@/hooks/useAuth';

interface HeaderProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  auth: AuthState;
}

const Header = ({ theme, onToggleTheme, auth }: HeaderProps) => {
  return (
    <header className="no-print flex items-center justify-between py-6">
      <div className="flex items-center gap-3">
        {/* Logo mark */}
        <div
          className="w-9 h-9 rounded-[11px] flex items-center justify-center shrink-0"
          style={{
            background: 'hsl(var(--primary))',
            boxShadow: '0 3px 10px hsl(var(--primary) / 0.3)',
          }}
        >
          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>SC</span>
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl leading-tight">
            Support Care
          </h1>
          <p className="text-[11px] text-muted-foreground font-medium leading-none mt-0.5">
            Shift &amp; earnings tracker
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => window.print()}
          className="glass-chip hover:opacity-80 transition-opacity"
          title="Print report"
        >
          <Printer className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Print</span>
        </button>
        <button
          onClick={onToggleTheme}
          className="glass-chip hover:opacity-80 transition-opacity"
          title="Toggle theme"
        >
          {theme === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        </button>
        <UserMenu auth={auth} />
      </div>
    </header>
  );
};

export default Header;
