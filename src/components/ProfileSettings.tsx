import { useState, useRef, useEffect } from 'react';
import { Camera, LogOut, Save, Loader2, Building2, CreditCard, FileText, MapPin, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { AuthState } from '@/hooks/useAuth';
import type { UserSettings } from '@/hooks/useUserSettings';

interface ProfileSettingsProps {
  auth: AuthState;
  settings: UserSettings | null;
  onSaveSettings: (updates: Partial<Omit<UserSettings, 'id' | 'user_id'>>) => Promise<void>;
}

/* ── Module-level sub-components (prevent remount on re-render) ── */

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}

const Field = ({ label, value, onChange, placeholder, type = 'text' }: FieldProps) => (
  <div>
    <label style={{ fontSize: 11, fontWeight: 500, color: 'hsl(var(--muted-foreground))', display: 'block', marginBottom: 6 }}>
      {label}
    </label>
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full text-foreground"
      style={{
        height: 44,
        padding: '0 14px',
        borderRadius: 12,
        background: 'hsl(var(--muted)/0.3)',
        border: '1px solid hsl(var(--border)/0.4)',
        fontSize: 14,
        transition: 'border-color 0.15s ease',
        outline: 'none',
      }}
      onFocus={e => e.currentTarget.style.borderColor = 'hsl(var(--primary)/0.5)'}
      onBlur={e => e.currentTarget.style.borderColor = 'hsl(var(--border)/0.4)'}
    />
  </div>
);

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const Section = ({ icon, title, children, defaultOpen = false }: SectionProps) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      borderRadius: 16,
      background: 'hsl(var(--card))',
      border: '1px solid hsl(var(--border)/0.4)',
      overflow: 'hidden',
      transition: 'all 0.2s ease',
    }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 text-left"
        style={{ padding: '14px 16px', WebkitTapHighlightColor: 'transparent' }}
      >
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'hsl(var(--primary)/0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'hsl(var(--primary))', flexShrink: 0,
        }}>
          {icon}
        </div>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'hsl(var(--foreground))' }}>{title}</span>
        <ChevronRight
          className="w-4 h-4"
          style={{
            color: 'hsl(var(--muted-foreground))',
            transition: 'transform 0.2s ease',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
        />
      </button>
      <div style={{
        maxHeight: open ? 600 : 0,
        opacity: open ? 1 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease',
      }}>
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {children}
        </div>
      </div>
    </div>
  );
};

/* ── Main component ── */
const ProfileSettings = ({ auth, settings, onSaveSettings }: ProfileSettingsProps) => {
  const [displayName, setDisplayName] = useState(auth.displayName ?? '');
  const [avatarUrl, setAvatarUrl] = useState(auth.avatarUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [businessName, setBusinessName] = useState('');
  const [abn, setAbn] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [bankName, setBankName] = useState('');
  const [bsb, setBsb] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [bizSaved, setBizSaved] = useState(false);
  const [bizSaving, setBizSaving] = useState(false);

  const settingsLoaded = useRef(false);
  useEffect(() => {
    if (!settings || settingsLoaded.current) return;
    settingsLoaded.current = true;
    const s = settings as unknown as Record<string, string | null>;
    setBusinessName(settings.business_name ?? '');
    setAbn(settings.abn ?? '');
    setEmail(settings.email ?? '');
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
  const displayEmail = auth.user.email ?? '';
  const name = auth.displayName ?? displayEmail.split('@')[0];

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
    } catch (err) { console.error('Avatar upload failed:', err); }
    finally { setUploading(false); }
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
    await onSaveSettings({
      business_name: businessName.trim() || null,
      abn: abn.trim() || null,
      bank_name: bankName.trim() || null,
      bsb: bsb.trim() || null,
      account_number: accountNumber.trim() || null,
      invoice_notes: invoiceNotes.trim() || null,
      ...({ email: email.trim() || null, phone: phone.trim() || null, address: address.trim() || null, account_name: accountName.trim() || null } as unknown as Partial<Omit<UserSettings, 'id' | 'user_id'>>),
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

  const saveBtnStyle = (isSaved: boolean) => ({
    height: 48,
    borderRadius: 14,
    fontSize: 14,
    fontWeight: 600 as const,
    background: isSaved ? 'hsl(var(--stat-green)/0.12)' : 'hsl(var(--primary))',
    color: isSaved ? 'hsl(var(--stat-green))' : 'hsl(var(--primary-foreground))',
    boxShadow: isSaved ? 'none' : '0 4px 20px hsl(var(--primary)/0.25)',
    transition: 'all 0.2s ease',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 32 }}>
      {/* ── Hero Profile Card ── */}
      <div style={{
        borderRadius: 20,
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border)/0.4)',
        padding: '28px 20px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Subtle gradient accent */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 80,
          background: 'linear-gradient(180deg, hsl(var(--primary)/0.06) 0%, transparent 100%)',
          pointerEvents: 'none',
        }} />

        {/* Avatar */}
        <button
          className="relative group"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{ zIndex: 1 }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar"
              style={{
                width: 80, height: 80, borderRadius: '50%', objectFit: 'cover',
                border: '3px solid hsl(var(--primary)/0.2)',
                transition: 'opacity 0.15s',
              }}
              className="group-hover:opacity-80"
            />
          ) : (
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, fontWeight: 700,
              background: 'hsl(var(--primary)/0.12)',
              color: 'hsl(var(--primary))',
              border: '3px solid hsl(var(--primary)/0.2)',
            }}>
              {initial}
            </div>
          )}
          <div style={{
            position: 'absolute', bottom: -2, right: -2,
            width: 28, height: 28, borderRadius: '50%',
            background: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px hsl(var(--primary)/0.3)',
          }}>
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
          </div>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />

        {/* Name & email */}
        <div style={{ textAlign: 'center', zIndex: 1 }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: 'hsl(var(--foreground))', lineHeight: 1.2 }}>{name}</p>
          <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>{displayEmail}</p>
        </div>

        {/* Display name field + save */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, zIndex: 1 }}>
          <Field label="Display Name" value={displayName} onChange={setDisplayName} placeholder={displayEmail.split('@')[0] || 'Your name'} />
          <button onClick={handleSaveProfile} disabled={saving}
            className="w-full flex items-center justify-center gap-2"
            style={saveBtnStyle(saved)}
          >
            {saved ? '✓ Saved' : saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save Profile</>}
          </button>
        </div>
      </div>

      {/* ── Collapsible Sections ── */}
      <Section icon={<Building2 className="w-4 h-4" />} title="Invoice Identity">
        <Field label="Business / Your Name" value={businessName} onChange={setBusinessName} placeholder="Your Name or Business Name" />
        <Field label="ABN" value={abn} onChange={setAbn} placeholder="12 345 678 901" />
        <Field label="Email" value={email} onChange={setEmail} placeholder="invoices@business.com.au" type="email" />
        <Field label="Phone" value={phone} onChange={setPhone} placeholder="+61 4XX XXX XXX" type="tel" />
        <Field label="Address" value={address} onChange={setAddress} placeholder="Suburb, State" />
      </Section>

      <Section icon={<CreditCard className="w-4 h-4" />} title="Banking & Payment">
        <Field label="Bank Name" value={bankName} onChange={setBankName} placeholder="Commonwealth Bank" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="BSB" value={bsb} onChange={setBsb} placeholder="000-000" />
          <Field label="Account Number" value={accountNumber} onChange={setAccountNumber} placeholder="12345678" />
        </div>
        <Field label="Account Name" value={accountName} onChange={setAccountName} placeholder="Your Full Name" />
      </Section>

      <Section icon={<FileText className="w-4 h-4" />} title="Default Invoice Notes">
        <textarea
          value={invoiceNotes}
          onChange={e => setInvoiceNotes(e.target.value)}
          placeholder="e.g. GST-free supply – no GST charged."
          rows={3}
          className="w-full text-foreground resize-none"
          style={{
            padding: '12px 14px',
            borderRadius: 12,
            background: 'hsl(var(--muted)/0.3)',
            border: '1px solid hsl(var(--border)/0.4)',
            fontSize: 14,
            outline: 'none',
          }}
        />
      </Section>

      {/* Save business button */}
      <button onClick={handleSaveBusiness} disabled={bizSaving}
        className="w-full flex items-center justify-center gap-2"
        style={saveBtnStyle(bizSaved)}
      >
        {bizSaved ? '✓ Saved' : bizSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save Business Details</>}
      </button>

      {/* ── Sign Out ── */}
      <button onClick={handleSignOut} disabled={signingOut}
        className="w-full flex items-center justify-center gap-2"
        style={{
          height: 48,
          borderRadius: 14,
          fontSize: 14,
          fontWeight: 600,
          background: 'hsl(var(--destructive)/0.08)',
          color: 'hsl(var(--destructive))',
          border: '1px solid hsl(var(--destructive)/0.15)',
          transition: 'all 0.15s ease',
        }}
      >
        <LogOut className="w-4 h-4" />
        {signingOut ? 'Signing out…' : 'Sign Out'}
      </button>
    </div>
  );
};

export default ProfileSettings;
