import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';

type Mode = 'login' | 'signup' | 'forgot';

const AuthPage = () => {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage({ type: 'error', text: error.message });
    } else if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) setMessage({ type: 'error', text: error.message });
      else setMessage({ type: 'success', text: 'Check your email for a confirmation link.' });
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) setMessage({ type: 'error', text: error.message });
      else setMessage({ type: 'success', text: 'Password reset email sent.' });
    }

    setLoading(false);
  };

  const handleSocial = async (provider: 'google' | 'apple') => {
    setLoading(true);
    setMessage(null);
    const result = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin,
    });
    if (result && 'error' in result && result.error) {
      setMessage({ type: 'error', text: String(result.error) });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      {/* Background glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 0%, hsl(var(--primary)/0.08), transparent)',
        }}
      />

      <div className="w-full max-w-sm relative">
        {/* Card */}
        <div className="glass-card p-8 space-y-6">
          {/* Logo / heading */}
          <div className="text-center space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Income Ledger</h1>
            <p className="text-sm text-muted-foreground">
              {mode === 'login' && 'Sign in to your account'}
              {mode === 'signup' && 'Create your account'}
              {mode === 'forgot' && 'Reset your password'}
            </p>
          </div>

          {/* Social auth */}
          {mode !== 'forgot' && (
            <div className="space-y-3">
              <button
                onClick={() => handleSocial('apple')}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 glass-surface rounded-2xl px-4 py-3 text-sm font-semibold text-foreground min-h-[48px] transition-opacity hover:opacity-80 active:opacity-60 disabled:opacity-40"
              >
                <AppleIcon />
                Continue with Apple
              </button>
              <button
                onClick={() => handleSocial('google')}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 glass-surface rounded-2xl px-4 py-3 text-sm font-semibold text-foreground min-h-[48px] transition-opacity hover:opacity-80 active:opacity-60 disabled:opacity-40"
              >
                <GoogleIcon />
                Continue with Google
              </button>

              <div className="relative flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground font-medium">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</label>
                <input
                  type="text"
                  autoComplete="name"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="glass-input w-full text-foreground min-h-[48px] placeholder:text-muted-foreground"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</label>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="glass-input w-full text-foreground min-h-[48px] placeholder:text-muted-foreground"
              />
            </div>

            {mode !== 'forgot' && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Password</label>
                <input
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="glass-input w-full text-foreground min-h-[48px] placeholder:text-muted-foreground"
                />
              </div>
            )}

            {message && (
              <div
                className={`text-xs font-medium px-4 py-3 rounded-xl ${
                  message.type === 'error'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-[hsl(var(--stat-green)/0.12)] text-[hsl(var(--stat-green))]'
                }`}
              >
                {message.text}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl px-4 py-3 text-sm font-bold min-h-[48px] transition-all duration-200 disabled:opacity-40"
              style={{
                background: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
                boxShadow: '0 4px 16px hsl(var(--primary)/0.3)',
              }}
            >
              {loading
                ? 'Please wait…'
                : mode === 'login'
                ? 'Sign In'
                : mode === 'signup'
                ? 'Create Account'
                : 'Send Reset Link'}
            </button>
          </form>

          {/* Footer links */}
          <div className="text-center space-y-2">
            {mode === 'login' && (
              <>
                <button onClick={() => setMode('forgot')} className="text-xs text-primary font-medium block w-full">
                  Forgot password?
                </button>
                <p className="text-xs text-muted-foreground">
                  No account?{' '}
                  <button onClick={() => setMode('signup')} className="text-primary font-semibold">
                    Sign up
                  </button>
                </p>
              </>
            )}
            {mode === 'signup' && (
              <p className="text-xs text-muted-foreground">
                Already have an account?{' '}
                <button onClick={() => setMode('login')} className="text-primary font-semibold">
                  Sign in
                </button>
              </p>
            )}
            {mode === 'forgot' && (
              <button onClick={() => setMode('login')} className="text-xs text-primary font-medium">
                Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Inline SVG icons to avoid extra deps
const AppleIcon = () => (
  <svg width="17" height="20" viewBox="0 0 17 20" fill="currentColor" aria-hidden="true">
    <path d="M14.07 10.65c-.02-2.09 1.71-3.1 1.79-3.15-0.98-1.43-2.5-1.62-3.04-1.64-1.29-.13-2.52.76-3.17.76-.66 0-1.67-.74-2.75-.72-1.41.02-2.71.82-3.44 2.09-1.47 2.55-.38 6.33 1.06 8.4.7 1.02 1.54 2.16 2.63 2.12 1.06-.04 1.46-.68 2.74-.68 1.28 0 1.64.68 2.76.66 1.14-.02 1.87-1.04 2.56-2.07.81-1.18 1.14-2.33 1.16-2.39-.03-.01-2.28-.87-2.3-3.38z" />
    <path d="M11.89 3.89c.58-.71 0.97-1.69.86-2.67-.83.03-1.84.55-2.43 1.25-.53.61-.99 1.6-.87 2.54.92.07 1.87-.46 2.44-1.12z" />
  </svg>
);

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

export default AuthPage;
