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
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Support Care
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground font-medium">
          Track your support shifts
        </p>
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
