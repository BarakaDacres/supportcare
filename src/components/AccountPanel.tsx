import { useState, useRef, useEffect } from 'react';
import { Camera, LogOut, Save, Loader2, Hash, RotateCcw, AlertCircle, RefreshCw, ChevronRight, Building2, CreditCard, FileText, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { AuthState } from '@/hooks/useAuth';
import type { UserSettings } from '@/hooks/useUserSettings';

interface AccountPanelProps {
  auth: AuthState;
  settings: UserSettings | null;
  settingsLoading: boolean;
  onSaveSettings: (updates: Partial<Omit<UserSettings, 'id' | 'user_id'>>) => Promise<void>;
}

/* ── Accordion section ── */
const AccordionSection = ({
  icon: Icon, title, subtitle, open, onToggle, dirty, children,
}: {
  icon: React.ElementType; title: string; subtitle?: string;
  open: boolean; onToggle: () => void; dirty?: boolean; children: React.ReactNode;
}) => (
  <div className="rounded-2xl overflow-hidden transition-all duration-300"
    style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', boxShadow: 'var(--card-shadow-sm)' }}>
    <button onClick={onToggle}
      className="w-full flex items-center gap-3.5 px-4 transition-colors active:bg-muted/40"
      style={{ minHeight: 58 }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: 'hsl(var(--primary)/0.08)' }}>
        <Icon className="w-[18px] h-[18px]" style={{ color: 'hsl(var(--primary))' }} />
      </div>
      <div className="flex-1 text-left">
        <p className="text-[15px] font-semibold text-foreground leading-tight">{title}</p>
        {subtitle && <p className="text-[12px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {dirty && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'hsl(var(--primary))' }} />}
      <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0 transition-transform duration-300"
        style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }} />
    </button>
    <div className="overflow-hidden transition-all duration-350 ease-[cubic-bezier(0.25,0.8,0.25,1)]"
      style={{ maxHeight: open ? 1200 : 0, opacity: open ? 1 : 0 }}>
      <div className="px-4 pb-4 pt-1 space-y-3">
        {children}
      </div>
    </div>
  </div>
);

/* ── Field ── */
const Field = ({ label, value, onChange, placeholder, type = 'text', hint }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; hint?: string;
}) => (
  <div className="space-y-1">
    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{label}</label>
    <input type={type} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl px-3.5 text-[15px] text-foreground transition-all duration-200 outline-none"
      style={{
        minHeight: 44, background: 'hsl(var(--muted)/0.35)',
        border: '1px solid hsl(var(--border)/0.6)',
      }}
      onFocus={e => { e.currentTarget.style.borderColor = 'hsl(var(--primary)/0.5)'; e.currentTarget.style.boxShadow = '0 0 0 3px hsl(var(--primary)/0.08)'; }}
      onBlur={e => { e.currentTarget.style.borderColor = 'hsl(var(--border)/0.6)'; e.currentTarget.style.boxShadow = 'none'; }}
    />
    {hint && <p className="text-[11px] text-muted-foreground pl-0.5">{hint}</p>}
  </div>
);

const FieldPair = ({ fields }: { fields: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }[] }) => (
  <div className="grid grid-cols-2 gap-3">
    {fields.map(f => <Field key={f.label} {...f} />)}
  </div>
);

/* ── Main ── */
const AccountPanel = ({ auth, settings, settingsLoading, onSaveSettings }: AccountPanelProps) => {
  const [displayName, setDisplayName] = useState(auth.displayName ?? '');
  const [avatarUrl, setAvatarUrl] = useState(auth.avatarUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [origDisplayName] = useState(auth.displayName ?? '');

  const [businessName, setBusinessName] = useState('');
  const [abn, setAbn] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [bankName, setBankName] = useState('');
  const [bsb, setBsb] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');

  const [origBiz, setOrigBiz] = useState({ businessName: '', abn: '', email: '', phone: '', address: '', invoiceNotes: '' });
  const [origBank, setOrigBank] = useState({ bankName: '', bsb: '', accountNumber: '', accountName: '' });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // Accordion states
  const [openSection, setOpenSection] = useState<string | null>(null);
  const toggle = (id: string) => setOpenSection(prev => prev === id ? null : id);

  useEffect(() => {
    if (!settingsLoading) { setTimedOut(false); return; }
    const t = setTimeout(() => setTimedOut(true), 6000);
    return () => clearTimeout(t);
  }, [settingsLoading, retryKey]);

  const settingsLoaded = useRef(false);
  useEffect(() => {
    if (!settings || settingsLoaded.current) return;
    settingsLoaded.current = true;
    const biz = {
      businessName: settings.business_name ?? '', abn: settings.abn ?? '',
      email: settings.email ?? '', phone: settings.phone ?? '',
      address: settings.address ?? '', invoiceNotes: settings.invoice_notes ?? '',
    };
    const bank = {
      bankName: settings.bank_name ?? '', bsb: settings.bsb ?? '',
      accountNumber: settings.account_number ?? '', accountName: settings.account_name ?? '',
    };
    setBusinessName(biz.businessName); setAbn(biz.abn); setEmail(biz.email);
    setPhone(biz.phone); setAddress(biz.address); setInvoiceNotes(biz.invoiceNotes);
    setBankName(bank.bankName); setBsb(bank.bsb); setAccountNumber(bank.accountNumber); setAccountName(bank.accountName);
    setOrigBiz(biz); setOrigBank(bank);
  }, [settings]);

  if (!auth.user) return null;

  const initial = (auth.displayName ?? auth.user.email ?? '?')[0].toUpperCase();
  const profileDirty = displayName !== origDisplayName;
  const bizDirty = businessName !== origBiz.businessName || abn !== origBiz.abn ||
    email !== origBiz.email || phone !== origBiz.phone ||
    address !== origBiz.address || invoiceNotes !== origBiz.invoiceNotes;
  const bankDirty = bankName !== origBank.bankName || bsb !== origBank.bsb ||
    accountNumber !== origBank.accountNumber || accountName !== origBank.accountName;
  const anyDirty = profileDirty || bizDirty || bankDirty;

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
    } catch (err) { console.error('Avatar upload failed:', err); }
    finally { setUploading(false); }
  };

  const handleSaveAll = async () => {
    if (!anyDirty) return;
    setSaving(true);
    const promises: Promise<void>[] = [];
    if (profileDirty) {
      promises.push(supabase.from('profiles').update({ display_name: displayName.trim() || null }).eq('user_id', auth.user!.id).then(() => {}) as Promise<void>);
    }
    const settingsUpdate: Partial<Omit<UserSettings, 'id' | 'user_id'>> = {};
    if (bizDirty) Object.assign(settingsUpdate, {
      business_name: businessName.trim() || null, abn: abn.trim() || null,
      email: email.trim() || null, phone: phone.trim() || null,
      address: address.trim() || null, invoice_notes: invoiceNotes.trim() || null,
    });
    if (bankDirty) Object.assign(settingsUpdate, {
      bank_name: bankName.trim() || null, bsb: bsb.trim() || null,
      account_number: accountNumber.trim() || null, account_name: accountName.trim() || null,
    });
    if (Object.keys(settingsUpdate).length > 0) promises.push(onSaveSettings(settingsUpdate));
    await Promise.all(promises);
    if (bizDirty) setOrigBiz({ businessName, abn, email, phone, address, invoiceNotes });
    if (bankDirty) setOrigBank({ bankName, bsb, accountNumber, accountName });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleResetCounter = async () => {
    if (!confirmReset) { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 4000); return; }
    setResetting(true); setConfirmReset(false);
    await onSaveSettings({ invoice_counter: 0 });
    setResetting(false); setResetDone(true);
    setTimeout(() => setResetDone(false), 2500);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    window.dispatchEvent(new CustomEvent('theme-sync'));
  };

  if (settingsLoading) {
    if (timedOut) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'hsl(var(--muted))' }}>
            <AlertCircle className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Settings unavailable</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">Could not load your settings. Check your connection and try again.</p>
          </div>
          <button onClick={() => { setTimedOut(false); setRetryKey(k => k + 1); window.location.reload(); }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <p className="text-xs text-muted-foreground">Loading account…</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-28">

      {/* ── Hero Profile Card ── */}
      <div className="rounded-2xl overflow-hidden"
        style={{
          background: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          boxShadow: 'var(--card-shadow-sm)',
        }}>
        <div className="flex items-center gap-4 px-4 py-5">
          {/* Avatar */}
          <button className="relative group shrink-0" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar"
                className="w-16 h-16 rounded-full object-cover transition-all duration-200 group-hover:scale-105"
                style={{ boxShadow: '0 0 0 2px hsl(var(--border))' }} />
            ) : (
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold transition-all duration-200 group-hover:scale-105"
                style={{
                  background: 'hsl(var(--muted))',
                  color: 'hsl(var(--foreground))',
                  boxShadow: '0 0 0 2px hsl(var(--border))',
                }}>
                {initial}
              </div>
            )}
            <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--foreground))',
                border: '2px solid hsl(var(--card))' }}>
              {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
            </div>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-bold text-foreground leading-tight truncate">
              {auth.displayName ?? auth.user.email?.split('@')[0]}
            </h2>
            <p className="text-[13px] text-muted-foreground mt-0.5 truncate">{auth.user.email}</p>
          </div>
        </div>
      </div>

      {/* ── Display Name ── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', boxShadow: 'var(--card-shadow-sm)' }}>
        <div className="px-4 py-3.5">
          <Field label="Display Name" value={displayName} onChange={setDisplayName}
            placeholder={auth.user.email?.split('@')[0] ?? 'Your name'} />
        </div>
      </div>

      {/* ── Collapsible Sections ── */}
      <AccordionSection icon={Building2} title="Invoice Identity" subtitle="Shown on every invoice"
        open={openSection === 'biz'} onToggle={() => toggle('biz')} dirty={bizDirty}>
        <Field label="Business / Your Name" value={businessName} onChange={setBusinessName} placeholder="Your Name or Business" hint="Appears on all invoices" />
        <Field label="ABN" value={abn} onChange={setAbn} placeholder="12 345 678 901" />
        <Field label="Email" value={email} onChange={setEmail} placeholder="invoices@you.com.au" type="email" />
        <Field label="Phone" value={phone} onChange={setPhone} placeholder="+61 4XX XXX XXX" type="tel" />
        <Field label="Address" value={address} onChange={setAddress} placeholder="Suburb, State" />
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Default Invoice Notes</label>
          <textarea value={invoiceNotes} onChange={e => setInvoiceNotes(e.target.value)}
            placeholder="e.g. GST-free supply – no GST charged."
            rows={3}
            className="w-full rounded-xl px-3.5 py-2.5 text-[15px] text-foreground resize-none transition-all duration-200 outline-none"
            style={{ background: 'hsl(var(--muted)/0.35)', border: '1px solid hsl(var(--border)/0.6)' }}
            onFocus={e => { e.currentTarget.style.borderColor = 'hsl(var(--primary)/0.5)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'hsl(var(--border)/0.6)'; }}
          />
        </div>
      </AccordionSection>

      <AccordionSection icon={CreditCard} title="Banking & Payment" subtitle="Payment section of invoices"
        open={openSection === 'bank'} onToggle={() => toggle('bank')} dirty={bankDirty}>
        <Field label="Bank Name" value={bankName} onChange={setBankName} placeholder="Commonwealth Bank" />
        <FieldPair fields={[
          { label: 'BSB', value: bsb, onChange: setBsb, placeholder: '000-000' },
          { label: 'Account Number', value: accountNumber, onChange: setAccountNumber, placeholder: '12345678' },
        ]} />
        <Field label="Account Name" value={accountName} onChange={setAccountName} placeholder="Your Full Name" />
      </AccordionSection>

      {/* ── Invoice Counter ── */}
      {settings && (
        <AccordionSection icon={Hash} title="Invoice Numbering"
          subtitle={`Next: INV-${String((settings.invoice_counter ?? 0) + 1).padStart(3, '0')}`}
          open={openSection === 'counter'} onToggle={() => toggle('counter')}>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-[13px] text-muted-foreground">Current counter</p>
              <p className="text-2xl font-bold font-mono" style={{ color: 'hsl(var(--primary))' }}>
                #{String(settings.invoice_counter ?? 0).padStart(3, '0')}
              </p>
            </div>
            <button onClick={handleResetCounter} disabled={resetting}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-semibold transition-all active:scale-95"
              style={{
                background: resetDone ? 'hsl(var(--stat-green)/0.12)' : confirmReset ? 'hsl(var(--destructive)/0.12)' : 'hsl(var(--destructive)/0.06)',
                color: resetDone ? 'hsl(var(--stat-green))' : 'hsl(var(--destructive))',
                border: `1px solid ${resetDone ? 'hsl(var(--stat-green)/0.25)' : 'hsl(var(--destructive)/0.15)'}`,
              }}>
              {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : resetDone ? '✓ Reset'
                : confirmReset ? <><RotateCcw className="w-3.5 h-3.5" />Confirm</>
                : <><RotateCcw className="w-3.5 h-3.5" />Reset</>}
            </button>
          </div>
        </AccordionSection>
      )}

      {/* ── Sign Out ── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', boxShadow: 'var(--card-shadow-sm)' }}>
        <button onClick={handleSignOut} disabled={signingOut}
          className="w-full flex items-center justify-center gap-2.5 transition-colors active:bg-destructive/8"
          style={{ minHeight: 50 }}>
          <LogOut className="w-[18px] h-[18px]" style={{ color: 'hsl(var(--destructive))' }} />
          <span className="text-[15px] font-semibold" style={{ color: 'hsl(var(--destructive))' }}>
            {signingOut ? 'Signing out…' : 'Sign Out'}
          </span>
        </button>
      </div>

      {/* ── Sticky Save ── */}
      {anyDirty && (
        <div className="fixed bottom-[84px] left-0 right-0 flex justify-center px-4 z-30 pointer-events-none">
          <button onClick={handleSaveAll} disabled={saving}
            className="flex items-center gap-2 px-7 py-3.5 rounded-2xl text-[15px] font-bold shadow-2xl transition-all duration-200 pointer-events-auto active:scale-95"
            style={{
              background: saved ? 'hsl(var(--stat-green))' : 'hsl(var(--primary))',
              color: 'hsl(var(--primary-foreground))',
              boxShadow: `0 8px 32px hsl(var(--primary)/0.35)`,
            }}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
              : saved ? '✓ Saved'
              : <><Save className="w-4 h-4" />Save Changes</>}
          </button>
        </div>
      )}
    </div>
  );
};

export default AccountPanel;
