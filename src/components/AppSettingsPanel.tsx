import { useState, useEffect } from 'react';
import { Save, Loader2, Target, Building2, CreditCard, FileText, Sliders, AlertCircle, Sunset } from 'lucide-react';
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
            Could not load your settings. Please check your connection or try refreshing.
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
          Try signing out and back in.
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

  /* ── Reusable rate input row ── */
  const RateInput = ({
    label,
    subLabel,
    fieldKey,
    unit = '$/hr',
  }: {
    label: string;
    subLabel?: string;
    fieldKey: keyof Omit<UserSettings, 'id' | 'user_id'>;
    unit?: string;
  }) => (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider leading-tight">
        {label}
      </label>
      {subLabel && <p className="text-[9px] text-muted-foreground leading-none">{subLabel}</p>}
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-muted-foreground shrink-0">$</span>
        <input
          type="number"
          min={0}
          step={0.5}
          value={val(fieldKey, settings[fieldKey] as number) as number}
          onChange={e => set(fieldKey, parseFloat(e.target.value) || 0)}
          className="glass-input flex-1 min-w-0 text-foreground text-sm"
          style={{ minHeight: 40 }}
        />
        {unit && <span className="text-[10px] text-muted-foreground shrink-0">{unit}</span>}
      </div>
    </div>
  );

  /* ── Toggle row ── */
  const ToggleRow = ({
    label,
    description,
    fieldKey,
  }: {
    label: string;
    description?: string;
    fieldKey: keyof Omit<UserSettings, 'id' | 'user_id'>;
  }) => {
    const checked = val(fieldKey, settings[fieldKey] as boolean) as boolean;
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          {description && <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>}
        </div>
        <button
          type="button"
          onClick={() => set(fieldKey, !checked)}
          className="relative shrink-0 rounded-full transition-all duration-200"
          style={{ width: 44, height: 26, background: checked ? 'hsl(var(--primary))' : 'hsl(var(--muted))' }}
        >
          <span
            className="absolute top-[3px] rounded-full bg-white shadow-sm transition-all duration-200"
            style={{ width: 20, height: 20, left: checked ? 21 : 3 }}
          />
        </button>
      </div>
    );
  };

  const showTax = val('show_tax_estimate', settings.show_tax_estimate) as boolean;

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-foreground">App Settings</h2>

      {/* ── Pay Rates ── */}
      <div className="glass-card p-4 space-y-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5" /> Pay Rates
        </h3>

        {/* Hourly rates — 2-col grid */}
        <div className="grid grid-cols-2 gap-3">
          <RateInput label="Mon – Fri" fieldKey="rate_weekday" />
          <RateInput label="Saturday" fieldKey="rate_saturday" />
          <RateInput label="Sunday" fieldKey="rate_sunday" />
          <RateInput label="Public Holiday" fieldKey="rate_public_holiday" />
        </div>

        {/* Evening rate — full width with clear labelling */}
        <div
          className="rounded-2xl p-3 space-y-2"
          style={{ background: 'hsl(38 90% 52% / 0.07)', border: '1px solid hsl(38 90% 52% / 0.2)' }}
        >
          <div className="flex items-center gap-1.5">
            <Sunset className="w-3.5 h-3.5" style={{ color: 'hsl(38 90% 45%)' }} />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'hsl(38 90% 45%)' }}>
              Evening Rate
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <RateInput
              label="Mon–Fri 18:00–22:00"
              subLabel="Overrides weekday rate for evening hours only. Sat/Sun use their own rates."
              fieldKey="rate_evening"
            />
          </div>
        </div>

        <div className="border-t border-border pt-3 space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Sleepover Flat Rates
          </p>
          <div className="grid grid-cols-2 gap-3">
            <RateInput
              label="Weekday night"
              subLabel="Mon – Fri"
              fieldKey="rate_sleepover_weekday"
              unit="flat"
            />
            <RateInput
              label="Weekend night"
              subLabel="Sat & Sun only"
              fieldKey="rate_sleepover_weekend"
              unit="flat"
            />
          </div>
          <p className="text-[9px] text-muted-foreground pt-1">
            Friday sleepovers use the weekday flat rate.
          </p>
        </div>
      </div>

      {/* ── Tax Estimate ── */}
      <div className="glass-card p-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Tax Estimate
        </h3>
        <p className="text-[10px] text-muted-foreground">For personal planning only — not applied to invoices.</p>
        <ToggleRow
          label="Show Tax Estimates"
          description="Display estimated tax deductions and take-home on Overview and Analytics."
          fieldKey="show_tax_estimate"
        />
        {showTax && (
          <div className="space-y-1 pt-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tax Rate</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={val('tax_rate', settings.tax_rate) as number}
                onChange={e => set('tax_rate', parseFloat(e.target.value) || 0)}
                className="glass-input w-20 text-center text-foreground"
                style={{ minHeight: 44 }}
              />
              <span className="text-sm font-semibold text-muted-foreground">%</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Income Goals ── */}
      <div className="glass-card p-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5" /> Income Goals
        </h3>
        <div className="space-y-3">
          {([
            { label: 'Weekly Goal', key: 'weekly_goal' as const },
            { label: 'Monthly Goal', key: 'monthly_goal' as const },
            { label: 'Yearly Goal', key: 'yearly_goal' as const },
          ] as const).map(({ label, key }) => (
            <div key={key} className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground shrink-0">$</span>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={(val(key, settings[key]) as number | null) ?? ''}
                  placeholder="Not set"
                  onChange={e => set(key, e.target.value ? parseFloat(e.target.value) : null)}
                  className="glass-input flex-1 min-w-0 text-foreground text-sm"
                  style={{ minHeight: 40 }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Invoice Issuer ── */}
      <div className="glass-card p-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5" /> Invoice Issuer
        </h3>
        <p className="text-[10px] text-muted-foreground">Appears on your invoices. GST-free supply.</p>
        {([
          { label: 'Business / Your Name', key: 'business_name' as const, placeholder: 'Your Name' },
          { label: 'ABN', key: 'abn' as const, placeholder: '12 345 678 901' },
        ] as const).map(({ label, key, placeholder }) => (
          <div key={key} className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
            <input
              type="text"
              value={(val(key, settings[key]) as string | null) ?? ''}
              placeholder={placeholder}
              onChange={e => set(key, e.target.value || null)}
              className="glass-input w-full text-foreground"
              style={{ minHeight: 44 }}
            />
          </div>
        ))}
      </div>

      {/* ── Bank Details ── */}
      <div className="glass-card p-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <CreditCard className="w-3.5 h-3.5" /> Bank Details
        </h3>
        {([
          { label: 'Bank Name', key: 'bank_name' as const, placeholder: 'Commonwealth Bank' },
          { label: 'BSB', key: 'bsb' as const, placeholder: '000-000' },
          { label: 'Account Number', key: 'account_number' as const, placeholder: '12345678' },
        ] as const).map(({ label, key, placeholder }) => (
          <div key={key} className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
            <input
              type="text"
              value={(val(key, settings[key]) as string | null) ?? ''}
              placeholder={placeholder}
              onChange={e => set(key, e.target.value || null)}
              className="glass-input w-full text-foreground"
              style={{ minHeight: 44 }}
            />
          </div>
        ))}
      </div>

      {/* ── Invoice Notes ── */}
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

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving || Object.keys(form).length === 0}
        className="w-full flex items-center justify-center gap-2 min-h-[50px] rounded-2xl text-sm font-bold transition-all duration-200 disabled:opacity-40"
        style={{
          background: saved ? 'hsl(var(--money-green)/0.15)' : 'hsl(var(--primary))',
          color: saved ? 'hsl(var(--money-green))' : 'hsl(var(--primary-foreground))',
          boxShadow: saved ? '0 0 20px hsl(var(--money-green)/0.25)' : '0 4px 16px hsl(var(--primary)/0.35)',
        }}
      >
        {saved
          ? '✓ Saved!'
          : saving
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
          : <><Save className="w-4 h-4" /> Save Settings</>
        }
      </button>
    </div>
  );
};

export default AppSettingsPanel;
