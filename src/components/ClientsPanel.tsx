import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Plus, Pencil, Trash2, User, Check, X, ChevronRight, ChevronLeft,
  Clock, FileText, Hash, Phone, MapPin, Moon, DollarSign, BarChart2, Mail,
  Archive, RotateCcw,
} from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Client } from '@/hooks/useClients';
import { isClientArchived } from '@/hooks/useClients';
import type { Shift } from '@/hooks/useShifts';
import { effectiveGrossPay } from '@/hooks/useShifts';
import { formatCurrency } from '@/lib/formatUtils';
import { formatTime12h, DEFAULT_RATES } from '@/lib/shiftCalculator';
import { MONTH_NAMES } from '@/lib/dateUtils';

interface ClientsPanelProps {
  clients: Client[];
  shifts: Shift[];
  loading: boolean;
  onAdd: (fields: Partial<Omit<Client, 'id' | 'user_id' | 'created_at' | 'updated_at'>> & { name: string }) => Promise<Client | null>;
  onUpdate: (id: string, updates: Partial<Omit<Client, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onArchive?: (id: string) => Promise<void>;
  onRestore?: (id: string) => Promise<void>;
}

const emptyForm = () => ({
  name: '',
  display_name: '',
  notes: '',
  active: true,
  phone: '',
  service_address: '',
  billing_address: '',
  use_plan_manager: false,
  participant_number: '',
  organisation_name: '',
  billing_contact: '',
  email: '',
  default_service_note: '',
  default_start_time: '',
  default_end_time: '',
  default_is_sleepover: false,
  invoice_label: '',
  invoice_notes: '',
  // Custom rates
  use_custom_rates: false,
  rate_weekday: '',
  rate_saturday: '',
  rate_sunday: '',
  rate_evening: '',
  rate_sleepover_weekday: '',
  rate_sleepover_weekend: '',
  rate_public_holiday: '',
});

type ClientForm = ReturnType<typeof emptyForm>;

function clientToForm(c: Client): ClientForm {
  return {
    name: c.name,
    display_name: c.display_name ?? '',
    notes: c.notes ?? '',
    active: c.active,
    phone: c.phone ?? '',
    service_address: c.service_address ?? '',
    billing_address: c.billing_address ?? '',
    use_plan_manager: c.use_plan_manager,
    participant_number: c.participant_number ?? '',
    organisation_name: c.organisation_name ?? '',
    billing_contact: c.billing_contact ?? '',
    email: c.email ?? '',
    default_service_note: c.default_service_note ?? '',
    default_start_time: c.default_start_time ?? '',
    default_end_time: c.default_end_time ?? '',
    default_is_sleepover: c.default_is_sleepover,
    invoice_label: c.invoice_label ?? '',
    invoice_notes: c.invoice_notes ?? '',
    use_custom_rates: c.use_custom_rates,
    rate_weekday: c.rate_weekday != null ? String(c.rate_weekday) : '',
    rate_saturday: c.rate_saturday != null ? String(c.rate_saturday) : '',
    rate_sunday: c.rate_sunday != null ? String(c.rate_sunday) : '',
    rate_evening: c.rate_evening != null ? String(c.rate_evening) : '',
    rate_sleepover_weekday: c.rate_sleepover_weekday != null ? String(c.rate_sleepover_weekday) : '',
    rate_sleepover_weekend: c.rate_sleepover_weekend != null ? String(c.rate_sleepover_weekend) : '',
    rate_public_holiday: c.rate_public_holiday != null ? String(c.rate_public_holiday) : '',
  };
}

function parseLocalDate(d: string) {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(y, m - 1, dd);
}

function formatDateLabel(dateStr: string) {
  const d = parseLocalDate(dateStr);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

/* ── Hoisted sub-components ── */
const FormField = ({
  label, value, onChange, placeholder, type = 'text', hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; hint?: string;
}) => (
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

const FormToggle = ({
  label, checked, onChange, icon,
}: {
  label: string; checked: boolean; onChange: (v: boolean) => void; icon: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className="w-full flex items-center gap-3 rounded-2xl border transition-all duration-200 px-4"
    style={{
      minHeight: 44,
      borderColor: checked ? 'hsl(var(--primary)/0.5)' : 'hsl(var(--border))',
      background: checked ? 'hsl(var(--primary)/0.08)' : 'transparent',
    }}
  >
    <span style={{ color: checked ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}>{icon}</span>
    <span className="text-sm font-semibold flex-1 text-left"
      style={{ color: checked ? 'hsl(var(--primary))' : 'hsl(var(--foreground))' }}>
      {label}
    </span>
    <span className="relative shrink-0 rounded-full transition-all duration-200"
      style={{ width: 42, height: 24, background: checked ? 'hsl(var(--primary))' : 'hsl(var(--muted))' }}>
      <span className="absolute top-[3px] rounded-full bg-white shadow-sm transition-all duration-200"
        style={{ width: 18, height: 18, left: checked ? 21 : 3 }} />
    </span>
  </button>
);

/* ── ClientFormSheet ── */
const ClientFormSheet = ({
  initial, title, onSave, onCancel,
}: {
  initial: ClientForm; title: string;
  onSave: (f: ClientForm) => Promise<void>; onCancel: () => void;
}) => {
  const [form, setForm] = useState<ClientForm>(initial);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const set = <K extends keyof ClientForm>(k: K, v: ClientForm[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || saving) return;
    setSaveError(null);
    setSaving(true);
    try { await onSave(form); }
    catch (err) { setSaveError(err instanceof Error ? err.message : 'Failed to save.'); }
    finally { setSaving(false); }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{
        paddingLeft: 16,
        paddingRight: 16,
        paddingTop: 'max(16px, env(safe-area-inset-top, 16px))',
        paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
        background: 'hsl(var(--foreground)/0.4)',
        backdropFilter: 'blur(24px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <form
        onSubmit={handleSubmit}
        className="flex flex-col"
        style={{
          width: 'calc(100vw - 32px)',
          maxWidth: 420,
          maxHeight: 'min(90dvh, 720px)',
          background: 'hsl(var(--card))',
          borderRadius: 24,
          boxShadow:
            '0 2px 8px hsl(var(--foreground)/0.08), ' +
            '0 20px 60px hsl(var(--foreground)/0.22), ' +
            '0 0 0 0.5px hsl(var(--border))',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between shrink-0"
          style={{ borderBottom: '0.5px solid hsl(var(--border))', padding: '14px 20px' }}>
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          <button type="button" onClick={onCancel}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
            style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
          style={{ padding: '16px 20px 4px', boxSizing: 'border-box' }}>

          {/* ── Participant ── */}
          <div style={{ marginBottom: 20 }}>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest" style={{ marginBottom: 10 }}>Participant</p>
            <div className="space-y-3" style={{ width: '100%', boxSizing: 'border-box' }}>
              <FormField label="Full Name *" value={form.name} onChange={v => set('name', v)} placeholder="e.g. Alex Johnson" />
              <FormField label="Display / Short Name" value={form.display_name} onChange={v => set('display_name', v)} placeholder="e.g. Alex" />
              <FormField label="Phone" value={form.phone} onChange={v => set('phone', v)} placeholder="+61 4XX XXX XXX" type="tel" />
              <FormField label="Service Address *" value={form.service_address} onChange={v => set('service_address', v)} placeholder="Where support is delivered" hint="Used for shifts and calendar events" />
              <FormField label="Participant / Reference Number" value={form.participant_number} onChange={v => set('participant_number', v)} placeholder="NDIS participant number" />
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Notes</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                  placeholder="Any notes about this client…" rows={2}
                  className="glass-input w-full text-foreground resize-none" style={{ boxSizing: 'border-box', minHeight: 44 }} />
              </div>
            </div>
          </div>

          {/* ── Plan Manager / Billing ── */}
          <div style={{ marginBottom: 20 }}>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest" style={{ marginBottom: 10 }}>Plan Manager / Billing</p>
            <div className="space-y-3" style={{ width: '100%', boxSizing: 'border-box' }}>
              <FormToggle label="This client uses a plan manager" checked={form.use_plan_manager} onChange={v => set('use_plan_manager', v)} icon={<FileText className="w-4 h-4" />} />
              {form.use_plan_manager && (
                <>
                  <FormField label="Organisation / Provider Name" value={form.organisation_name} onChange={v => set('organisation_name', v)} placeholder="e.g. Sunrise Support Services" />
                  <FormField label="Billing Contact" value={form.billing_contact} onChange={v => set('billing_contact', v)} placeholder="e.g. Jane Smith" />
                  <FormField label="Billing Email" value={form.email} onChange={v => set('email', v)} placeholder="billing@email.com" type="email" />
                  <FormField label="Billing Address *" value={form.billing_address} onChange={v => set('billing_address', v)} placeholder="Invoice recipient address" hint="Used on invoices only" />
                </>
              )}
            </div>
          </div>

          {/* ── Shift Defaults ── */}
          <div style={{ marginBottom: 20 }}>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest" style={{ marginBottom: 10 }}>Shift Defaults</p>
            <div className="space-y-3" style={{ width: '100%', boxSizing: 'border-box' }}>
              <div className="grid grid-cols-2 gap-3" style={{ width: '100%' }}>
                <div className="space-y-1.5 min-w-0">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Start Time
                  </label>
                  <input type="time" value={form.default_start_time} onChange={e => set('default_start_time', e.target.value)}
                    className="glass-input w-full text-foreground"
                    style={{ minHeight: 44, fontSize: 16, WebkitAppearance: 'none', padding: '8px 10px' }} />
                </div>
                <div className="space-y-1.5 min-w-0">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3 h-3" /> End Time
                  </label>
                  <input type="time" value={form.default_end_time} onChange={e => set('default_end_time', e.target.value)}
                    className="glass-input w-full text-foreground"
                    style={{ minHeight: 44, fontSize: 16, WebkitAppearance: 'none', padding: '8px 10px' }} />
                </div>
              </div>
              <FormToggle label="Default Sleepover" checked={form.default_is_sleepover} onChange={v => set('default_is_sleepover', v)} icon={<Moon className="w-4 h-4" />} />
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Default Service Note
                </label>
                <textarea value={form.default_service_note} onChange={e => set('default_service_note', e.target.value)}
                  placeholder="e.g. Assistance with Self-Care Activities" rows={2}
                  className="glass-input w-full text-foreground resize-none" style={{ boxSizing: 'border-box', minHeight: 44 }} />
              </div>
            </div>
          </div>

          {/* ── Custom Rates ── */}
          <div style={{ marginBottom: 20 }}>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest" style={{ marginBottom: 10 }}>Rates</p>
            <div className="space-y-3" style={{ width: '100%', boxSizing: 'border-box' }}>
              <FormToggle label="Use custom rates" checked={form.use_custom_rates} onChange={v => set('use_custom_rates', v)} icon={<DollarSign className="w-4 h-4" />} />
              {!form.use_custom_rates && (
                <p className="text-[10px] text-muted-foreground pl-1">Using default rates from Settings</p>
              )}
              {form.use_custom_rates && (
                <>
                  <p className="text-[10px] text-muted-foreground pl-1">Leave blank to use the default rate for that field</p>
                  <div className="grid grid-cols-2 gap-3" style={{ width: '100%' }}>
                    <FormField label="Weekday $/hr" value={form.rate_weekday} onChange={v => set('rate_weekday', v)} placeholder={String(DEFAULT_RATES.rate_weekday)} type="number" />
                    <FormField label="Saturday $/hr" value={form.rate_saturday} onChange={v => set('rate_saturday', v)} placeholder={String(DEFAULT_RATES.rate_saturday)} type="number" />
                    <FormField label="Sunday $/hr" value={form.rate_sunday} onChange={v => set('rate_sunday', v)} placeholder={String(DEFAULT_RATES.rate_sunday)} type="number" />
                    <FormField label="Evening $/hr" value={form.rate_evening} onChange={v => set('rate_evening', v)} placeholder={String(DEFAULT_RATES.rate_evening)} type="number" />
                    <FormField label="Sleepover Wkday $" value={form.rate_sleepover_weekday} onChange={v => set('rate_sleepover_weekday', v)} placeholder={String(DEFAULT_RATES.rate_sleepover_weekday)} type="number" />
                    <FormField label="Sleepover Wkend $" value={form.rate_sleepover_weekend} onChange={v => set('rate_sleepover_weekend', v)} placeholder={String(DEFAULT_RATES.rate_sleepover_weekend)} type="number" />
                  </div>
                  <FormField label="Public Holiday $/hr" value={form.rate_public_holiday} onChange={v => set('rate_public_holiday', v)} placeholder={String(DEFAULT_RATES.rate_public_holiday)} type="number" />
                </>
              )}
            </div>
          </div>

          {/* ── Invoice Settings ── */}
          <div style={{ marginBottom: 8 }}>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest" style={{ marginBottom: 10 }}>Invoice Settings</p>
            <div className="space-y-3" style={{ width: '100%', boxSizing: 'border-box' }}>
              <FormField label="Invoice Label" value={form.invoice_label} onChange={v => set('invoice_label', v)} placeholder="Name to use on invoices" />
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Invoice Notes</label>
                <textarea value={form.invoice_notes} onChange={e => set('invoice_notes', e.target.value)}
                  placeholder="Any client-specific invoice notes…" rows={2}
                  className="glass-input w-full text-foreground resize-none" style={{ boxSizing: 'border-box', minHeight: 44 }} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 space-y-2" style={{ borderTop: '0.5px solid hsl(var(--border))', padding: '12px 20px', boxSizing: 'border-box' }}>
          {saveError && <p className="text-xs text-destructive text-center px-2">{saveError}</p>}
          <div className="flex gap-2.5">
            <button type="button" onClick={onCancel}
              className="flex-1 rounded-2xl text-sm font-semibold"
              style={{ minHeight: 48, background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>Cancel</button>
            <button type="submit" disabled={saving || !form.name.trim()}
              className="flex-1 rounded-2xl text-sm font-bold disabled:opacity-50"
              style={{ minHeight: 48, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', boxShadow: saving ? 'none' : '0 4px 16px hsl(var(--primary)/0.3)' }}>
              {saving ? 'Saving…' : <><Check className="w-4 h-4 inline mr-1" /> Save Client</>}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

/* ── Premium themed map with MapLibre GL ── */
const AddressMap = ({ address, clientName, isActive }: { address: string; clientName?: string; isActive?: boolean }) => {
  const q = encodeURIComponent(address);
  const initial = clientName ? clientName[0].toUpperCase() : '?';
  const isDark = document.documentElement.classList.contains('dark');
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Free tile styles — dark & light
    const darkStyle = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
    const lightStyle = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: isDark ? darkStyle : lightStyle,
      center: [151.2093, -33.8688], // Default Sydney
      zoom: 14,
      attributionControl: false,
      interactive: true,
    });
    mapRef.current = map;

    // Geocode via Nominatim
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=1`, {
      headers: { 'Accept': 'application/json' },
    })
      .then(r => r.json())
      .then(results => {
        if (results && results.length > 0) {
          const { lon, lat } = results[0];
          map.setCenter([parseFloat(lon), parseFloat(lat)]);
        }
      })
      .catch(() => { /* fallback position */ });

    return () => { map.remove(); mapRef.current = null; };
  }, [address, isDark]);

  return (
    <div
      className="relative overflow-hidden"
      style={{
        height: 240,
        borderRadius: 22,
        background: isDark ? 'hsl(220 14% 8%)' : 'hsl(220 14% 96%)',
        boxShadow: 'var(--card-shadow-md)',
        border: '1px solid hsl(var(--border)/0.5)',
      }}
    >
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Top edge fade */}
      <div className="absolute inset-x-0 top-0 pointer-events-none" style={{
        height: 48,
        background: isDark
          ? 'linear-gradient(to bottom, hsl(220 14% 8% / 0.5), transparent)'
          : 'linear-gradient(to bottom, hsl(220 14% 96% / 0.6), transparent)',
      }} />
      {/* Bottom edge fade */}
      <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{
        height: 64,
        background: isDark
          ? 'linear-gradient(to top, hsl(220 14% 8% / 0.7), transparent)'
          : 'linear-gradient(to top, hsl(220 14% 96% / 0.7), transparent)',
      }} />

      {/* Custom center marker */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ marginTop: -20 }}>
        <div className="flex flex-col items-center gap-0">
          <div
            className="flex items-center justify-center text-xs font-bold"
            style={{
              width: 36, height: 36, borderRadius: 12,
              background: 'hsl(var(--primary))',
              color: 'white',
              boxShadow: '0 4px 16px hsl(var(--primary)/0.5), 0 0 0 3px hsl(0 0% 100% / 0.2)',
            }}
          >
            {initial}
          </div>
          <div style={{ width: 2, height: 10, background: 'hsl(var(--primary))', borderRadius: 1, opacity: 0.7 }} />
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'hsl(var(--primary)/0.4)', marginTop: -1 }} />
        </div>
      </div>

      {/* Floating info card — bottom */}
      {clientName && (
        <div
          className="absolute bottom-3 left-3 right-3 flex items-center gap-3 px-3.5 py-2.5"
          style={{
            borderRadius: 16,
            background: isDark ? 'hsl(220 14% 10% / 0.82)' : 'hsl(0 0% 100% / 0.85)',
            backdropFilter: 'blur(24px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
            border: isDark ? '1px solid hsl(0 0% 100% / 0.08)' : '1px solid hsl(var(--border))',
            boxShadow: isDark
              ? '0 4px 20px hsl(0 0% 0% / 0.4), inset 0 0.5px 0 hsl(0 0% 100% / 0.06)'
              : '0 4px 20px hsl(0 0% 0% / 0.08)',
          }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0"
            style={{ background: 'hsl(var(--primary)/0.2)', color: 'hsl(var(--primary))' }}
          >
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate" style={{ color: isDark ? 'white' : 'hsl(var(--foreground))' }}>{clientName}</p>
            <p className="text-[10px] truncate" style={{ color: isDark ? 'hsl(0 0% 100% / 0.5)' : 'hsl(var(--muted-foreground))' }}>{address}</p>
          </div>
          {isActive !== undefined && (
            <span
              className="text-[9px] font-semibold px-2 py-0.5 rounded-full shrink-0"
              style={{
                background: isActive ? 'hsl(var(--stat-green)/0.2)' : 'hsl(var(--muted))',
                color: isActive ? 'hsl(var(--stat-green))' : 'hsl(var(--muted-foreground))',
              }}
            >
              {isActive ? 'Active' : 'Inactive'}
            </span>
          )}
        </div>
      )}

      {/* Open in Maps pill — top-right */}
      <a
        href={`https://maps.google.com/?q=${q}`}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-3 right-3 flex items-center gap-1.5 px-3.5 py-2 text-[11px] font-semibold active:scale-95 transition-transform"
        style={{
          borderRadius: 100,
          background: 'hsl(var(--primary)/0.9)',
          color: 'white',
          boxShadow: '0 4px 16px hsl(var(--primary)/0.4), 0 1px 4px hsl(0 0% 0% / 0.3)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <MapPin className="w-3 h-3" /> Open in Maps
      </a>
    </div>
  );
};

/* ── ClientProfile ── */
const ClientProfile = ({
  client, shifts, onEdit, onBack,
}: {
  client: Client; shifts: Shift[];
  onEdit: () => void; onBack: () => void;
}) => {
  const clientShifts = useMemo(
    () => shifts.filter(s => s.client_id === client.id).sort((a, b) => b.date.localeCompare(a.date)),
    [shifts, client.id]
  );

  const totalEarnings = clientShifts.reduce((s, sh) => s + effectiveGrossPay(sh), 0);
  const totalHours = clientShifts.filter(s => !s.is_sleepover).reduce((s, sh) => s + Number(sh.hours_worked), 0);
  const totalSleepovers = clientShifts.filter(s => s.is_sleepover).length;
  const recentShifts = clientShifts.slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Back nav */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'hsl(var(--primary))' }}>
        <ChevronLeft className="w-4 h-4" /> All Clients
      </button>

      {/* Hero card — clean Apple style, no accent bar */}
      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold shrink-0"
              style={{ background: 'hsl(var(--primary)/0.1)', color: 'hsl(var(--primary))' }}>
              {client.name[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-foreground leading-tight">{client.name}</h2>
              {client.display_name && <p className="text-xs text-muted-foreground mt-0.5">{client.display_name}</p>}
              <span className="inline-flex items-center gap-1 mt-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
                style={{
                  background: client.active ? 'hsl(var(--stat-green)/0.1)' : 'hsl(var(--muted))',
                  color: client.active ? 'hsl(var(--stat-green))' : 'hsl(var(--muted-foreground))',
                }}>
                {client.active ? '● Active' : '○ Inactive'}
              </span>
            </div>
          </div>
          <button onClick={onEdit}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold shrink-0 active:scale-95 transition-transform"
            style={{ background: 'hsl(var(--primary)/0.1)', color: 'hsl(var(--primary))' }}>
            <Pencil className="w-3 h-3" /> Edit
          </button>
        </div>

        {/* Quick info chips */}
        {(client.participant_number || client.service_address) && (
          <div className="flex flex-wrap gap-2">
            {client.participant_number && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl"
                style={{ background: 'hsl(var(--muted)/0.6)', color: 'hsl(var(--foreground))' }}>
                <Hash className="w-3 h-3 text-muted-foreground" /> {client.participant_number}
              </span>
            )}
            {client.service_address && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl"
                style={{ background: 'hsl(var(--muted)/0.6)', color: 'hsl(var(--foreground))' }}>
                <MapPin className="w-3 h-3 text-muted-foreground" /> {client.service_address}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Map */}
      {client.service_address && <AddressMap address={client.service_address} clientName={client.name} isActive={client.active} />}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: 'Total Earned', value: formatCurrency(totalEarnings), icon: <DollarSign className="w-4 h-4" />, color: 'hsl(var(--money-green))' },
          { label: 'Hours', value: `${totalHours.toFixed(0)}h`, icon: <Clock className="w-4 h-4" />, color: 'hsl(var(--primary))' },
          { label: 'Shifts', value: String(clientShifts.length), icon: <BarChart2 className="w-4 h-4" />, color: 'hsl(var(--purple))' },
        ].map(s => (
          <div key={s.label} className="card-elevated p-3.5 space-y-1.5 text-center">
            <div className="w-8 h-8 rounded-xl mx-auto flex items-center justify-center" style={{ background: `${s.color}15`, color: s.color }}>{s.icon}</div>
            <p className="text-base font-bold text-foreground">{s.value}</p>
            <p className="text-[10px] text-muted-foreground font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {totalSleepovers > 0 && (
        <div className="flex items-center justify-center gap-2 py-2.5 rounded-2xl"
          style={{ background: 'hsl(var(--primary)/0.06)', border: '1px solid hsl(var(--primary)/0.12)' }}>
          <Moon className="w-3.5 h-3.5" style={{ color: 'hsl(var(--primary))' }} />
          <span className="text-sm font-semibold text-foreground">{totalSleepovers}</span>
          <span className="text-xs text-muted-foreground">sleepover{totalSleepovers !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Billing details — grouped Apple-settings style */}
      {(() => {
        const org = client.organisation_name;
        const email = client.email;
        const pn = client.participant_number;
        const phone = client.phone;
        const items: { icon: React.ReactNode; label: string; value: string }[] = [];
        if (org) items.push({ icon: <FileText className="w-3.5 h-3.5" />, label: 'Organisation', value: org });
        if (email) items.push({ icon: <Mail className="w-3.5 h-3.5" />, label: 'Email', value: email });
        if (pn) items.push({ icon: <Hash className="w-3.5 h-3.5" />, label: 'NDIS Participant No.', value: pn });
        if (phone) items.push({ icon: <Phone className="w-3.5 h-3.5" />, label: 'Phone', value: phone });
        if (items.length === 0) return null;

        return (
          <div className="card-elevated overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Participant & Billing</p>
            </div>
            <div className="divide-y" style={{ borderColor: 'hsl(var(--border)/0.5)' }}>
              {items.map(item => (
                <div key={item.label} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'hsl(var(--muted)/0.7)', color: 'hsl(var(--muted-foreground))' }}>
                    {item.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
                    <p className="text-xs font-semibold text-foreground truncate">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Custom Rates */}
      {client.use_custom_rates && (
        <div className="card-elevated overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Custom Rates</p>
          </div>
          <div className="px-4 pb-4">
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'Weekday', val: client.rate_weekday, def: DEFAULT_RATES.rate_weekday },
                { label: 'Sat', val: client.rate_saturday, def: DEFAULT_RATES.rate_saturday },
                { label: 'Sun', val: client.rate_sunday, def: DEFAULT_RATES.rate_sunday },
                { label: 'Eve', val: client.rate_evening, def: DEFAULT_RATES.rate_evening },
                { label: 'Sleep Wk', val: client.rate_sleepover_weekday, def: DEFAULT_RATES.rate_sleepover_weekday },
                { label: 'Sleep We', val: client.rate_sleepover_weekend, def: DEFAULT_RATES.rate_sleepover_weekend },
                { label: 'PH', val: client.rate_public_holiday, def: DEFAULT_RATES.rate_public_holiday },
              ].map(r => (
                <span key={r.label} className="text-[10px] font-medium px-2.5 py-1 rounded-lg"
                  style={{
                    background: r.val != null ? 'hsl(var(--primary)/0.08)' : 'hsl(var(--muted)/0.5)',
                    color: r.val != null ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                  }}>
                  {r.label} ${r.val ?? r.def}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {(client.default_start_time || client.default_end_time || client.default_service_note) && (
        <div className="card-elevated overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Shift Defaults</p>
          </div>
          <div className="px-4 pb-4 space-y-2">
            {(client.default_start_time || client.default_end_time) && (
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'hsl(var(--muted)/0.7)' }}>
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <span className="text-xs font-medium text-foreground">
                  {client.default_start_time ? formatTime12h(client.default_start_time) : '—'} – {client.default_end_time ? formatTime12h(client.default_end_time) : '—'}
                </span>
                {client.default_is_sleepover && (
                  <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full"
                    style={{ background: 'hsl(var(--primary)/0.1)', color: 'hsl(var(--primary))' }}>Sleepover</span>
                )}
              </div>
            )}
            {client.default_service_note && (
              <p className="text-xs text-muted-foreground pl-9">{client.default_service_note}</p>
            )}
          </div>
        </div>
      )}

      {/* Recent shifts */}
      {recentShifts.length > 0 && (
        <div className="card-elevated overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Recent Shifts</p>
          </div>
          <div className="divide-y" style={{ borderColor: 'hsl(var(--border)/0.5)' }}>
            {recentShifts.map(s => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">{formatDateLabel(s.date)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatTime12h(s.start_time)} – {formatTime12h(s.end_time)}
                    {s.is_sleepover ? ' · Sleepover' : ''}
                  </p>
                </div>
                <span className="text-xs font-bold money-text shrink-0">{formatCurrency(effectiveGrossPay(s))}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Main ClientsPanel ── */
const ClientsPanel = ({ clients, shifts, loading, onAdd, onUpdate, onDelete, onArchive, onRestore }: ClientsPanelProps) => {
  const [view, setView] = useState<'list' | 'profile' | 'add' | 'edit'>('list');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const selectedClient = clients.find(c => c.id === selectedClientId) ?? null;

  const parseRate = (v: string): number | null => {
    if (!v.trim()) return null;
    const n = parseFloat(v);
    return isFinite(n) && n >= 0 ? n : null;
  };

  const buildClientPayload = (form: ClientForm) => ({
    name: form.name.trim(),
    display_name: form.display_name.trim() || null,
    notes: form.notes.trim() || null,
    active: form.active,
    phone: form.phone.trim() || null,
    service_address: form.service_address.trim() || null,
    billing_address: form.billing_address.trim() || null,
    use_plan_manager: form.use_plan_manager,
    participant_number: form.participant_number.trim() || null,
    organisation_name: form.organisation_name.trim() || null,
    billing_contact: form.billing_contact.trim() || null,
    email: form.email.trim() || null,
    default_service_note: form.default_service_note.trim() || null,
    default_start_time: form.default_start_time || null,
    default_end_time: form.default_end_time || null,
    default_is_sleepover: form.default_is_sleepover,
    invoice_label: form.invoice_label.trim() || null,
    invoice_notes: form.invoice_notes.trim() || null,
    use_custom_rates: form.use_custom_rates,
    rate_weekday: parseRate(form.rate_weekday),
    rate_saturday: parseRate(form.rate_saturday),
    rate_sunday: parseRate(form.rate_sunday),
    rate_evening: parseRate(form.rate_evening),
    rate_sleepover_weekday: parseRate(form.rate_sleepover_weekday),
    rate_sleepover_weekend: parseRate(form.rate_sleepover_weekend),
    rate_public_holiday: parseRate(form.rate_public_holiday),
  });

  const handleAdd = async (form: ClientForm) => {
    const result = await onAdd(buildClientPayload(form));
    if (result) { setSelectedClientId(result.id); setView('profile'); }
  };

  const handleEdit = async (form: ClientForm) => {
    if (!selectedClientId) return;
    await onUpdate(selectedClientId, buildClientPayload(form));
    setView('profile');
  };

  const handleDeleteConfirm = async (id: string) => {
    await onDelete(id);
    setDeleteConfirm(null);
    setView('list');
    setSelectedClientId(null);
  };

  const handleArchive = async (id: string) => {
    if (onArchive) await onArchive(id);
    setDeleteConfirm(null);
    setView('list');
    setSelectedClientId(null);
  };

  const handleRestore = async (id: string) => {
    if (onRestore) await onRestore(id);
  };

  // Separate active vs archived
  const activeClients = clients.filter(c => !isClientArchived(c));
  const archivedClients = clients.filter(c => isClientArchived(c));
  const displayClients = showArchived ? archivedClients : activeClients;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {view === 'add' && (
        <ClientFormSheet title="Add Client" initial={emptyForm()} onSave={handleAdd} onCancel={() => setView('list')} />
      )}
      {view === 'edit' && selectedClient && (
        <ClientFormSheet title="Edit Client" initial={clientToForm(selectedClient)} onSave={handleEdit} onCancel={() => setView('profile')} />
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (() => {
        const dcClient = clients.find(c => c.id === deleteConfirm);
        const linkedShifts = shifts.filter(s => s.client_id === deleteConfirm);
        return (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            style={{ background: 'hsl(var(--foreground)/0.35)', backdropFilter: 'blur(20px) saturate(1.5)', WebkitBackdropFilter: 'blur(20px) saturate(1.5)' }}
          >
            <div className="w-full max-w-sm p-6 space-y-4" style={{ background: 'hsl(var(--card))', borderRadius: 24, boxShadow: '0 20px 60px hsl(var(--foreground)/0.2)' }}>
              <p className="text-base font-bold text-foreground">
                {dcClient && isClientArchived(dcClient) ? 'Permanently delete?' : 'Archive or delete?'}
              </p>
              {linkedShifts.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  This client has <strong>{linkedShifts.length}</strong> linked shift{linkedShifts.length !== 1 ? 's' : ''}.
                  {dcClient && !isClientArchived(dcClient)
                    ? ' Archiving will hide the client and their shifts from active views. Deleting is permanent.'
                    : ' Deleting is permanent and cannot be undone.'}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {dcClient && !isClientArchived(dcClient)
                    ? 'Archive to hide from active views, or delete permanently.'
                    : 'This will permanently remove the client.'}
                </p>
              )}
              <div className="flex flex-col gap-2">
                {dcClient && !isClientArchived(dcClient) && onArchive && (
                  <button onClick={() => handleArchive(deleteConfirm)}
                    className="w-full rounded-2xl text-sm font-semibold flex items-center justify-center gap-2"
                    style={{ minHeight: 48, background: 'hsl(var(--primary)/0.1)', color: 'hsl(var(--primary))' }}>
                    <Archive className="w-4 h-4" /> Archive Client
                  </button>
                )}
                <button onClick={() => handleDeleteConfirm(deleteConfirm)}
                  className="w-full rounded-2xl text-sm font-bold text-white"
                  style={{ minHeight: 48, background: 'hsl(var(--destructive))' }}>
                  <Trash2 className="w-3.5 h-3.5 inline mr-1.5" /> Delete Permanently
                </button>
                <button onClick={() => setDeleteConfirm(null)}
                  className="w-full rounded-2xl text-sm font-semibold"
                  style={{ minHeight: 48, background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Profile view */}
      {view === 'profile' && selectedClient ? (
        <ClientProfile
          client={selectedClient} shifts={shifts}
          onEdit={() => setView('edit')}
          onBack={() => { setView('list'); setSelectedClientId(null); }}
        />
      ) : (
        /* List view */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-foreground">Clients</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {activeClients.length} active{archivedClients.length > 0 ? ` · ${archivedClients.length} archived` : ''}
              </p>
            </div>
            <button
              onClick={() => setView('add')}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold active:scale-95 transition-transform"
              style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', boxShadow: '0 4px 16px hsl(var(--primary)/0.3)' }}
            >
              <Plus className="w-4 h-4" /> Add Client
            </button>
          </div>

          {/* Active / Archived toggle */}
          {archivedClients.length > 0 && (
            <div className="flex gap-1.5">
              <button onClick={() => setShowArchived(false)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all active:scale-95"
                style={{
                  background: !showArchived ? 'hsl(var(--primary)/0.12)' : 'transparent',
                  color: !showArchived ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                }}>
                Active ({activeClients.length})
              </button>
              <button onClick={() => setShowArchived(true)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all active:scale-95 flex items-center gap-1"
                style={{
                  background: showArchived ? 'hsl(var(--primary)/0.12)' : 'transparent',
                  color: showArchived ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                }}>
                <Archive className="w-3 h-3" /> Archived ({archivedClients.length})
              </button>
            </div>
          )}

          {displayClients.length === 0 && !showArchived ? (
            <div className="card-elevated p-10 text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center" style={{ background: 'hsl(var(--primary)/0.08)' }}>
                <User className="w-8 h-8" style={{ color: 'hsl(var(--primary)/0.4)' }} />
              </div>
              <p className="text-sm font-semibold text-foreground">No clients yet</p>
              <p className="text-xs text-muted-foreground max-w-[240px] mx-auto">Add a client to assign them to shifts and generate targeted invoices.</p>
              <button onClick={() => setView('add')}
                className="mt-2 px-5 py-2.5 rounded-xl text-sm font-bold active:scale-95 transition-transform"
                style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                Add your first client
              </button>
            </div>
          ) : displayClients.length === 0 && showArchived ? (
            <div className="card-elevated p-8 text-center">
              <Archive className="w-6 h-6 mx-auto mb-2" style={{ color: 'hsl(var(--muted-foreground)/0.4)' }} />
              <p className="text-sm text-muted-foreground">No archived clients</p>
            </div>
          ) : (
            <div className="space-y-2">
              {displayClients.map(client => {
                const archived = isClientArchived(client);
                const clientShifts = shifts.filter(s => s.client_id === client.id);
                const earned = clientShifts.reduce((s, sh) => s + effectiveGrossPay(sh), 0);
                return (
                  <div
                    key={client.id}
                    className="card-elevated cursor-pointer active:scale-[0.99] transition-transform duration-100"
                    style={{ opacity: archived ? 0.7 : 1 }}
                    onClick={() => { setSelectedClientId(client.id); setView('profile'); }}
                  >
                    <div className="p-4 flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
                        style={{ background: archived ? 'hsl(var(--muted)/0.6)' : 'hsl(var(--primary)/0.1)', color: archived ? 'hsl(var(--muted-foreground))' : 'hsl(var(--primary))' }}>
                        {client.name[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{client.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-[10px] text-muted-foreground">{clientShifts.length} shift{clientShifts.length !== 1 ? 's' : ''}</p>
                          {earned > 0 && <span className="text-[10px] font-semibold money-text">{formatCurrency(earned)}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {archived ? (
                          <>
                            <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full"
                              style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>Archived</span>
                            {onRestore && (
                              <button
                                onClick={e => { e.stopPropagation(); handleRestore(client.id); }}
                                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors active:scale-90"
                                style={{ color: 'hsl(var(--primary))' }}>
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        ) : (
                          !client.active && (
                            <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full"
                              style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>Inactive</span>
                          )
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); setDeleteConfirm(client.id); }}
                          className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                          style={{ color: 'hsl(var(--muted-foreground))' }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClientsPanel;
