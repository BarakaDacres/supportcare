import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';

type Mode = 'login' | 'signup' | 'forgot';
type OnboardingStep = 'welcome' | 'business' | 'rates' | null;

// ── SVG icons ──────────────────────────────────────────────────────────────────
const AppleIcon = () => (
  <svg width="17" height="20" viewBox="0 0 17 20" fill="currentColor" aria-hidden="true">
    <path d="M14.07 10.65c-.02-2.09 1.71-3.1 1.79-3.15-0.98-1.43-2.5-1.62-3.04-1.64-1.29-.13-2.52.76-3.17.76-.66 0-1.67-.74-2.75-.72-1.41.02-2.71.82-3.44 2.09-1.47 2.55-.38 6.33 1.06 8.4.7 1.02 1.54 2.16 2.63 2.12 1.06-.04 1.46-.68 2.74-.68 1.28 0 1.64.68 2.76.66 1.14-.02 1.87-1.04 2.56-2.07.81-1.18 1.14-2.33 1.16-2.39-.03-.01-2.28-.87-2.3-3.38z" />
    <path d="M11.89 3.89c.58-.71 0.97-1.69.86-2.67-.83.03-1.84.55-2.43 1.25-.53.61-.99 1.6-.87 2.54.92.07 1.87-.46 2.44-1.12z" />
  </svg>
);

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

// ── Onboarding Wizard ─────────────────────────────────────────────────────────
interface OnboardingWizardProps {
  onComplete: () => void;
}

const OnboardingWizard = ({ onComplete }: OnboardingWizardProps) => {
  const [step, setStep] = useState<'welcome' | 'business' | 'rates'>('welcome');
  const [businessName, setBusinessName] = useState('');
  const [abn, setAbn] = useState('');
  const [weekdayRate, setWeekdayRate] = useState('');
  const [saving, setSaving] = useState(false);

  const steps = ['welcome', 'business', 'rates'] as const;
  const stepIdx = steps.indexOf(step);

  const handleFinish = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const updates: Record<string, unknown> = {};
        if (businessName.trim()) updates.business_name = businessName.trim();
        if (abn.trim()) updates.abn = abn.trim();
        if (weekdayRate && !isNaN(Number(weekdayRate))) updates.rate_weekday = Number(weekdayRate);
        if (Object.keys(updates).length > 0) {
          await supabase.from('user_settings').update(updates).eq('user_id', session.user.id);
        }
      }
    } catch (e) {
      console.error('Onboarding save error:', e);
    }
    localStorage.setItem('onboarding_complete', 'true');
    setSaving(false);
    onComplete();
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: 'hsl(var(--background))' }}>
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true"
        style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, hsl(var(--primary)/0.1) 0%, transparent 70%)' }} />

      <div className="w-full max-w-[360px] relative space-y-6">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2">
          {steps.map((s, i) => (
            <div key={s} className="rounded-full transition-all duration-300"
              style={{
                width: i === stepIdx ? 20 : 6,
                height: 6,
                background: i <= stepIdx ? 'hsl(var(--primary))' : 'hsl(var(--border))',
              }} />
          ))}
        </div>

        {/* Card */}
        <div className="glass-card-glow">

          {/* Welcome step */}
          {step === 'welcome' && (
            <div className="p-8 flex flex-col items-center text-center gap-5">
              <div className="w-20 h-20 rounded-[24px] flex items-center justify-center text-white font-black text-3xl tracking-tight select-none"
                style={{
                  background: 'hsl(var(--primary))',
                  boxShadow: '0 8px 32px hsl(var(--primary)/0.4), 0 2px 8px hsl(var(--primary)/0.25), inset 0 1px 0 hsl(0 0% 100% / 0.25)',
                  animation: 'logo-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}>
                SC
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">Welcome to<br />Support Care</h2>
                <p className="text-[14px] text-muted-foreground mt-2 leading-relaxed">
                  Your personal shift and earnings tracker, built for NDIS support workers.
                </p>
              </div>
              <div className="w-full space-y-2 pt-2">
                {['Track shifts & earnings', 'Generate professional invoices', 'Analyse your income'].map(f => (
                  <div key={f} className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-left"
                    style={{ background: 'hsl(var(--primary)/0.06)' }}>
                    <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold"
                      style={{ background: 'hsl(var(--primary))', color: '#fff' }}>✓</span>
                    <p className="text-[14px] text-foreground font-medium">{f}</p>
                  </div>
                ))}
              </div>
              <button onClick={() => setStep('business')}
                className="w-full rounded-2xl px-4 py-3.5 text-[15px] font-bold min-h-[52px] transition-all active:scale-[0.98]"
                style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', boxShadow: '0 4px 20px hsl(var(--primary)/0.35)' }}>
                Let's get started →
              </button>
            </div>
          )}

          {/* Business step */}
          {step === 'business' && (
            <div className="p-6 space-y-5">
              <div className="text-center">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Step 2 of 3</p>
                <h2 className="text-[20px] font-bold text-foreground mt-1">Your Business</h2>
                <p className="text-[13px] text-muted-foreground mt-1">Used on your invoices — you can update this anytime</p>
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Business / Your Name</label>
                  <input type="text" placeholder="Your Name or Business Name" value={businessName}
                    onChange={e => setBusinessName(e.target.value)}
                    className="glass-input w-full text-foreground" style={{ minHeight: 48 }} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">ABN <span className="normal-case text-muted-foreground font-normal">(optional)</span></label>
                  <input type="text" placeholder="12 345 678 901" value={abn}
                    onChange={e => setAbn(e.target.value)}
                    className="glass-input w-full text-foreground" style={{ minHeight: 48 }} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep('rates')}
                  className="flex-1 rounded-2xl px-4 py-3 text-[14px] font-semibold min-h-[48px] transition-all"
                  style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
                  Skip
                </button>
                <button onClick={() => setStep('rates')}
                  className="flex-[2] rounded-2xl px-4 py-3 text-[14px] font-bold min-h-[48px] transition-all active:scale-[0.98]"
                  style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', boxShadow: '0 4px 16px hsl(var(--primary)/0.3)' }}>
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* Rates step */}
          {step === 'rates' && (
            <div className="p-6 space-y-5">
              <div className="text-center">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Step 3 of 3</p>
                <h2 className="text-[20px] font-bold text-foreground mt-1">Your Pay Rate</h2>
                <p className="text-[13px] text-muted-foreground mt-1">Set your weekday hourly rate to get started</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Weekday Rate ($/hr)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[17px] font-semibold text-muted-foreground">$</span>
                  <input type="number" placeholder="60" value={weekdayRate}
                    onChange={e => setWeekdayRate(e.target.value)}
                    className="glass-input w-full text-foreground pl-8" style={{ minHeight: 52, fontSize: 17 }} />
                </div>
                <p className="text-[11px] text-muted-foreground px-1">Other rates (weekend, public holiday, etc.) can be set in Settings → Rates</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={handleFinish}
                  className="flex-1 rounded-2xl px-4 py-3 text-[14px] font-semibold min-h-[48px] transition-all"
                  style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
                  Skip
                </button>
                <button onClick={handleFinish} disabled={saving}
                  className="flex-[2] rounded-2xl px-4 py-3 text-[14px] font-bold min-h-[48px] transition-all active:scale-[0.98] disabled:opacity-50"
                  style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', boxShadow: '0 4px 16px hsl(var(--primary)/0.3)' }}>
                  {saving ? 'Setting up…' : 'Get Started 🎉'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes logo-pop {
          from { opacity: 0; transform: scale(0.7); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

// ── Main Auth Page ─────────────────────────────────────────────────────────────
const AuthPage = () => {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState<OnboardingStep>(null);

  // Check on mount if we're a freshly-confirmed new user
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('type=signup') || hash.includes('type=recovery')) {
      // handled by supabase redirect — do nothing here
    }
    // If user just signed up via OAuth and onboarding not done
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        const done = localStorage.getItem('onboarding_complete');
        if (!done) {
          // Small delay so App.tsx picks up the user state first
          setTimeout(() => setShowOnboarding('welcome'), 300);
        }
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setMessage({ type: 'error', text: error.message });
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name }, emailRedirectTo: window.location.origin },
        });
        if (error) setMessage({ type: 'error', text: error.message });
        else setMessage({ type: 'success', text: 'Check your email for a confirmation link. Once confirmed, sign in to start the setup.' });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) setMessage({ type: 'error', text: error.message });
        else setMessage({ type: 'success', text: 'Password reset email sent.' });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSocial = async (provider: 'google' | 'apple') => {
    setLoading(true);
    setMessage(null);
    localStorage.setItem('last_auth_provider', provider);
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
    if (result && 'error' in result && result.error) {
      setMessage({ type: 'error', text: String(result.error) });
      setLoading(false);
    }
  };

  // Show onboarding wizard instead of auth screen
  if (showOnboarding) {
    return <OnboardingWizard onComplete={() => setShowOnboarding(null)} />;
  }

  const isDark = document.documentElement.classList.contains('dark');

  return (
    <div className="min-h-screen flex flex-col items-center justify-end px-5 pb-10 pt-8 relative overflow-hidden"
      style={{ background: isDark ? '#0a0a0c' : 'hsl(var(--background))' }}>

      {/* ── Subtle grid texture ── */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true"
        style={{
          backgroundImage: isDark
            ? `linear-gradient(hsl(220 20% 20% / 0.06) 1px, transparent 1px), linear-gradient(90deg, hsl(220 20% 20% / 0.06) 1px, transparent 1px)`
            : `linear-gradient(hsl(220 20% 80% / 0.08) 1px, transparent 1px), linear-gradient(90deg, hsl(220 20% 80% / 0.08) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 80% 70% at 50% 30%, black 0%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 30%, black 0%, transparent 80%)',
        }} />

      {/* ── Ambient glow ── */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true"
        style={{
          background: isDark
            ? 'radial-gradient(ellipse 60% 40% at 50% 15%, hsl(211 100% 50% / 0.06) 0%, transparent 70%)'
            : 'radial-gradient(ellipse 60% 40% at 50% 15%, hsl(211 100% 50% / 0.08) 0%, transparent 70%)',
        }} />

      {/* ── Centered brand area ── */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 relative z-10 mb-10">
        <div className="w-20 h-20 rounded-[24px] flex items-center justify-center text-white font-black text-3xl tracking-tight select-none"
          style={{
            background: 'hsl(211 100% 50%)',
            boxShadow: '0 12px 48px hsl(211 100% 50% / 0.35), 0 4px 16px hsl(211 100% 50% / 0.2), inset 0 1px 0 hsl(0 0% 100% / 0.2)',
            animation: 'logo-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}>
          SC
        </div>
        <div className="text-center">
          <h1 className="text-[28px] font-bold tracking-tight" style={{ color: isDark ? 'white' : 'hsl(var(--foreground))' }}>Support Care</h1>
          <p className="text-[14px] mt-1" style={{ color: isDark ? 'hsl(220 10% 50%)' : 'hsl(var(--muted-foreground))' }}>
            Shift tracking & invoicing for NDIS workers
          </p>
        </div>
      </div>

      {/* ── Auth card ── */}
      <div className="w-full max-w-[380px] relative z-10 space-y-4">

        {mode !== 'forgot' ? (
          <>
            {/* Social sign-in buttons */}
            <div className="space-y-2.5">
              <button onClick={() => handleSocial('google')} disabled={loading}
                className="lg-settings-card w-full flex items-center gap-4 px-5 text-[15px] font-medium transition-all duration-200 active:scale-[0.98] disabled:opacity-40"
                style={{
                  minHeight: 52,
                  color: isDark ? 'white' : 'hsl(var(--foreground))',
                  borderRadius: 18,
                }}>
                <GoogleIcon />
                <span className="flex-1 text-left">Sign in with Google</span>
                {localStorage.getItem('last_auth_provider') === 'google' && (
                  <span className="text-[10px] font-medium rounded-full px-2.5 py-1"
                    style={{ background: isDark ? 'hsl(220 10% 100% / 0.08)' : 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
                    Last used
                  </span>
                )}
              </button>

              <button onClick={() => handleSocial('apple')} disabled={loading}
                className="lg-settings-card w-full flex items-center gap-4 px-5 text-[15px] font-medium transition-all duration-200 active:scale-[0.98] disabled:opacity-40"
                style={{
                  minHeight: 52,
                  color: isDark ? 'white' : 'hsl(var(--foreground))',
                  borderRadius: 18,
                }}>
                <AppleIcon />
                <span className="flex-1 text-left">Sign in with Apple</span>
                {localStorage.getItem('last_auth_provider') === 'apple' && (
                  <span className="text-[10px] font-medium rounded-full px-2.5 py-1"
                    style={{ background: isDark ? 'hsl(220 10% 100% / 0.08)' : 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
                    Last used
                  </span>
                )}
              </button>
            </div>

            <div className="flex items-center gap-3 py-0.5">
              <div className="flex-1 h-px" style={{ background: isDark ? 'hsl(220 10% 100% / 0.06)' : 'hsl(var(--border))' }} />
              <span className="text-[11px] font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>or</span>
              <div className="flex-1 h-px" style={{ background: isDark ? 'hsl(220 10% 100% / 0.06)' : 'hsl(var(--border))' }} />
            </div>
          </>
        ) : null}

        {/* Email/password form — Liquid Glass */}
        <div className="lg-settings-card" style={{ borderRadius: 18 }}>
          <form onSubmit={handleSubmit} className="p-4 space-y-2.5">
            {mode === 'signup' && (
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Name</label>
                <input type="text" autoComplete="name" placeholder="Your name" value={name}
                  onChange={e => setName(e.target.value)} required
                  className="w-full rounded-xl px-3.5 outline-none transition-all"
                  style={{
                    minHeight: 42, fontSize: '0.8125rem', fontWeight: 500,
                    background: isDark ? 'hsl(220 14% 8% / 0.8)' : 'hsl(var(--muted)/0.5)',
                    color: isDark ? 'white' : 'hsl(var(--foreground))',
                    border: isDark ? '0.5px solid hsl(220 10% 100% / 0.08)' : '0.5px solid hsl(var(--border))',
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'hsl(211 100% 58% / 0.5)'}
                  onBlur={e => e.currentTarget.style.borderColor = isDark ? 'hsl(220 10% 100% / 0.08)' : 'hsl(var(--border))'}
                />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Email</label>
              <input type="email" autoComplete="email" placeholder="you@example.com" value={email}
                onChange={e => setEmail(e.target.value)} required
                className="w-full rounded-xl px-3.5 outline-none transition-all"
                style={{
                  minHeight: 42, fontSize: '0.8125rem', fontWeight: 500,
                  background: isDark ? 'hsl(220 14% 8% / 0.8)' : 'hsl(var(--muted)/0.5)',
                  color: isDark ? 'white' : 'hsl(var(--foreground))',
                  border: isDark ? '0.5px solid hsl(220 10% 100% / 0.08)' : '0.5px solid hsl(var(--border))',
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'hsl(211 100% 58% / 0.5)'}
                onBlur={e => e.currentTarget.style.borderColor = isDark ? 'hsl(220 10% 100% / 0.08)' : 'hsl(var(--border))'}
              />
            </div>
            {mode !== 'forgot' && (
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Password</label>
                <input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required
                  className="w-full rounded-xl px-3.5 outline-none transition-all"
                  style={{
                    minHeight: 42, fontSize: '0.8125rem', fontWeight: 500,
                    background: isDark ? 'hsl(220 14% 8% / 0.8)' : 'hsl(var(--muted)/0.5)',
                    color: isDark ? 'white' : 'hsl(var(--foreground))',
                    border: isDark ? '0.5px solid hsl(220 10% 100% / 0.08)' : '0.5px solid hsl(var(--border))',
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'hsl(211 100% 58% / 0.5)'}
                  onBlur={e => e.currentTarget.style.borderColor = isDark ? 'hsl(220 10% 100% / 0.08)' : 'hsl(var(--border))'}
                />
              </div>
            )}

            {message && (
              <div className="text-[12px] font-medium px-3.5 py-2.5 rounded-xl leading-relaxed"
                style={{
                  background: message.type === 'error' ? 'hsl(0 62% 52% / 0.15)' : 'hsl(126 38% 58% / 0.15)',
                  color: message.type === 'error' ? 'hsl(0 62% 70%)' : 'hsl(126 38% 70%)',
                  border: `0.5px solid ${message.type === 'error' ? 'hsl(0 62% 52% / 0.25)' : 'hsl(126 38% 58% / 0.25)'}`,
                }}>
                {message.text}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full rounded-2xl px-4 py-3 text-[14px] font-bold min-h-[46px] transition-all duration-200 disabled:opacity-40 active:scale-[0.98]"
              style={{
                background: 'hsl(211 100% 50%)',
                color: '#fff',
                boxShadow: '0 4px 20px hsl(211 100% 50% / 0.3)',
                marginTop: 4,
              }}>
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
            </button>
          </form>

          {/* Footer links */}
          <div className="px-4 py-3 text-center space-y-1" style={{ borderTop: isDark ? '0.5px solid hsl(220 10% 100% / 0.06)' : '0.5px solid hsl(var(--border))' }}>
            {mode === 'login' && (
              <>
                <button onClick={() => { setMode('forgot'); setMessage(null); }}
                  className="text-[11px] font-medium block w-full" style={{ color: 'hsl(211 100% 58%)' }}>
                  Forgot password?
                </button>
                <p className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  No account?{' '}
                  <button onClick={() => { setMode('signup'); setMessage(null); }} className="font-semibold" style={{ color: 'hsl(211 100% 58%)' }}>
                    Sign up
                  </button>
                </p>
              </>
            )}
            {mode === 'signup' && (
              <p className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Already have an account?{' '}
                <button onClick={() => { setMode('login'); setMessage(null); }} className="font-semibold" style={{ color: 'hsl(211 100% 58%)' }}>
                  Sign in
                </button>
              </p>
            )}
            {mode === 'forgot' && (
              <button onClick={() => { setMode('login'); setMessage(null); }} className="text-[11px] font-medium" style={{ color: 'hsl(211 100% 58%)' }}>
                ← Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes logo-pop {
          from { opacity: 0; transform: scale(0.7); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

export default AuthPage;
