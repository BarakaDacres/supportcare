import { useState, useEffect } from 'react';
import { Save, Loader2, Target, Building2, CreditCard, FileText, Sliders, AlertCircle, Sunset, Code2 } from 'lucide-react';
import type { UserSettings } from '@/hooks/useUserSettings';
import { DEFAULT_NDIS_CODES, type NdisItemCodes } from '@/lib/invoiceGrouping';

interface AppSettingsPanelProps {
  settings: UserSettings | null;
  loading: boolean;
  onSave: (updates: Partial<Omit<UserSettings, 'id' | 'user_id'>>) => Promise<void>;
}

/* ════════════════════════════════════════════════════
   HOISTED sub-components — defined OUTSIDE the panel
   so React never remounts inputs between renders.
   This was the root cause of focus-loss after 1 char.
════════════════════════════════════════════════════ */

const RateInputRow = ({
  label, subLabel, value, onChange, unit = '$/hr',
}: {
  label: string; subLabel?: string; value: number;
  onChange: (v: number) => void; unit?: string;
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
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="glass-input flex-1 min-w-0 text-foreground text-sm"
        style={{ minHeight: 40 }}
      />
      {unit && <span className="text-[10px] text-muted-foreground shrink-0">{unit}</span>}
    </div>
  </div>
);

const ToggleRowItem = ({
  label, description, checked, onChange,
}: {
  label: string; description?: string; checked: boolean; onChange: (v: boolean) => void;
}) => (
  <div className="flex items-center justify-between gap-3">
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      {description && <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>}
    </div>
    <button
      type="button"
      onClick={() => onChange(!checked)}
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

const TextInput = ({
  label, value, onChange, placeholder, hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; hint?: string;
}) => (
  <div className="space-y-1.5">
    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="glass-input w-full text-foreground"
      style={{ minHeight: 44 }}
    />
    {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
  </div>
);

const NumberInput = ({
  label, value, onChange, placeholder, hint, prefix,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; hint?: string; prefix?: string;
}) => (
  <div className="space-y-1.5">
    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
    <div className="flex items-center gap-1.5">
      {prefix && <span className="text-sm text-muted-foreground shrink-0">{prefix}</span>}
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="glass-input flex-1 min-w-0 text-foreground"
        style={{ minHeight: 44 }}
      />
    </div>
    {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
  </div>
);

const NdisCodeInput = ({
  label, value, onChange, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) => (
  <div className="space-y-1">
    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider leading-tight">{label}</label>
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder ?? '01_XXX_XXXX_1_1'}
      className="glass-input w-full text-foreground text-xs font-mono"
      style={{ minHeight: 40 }}
    />
  </div>
);

const AppSettingsPanel = ({ settings, loading, onSave }: AppSettingsPanelProps) => {
  const [form, setForm] = useState<Partial<Omit<UserSettings, 'id' | 'user_id'>>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  // NDIS codes stored locally (persisted via invoice_notes workaround until DB migration)
  const [ndisCodes, setNdisCodes] = useState<NdisItemCodes>(DEFAULT_NDIS_CODES);

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

  const setCode = (key: keyof NdisItemCodes, value: string) =>
    setNdisCodes(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(form);
      setForm({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      console.error('Settings save error:', e);
    } finally {
      setSaving(false);
    }
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
          <RateInputRow
            label="Mon – Fri"
            value={val('rate_weekday', settings.rate_weekday) as number}
            onChange={v => set('rate_weekday', v)}
          />
          <RateInputRow
            label="Saturday"
            value={val('rate_saturday', settings.rate_saturday) as number}
            onChange={v => set('rate_saturday', v)}
          />
          <RateInputRow
            label="Sunday"
            value={val('rate_sunday', settings.rate_sunday) as number}
            onChange={v => set('rate_sunday', v)}
          />
          <RateInputRow
            label="Public Holiday"
            value={val('rate_public_holiday', settings.rate_public_holiday) as number}
            onChange={v => set('rate_public_holiday', v)}
          />
        </div>

        {/* Evening rate */}
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
          <RateInputRow
            label="Mon–Fri 18:00–22:00"
            subLabel="Overrides weekday rate for evening hours only. Sat/Sun use their own rates."
            value={val('rate_evening', settings.rate_evening) as number}
            onChange={v => set('rate_evening', v)}
          />
        </div>

        <div className="border-t border-border pt-3 space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Sleepover Flat Rates
          </p>
          <div className="grid grid-cols-2 gap-3">
            <RateInputRow
              label="Weekday night"
              subLabel="Mon – Fri"
              value={val('rate_sleepover_weekday', settings.rate_sleepover_weekday) as number}
              onChange={v => set('rate_sleepover_weekday', v)}
              unit="flat"
            />
            <RateInputRow
              label="Weekend night"
              subLabel="Sat & Sun only"
              value={val('rate_sleepover_weekend', settings.rate_sleepover_weekend) as number}
              onChange={v => set('rate_sleepover_weekend', v)}
              unit="flat"
            />
          </div>
        </div>
      </div>

      {/* ── NDIS Item Codes ── */}
      <div className="glass-card p-4 space-y-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Code2 className="w-3.5 h-3.5" /> NDIS Item Codes
        </h3>
        <p className="text-[10px] text-muted-foreground -mt-2">
          These codes appear on your invoices. Edit them to match your plan management requirements.
        </p>
        <div className="grid grid-cols-1 gap-3">
          <NdisCodeInput label="Daily Support (Weekday)" value={ndisCodes.daily} onChange={v => setCode('daily', v)} />
          <NdisCodeInput label="Evening Support" value={ndisCodes.evening} onChange={v => setCode('evening', v)} />
          <NdisCodeInput label="Saturday Support" value={ndisCodes.saturday} onChange={v => setCode('saturday', v)} />
          <NdisCodeInput label="Sunday Support" value={ndisCodes.sunday} onChange={v => setCode('sunday', v)} />
          <NdisCodeInput label="Public Holiday Support" value={ndisCodes.public_holiday} onChange={v => setCode('public_holiday', v)} />
          <NdisCodeInput label="Weekday Sleepover" value={ndisCodes.weekday_sleepover} onChange={v => setCode('weekday_sleepover', v)} />
          <NdisCodeInput label="Weekend Sleepover (Sat)" value={ndisCodes.saturday_sleepover} onChange={v => setCode('saturday_sleepover', v)} />
          <NdisCodeInput label="Weekend Sleepover (Sun)" value={ndisCodes.sunday_sleepover} onChange={v => setCode('sunday_sleepover', v)} />
        </div>
      </div>

      {/* ── Goals ── */}
      <div className="glass-card p-4 space-y-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5" /> Income Goals
        </h3>
        <div className="grid grid-cols-1 gap-3">
          <NumberInput
            label="Weekly Goal"
            prefix="$"
            value={String(val('weekly_goal', settings.weekly_goal) ?? '')}
            onChange={v => set('weekly_goal', v === '' ? null : parseFloat(v) || null)}
            placeholder="e.g. 800"
          />
          <NumberInput
            label="Monthly Goal"
            prefix="$"
            value={String(val('monthly_goal', settings.monthly_goal) ?? '')}
            onChange={v => set('monthly_goal', v === '' ? null : parseFloat(v) || null)}
            placeholder="e.g. 3200"
          />
          <NumberInput
            label="Yearly Goal"
            prefix="$"
            value={String(val('yearly_goal', settings.yearly_goal) ?? '')}
            onChange={v => set('yearly_goal', v === '' ? null : parseFloat(v) || null)}
            placeholder="e.g. 38000"
          />
        </div>
      </div>

      {/* ── Tax ── */}
      <div className="glass-card p-4 space-y-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" /> Tax Estimate
        </h3>
        <ToggleRowItem
          label="Show Tax Estimate"
          description="Display an estimated tax deduction on the Overview screen."
          checked={showTax}
          onChange={v => set('show_tax_estimate', v)}
        />
        {showTax && (
          <RateInputRow
            label="Tax Rate"
            value={val('tax_rate', settings.tax_rate) as number}
            onChange={v => set('tax_rate', v)}
            unit="%"
          />
        )}
      </div>

      {/* ── Business ── */}
      <div className="glass-card p-4 space-y-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5" /> Business Details
        </h3>
        <TextInput
          label="Business / Trading Name"
          value={String(val('business_name', settings.business_name) ?? '')}
          onChange={v => set('business_name', v)}
          placeholder="Your name or business name"
        />
        <TextInput
          label="ABN"
          value={String(val('abn', settings.abn) ?? '')}
          onChange={v => set('abn', v)}
          placeholder="xx xxx xxx xxx"
        />
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Default Invoice Notes</label>
          <textarea
            value={String(val('invoice_notes', settings.invoice_notes) ?? '')}
            onChange={e => set('invoice_notes', e.target.value)}
            placeholder="e.g. GST-free supply – no GST charged. Payment due within 14 days."
            rows={3}
            className="glass-input w-full text-foreground resize-none"
            style={{ boxSizing: 'border-box' }}
          />
          <p className="text-[10px] text-muted-foreground">Appears at the bottom of all invoices unless overridden per client.</p>
        </div>
      </div>

      {/* ── Banking ── */}
      <div className="glass-card p-4 space-y-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <CreditCard className="w-3.5 h-3.5" /> Bank Details
        </h3>
        <p className="text-[10px] text-muted-foreground -mt-2">Shown on invoices for payment instructions.</p>
        <TextInput
          label="Bank Name"
          value={String(val('bank_name', settings.bank_name) ?? '')}
          onChange={v => set('bank_name', v)}
          placeholder="e.g. Commonwealth Bank"
        />
        <div className="grid grid-cols-2 gap-3">
          <TextInput
            label="BSB"
            value={String(val('bsb', settings.bsb) ?? '')}
            onChange={v => set('bsb', v)}
            placeholder="xxx-xxx"
          />
          <TextInput
            label="Account Number"
            value={String(val('account_number', settings.account_number) ?? '')}
            onChange={v => set('account_number', v)}
            placeholder="xxxxxxxxx"
          />
        </div>
      </div>

      {/* ── Save button ── */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 min-h-[52px] rounded-2xl text-sm font-bold transition-all duration-200 disabled:opacity-50"
        style={{
          background: saved ? 'hsl(var(--stat-green))' : 'hsl(var(--primary))',
          color: 'hsl(var(--primary-foreground))',
          boxShadow: saving ? 'none' : '0 4px 16px hsl(var(--primary)/0.3)',
        }}
      >
        {saving ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
        ) : saved ? (
          '✓ Saved'
        ) : (
          <><Save className="w-4 h-4" /> Save Settings</>
        )}
      </button>

      <div className="h-4" />
    </div>
  );
};

export default AppSettingsPanel;
