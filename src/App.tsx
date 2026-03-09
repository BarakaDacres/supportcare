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

// Apply saved theme before any render to prevent flash
const savedRaw = localStorage.getItem('income-ledger-data');
if (savedRaw) {
  try {
    const saved = JSON.parse(savedRaw);
    if (saved?.theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  } catch { /* ignore */ }
}

const AppRoutes = () => {
  const auth = useAuth();

  // Keep dark class in sync with localStorage even when store isn't mounted (e.g. auth screen)
  useEffect(() => {
    const syncTheme = () => {
      try {
        const raw = localStorage.getItem('income-ledger-data');
        const saved = raw ? JSON.parse(raw) : {};
        document.documentElement.classList.toggle('dark', saved?.theme === 'dark');
      } catch { /* ignore */ }
    };
    window.addEventListener('storage', syncTheme);
    return () => window.removeEventListener('storage', syncTheme);
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
