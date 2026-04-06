import { useState, useEffect, useRef } from 'react';
import { Save, Loader2, AlertCircle, RefreshCw, ChevronDown } from 'lucide-react';
import type { UserSettings } from '@/hooks/useUserSettings';
import { DEFAULT_NDIS_CODES, type NdisItemCodes } from '@/lib/invoiceGrouping';

interface RatesPanelProps {
  settings: UserSettings | null;
  loading: boolean;
  onSave: (updates: Partial<Omit<UserSettings, 'id' | 'user_id'>>) => Promise<void>;
}

/* ─────────────────────────────────────────────────────────────────
   Sub-components at MODULE LEVEL to prevent focus-loss
───────────────────────────────────────────────────────────────── */

const SettingsGroup = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl overflow-hidden"
    style={{ background: 'hsl(var(--card))', boxShadow: 'var(--card-shadow-sm)', border: '1px solid hsl(var(--border))' }}>
    {children}
  </div>
);

interface RateRowProps {
  label: string;
  sublabel?: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  isLast?: boolean;
}
const RateRow = ({ label, sublabel, value, onChange, unit = '$/hr', isLast }: RateRowProps) => (
  <div>
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[15px] text-foreground leading-tight">{label}</p>
          {sublabel && <p className="text-[12px] text-muted-foreground mt-0.5 leading-tight">{sublabel}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[13px] text-muted-foreground">$</span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={value}
            onChange={e => onChange(parseFloat(e.target.value) || 0)}
            className="glass-input text-foreground text-[15px] text-right font-mono"
            style={{ minHeight: 40, width: 90 }}
          />
          {unit && <span className="text-[12px] text-muted-foreground w-8">{unit}</span>}
        </div>
      </div>
    </div>
    {!isLast && <div className="ml-4 mr-0 h-px" style={{ background: 'hsl(var(--divider))' }} />}
  </div>
);

interface GoalRowProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  isLast?: boolean;
}
const GoalRow = ({ label, value, onChange, placeholder, isLast }: GoalRowProps) => (
  <div>
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px] text-foreground">{label}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[13px] text-muted-foreground">$</span>
          <input
            type="number"
            min={0}
            step={1}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className="glass-input text-foreground text-[15px] text-right font-mono"
            style={{ minHeight: 40, width: 110 }}
          />
        </div>
      </div>
    </div>
    {!isLast && <div className="ml-4 mr-0 h-px" style={{ background: 'hsl(var(--divider))' }} />}
  </div>
);

interface NdisRowProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  isLast?: boolean;
}
const NdisRow = ({ label, value, onChange, isLast }: NdisRowProps) => (
  <div>
    <div className="px-4 py-3 space-y-1.5">
      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="01_XXX_XXXX_1_1"
        className="glass-input w-full text-foreground text-xs font-mono"
        style={{ minHeight: 40 }}
      />
    </div>
    {!isLast && <div className="ml-4 mr-0 h-px" style={{ background: 'hsl(var(--divider))' }} />}
  </div>
);

interface TaxRowProps {
  label: string;
  sublabel?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  isLast?: boolean;
}
const TaxRow = ({ label, sublabel, checked, onChange, isLast }: TaxRowProps) => (
  <div>
    <div className="px-4 py-0 flex items-center justify-between gap-3" style={{ minHeight: 50 }}>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] text-foreground">{label}</p>
        {sublabel && <p className="text-[12px] text-muted-foreground mt-0.5">{sublabel}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        aria-checked={checked}
        role="switch"
        className="relative shrink-0 transition-all duration-300"
        style={{
          width: 51, height: 31, borderRadius: 999,
          background: checked ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
          boxShadow: checked ? 'none' : 'inset 0 0 0 1px hsl(var(--border))',
        }}
      >
        <span className="absolute top-[3px] rounded-full bg-white shadow-md transition-all duration-300"
          style={{ width: 25, height: 25, left: checked ? 23 : 3, boxShadow: '0 2px 6px hsl(0 0% 0% / 0.18)' }} />
      </button>
    </div>
    {!isLast && <div className="ml-4 mr-0 h-px" style={{ background: 'hsl(var(--divider))' }} />}
  </div>
);

/* ── Collapsible Section ── */
interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}
const CollapsibleSection = ({ title, subtitle, defaultOpen = false, children }: CollapsibleSectionProps) => {
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(defaultOpen ? undefined : 0);

  useEffect(() => {
    if (!contentRef.current) return;
    if (open) {
      setHeight(contentRef.current.scrollHeight);
      const t = setTimeout(() => setHeight(undefined), 300);
      return () => clearTimeout(t);
    } else {
      setHeight(contentRef.current.scrollHeight);
      requestAnimationFrame(() => setHeight(0));
    }
  }, [open]);

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'hsl(var(--card))', boxShadow: 'var(--card-shadow-sm)', border: '1px solid hsl(var(--border))' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 active:bg-accent/30 transition-colors duration-150"
      >
        <div className="text-left">
          <p className="text-[15px] font-semibold text-foreground">{title}</p>
          {subtitle && <p className="text-[12px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <ChevronDown
          className="w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-300"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
      <div
        ref={contentRef}
        style={{
          height: height,
          overflow: 'hidden',
          transition: 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div className="border-t" style={{ borderColor: 'hsl(var(--divider))' }}>
          {children}
        </div>
      </div>
    </div>
  );
};

/* ── Main ── */
const RatesPanel = ({ settings, loading, onSave }: RatesPanelProps) => {
  const [form, setForm] = useState<Partial<Omit<UserSettings, 'id' | 'user_id'>>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const ndisCodes = useRef<NdisItemCodes>({ ...DEFAULT_NDIS_CODES });
  const [ndisCodesState, setNdisCodesState] = useState<NdisItemCodes>({ ...DEFAULT_NDIS_CODES });

  const [eveningStart, setEveningStart] = useState(() => localStorage.getItem('pref_evening_start') || '18:00');
  const [eveningEnd, setEveningEnd] = useState(() => localStorage.getItem('pref_evening_end') || '00:00');
  const [sleepoverStart, setSleepoverStart] = useState(() => localStorage.getItem('pref_sleepover_start') || '00:00');
  const [sleepoverEnd, setSleepoverEnd] = useState(() => localStorage.getItem('pref_sleepover_end') || '06:00');

  useEffect(() => {
    if (!loading) { setTimedOut(false); return; }
    const t = setTimeout(() => setTimedOut(true), 6000);
    return () => clearTimeout(t);
  }, [loading, retryKey]);

  if (loading) {
    if (timedOut) {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'hsl(var(--muted))' }}>
            <AlertCircle className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Settings unavailable</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">Could not load your settings. Check connection and try again.</p>
          </div>
          <button onClick={() => { setTimedOut(false); setRetryKey(k => k + 1); window.location.reload(); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
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
        <p className="text-xs text-muted-foreground max-w-[240px]">Try signing out and back in.</p>
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
    } finally {
      setSaving(false);
    }
  };

  const showTax = val('show_tax_estimate', settings.show_tax_estimate) as boolean;
  const anyDirty = Object.keys(form).length > 0;

  return (
    <div className="space-y-4 pb-4">

      {/* ── Pay Rates ── */}
      <CollapsibleSection title="Pay Rates" subtitle="Hourly rates by day type" defaultOpen>
        <RateRow label="Monday – Friday" value={val('rate_weekday', settings.rate_weekday) as number} onChange={v => set('rate_weekday', v)} />
        <RateRow label="Saturday" value={val('rate_saturday', settings.rate_saturday) as number} onChange={v => set('rate_saturday', v)} />
        <RateRow label="Sunday" value={val('rate_sunday', settings.rate_sunday) as number} onChange={v => set('rate_sunday', v)} />
        <RateRow label="Public Holiday" value={val('rate_public_holiday', settings.rate_public_holiday) as number} onChange={v => set('rate_public_holiday', v)} isLast />
      </CollapsibleSection>

      {/* ── Evening Shift ── */}
      <CollapsibleSection title="Evening Shift" subtitle="Evening rate & window settings">
        <RateRow
          label="Evening Rate"
          sublabel="Mon–Fri evening override"
          value={val('rate_evening', settings.rate_evening) as number}
          onChange={v => set('rate_evening', v)}
        />
        <div>
          <div className="ml-4 mr-0 h-px" style={{ background: 'hsl(var(--divider))' }} />
          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[15px] text-foreground leading-tight">Evening Window</p>
                <p className="text-[12px] text-muted-foreground mt-0.5 leading-tight">Set when evening rate applies</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <input type="time" value={eveningStart}
                  onChange={e => { setEveningStart(e.target.value); localStorage.setItem('pref_evening_start', e.target.value); }}
                  className="glass-input text-foreground text-[13px] font-mono text-center" style={{ minHeight: 38, width: 80 }} />
                <span className="text-[11px] text-muted-foreground">–</span>
                <input type="time" value={eveningEnd}
                  onChange={e => { setEveningEnd(e.target.value); localStorage.setItem('pref_evening_end', e.target.value); }}
                  className="glass-input text-foreground text-[13px] font-mono text-center" style={{ minHeight: 38, width: 80 }} />
              </div>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground px-4 pb-3">Sat/Sun use their own rates regardless of time.</p>
      </CollapsibleSection>

      {/* ── Sleepover Shifts ── */}
      <CollapsibleSection title="Sleepover Shifts" subtitle="Flat fees & overnight window">
        <RateRow label="Weekday Night" sublabel="Mon – Fri" value={val('rate_sleepover_weekday', settings.rate_sleepover_weekday) as number} onChange={v => set('rate_sleepover_weekday', v)} unit="flat" />
        <RateRow label="Weekend Night" sublabel="Sat & Sun" value={val('rate_sleepover_weekend', settings.rate_sleepover_weekend) as number} onChange={v => set('rate_sleepover_weekend', v)} unit="flat" />
        <div>
          <div className="ml-4 mr-0 h-px" style={{ background: 'hsl(var(--divider))' }} />
          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[15px] text-foreground leading-tight">Sleepover Window</p>
                <p className="text-[12px] text-muted-foreground mt-0.5 leading-tight">Set your overnight hours</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <input type="time" value={sleepoverStart}
                  onChange={e => { setSleepoverStart(e.target.value); localStorage.setItem('pref_sleepover_start', e.target.value); }}
                  className="glass-input text-foreground text-[13px] font-mono text-center" style={{ minHeight: 38, width: 80 }} />
                <span className="text-[11px] text-muted-foreground">–</span>
                <input type="time" value={sleepoverEnd}
                  onChange={e => { setSleepoverEnd(e.target.value); localStorage.setItem('pref_sleepover_end', e.target.value); }}
                  className="glass-input text-foreground text-[13px] font-mono text-center" style={{ minHeight: 38, width: 80 }} />
              </div>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground px-4 pb-3">Sleepover is a flat fee regardless of hours.</p>
      </CollapsibleSection>

      {/* ── Tax ── */}
      <CollapsibleSection title="Tax Estimate" subtitle="Estimated tax deductions">
        <TaxRow
          label="Show Tax Estimate"
          sublabel="Display estimated tax on Overview screen"
          checked={showTax}
          onChange={v => set('show_tax_estimate', v)}
          isLast={!showTax}
        />
        {showTax && (
          <RateRow
            label="Tax Rate"
            value={val('tax_rate', settings.tax_rate) as number}
            onChange={v => set('tax_rate', v)}
            unit="%"
            isLast
          />
        )}
      </CollapsibleSection>

      {/* ── Income Goals ── */}
      <CollapsibleSection title="Income Goals" subtitle="Weekly, monthly & yearly targets">
        <GoalRow label="Weekly Goal" value={String(val('weekly_goal', settings.weekly_goal) ?? '')} onChange={v => set('weekly_goal', v === '' ? null : parseFloat(v) || null)} placeholder="800" />
        <GoalRow label="Monthly Goal" value={String(val('monthly_goal', settings.monthly_goal) ?? '')} onChange={v => set('monthly_goal', v === '' ? null : parseFloat(v) || null)} placeholder="3200" />
        <GoalRow label="Yearly Goal" value={String(val('yearly_goal', settings.yearly_goal) ?? '')} onChange={v => set('yearly_goal', v === '' ? null : parseFloat(v) || null)} placeholder="38000" isLast />
      </CollapsibleSection>

      {/* ── NDIS Item Codes ── */}
      <CollapsibleSection title="NDIS Item Codes" subtitle="Plan management code mappings">
        <NdisRow label="Daily Support (Weekday)" value={ndisCodesState.daily} onChange={v => setCode('daily', v)} />
        <NdisRow label="Evening Support" value={ndisCodesState.evening} onChange={v => setCode('evening', v)} />
        <NdisRow label="Saturday Support" value={ndisCodesState.saturday} onChange={v => setCode('saturday', v)} />
        <NdisRow label="Sunday Support" value={ndisCodesState.sunday} onChange={v => setCode('sunday', v)} />
        <NdisRow label="Public Holiday" value={ndisCodesState.public_holiday} onChange={v => setCode('public_holiday', v)} />
        <NdisRow label="Weekday Sleepover" value={ndisCodesState.weekday_sleepover} onChange={v => setCode('weekday_sleepover', v)} />
        <NdisRow label="Weekend Sleepover (Sat)" value={ndisCodesState.saturday_sleepover} onChange={v => setCode('saturday_sleepover', v)} />
        <NdisRow label="Weekend Sleepover (Sun)" value={ndisCodesState.sunday_sleepover} onChange={v => setCode('sunday_sleepover', v)} isLast />
      </CollapsibleSection>

      {/* ── Sticky Save ── */}
      {anyDirty && (
        <div className="sticky bottom-24 z-30">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 min-h-[50px] rounded-2xl text-[15px] font-semibold transition-all duration-200 disabled:opacity-50"
            style={{
              background: saved ? 'hsl(var(--stat-green)/0.15)' : 'hsl(var(--primary))',
              color: saved ? 'hsl(var(--stat-green))' : 'hsl(var(--primary-foreground))',
              boxShadow: saved ? '0 0 20px hsl(var(--stat-green)/0.2)' : '0 4px 16px hsl(var(--primary)/0.3)',
            }}
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : saved ? '✓ Saved' : <><Save className="w-4 h-4" /> Save Changes</>}
          </button>
        </div>
      )}

      <div className="h-2" />
    </div>
  );
};

export default RatesPanel;
