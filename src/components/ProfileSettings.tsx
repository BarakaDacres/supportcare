import { useState, useRef } from 'react';
import { User, Camera, LogOut, Save, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { AuthState } from '@/hooks/useAuth';

interface ProfileSettingsProps {
  auth: AuthState;
}

const ProfileSettings = ({ auth }: ProfileSettingsProps) => {
  const [displayName, setDisplayName] = useState(auth.displayName ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!auth.user) return null;

  const initial = (auth.displayName ?? auth.user.email ?? '?')[0].toUpperCase();

  const handleSave = async () => {
    if (!auth.user) return;
    setSaving(true);
    await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() || null })
      .eq('user_id', auth.user.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-foreground">Account</h2>

      {/* Avatar + Name */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            {auth.avatarUrl ? (
              <img
                src={auth.avatarUrl}
                alt="Avatar"
                className="w-16 h-16 rounded-full object-cover ring-2 ring-primary/30"
              />
            ) : (
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold ring-2 ring-primary/30"
                style={{
                  background: 'hsl(var(--primary) / 0.15)',
                  color: 'hsl(var(--primary))',
                }}
              >
                {initial}
              </div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
              title="Change photo"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {auth.displayName ?? auth.user.email?.split('@')[0]}
            </p>
            <p className="text-xs text-muted-foreground truncate">{auth.user.email}</p>
          </div>
        </div>

        {/* Display Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Display Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={auth.user.email?.split('@')[0] ?? 'Your name'}
            className="glass-input w-full text-foreground min-h-[44px]"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 min-h-[44px] rounded-xl text-sm font-semibold transition-all duration-200"
          style={{
            background: saved
              ? 'hsl(var(--stat-green) / 0.15)'
              : 'hsl(var(--primary))',
            color: saved ? 'hsl(var(--stat-green))' : 'hsl(var(--primary-foreground))',
            boxShadow: saved
              ? '0 0 20px hsl(var(--stat-green) / 0.25)'
              : '0 4px 16px hsl(var(--primary) / 0.35)',
          }}
        >
          {saved ? (
            <>
              <span className="w-4 h-4 inline-flex items-center justify-center">✓</span>
              Saved!
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              {saving ? 'Saving…' : 'Save Changes'}
            </>
          )}
        </button>
      </div>

      {/* Account Info */}
      <div className="glass-card p-4 space-y-3">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Signed in as
        </label>
        <div className="flex items-center gap-3">
          <User className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-foreground truncate">{auth.user.email}</span>
        </div>
      </div>

      {/* Sign Out */}
      <button
        onClick={handleSignOut}
        disabled={signingOut}
        className="w-full glass-card p-4 flex items-center gap-3 min-h-[44px] hover:opacity-80 transition-opacity"
        style={{ color: 'hsl(var(--destructive))' }}
      >
        <LogOut className="w-5 h-5" />
        <span className="text-sm font-semibold">
          {signingOut ? 'Signing out…' : 'Sign Out'}
        </span>
      </button>
    </div>
  );
};

export default ProfileSettings;
