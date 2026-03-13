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

  const Toggle = ({ label, fieldKey, icon }: { label: string; fieldKey: 'default_is_sleepover'; icon: React.ReactNode }) => (
    <button
      type="button"
      onClick={() => set(fieldKey, !form[fieldKey])}
      className="w-full flex items-center gap-3 rounded-2xl border transition-all duration-200 px-4"
      style={{
        minHeight: 44,
        borderColor: form[fieldKey] ? 'hsl(var(--primary)/0.5)' : 'hsl(var(--border))',
        background: form[fieldKey] ? 'hsl(var(--primary)/0.08)' : 'transparent',
      }}
    >
      <span style={{ color: form[fieldKey] ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}>{icon}</span>
      <span className="text-sm font-semibold flex-1 text-left"
        style={{ color: form[fieldKey] ? 'hsl(var(--primary))' : 'hsl(var(--foreground))' }}>
        {label}
      </span>
      <span className="relative shrink-0 rounded-full transition-all duration-200"
        style={{ width: 42, height: 24, background: form[fieldKey] ? 'hsl(var(--primary))' : 'hsl(var(--muted))' }}>
        <span className="absolute top-[3px] rounded-full bg-white shadow-sm transition-all duration-200"
          style={{ width: 18, height: 18, left: form[fieldKey] ? 21 : 3 }} />
      </span>
    </button>
  );

  const Field = ({
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
            <Field label="Full Name *" value={form.name} onChange={v => set('name', v)} placeholder="e.g. Alex Johnson" />
            <Field label="Display / Short Name" value={form.display_name} onChange={v => set('display_name', v)} placeholder="e.g. Alex" hint="Used on shift cards and invoices when shorter name is preferred" />
            <Field label="Phone" value={form.phone} onChange={v => set('phone', v)} placeholder="+61 4XX XXX XXX" type="tel" />
            <Field label="Address / Location" value={form.address} onChange={v => set('address', v)} placeholder="Suburb or full address" />
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
            <Toggle label="Default Sleepover" fieldKey="default_is_sleepover" icon={<Moon className="w-4 h-4" />} />
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
            <Field label="Participant / Reference Number" value={form.participant_number} onChange={v => set('participant_number', v)} placeholder="NDIS participant number" />
            <Field label="Invoice Label" value={form.invoice_label} onChange={v => set('invoice_label', v)} placeholder="Name to use on invoices" hint="Override for how this client appears on invoices" />
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

  const labelName = client.invoice_label || client.display_name || client.name;

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
                <span className="glass-chip text-[10px] py-0.5 px-2 gap-1"><Moon className="w-2.5 h-2.5" /> Sleepover</span>
              )}
            </div>
          )}
          {client.default_service_note && (
            <p className="text-xs text-muted-foreground">{client.default_service_note}</p>
          )}
        </div>
      )}

      {/* Invoice info */}
      {(client.invoice_label || client.participant_number || client.invoice_notes) && (
        <div className="glass-card p-4 space-y-2">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Invoice Details</p>
          {labelName !== client.name && (
            <div className="flex gap-2 items-start">
              <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <span className="text-xs text-foreground">{labelName}</span>
            </div>
          )}
          {client.invoice_notes && (
            <p className="text-xs text-muted-foreground">{client.invoice_notes}</p>
          )}
        </div>
      )}

      {/* Recent shifts */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
          Recent Shifts ({clientShifts.length} total)
        </p>
        {recentShifts.length === 0 ? (
          <div className="glass-card p-5 text-center">
            <p className="text-xs text-muted-foreground">No shifts logged for this client yet.</p>
          </div>
        ) : (
          recentShifts.map(s => (
            <div key={s.id} className="glass-card p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">{formatDateLabel(s.date)}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatTime12h(s.start_time)} – {formatTime12h(s.end_time)}
                  {s.is_sleepover && ' · Sleepover'}
                  {s.is_public_holiday && ' · Public Holiday'}
                </p>
              </div>
              <p className="text-sm font-bold shrink-0" style={{ color: 'hsl(var(--money-green))' }}>
                {formatCurrency(effectiveGrossPay(s))}
              </p>
            </div>
          ))
        )}
        {clientShifts.length > 5 && (
          <p className="text-[10px] text-muted-foreground text-center">
            + {clientShifts.length - 5} more shifts
          </p>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════
   Main ClientsPanel
═══════════════════════════════════════ */
const ClientsPanel = ({ clients, shifts, loading, onAdd, onUpdate, onDelete }: ClientsPanelProps) => {
  const [showAdd, setShowAdd] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const activeClients = clients.filter(c => c.active);
  const inactiveClients = clients.filter(c => !c.active);
  const visibleClients = showInactive ? clients : activeClients;

  const handleAdd = async (form: ClientForm) => {
    await onAdd({
      name: form.name.trim(),
      display_name: form.display_name.trim() || null,
      notes: form.notes.trim() || null,
      active: true,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      participant_number: form.participant_number.trim() || null,
      default_service_note: form.default_service_note.trim() || null,
      default_start_time: form.default_start_time || null,
      default_end_time: form.default_end_time || null,
      default_is_sleepover: form.default_is_sleepover,
      invoice_label: form.invoice_label.trim() || null,
      invoice_notes: form.invoice_notes.trim() || null,
    });
    setShowAdd(false);
  };

  const handleEdit = async (form: ClientForm) => {
    if (!editingClient) return;
    await onUpdate(editingClient.id, {
      name: form.name.trim(),
      display_name: form.display_name.trim() || null,
      notes: form.notes.trim() || null,
      active: form.active,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      participant_number: form.participant_number.trim() || null,
      default_service_note: form.default_service_note.trim() || null,
      default_start_time: form.default_start_time || null,
      default_end_time: form.default_end_time || null,
      default_is_sleepover: form.default_is_sleepover,
      invoice_label: form.invoice_label.trim() || null,
      invoice_notes: form.invoice_notes.trim() || null,
    });
    setEditingClient(null);
    // Refresh viewing client data if we edited the currently viewed one
    if (viewingClient?.id === editingClient.id) {
      setViewingClient(null); // Will re-open fresh from list
    }
  };

  // If viewing a client profile
  if (viewingClient) {
    // Re-find from live clients list in case it was edited
    const liveClient = clients.find(c => c.id === viewingClient.id) ?? viewingClient;
    return (
      <>
        <ClientProfile
          client={liveClient}
          shifts={shifts}
          onEdit={() => setEditingClient(liveClient)}
          onBack={() => setViewingClient(null)}
        />
        {editingClient && (
          <ClientFormSheet
            title="Edit Client"
            initial={clientToForm(editingClient)}
            onSave={handleEdit}
            onCancel={() => setEditingClient(null)}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Clients</h2>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-all min-h-[40px]"
          style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', boxShadow: '0 4px 16px hsl(var(--primary)/0.3)' }}
        >
          <Plus className="w-4 h-4" /> Add Client
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-7 h-7 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      ) : clients.length === 0 ? (
        <div className="glass-card p-10 text-center space-y-3">
          <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center"
            style={{ background: 'hsl(var(--primary)/0.1)' }}>
            <User className="w-7 h-7" style={{ color: 'hsl(var(--primary))' }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">No clients yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[220px] mx-auto">
              Add your first client to start linking shifts and generating client invoices.
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="text-sm font-semibold"
            style={{ color: 'hsl(var(--primary))' }}
          >
            Add first client →
          </button>
        </div>
      ) : (
        <>
          {/* Client list */}
          <div className="space-y-2">
            {visibleClients.map(client => {
              const clientShifts = shifts.filter(s => s.client_id === client.id);
              const totalEarnings = clientShifts.reduce((s, sh) => s + effectiveGrossPay(sh), 0);
              return (
                <div key={client.id} className="glass-card p-4">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                      style={{ background: 'hsl(var(--primary)/0.12)', color: 'hsl(var(--primary))' }}>
                      {client.name[0].toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">{client.name}</span>
                        {!client.active && (
                          <span className="text-[10px] text-muted-foreground glass-chip py-0.5 px-2">Inactive</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {clientShifts.length} shift{clientShifts.length !== 1 ? 's' : ''}
                        </span>
                        {totalEarnings > 0 && (
                          <span className="text-xs font-semibold" style={{ color: 'hsl(var(--money-green))' }}>
                            {formatCurrency(totalEarnings)}
                          </span>
                        )}
                        {client.participant_number && (
                          <span className="text-[10px] text-muted-foreground hidden sm:inline">
                            #{client.participant_number}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setViewingClient(client)}
                        className="glass-chip py-1.5 px-3 text-xs gap-1"
                      >
                        View <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Quick actions row */}
                  <div className="flex gap-2 mt-3 pt-2.5 border-t border-border">
                    <button
                      onClick={() => setEditingClient(client)}
                      className="glass-chip text-xs py-1.5 flex-1 justify-center gap-1.5"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                    <button
                      onClick={() => onUpdate(client.id, { active: !client.active })}
                      className="glass-chip text-xs py-1.5 flex-1 justify-center"
                    >
                      {client.active ? 'Mark Inactive' : 'Mark Active'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(client.id)}
                      className="glass-chip text-xs py-1.5 px-3 justify-center"
                      style={{ color: 'hsl(var(--destructive))' }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Show/hide inactive */}
          {inactiveClients.length > 0 && (
            <button
              onClick={() => setShowInactive(p => !p)}
              className="w-full text-xs text-muted-foreground py-2 font-semibold"
            >
              {showInactive
                ? `Hide ${inactiveClients.length} inactive`
                : `Show ${inactiveClients.length} inactive client${inactiveClients.length !== 1 ? 's' : ''}`}
            </button>
          )}
        </>
      )}

      {/* Add form */}
      {showAdd && (
        <ClientFormSheet
          title="Add Client"
          initial={emptyForm()}
          onSave={handleAdd}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* Edit form */}
      {editingClient && !viewingClient && (
        <ClientFormSheet
          title="Edit Client"
          initial={clientToForm(editingClient)}
          onSave={handleEdit}
          onCancel={() => setEditingClient(null)}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm p-4">
          <div className="glass-card p-6 w-full max-w-sm space-y-4 text-center">
            <p className="font-semibold text-foreground">Remove this client?</p>
            <p className="text-sm text-muted-foreground">Their shifts won't be deleted.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 glass-chip min-h-[44px] justify-center text-sm font-semibold">Cancel</button>
              <button
                onClick={async () => { await onDelete(confirmDelete); setConfirmDelete(null); }}
                className="flex-1 min-h-[44px] rounded-2xl text-sm font-bold"
                style={{ background: 'hsl(var(--destructive))', color: 'white' }}
              >Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientsPanel;
