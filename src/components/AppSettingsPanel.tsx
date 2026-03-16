import { useState, useEffect, useRef } from 'react';
import { Save, Loader2, Target, Building2, CreditCard, FileText, Sliders, AlertCircle, Sunset, Code2, RefreshCw, Hash, RotateCcw } from 'lucide-react';
import type { UserSettings } from '@/hooks/useUserSettings';
import { DEFAULT_NDIS_CODES, type NdisItemCodes } from '@/lib/invoiceGrouping';

interface AppSettingsPanelProps {
  settings: UserSettings | null;
  loading: boolean;
  onSave: (updates: Partial<Omit<UserSettings, 'id' | 'user_id'>>) => Promise<void>;
  onResetInvoiceCounter?: () => Promise<void>;
}

/* ════════════════════════════════════════════════════
   ALL sub-components HOISTED to module scope.
   This is the root-cause fix for focus-loss:
   if defined inside the panel body, React sees a new
   component type each render → unmounts → remounts
   the <input> → focus stolen after every keystroke.
════════════════════════════════════════════════════ */

interface RateInputRowProps {
  label: string;
  subLabel?: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
}

const RateInputRow = ({ label, subLabel, value, onChange, unit = '$/hr' }: RateInputRowProps) => (
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

interface ToggleRowItemProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

const ToggleRowItem = ({ label, description, checked, onChange }: ToggleRowItemProps) => (
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

interface TextInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}

const TextInput = ({ label, value, onChange, placeholder, hint }: TextInputProps) => (
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

interface NumberInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  prefix?: string;
}

const NumberInput = ({ label, value, onChange, placeholder, hint, prefix }: NumberInputProps) => (
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

interface NdisCodeInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

const NdisCodeInput = ({ label, value, onChange, placeholder }: NdisCodeInputProps) => (
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

/* ── Main panel ── */
const AppSettingsPanel = ({ settings, loading, onSave, onResetInvoiceCounter }: AppSettingsPanelProps) => {
  const [form, setForm] = useState<Partial<Omit<UserSettings, 'id' | 'user_id'>>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const ndisCodes = useRef<NdisItemCodes>({ ...DEFAULT_NDIS_CODES });
  const [ndisCodesState, setNdisCodesState] = useState<NdisItemCodes>({ ...DEFAULT_NDIS_CODES });

  // Loading timeout — reset when loading resolves or on retry
  useEffect(() => {
    if (!loading) {
      setTimedOut(false);
      return;
    }
    const t = setTimeout(() => setTimedOut(true), 6000);
    return () => clearTimeout(t);
  }, [loading, retryKey]);

  const handleRetry = () => {
    setTimedOut(false);
    setRetryKey(k => k + 1);
    window.location.reload();
  };

  if (loading) {
    if (timedOut) {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: 'hsl(var(--muted))' }}>
            <AlertCircle className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Settings unavailable</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
              Could not load your settings. Check your connection and try again.
            </p>
          </div>
          <button
            onClick={handleRetry}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <p className="text-xs text-muted-foreground">Loading settings…</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <AlertCircle className="w-8 h-8 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">Settings not found</p>
        <p className="text-xs text-muted-foreground max-w-[240px]">
          Try signing out and back in to reload your settings.
        </p>
      </div>
    );
  }

  const val = <K extends keyof typeof form>(key: K, fallback: UserSettings[K]) =>
    form[key] !== undefined ? form[key] : (settings[key] ?? fallback);

  const set = <K extends keyof typeof form>(key: K, value: typeof form[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const setCode = (key: keyof NdisItemCodes, value: string) => {
    ndisCodes.current = { ...ndisCodes.current, [key]: value };
    setNdisCodesState(prev => ({ ...prev, [key]: value }));
  };

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

  const handleResetCounter = async () => {
    if (!confirmReset) { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 4000); return; }
    setResetting(true);
    setConfirmReset(false);
    await onSave({ invoice_counter: 0 });
    setResetting(false);
    setResetDone(true);
    setTimeout(() => setResetDone(false), 2500);
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
          <NdisCodeInput label="Daily Support (Weekday)" value={ndisCodesState.daily} onChange={v => setCode('daily', v)} />
          <NdisCodeInput label="Evening Support" value={ndisCodesState.evening} onChange={v => setCode('evening', v)} />
          <NdisCodeInput label="Saturday Support" value={ndisCodesState.saturday} onChange={v => setCode('saturday', v)} />
          <NdisCodeInput label="Sunday Support" value={ndisCodesState.sunday} onChange={v => setCode('sunday', v)} />
          <NdisCodeInput label="Public Holiday Support" value={ndisCodesState.public_holiday} onChange={v => setCode('public_holiday', v)} />
          <NdisCodeInput label="Weekday Sleepover" value={ndisCodesState.weekday_sleepover} onChange={v => setCode('weekday_sleepover', v)} />
          <NdisCodeInput label="Weekend Sleepover (Sat)" value={ndisCodesState.saturday_sleepover} onChange={v => setCode('saturday_sleepover', v)} />
          <NdisCodeInput label="Weekend Sleepover (Sun)" value={ndisCodesState.sunday_sleepover} onChange={v => setCode('sunday_sleepover', v)} />
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
        <div className="space-y-3">
          <ToggleRowItem
            label="Use Default Invoice Notes"
            description="Automatically include the note template below on new invoices."
            checked={val('use_default_invoice_notes', settings.use_default_invoice_notes ?? true) as boolean}
            onChange={v => set('use_default_invoice_notes', v)}
          />
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Default Invoice Notes</label>
            <textarea
              value={String(val('invoice_notes', settings.invoice_notes) ?? '')}
              onChange={e => set('invoice_notes', e.target.value)}
              placeholder="e.g. GST-free supply – no GST charged. Payment due within 14 days."
              rows={3}
              className="glass-input w-full text-foreground resize-none"
              style={{
                boxSizing: 'border-box',
                opacity: (val('use_default_invoice_notes', settings.use_default_invoice_notes ?? true) as boolean) ? 1 : 0.4,
                pointerEvents: (val('use_default_invoice_notes', settings.use_default_invoice_notes ?? true) as boolean) ? 'auto' : 'none',
                transition: 'opacity 0.2s ease',
              }}
            />
            <p className="text-[10px] text-muted-foreground">
              {(val('use_default_invoice_notes', settings.use_default_invoice_notes ?? true) as boolean)
                ? 'Automatically appended to new invoices. Turn off to skip this note.'
                : 'Notes are saved but will not be added to new invoices automatically.'}
            </p>
          </div>
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

      {/* ── Invoice Counter ── */}
      <div className="glass-card p-4 space-y-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Hash className="w-3.5 h-3.5" /> Invoice Numbering
        </h3>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Current Counter</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Next invoice will be <span className="font-mono font-semibold" style={{ color: 'hsl(var(--primary))' }}>INV-{String((settings.invoice_counter ?? 0) + 1).padStart(3, '0')}</span>
            </p>
          </div>
          <div className="text-2xl font-bold font-mono" style={{ color: 'hsl(var(--primary))' }}>
            #{String(settings.invoice_counter ?? 0).padStart(3, '0')}
          </div>
        </div>
        <button
          onClick={handleResetCounter}
          disabled={resetting}
          className="w-full flex items-center justify-center gap-2 min-h-[44px] rounded-xl text-sm font-semibold transition-all duration-200"
          style={{
            background: resetDone
              ? 'hsl(var(--stat-green)/0.15)'
              : confirmReset
              ? 'hsl(var(--destructive)/0.12)'
              : 'hsl(var(--muted))',
            color: resetDone
              ? 'hsl(var(--stat-green))'
              : confirmReset
              ? 'hsl(var(--destructive))'
              : 'hsl(var(--foreground))',
            border: confirmReset ? '1px solid hsl(var(--destructive)/0.3)' : '1px solid transparent',
          }}
        >
          {resetting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Resetting…</>
          ) : resetDone ? (
            '✓ Counter Reset to 000'
          ) : confirmReset ? (
            '⚠ Tap again to confirm reset'
          ) : (
            <><RotateCcw className="w-4 h-4" /> Reset to #000</>
          )}
        </button>
        <p className="text-[10px] text-muted-foreground">
          Resets the counter so the next invoice starts at INV-001. Existing invoices are not affected.
        </p>
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
