import { useState, useRef, useEffect, useCallback } from 'react';
import {
  User, Camera, LogOut, Save, Loader2, Building2, CreditCard,
  FileText, MapPin, Hash, RotateCcw, RefreshCw, AlertCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { AuthState } from '@/hooks/useAuth';
import type { UserSettings } from '@/hooks/useUserSettings';

interface AccountPanelProps {
  auth: AuthState;
  settings: UserSettings | null;
  settingsLoading: boolean;
  onSaveSettings: (updates: Partial<Omit<UserSettings, 'id' | 'user_id'>>) => Promise<void>;
}

/* ─────────────────────────────────────────────────────────────────
   All sub-components at MODULE LEVEL to prevent focus-loss on mobile
───────────────────────────────────────────────────────────────── */

const SectionHeader = ({ label }: { label: string }) => (
  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-1 mb-1.5 mt-1">
    {label}
  </p>
);

const SettingsGroup = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl overflow-hidden"
    style={{ background: 'hsl(var(--card))', boxShadow: 'var(--card-shadow-sm)', border: '1px solid hsl(var(--border))' }}>
    {children}
  </div>
);

interface FieldRowProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
  isLast?: boolean;
}
const FieldRow = ({ label, value, onChange, placeholder, type = 'text', hint, isLast }: FieldRowProps) => (
  <div>
    <div className="px-4 py-3 space-y-1.5">
      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="glass-input w-full text-foreground text-[15px]"
        style={{ minHeight: 44 }}
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
    {!isLast && <div className="ml-4 mr-0 h-px" style={{ background: 'hsl(var(--divider))' }} />}
  </div>
);

interface GridFieldRowProps {
  fields: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }[];
  isLast?: boolean;
}
const GridFieldRow = ({ fields, isLast }: GridFieldRowProps) => (
  <div>
    <div className="px-4 py-3">
      <div className="grid grid-cols-2 gap-3">
        {fields.map(f => (
          <div key={f.label} className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{f.label}</label>
            <input
              type="text"
              value={f.value}
              onChange={e => f.onChange(e.target.value)}
              placeholder={f.placeholder}
              className="glass-input w-full text-foreground text-[15px]"
              style={{ minHeight: 44 }}
            />
          </div>
        ))}
      </div>
    </div>
    {!isLast && <div className="ml-4 mr-0 h-px" style={{ background: 'hsl(var(--divider))' }} />}
  </div>
);

interface NotesRowProps {
  value: string;
  onChange: (v: string) => void;
  isLast?: boolean;
}
const NotesRow = ({ value, onChange, isLast }: NotesRowProps) => (
  <div>
    <div className="px-4 py-3 space-y-1.5">
      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Default Invoice Notes</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="e.g. GST-free supply – no GST charged. Payment due within 14 days."
        rows={3}
        className="glass-input w-full text-foreground resize-none text-[15px]"
        style={{ boxSizing: 'border-box' }}
      />
    </div>
    {!isLast && <div className="ml-4 mr-0 h-px" style={{ background: 'hsl(var(--divider))' }} />}
  </div>
);

const SaveButton = ({ onSave, saving, saved }: { onSave: () => void; saving: boolean; saved: boolean }) => (
  <button
    onClick={onSave}
    disabled={saving}
    className="w-full flex items-center justify-center gap-2 min-h-[50px] rounded-2xl text-[15px] font-semibold transition-all duration-200 disabled:opacity-50"
    style={{
      background: saved ? 'hsl(var(--stat-green) / 0.15)' : 'hsl(var(--primary))',
      color: saved ? 'hsl(var(--stat-green))' : 'hsl(var(--primary-foreground))',
      boxShadow: saved ? '0 0 20px hsl(var(--stat-green)/0.2)' : '0 4px 16px hsl(var(--primary)/0.3)',
    }}
  >
    {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : saved ? '✓ Saved' : <><Save className="w-4 h-4" /> Save</>}
  </button>
);

/* ── Main component ── */
const AccountPanel = ({ auth, settings, settingsLoading, onSaveSettings }: AccountPanelProps) => {
  const [displayName, setDisplayName] = useState(auth.displayName ?? '');
  const [avatarUrl, setAvatarUrl] = useState(auth.avatarUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Profile save state
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Business fields
  const [businessName, setBusinessName] = useState('');
  const [abn, setAbn] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [bizSaving, setBizSaving] = useState(false);
  const [bizSaved, setBizSaved] = useState(false);

  // Banking fields
  const [bankName, setBankName] = useState('');
  const [bsb, setBsb] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [bankSaving, setBankSaving] = useState(false);
  const [bankSaved, setBankSaved] = useState(false);

  // Invoice counter
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  // Timeout/retry
  const [timedOut, setTimedOut] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!settingsLoading) { setTimedOut(false); return; }
    const t = setTimeout(() => setTimedOut(true), 6000);
    return () => clearTimeout(t);
  }, [settingsLoading, retryKey]);

  // Sync from settings once
  const settingsLoaded = useRef(false);
  useEffect(() => {
    if (!settings || settingsLoaded.current) return;
    settingsLoaded.current = true;
    setBusinessName(settings.business_name ?? '');
    setAbn(settings.abn ?? '');
    setEmail(settings.email ?? '');
    setPhone((settings as unknown as Record<string, string | null>).phone ?? '');
    setAddress((settings as unknown as Record<string, string | null>).address ?? '');
    setBankName(settings.bank_name ?? '');
    setBsb(settings.bsb ?? '');
    setAccountNumber(settings.account_number ?? '');
    setAccountName((settings as unknown as Record<string, string | null>).account_name ?? '');
    setInvoiceNotes(settings.invoice_notes ?? '');
  }, [settings]);

  if (!auth.user) return null;

  const initial = (auth.displayName ?? auth.user.email ?? '?')[0].toUpperCase();

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.user) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${auth.user.id}/avatar.${ext}`;
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${data.publicUrl}?t=${Date.now()}`;
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('user_id', auth.user.id);
      setAvatarUrl(publicUrl);
    } catch (err) {
      console.error('Avatar upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!auth.user) return;
    setProfileSaving(true);
    await supabase.from('profiles').update({ display_name: displayName.trim() || null }).eq('user_id', auth.user.id);
    setProfileSaving(false);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2500);
  };

  const handleSaveBusiness = async () => {
    setBizSaving(true);
    await onSaveSettings({
      business_name: businessName.trim() || null,
      abn: abn.trim() || null,
      invoice_notes: invoiceNotes.trim() || null,
      ...({ email: email.trim() || null, phone: phone.trim() || null, address: address.trim() || null } as unknown as Partial<Omit<UserSettings, 'id' | 'user_id'>>),
    });
    setBizSaving(false);
    setBizSaved(true);
    setTimeout(() => setBizSaved(false), 2500);
  };

  const handleSaveBank = async () => {
    setBankSaving(true);
    await onSaveSettings({
      bank_name: bankName.trim() || null,
      bsb: bsb.trim() || null,
      account_number: accountNumber.trim() || null,
      ...({ account_name: accountName.trim() || null } as unknown as Partial<Omit<UserSettings, 'id' | 'user_id'>>),
    });
    setBankSaving(false);
    setBankSaved(true);
    setTimeout(() => setBankSaved(false), 2500);
  };

  const handleResetCounter = async () => {
    if (!confirmReset) { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 4000); return; }
    setResetting(true);
    setConfirmReset(false);
    await onSaveSettings({ invoice_counter: 0 });
    setResetting(false);
    setResetDone(true);
    setTimeout(() => setResetDone(false), 2500);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    window.dispatchEvent(new CustomEvent('theme-sync'));
  };

  // Loading state
  if (settingsLoading) {
    if (timedOut) {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'hsl(var(--muted))' }}>
            <AlertCircle className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Settings unavailable</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">Could not load your settings. Check your connection and try again.</p>
          </div>
          <button onClick={() => { setTimedOut(false); setRetryKey(k => k + 1); window.location.reload(); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <p className="text-xs text-muted-foreground">Loading account…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-4">

      {/* ── Profile ── */}
      <div className="space-y-1.5">
        <SectionHeader label="Profile" />
        <SettingsGroup>
          {/* Avatar row */}
          <div className="px-4 py-4 flex items-center gap-4">
            <button className="relative shrink-0 group" onClick={() => fileRef.current?.click()} title="Change photo" disabled={uploading}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-14 h-14 rounded-full object-cover ring-2 ring-primary/30 transition-opacity group-hover:opacity-70" />
              ) : (
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold ring-2 ring-primary/30 transition-opacity group-hover:opacity-70"
                  style={{ background: 'hsl(var(--primary)/0.15)', color: 'hsl(var(--primary))' }}>
                  {initial}
                </div>
              )}
              <div className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: 'hsl(var(--foreground)/0.35)' }}>
                {uploading ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Camera className="w-4 h-4 text-white" />}
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center shadow pointer-events-none"
                style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                {uploading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Camera className="w-2.5 h-2.5" />}
              </div>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-foreground truncate">
                {auth.displayName ?? auth.user.email?.split('@')[0]}
              </p>
              <p className="text-[13px] text-muted-foreground truncate">{auth.user.email}</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'hsl(var(--primary))' }}>Tap to change photo</p>
            </div>
          </div>

          <div className="ml-4 mr-0 h-px" style={{ background: 'hsl(var(--divider))' }} />

          <FieldRow
            label="Display Name"
            value={displayName}
            onChange={setDisplayName}
            placeholder={auth.user.email?.split('@')[0] ?? 'Your name'}
            isLast
          />
        </SettingsGroup>

        <div className="px-1 pt-1">
          <SaveButton onSave={handleSaveProfile} saving={profileSaving} saved={profileSaved} />
        </div>
      </div>

      {/* ── Business Identity ── */}
      <div className="space-y-1.5">
        <SectionHeader label="Business Identity" />
        <p className="text-[11px] text-muted-foreground px-1 mb-1.5">Shown at the top of every invoice.</p>
        <SettingsGroup>
          <FieldRow label="Business / Your Name" value={businessName} onChange={setBusinessName} placeholder="Your Name or Business Name" hint="Appears on all invoices" />
          <FieldRow label="ABN" value={abn} onChange={setAbn} placeholder="12 345 678 901" />
          <FieldRow label="Email" value={email} onChange={setEmail} placeholder="invoices@yourbusiness.com.au" type="email" hint="Shown in invoice header" />
          <FieldRow label="Phone" value={phone} onChange={setPhone} placeholder="+61 4XX XXX XXX" type="tel" />
          <FieldRow label="Address" value={address} onChange={setAddress} placeholder="Suburb, State" />
          <NotesRow value={invoiceNotes} onChange={setInvoiceNotes} isLast />
        </SettingsGroup>

        <div className="px-1 pt-1">
          <SaveButton onSave={handleSaveBusiness} saving={bizSaving} saved={bizSaved} />
        </div>
      </div>

      {/* ── Banking ── */}
      <div className="space-y-1.5">
        <SectionHeader label="Banking & Payment" />
        <p className="text-[11px] text-muted-foreground px-1 mb-1.5">Shown in the payment section of your invoices.</p>
        <SettingsGroup>
          <FieldRow label="Bank Name" value={bankName} onChange={setBankName} placeholder="Commonwealth Bank" />
          <GridFieldRow
            fields={[
              { label: 'BSB', value: bsb, onChange: setBsb, placeholder: '000-000' },
              { label: 'Account Number', value: accountNumber, onChange: setAccountNumber, placeholder: '12345678' },
            ]}
          />
          <FieldRow label="Account Name" value={accountName} onChange={setAccountName} placeholder="Your Full Name" isLast />
        </SettingsGroup>

        <div className="px-1 pt-1">
          <SaveButton onSave={handleSaveBank} saving={bankSaving} saved={bankSaved} />
        </div>
      </div>

      {/* ── Invoice Numbering ── */}
      <div className="space-y-1.5">
        <SectionHeader label="Invoice Numbering" />
        {settings && (
          <SettingsGroup>
            <div className="px-4 py-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[15px] font-semibold text-foreground">Current Counter</p>
                <p className="text-[13px] text-muted-foreground mt-0.5">
                  Next: <span className="font-mono font-semibold" style={{ color: 'hsl(var(--primary))' }}>
                    INV-{String((settings.invoice_counter ?? 0) + 1).padStart(3, '0')}
                  </span>
                </p>
              </div>
              <div className="text-2xl font-bold font-mono" style={{ color: 'hsl(var(--primary))' }}>
                #{String(settings.invoice_counter ?? 0).padStart(3, '0')}
              </div>
            </div>
          </SettingsGroup>
        )}
        <div className="px-1">
          <button
            onClick={handleResetCounter}
            disabled={resetting}
            className="w-full flex items-center justify-center gap-2 min-h-[44px] rounded-xl text-[15px] font-semibold transition-all duration-200"
            style={{
              background: resetDone ? 'hsl(var(--stat-green)/0.15)' : confirmReset ? 'hsl(var(--destructive)/0.12)' : 'hsl(var(--muted))',
              color: resetDone ? 'hsl(var(--stat-green))' : confirmReset ? 'hsl(var(--destructive))' : 'hsl(var(--foreground))',
              border: confirmReset ? '1px solid hsl(var(--destructive)/0.3)' : '1px solid hsl(var(--border))',
            }}
          >
            {resetting ? <><Loader2 className="w-4 h-4 animate-spin" /> Resetting…</> : resetDone ? '✓ Counter Reset' : confirmReset ? '⚠ Tap again to confirm' : <><RotateCcw className="w-4 h-4" /> Reset to #000</>}
          </button>
          <p className="text-[11px] text-muted-foreground px-1 mt-2">Resets so the next invoice starts at INV-001. Existing invoices are not affected.</p>
        </div>
      </div>

      {/* ── Session ── */}
      <div className="space-y-1.5">
        <SectionHeader label="Session" />
        <SettingsGroup>
          <div className="px-4 flex items-center gap-3" style={{ minHeight: 50 }}>
            <User className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-[15px] text-foreground truncate">{auth.user.email}</span>
          </div>
          <div className="ml-4 h-px" style={{ background: 'hsl(var(--divider))' }} />
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full flex items-center gap-3 px-4 transition-colors duration-150"
            style={{ minHeight: 50, color: 'hsl(var(--destructive))' }}
          >
            <LogOut className="w-5 h-5" />
            <span className="text-[15px] font-semibold">{signingOut ? 'Signing out…' : 'Sign Out'}</span>
          </button>
        </SettingsGroup>
      </div>

    </div>
  );
};

export default AccountPanel;
