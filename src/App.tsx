import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index";
import AuthPage from "./pages/AuthPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// ── Theme bootstrap (runs once before first paint) ──────────────────────────
// Priority: explicit user override stored in localStorage > system preference
;(() => {
  try {
    const raw = localStorage.getItem('income-ledger-data');
    const saved = raw ? JSON.parse(raw) : {};
    if (saved?.themeOverride === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (saved?.themeOverride === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      // No explicit override → follow system (including legacy 'theme' key migration)
      const legacyDark = saved?.theme === 'dark';
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      // If there's a legacy explicit key use it once, otherwise follow system
      const isDark = (saved?.themeOverride === undefined && saved?.theme !== undefined)
        ? legacyDark
        : systemDark;
      document.documentElement.classList.toggle('dark', isDark);
    }
  } catch { /* ignore */ }
})();

const AppRoutes = () => {
  const auth = useAuth();

  // Keep the dark class in sync:
  //   1. When system appearance changes (and user has no override)
  //   2. When the user explicitly toggles via app (theme-sync event)
  //   3. Cross-tab (storage event)
  useEffect(() => {
    const applyTheme = () => {
      try {
        const raw = localStorage.getItem('income-ledger-data');
        const saved = raw ? JSON.parse(raw) : {};
        if (saved?.themeOverride === 'dark') {
          document.documentElement.classList.add('dark');
        } else if (saved?.themeOverride === 'light') {
          document.documentElement.classList.remove('dark');
        } else {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          document.documentElement.classList.toggle('dark', prefersDark);
        }
      } catch { /* ignore */ }
    };

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', applyTheme);
    window.addEventListener('storage', applyTheme);
    window.addEventListener('theme-sync', applyTheme);
    return () => {
      mq.removeEventListener('change', applyTheme);
      window.removeEventListener('storage', applyTheme);
      window.removeEventListener('theme-sync', applyTheme);
    };
  }, []);

  if (auth.loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={auth.user ? <Index auth={auth} /> : <AuthPage />}
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
