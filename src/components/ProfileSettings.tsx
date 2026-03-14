import { useState, useRef, useEffect, useCallback } from 'react';
import { User, Camera, LogOut, Save, Loader2, Building2, CreditCard, FileText, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { AuthState } from '@/hooks/useAuth';
import type { UserSettings } from '@/hooks/useUserSettings';

interface ProfileSettingsProps {
  auth: AuthState;
  settings: UserSettings | null;
  onSaveSettings: (updates: Partial<Omit<UserSettings, 'id' | 'user_id'>>) => Promise<void>;
}

/* ─────────────────────────────────────────────────────────────────────────
   CRITICAL: ALL sub-components are defined at MODULE LEVEL (outside any
   component body). Defining them inside a component causes React to treat
   them as new component types on every render, which unmounts → remounts
   the input DOM node, immediately stealing focus after 1 character.
───────────────────────────────────────────────────────────────────────── */

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
}

const Field = ({ label, value, onChange, placeholder, type = 'text', hint }: FieldProps) => (
  <div className="space-y-1">
    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="glass-input w-full text-foreground"
      style={{ minHeight: 44 }}
    />
    {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
  </div>
);

interface AddressFieldProps {
  value: string;
  onChange: (v: string) => void;
}

const AddressField = ({ value, onChange }: AddressFieldProps) => (
  <div className="space-y-1">
    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
      <MapPin className="w-3 h-3" /> Address
    </label>
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="Suburb, State"
      className="glass-input w-full text-foreground"
      style={{ minHeight: 44 }}
    />
  </div>
);

interface NotesTextareaProps {
  value: string;
  onChange: (v: string) => void;
}

const NotesTextarea = ({ value, onChange }: NotesTextareaProps) => (
  <textarea
    value={value}
    onChange={e => onChange(e.target.value)}
    placeholder="e.g. GST-free supply – no GST charged. Payment due within 14 days."
    rows={3}
    className="glass-input w-full text-foreground resize-none"
  />
);

/* ── Main component ── */
const ProfileSettings = ({ auth, settings, onSaveSettings }: ProfileSettingsProps) => {
  const [displayName, setDisplayName] = useState(auth.displayName ?? '');
  const [avatarUrl, setAvatarUrl] = useState(auth.avatarUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Business/invoice fields — backed by user_settings
  const [businessName, setBusinessName] = useState('');
  const [abn, setAbn] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [bankName, setBankName] = useState('');
  const [bsb, setBsb] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [invoiceNotes, setInvoiceNotes] = useState('');

  const [bizSaved, setBizSaved] = useState(false);
  const [bizSaving, setBizSaving] = useState(false);

  // Sync from settings only once when loaded (prevent clobbering typed value)
  const settingsLoaded = useRef(false);
  useEffect(() => {
    if (!settings || settingsLoaded.current) return;
    settingsLoaded.current = true;
    const s = settings as unknown as Record<string, string | null>;
    setBusinessName(settings.business_name ?? '');
    setAbn(settings.abn ?? '');
    setPhone(s.phone ?? '');
    setAddress(s.address ?? '');
    setBankName(settings.bank_name ?? '');
    setBsb(settings.bsb ?? '');
    setAccountNumber(settings.account_number ?? '');
    setAccountName(s.account_name ?? '');
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
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
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
    setSaving(true);
    await supabase.from('profiles').update({ display_name: displayName.trim() || null }).eq('user_id', auth.user.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveBusiness = async () => {
    setBizSaving(true);
    const s = settings as unknown as Record<string, unknown>;
    await onSaveSettings({
      business_name: businessName.trim() || null,
      abn: abn.trim() || null,
      bank_name: bankName.trim() || null,
      bsb: bsb.trim() || null,
      account_number: accountNumber.trim() || null,
      invoice_notes: invoiceNotes.trim() || null,
      ...({ phone: phone.trim() || null, address: address.trim() || null, account_name: accountName.trim() || null } as unknown as Partial<Omit<UserSettings, 'id' | 'user_id'>>),
    });
    setBizSaving(false);
    setBizSaved(true);
    setTimeout(() => setBizSaved(false), 2000);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    window.dispatchEvent(new CustomEvent('theme-sync'));
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-foreground">Account</h2>

      {/* ── Profile card ── */}
      <div className="glass-card p-5 space-y-4">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Profile</p>

        <div className="flex items-center gap-4">
          {/* Avatar */}
          <button
            className="relative shrink-0 group"
            onClick={() => fileRef.current?.click()}
            title="Change photo"
            disabled={uploading}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar"
                className="w-16 h-16 rounded-full object-cover ring-2 ring-primary/30 transition-opacity group-hover:opacity-70" />
            ) : (
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold ring-2 ring-primary/30 transition-opacity group-hover:opacity-70"
                style={{ background: 'hsl(var(--primary)/0.15)', color: 'hsl(var(--primary))' }}>
                {initial}
              </div>
            )}
            <div className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'hsl(var(--foreground)/0.35)' }}>
              {uploading ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Camera className="w-5 h-5 text-white" />}
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center shadow-md pointer-events-none"
              style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
              {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
            </div>
          </button>

          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">
              {auth.displayName ?? auth.user.email?.split('@')[0]}
            </p>
            <p className="text-xs text-muted-foreground truncate">{auth.user.email}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'hsl(var(--primary))' }}>Tap photo to change</p>
          </div>
        </div>

        <Field
          label="Display Name"
          value={displayName}
          onChange={setDisplayName}
          placeholder={auth.user.email?.split('@')[0] ?? 'Your name'}
        />

        <button onClick={handleSaveProfile} disabled={saving}
          className="w-full flex items-center justify-center gap-2 min-h-[44px] rounded-xl text-sm font-semibold transition-all duration-200"
          style={{
            background: saved ? 'hsl(var(--stat-green)/0.15)' : 'hsl(var(--primary))',
            color: saved ? 'hsl(var(--stat-green))' : 'hsl(var(--primary-foreground))',
            boxShadow: saved ? '0 0 20px hsl(var(--stat-green)/0.25)' : '0 4px 16px hsl(var(--primary)/0.35)',
          }}>
          {saved ? <>✓ Saved!</> : saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save Profile</>}
        </button>
      </div>

      {/* ── Business / Invoice Identity ── */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Invoice Identity</p>
        </div>
        <p className="text-[10px] text-muted-foreground">This information appears on your invoices.</p>
        <Field label="Business / Your Name" value={businessName} onChange={setBusinessName} placeholder="Your Name or Business Name" hint="Shown at the top of every invoice" />
        <Field label="ABN" value={abn} onChange={setAbn} placeholder="12 345 678 901" />
        <Field label="Phone" value={phone} onChange={setPhone} placeholder="+61 4XX XXX XXX" type="tel" />
        <AddressField value={address} onChange={setAddress} />
      </div>

      {/* ── Banking ── */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-1.5">
          <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Banking & Payment</p>
        </div>
        <p className="text-[10px] text-muted-foreground">Appears in the payment section of your invoices.</p>
        <Field label="Bank Name" value={bankName} onChange={setBankName} placeholder="Commonwealth Bank" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="BSB" value={bsb} onChange={setBsb} placeholder="000-000" />
          <Field label="Account Number" value={accountNumber} onChange={setAccountNumber} placeholder="12345678" />
        </div>
        <Field label="Account Name" value={accountName} onChange={setAccountName} placeholder="Your Full Name" />
      </div>

      {/* ── Default invoice notes ── */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Default Invoice Notes</p>
        </div>
        <NotesTextarea value={invoiceNotes} onChange={setInvoiceNotes} />
      </div>

      {/* Save business info */}
      <button onClick={handleSaveBusiness} disabled={bizSaving}
        className="w-full flex items-center justify-center gap-2 min-h-[50px] rounded-2xl text-sm font-bold transition-all duration-200"
        style={{
          background: bizSaved ? 'hsl(var(--money-green)/0.15)' : 'hsl(var(--primary))',
          color: bizSaved ? 'hsl(var(--money-green))' : 'hsl(var(--primary-foreground))',
          boxShadow: bizSaved ? '0 0 20px hsl(var(--money-green)/0.25)' : '0 4px 16px hsl(var(--primary)/0.35)',
        }}>
        {bizSaved ? '✓ Saved!' : bizSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save Business Details</>}
      </button>

      {/* Signed in */}
      <div className="glass-card p-4 space-y-3">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Session</p>
        <div className="flex items-center gap-3">
          <User className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-foreground truncate">{auth.user.email}</span>
        </div>
      </div>

      {/* Sign out */}
      <button onClick={handleSignOut} disabled={signingOut}
        className="w-full glass-card p-4 flex items-center gap-3 min-h-[44px] hover:opacity-80 transition-opacity"
        style={{ color: 'hsl(var(--destructive))' }}>
        <LogOut className="w-5 h-5" />
        <span className="text-sm font-semibold">{signingOut ? 'Signing out…' : 'Sign Out'}</span>
      </button>
    </div>
  );
};

export default ProfileSettings;
