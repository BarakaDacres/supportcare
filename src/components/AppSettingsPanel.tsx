import { useState, useEffect } from 'react';
import { Save, Loader2, Target, Building2, CreditCard, FileText, Sliders, AlertCircle } from 'lucide-react';
import type { UserSettings } from '@/hooks/useUserSettings';

interface AppSettingsPanelProps {
  settings: UserSettings | null;
  loading: boolean;
  onSave: (updates: Partial<Omit<UserSettings, 'id' | 'user_id'>>) => Promise<void>;
}

const AppSettingsPanel = ({ settings, loading, onSave }: AppSettingsPanelProps) => {
  const [form, setForm] = useState<Partial<Omit<UserSettings, 'id' | 'user_id'>>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!loading) {
      setTimedOut(false);
      return;
    }
    const t = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, [loading]);

  if (loading) {
    if (timedOut) {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <AlertCircle className="w-8 h-8 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Settings unavailable</p>
          <p className="text-xs text-muted-foreground max-w-[240px]">
            Could not load your settings. Please check your connection or try refreshing the page.
          </p>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <AlertCircle className="w-8 h-8 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">Settings not found</p>
        <p className="text-xs text-muted-foreground max-w-[240px]">
          Your settings profile could not be loaded. Try signing out and back in.
        </p>
      </div>
    );
  }

  const val = <K extends keyof typeof form>(key: K, fallback: UserSettings[K]) =>
    form[key] !== undefined ? form[key] : (settings[key] ?? fallback);

  const set = <K extends keyof typeof form>(key: K, value: typeof form[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    await onSave(form);
    setForm({});
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-foreground">App Settings</h2>

      {/* Pay Rates */}
      <div className="glass-card p-4 space-y-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5" /> Pay Rates
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Mon–Fri ($/hr)', key: 'rate_weekday' as const },
            { label: 'Saturday ($/hr)', key: 'rate_saturday' as const },
            { label: 'Sunday ($/hr)', key: 'rate_sunday' as const },
            { label: 'Public Holiday ($/hr)', key: 'rate_public_holiday' as const },
          ].map(({ label, key }) => (
            <div key={key} className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">$</span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={val(key, settings[key]) as number}
                  onChange={e => set(key, parseFloat(e.target.value) || 0)}
                  className="glass-input flex-1 text-foreground min-h-[40px] text-sm"
                />
              </div>
            </div>
          ))}
          <div className="col-span-2 grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Weekday Sleepover (flat)</label>
              <p className="text-[9px] text-muted-foreground">Mon – Fri nights</p>
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">$</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={val('rate_sleepover_weekday', settings.rate_sleepover_weekday) as number}
                  onChange={e => set('rate_sleepover_weekday', parseFloat(e.target.value) || 0)}
                  className="glass-input flex-1 text-foreground min-h-[40px] text-sm"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Weekend Sleepover (flat)</label>
              <p className="text-[9px] text-muted-foreground">Sat & Sun nights only</p>
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">$</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={val('rate_sleepover_weekend', settings.rate_sleepover_weekend) as number}
                  onChange={e => set('rate_sleepover_weekend', parseFloat(e.target.value) || 0)}
                  className="glass-input flex-1 text-foreground min-h-[40px] text-sm"
                />
              </div>
            </div>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground border-t border-border pt-2">
          Friday sleepovers use the weekday flat rate. Weekend rate applies to Saturday &amp; Sunday nights only.
        </p>
      </div>

      {/* Tax Estimate */}
      <div className="glass-card p-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tax Estimate (Personal Planning)</h3>
        <p className="text-[10px] text-muted-foreground">This is NOT applied to invoices. For personal income tax planning only.</p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={val('tax_rate', settings.tax_rate) as number}
            onChange={e => set('tax_rate', parseFloat(e.target.value) || 0)}
            className="glass-input w-24 text-center text-foreground min-h-[44px]"
          />
          <span className="text-sm font-semibold text-muted-foreground">%</span>
        </div>
      </div>

      {/* Goals */}
      <div className="glass-card p-4 space-y-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5" /> Income Goals
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Monthly Goal', key: 'monthly_goal' as const },
            { label: 'Yearly Goal', key: 'yearly_goal' as const },
          ].map(({ label, key }) => (
            <div key={key} className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">$</span>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={(val(key, settings[key]) as number | null) ?? ''}
                  placeholder="Not set"
                  onChange={e => set(key, e.target.value ? parseFloat(e.target.value) : null)}
                  className="glass-input flex-1 text-foreground min-h-[40px] text-sm"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Invoice Issuer */}
      <div className="glass-card p-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5" /> Invoice Issuer Details
        </h3>
        <p className="text-[10px] text-muted-foreground">These appear on your invoices. GST-free supply — no GST charged.</p>
        {[
          { label: 'Business / Your Name', key: 'business_name' as const, placeholder: 'Your Name' },
          { label: 'ABN', key: 'abn' as const, placeholder: '12 345 678 901' },
        ].map(({ label, key, placeholder }) => (
          <div key={key} className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
            <input
              type="text"
              value={(val(key, settings[key]) as string | null) ?? ''}
              placeholder={placeholder}
              onChange={e => set(key, e.target.value || null)}
              className="glass-input w-full text-foreground min-h-[44px]"
            />
          </div>
        ))}
      </div>

      {/* Bank Details */}
      <div className="glass-card p-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <CreditCard className="w-3.5 h-3.5" /> Bank Details
        </h3>
        {[
          { label: 'Bank Name', key: 'bank_name' as const, placeholder: 'Commonwealth Bank' },
          { label: 'BSB', key: 'bsb' as const, placeholder: '000-000' },
          { label: 'Account Number', key: 'account_number' as const, placeholder: '12345678' },
        ].map(({ label, key, placeholder }) => (
          <div key={key} className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
            <input
              type="text"
              value={(val(key, settings[key]) as string | null) ?? ''}
              placeholder={placeholder}
              onChange={e => set(key, e.target.value || null)}
              className="glass-input w-full text-foreground min-h-[44px]"
            />
          </div>
        ))}
      </div>

      {/* Invoice Notes */}
      <div className="glass-card p-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" /> Default Invoice Notes
        </h3>
        <textarea
          value={(val('invoice_notes', settings.invoice_notes) as string | null) ?? ''}
          onChange={e => set('invoice_notes', e.target.value || null)}
          placeholder="e.g. GST-free supply – no GST charged."
          rows={3}
          className="glass-input w-full text-foreground resize-none"
        />
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving || Object.keys(form).length === 0}
        className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-2xl text-sm font-bold transition-all duration-200 disabled:opacity-40"
        style={{
          background: saved ? 'hsl(var(--money-green)/0.15)' : 'hsl(var(--primary))',
          color: saved ? 'hsl(var(--money-green))' : 'hsl(var(--primary-foreground))',
          boxShadow: saved ? '0 0 20px hsl(var(--money-green)/0.25)' : '0 4px 16px hsl(var(--primary)/0.35)',
        }}
      >
        {saved ? '✓ Saved!' : saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save Settings</>}
      </button>
    </div>
  );
};

export default AppSettingsPanel;
