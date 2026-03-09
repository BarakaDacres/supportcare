import { Sun, Moon, Printer } from 'lucide-react';

interface HeaderProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

const Header = ({ theme, onToggleTheme }: HeaderProps) => {
  return (
    <header className="no-print flex items-center justify-between py-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Income Ledger
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground font-medium">
          Track your earnings with clarity
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
      </div>
    </header>
  );
};

export default Header;
