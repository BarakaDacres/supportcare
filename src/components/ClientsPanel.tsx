import { useState, useMemo } from 'react';
import {
  Plus, Pencil, Trash2, User, Check, X, ChevronRight, ChevronLeft,
  Clock, FileText, Hash, Phone, MapPin, Moon, DollarSign, BarChart2,
} from 'lucide-react';
import type { Client } from '@/hooks/useClients';
import type { Shift } from '@/hooks/useShifts';
import { effectiveGrossPay } from '@/hooks/useShifts';
import { formatCurrency } from '@/lib/formatUtils';
import { formatTime12h } from '@/lib/shiftCalculator';
import { MONTH_NAMES } from '@/lib/dateUtils';

interface ClientsPanelProps {
  clients: Client[];
  shifts: Shift[];
  loading: boolean;
  onAdd: (fields: Partial<Omit<Client, 'id' | 'user_id' | 'created_at' | 'updated_at'>> & { name: string }) => Promise<Client | null>;
  onUpdate: (id: string, updates: Partial<Omit<Client, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

/* ── Empty client form state ── */
const emptyForm = () => ({
  name: '',
  display_name: '',
  notes: '',
  active: true,
  phone: '',
  address: '',
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
});

type ClientForm = ReturnType<typeof emptyForm>;

function clientToForm(c: Client): ClientForm {
  return {
    name: c.name,
    display_name: c.display_name ?? '',
    notes: c.notes ?? '',
    active: c.active,
    phone: c.phone ?? '',
    address: c.address ?? '',
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

/* ══════════════════════════════════════════════════
   HOISTED sub-components — defined OUTSIDE the form
   so React never remounts them between renders,
   which is what was causing focus-loss after 1 char
════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════
   ClientForm component
═══════════════════════════════════════ */
const ClientFormSheet = ({
  initial,
  title,
  onSave,
  onCancel,
}: {
  initial: ClientForm;
  title: string;
  onSave: (f: ClientForm) => Promise<void>;
  onCancel: () => void;
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
    try {
      await onSave(form);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'hsl(var(--foreground)/0.45)', backdropFilter: 'blur(4px)', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full flex flex-col"
        style={{
          maxWidth: 440,
          width: '100%',
          maxHeight: 'min(92dvh, 700px)',
          background: 'hsl(var(--card))',
          borderRadius: 24,
          boxShadow: '0 2px 8px hsl(var(--foreground)/0.08), 0 20px 60px hsl(var(--foreground)/0.22), 0 0 0 0.5px hsl(var(--border))',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between shrink-0"
          style={{ borderBottom: '0.5px solid hsl(var(--border))', padding: '16px 20px' }}>
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          <button type="button" onClick={onCancel}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
            style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain space-y-5"
          style={{ padding: '20px 20px', boxSizing: 'border-box' }}>

          {/* ── Basic Details ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Basic Details</p>
            <FormField label="Full Name *" value={form.name} onChange={v => set('name', v)} placeholder="e.g. Alex Johnson" />
            <FormField label="Display / Short Name" value={form.display_name} onChange={v => set('display_name', v)} placeholder="e.g. Alex" hint="Used on shift cards and invoices when shorter name is preferred" />
            <FormField label="Phone" value={form.phone} onChange={v => set('phone', v)} placeholder="+61 4XX XXX XXX" type="tel" />
            <FormField label="Address / Location" value={form.address} onChange={v => set('address', v)} placeholder="Suburb or full address" />
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Any notes about this client…"
                rows={2}
                className="glass-input w-full text-foreground resize-none"
                style={{ boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* ── Shift Defaults ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Shift Defaults</p>
            <p className="text-[10px] text-muted-foreground -mt-1">Pre-fill shift form when this client is selected.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 min-w-0">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Default Start
                </label>
                <input type="time" value={form.default_start_time} onChange={e => set('default_start_time', e.target.value)}
                  className="glass-input w-full text-foreground block" style={{ minHeight: 44, boxSizing: 'border-box' }} />
              </div>
              <div className="space-y-1.5 min-w-0">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Default End
                </label>
                <input type="time" value={form.default_end_time} onChange={e => set('default_end_time', e.target.value)}
                  className="glass-input w-full text-foreground block" style={{ minHeight: 44, boxSizing: 'border-box' }} />
              </div>
            </div>
            <FormToggle
              label="Default Sleepover"
              checked={form.default_is_sleepover}
              onChange={v => set('default_is_sleepover', v)}
              icon={<Moon className="w-4 h-4" />}
            />
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <FileText className="w-3 h-3" /> Default Service Note
              </label>
              <textarea
                value={form.default_service_note}
                onChange={e => set('default_service_note', e.target.value)}
                placeholder="e.g. Assistance with Self-Care Activities"
                rows={2}
                className="glass-input w-full text-foreground resize-none"
                style={{ boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* ── Billing Defaults ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Billing Details</p>
            <FormField label="Organisation / NDIS Provider" value={form.organisation_name} onChange={v => set('organisation_name', v)} placeholder="e.g. Sunrise Support Services" hint="Appears as the organisation on invoices (Bill To)" />
            <FormField label="Billing Contact" value={form.billing_contact} onChange={v => set('billing_contact', v)} placeholder="e.g. Jane Smith" />
            <FormField label="Participant / Reference Number" value={form.participant_number} onChange={v => set('participant_number', v)} placeholder="NDIS participant number" />
            <FormField label="Invoice Label" value={form.invoice_label} onChange={v => set('invoice_label', v)} placeholder="Name to use on invoices" hint="Override for how this client appears on invoices" />
            <FormField label="Email" value={form.email} onChange={v => set('email', v)} placeholder="billing@email.com" type="email" />
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Invoice Notes for this Client</label>
              <textarea
                value={form.invoice_notes}
                onChange={e => set('invoice_notes', e.target.value)}
                placeholder="Any client-specific invoice notes…"
                rows={2}
                className="glass-input w-full text-foreground resize-none"
                style={{ boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <div className="h-1" />
        </div>

        {/* Footer */}
        <div className="shrink-0 space-y-2" style={{ borderTop: '0.5px solid hsl(var(--border))', padding: '12px 20px 20px', boxSizing: 'border-box' }}>
          {saveError && (
            <p className="text-xs text-destructive text-center px-2">{saveError}</p>
          )}
          <div className="flex gap-2.5">
            <button type="button" onClick={onCancel}
              className="flex-1 rounded-2xl text-sm font-semibold transition-colors"
              style={{ minHeight: 48, background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !form.name.trim()}
              className="flex-1 rounded-2xl text-sm font-bold transition-all duration-200 disabled:opacity-50"
              style={{ minHeight: 48, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', boxShadow: saving ? 'none' : '0 4px 16px hsl(var(--primary)/0.3)' }}>
              {saving ? 'Saving…' : <><Check className="w-4 h-4 inline mr-1" /> Save Client</>}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

/* ═══════════════════════════════════════
   ClientProfile component
═══════════════════════════════════════ */
const ClientProfile = ({
  client,
  shifts,
  onEdit,
  onBack,
}: {
  client: Client;
  shifts: Shift[];
  onEdit: () => void;
  onBack: () => void;
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

      {/* Client header */}
      <div className="glass-card p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
              style={{ background: 'hsl(var(--primary)/0.12)', color: 'hsl(var(--primary))' }}>
              {client.name[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-foreground">{client.name}</h2>
              {client.display_name && <p className="text-xs text-muted-foreground">{client.display_name}</p>}
              <span className={`inline-flex items-center gap-1 mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${client.active ? 'text-emerald-600' : 'text-muted-foreground'}`}
                style={{ background: client.active ? 'hsl(142 76% 36%/0.1)' : 'hsl(var(--muted))' }}>
                {client.active ? '● Active' : '○ Inactive'}
              </span>
            </div>
          </div>
          <button onClick={onEdit}
            className="glass-chip py-2 px-3 text-xs shrink-0 gap-1.5">
            <Pencil className="w-3 h-3" /> Edit
          </button>
        </div>

      {/* Detail chips */}
        <div className="flex flex-wrap gap-2">
          {client.participant_number && (
            <span className="glass-chip text-xs gap-1.5"><Hash className="w-3 h-3" /> {client.participant_number}</span>
          )}
          {client.phone && (
            <span className="glass-chip text-xs gap-1.5"><Phone className="w-3 h-3" /> {client.phone}</span>
          )}
          {client.address && (
            <span className="glass-chip text-xs gap-1.5"><MapPin className="w-3 h-3" /> {client.address}</span>
          )}
        </div>

        {client.notes && (
          <p className="text-xs text-muted-foreground border-t border-border pt-2.5">{client.notes}</p>
        )}
      </div>

      {/* Billing / participant details */}
      {(() => {
        const org     = client.organisation_name;
        const contact = client.billing_contact;
        const email   = client.email;
        const pn      = client.participant_number;
        if (!org && !contact && !email && !pn && !client.phone) return null;
        return (
          <div className="glass-card p-4 space-y-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Participant &amp; Billing</p>
            {org && (
              <div className="flex items-start gap-2">
                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Organisation</p>
                  <p className="text-xs font-semibold text-foreground">{org}</p>
                </div>
              </div>
            )}
            {contact && (
              <div className="flex items-start gap-2">
                <User className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Billing Contact</p>
                  <p className="text-xs font-semibold text-foreground">{contact}</p>
                </div>
              </div>
            )}
            {email && (
              <div className="flex items-start gap-2">
                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Email</p>
                  <p className="text-xs font-semibold text-foreground">{email}</p>
                </div>
              </div>
            )}
            {pn && (
              <div className="flex items-start gap-2">
                <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">NDIS Participant No.</p>
                  <p className="text-xs font-semibold text-foreground">{pn}</p>
                </div>
              </div>
            )}
            {client.phone && (
              <div className="flex items-start gap-2">
                <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Phone</p>
                  <p className="text-xs font-semibold text-foreground">{client.phone}</p>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Total Earned', value: formatCurrency(totalEarnings), icon: <DollarSign className="w-4 h-4" /> },
          { label: 'Hours', value: `${totalHours.toFixed(0)}h`, icon: <Clock className="w-4 h-4" /> },
          { label: 'Shifts', value: String(clientShifts.length), icon: <BarChart2 className="w-4 h-4" /> },
        ].map(s => (
          <div key={s.label} className="glass-card p-3 space-y-1 text-center">
            <div className="flex justify-center" style={{ color: 'hsl(var(--primary))' }}>{s.icon}</div>
            <p className="text-base font-bold text-foreground">{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {totalSleepovers > 0 && (
        <div className="glass-chip w-full justify-center gap-2 py-2.5">
          <Moon className="w-3.5 h-3.5 text-primary" />
          <span className="text-sm font-semibold text-foreground">{totalSleepovers}</span>
          <span className="text-xs text-muted-foreground">sleepover{totalSleepovers !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Shift defaults summary */}
      {(client.default_start_time || client.default_end_time || client.default_service_note) && (
        <div className="glass-card p-4 space-y-2">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Shift Defaults</p>
          {(client.default_start_time || client.default_end_time) && (
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-foreground">
                {client.default_start_time ? formatTime12h(client.default_start_time) : '—'}
                {' – '}
                {client.default_end_time ? formatTime12h(client.default_end_time) : '—'}
              </span>
              {client.default_is_sleepover && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
                  style={{ background: '#2563EB' }}>Sleepover</span>
              )}
            </div>
          )}
          {client.default_service_note && (
            <p className="text-xs text-muted-foreground">{client.default_service_note}</p>
          )}
        </div>
      )}

      {/* Recent shifts */}
      {recentShifts.length > 0 && (
        <div className="glass-card p-4 space-y-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Recent Shifts</p>
          {recentShifts.map(s => (
            <div key={s.id} className="flex items-center justify-between gap-3 py-2 border-t border-border first:border-0 first:pt-0">
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
      )}
    </div>
  );
};

/* ═══════════════════════════════════════
   Main ClientsPanel
═══════════════════════════════════════ */
const ClientsPanel = ({ clients, shifts, loading, onAdd, onUpdate, onDelete }: ClientsPanelProps) => {
  const [view, setView] = useState<'list' | 'profile' | 'add' | 'edit'>('list');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const selectedClient = clients.find(c => c.id === selectedClientId) ?? null;

  const buildClientPayload = (form: ClientForm) => ({
    name: form.name.trim(),
    display_name: form.display_name.trim() || null,
    notes: form.notes.trim() || null,
    active: form.active,
    phone: form.phone.trim() || null,
    address: form.address.trim() || null,
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
  });

  const handleAdd = async (form: ClientForm) => {
    const result = await onAdd(buildClientPayload(form));
    if (result) {
      setSelectedClientId(result.id);
      setView('profile');
    }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add form modal */}
      {view === 'add' && (
        <ClientFormSheet
          title="Add Client"
          initial={emptyForm()}
          onSave={handleAdd}
          onCancel={() => setView('list')}
        />
      )}

      {/* Edit form modal */}
      {view === 'edit' && selectedClient && (
        <ClientFormSheet
          title="Edit Client"
          initial={clientToForm(selectedClient)}
          onSave={handleEdit}
          onCancel={() => setView('profile')}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: 'hsl(var(--foreground)/0.5)', backdropFilter: 'blur(4px)' }}
        >
          <div className="w-full max-w-sm glass-card p-6 space-y-4">
            <p className="text-base font-bold text-foreground">Delete client?</p>
            <p className="text-sm text-muted-foreground">
              This removes the client record. Their assigned shifts won't be deleted.
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 rounded-2xl text-sm font-semibold"
                style={{ minHeight: 48, background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
                Cancel
              </button>
              <button
                onClick={() => handleDeleteConfirm(deleteConfirm)}
                className="flex-1 rounded-2xl text-sm font-bold text-white"
                style={{ minHeight: 48, background: 'hsl(var(--destructive))' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile view */}
      {view === 'profile' && selectedClient ? (
        <ClientProfile
          client={selectedClient}
          shifts={shifts}
          onEdit={() => setView('edit')}
          onBack={() => { setView('list'); setSelectedClientId(null); }}
        />
      ) : (
        /* List view */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">Clients</h2>
            <button
              onClick={() => setView('add')}
              className="flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-bold transition-all duration-200"
              style={{
                background: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
                boxShadow: '0 4px 16px hsl(var(--primary)/0.3)',
              }}
            >
              <Plus className="w-4 h-4" /> Add Client
            </button>
          </div>

          {clients.length === 0 ? (
            <div className="glass-card p-10 text-center space-y-3">
              <User className="w-10 h-10 mx-auto text-muted-foreground opacity-40" />
              <p className="text-sm font-semibold text-foreground">No clients yet</p>
              <p className="text-xs text-muted-foreground">Add a client to assign them to shifts and generate targeted invoices.</p>
              <button
                onClick={() => setView('add')}
                className="mt-2 px-5 py-2.5 rounded-2xl text-sm font-bold"
                style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                Add your first client
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {clients.map(client => {
                const clientShifts = shifts.filter(s => s.client_id === client.id);
                const earned = clientShifts.reduce((s, sh) => s + effectiveGrossPay(sh), 0);
                return (
                  <div
                    key={client.id}
                    className="glass-card p-4 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-transform duration-100"
                    onClick={() => { setSelectedClientId(client.id); setView('profile'); }}
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                      style={{ background: 'hsl(var(--primary)/0.12)', color: 'hsl(var(--primary))' }}>
                      {client.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{client.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {clientShifts.length} shift{clientShifts.length !== 1 ? 's' : ''}
                        {earned > 0 ? ` · ${formatCurrency(earned)}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!client.active && (
                        <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
                          Inactive
                        </span>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteConfirm(client.id); }}
                        className="w-7 h-7 flex items-center justify-center rounded-full transition-colors hover:bg-destructive/10"
                        style={{ color: 'hsl(var(--muted-foreground))' }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
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
