import { useState } from 'react';
import { Plus, Pencil, Trash2, X, Clock, Moon, Sun, Sunset, User } from 'lucide-react';
import type { ShiftTemplate, NewShiftTemplate } from '@/hooks/useShiftTemplates';
import type { Client } from '@/hooks/useClients';

interface Props {
  templates: ShiftTemplate[];
  clients: Client[];
  onAdd: (t: NewShiftTemplate) => Promise<unknown>;
  onUpdate: (id: string, t: Partial<NewShiftTemplate>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const SHIFT_TYPES = [
  { value: 'day', label: 'Day', icon: <Sun className="w-3.5 h-3.5" /> },
  { value: 'evening', label: 'Evening', icon: <Sunset className="w-3.5 h-3.5" /> },
  { value: 'sleepover', label: 'Sleepover', icon: <Moon className="w-3.5 h-3.5" /> },
];

function formatTime12(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const ShiftTemplatesManager = ({ templates, clients, onAdd, onUpdate, onDelete }: Props) => {
  const [editing, setEditing] = useState<ShiftTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [shiftType, setShiftType] = useState('day');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [clientId, setClientId] = useState('');
  const [notes, setNotes] = useState('');
  const [isSleepover, setIsSleepover] = useState(false);

  const resetForm = () => {
    setName(''); setShiftType('day'); setStartTime('09:00'); setEndTime('17:00');
    setClientId(''); setNotes(''); setIsSleepover(false);
  };

  const openCreate = () => {
    resetForm();
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (t: ShiftTemplate) => {
    setName(t.name);
    setShiftType(t.shift_type);
    setStartTime(t.start_time.slice(0, 5));
    setEndTime(t.end_time.slice(0, 5));
    setClientId(t.client_id ?? '');
    setNotes(t.notes ?? '');
    setIsSleepover(t.is_sleepover);
    setEditing(t);
    setCreating(true);
  };

  const handleTypeChange = (type: string) => {
    setShiftType(type);
    if (type === 'sleepover') {
      setIsSleepover(true);
      setStartTime('22:00');
      setEndTime('06:00');
    } else if (type === 'evening') {
      setIsSleepover(false);
      setStartTime('15:00');
      setEndTime('22:00');
    } else {
      setIsSleepover(false);
      setStartTime('09:00');
      setEndTime('17:00');
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload: NewShiftTemplate = {
        name: name.trim(),
        shift_type: shiftType,
        start_time: startTime,
        end_time: endTime,
        client_id: clientId || null,
        notes: notes.trim() || null,
        is_sleepover: isSleepover,
      };
      if (editing) {
        await onUpdate(editing.id, payload);
      } else {
        await onAdd(payload);
      }
      setCreating(false);
      resetForm();
      setEditing(null);
    } catch (e) {
      console.error('Template save error:', e);
    } finally {
      setSaving(false);
    }
  };

  const activeClients = clients.filter(c => c.active);

  // Form Modal
  if (creating) {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center"
        style={{
          paddingLeft: 16, paddingRight: 16,
          paddingTop: 'max(16px, env(safe-area-inset-top, 16px))',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
          background: 'hsl(var(--foreground)/0.4)',
          backdropFilter: 'blur(24px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
        }}
        onClick={() => { setCreating(false); setEditing(null); }}
      >
        <div
          className="flex flex-col"
          style={{
            width: 'calc(100vw - 32px)', maxWidth: 420,
            maxHeight: 'min(90dvh, 680px)',
            background: 'hsl(var(--card))',
            borderRadius: 24,
            boxShadow: '0 2px 8px hsl(var(--foreground)/0.08), 0 20px 60px hsl(var(--foreground)/0.22), 0 0 0 0.5px hsl(var(--border))',
            overflow: 'hidden',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between shrink-0"
            style={{ borderBottom: '0.5px solid hsl(var(--border))', padding: '14px 20px' }}>
            <h2 className="text-base font-bold text-foreground">
              {editing ? 'Edit Template' : 'New Template'}
            </h2>
            <button type="button" onClick={() => { setCreating(false); setEditing(null); }}
              className="w-8 h-8 flex items-center justify-center rounded-full"
              style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
            style={{ padding: '16px 20px 4px' }}>
            <div className="space-y-3">
              {/* Name */}
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Template Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Morning shift with John"
                  className="w-full rounded-2xl border px-4 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground/50"
                  style={{
                    borderColor: 'hsl(var(--border))',
                    background: 'hsl(var(--muted)/0.4)',
                    minHeight: 48, fontSize: 16,
                  }}
                />
              </div>

              {/* Shift Type */}
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Shift Type
                </label>
                <div className="flex rounded-xl p-1 gap-1" style={{ background: 'hsl(var(--muted))' }}>
                  {SHIFT_TYPES.map(st => (
                    <button
                      key={st.value}
                      type="button"
                      onClick={() => handleTypeChange(st.value)}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-[9px] py-2.5 transition-all duration-200 text-[13px] font-semibold"
                      style={{
                        background: shiftType === st.value ? 'hsl(var(--card))' : 'transparent',
                        color: shiftType === st.value ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                        boxShadow: shiftType === st.value ? '0 1px 4px hsl(0 0% 0% / 0.12)' : 'none',
                      }}
                    >
                      {st.icon} {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Times */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Start</label>
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                    className="w-full rounded-2xl border px-4 py-3 text-sm font-medium text-foreground"
                    style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--muted)/0.4)', minHeight: 48, fontSize: 16, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">End</label>
                  <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                    className="w-full rounded-2xl border px-4 py-3 text-sm font-medium text-foreground"
                    style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--muted)/0.4)', minHeight: 48, fontSize: 16, boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Client */}
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Client</label>
                <select value={clientId} onChange={e => setClientId(e.target.value)}
                  className="w-full rounded-2xl border px-4 py-3 text-sm font-medium text-foreground appearance-none"
                  style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--muted)/0.4)', minHeight: 48, fontSize: 16 }}>
                  <option value="">No client</option>
                  {activeClients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Notes <span className="font-normal opacity-60">(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Leave blank for smart auto-notes"
                  rows={2}
                  className="w-full rounded-2xl border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none"
                  style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--muted)/0.4)', fontSize: 16 }}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: '12px 20px 20px', borderTop: '0.5px solid hsl(var(--border))' }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="w-full rounded-2xl text-sm font-bold transition-all duration-200 active:scale-[0.97] disabled:opacity-40"
              style={{
                minHeight: 50,
                background: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
              }}
            >
              {saving ? 'Saving…' : editing ? 'Update Template' : 'Create Template'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Template List
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-1 mb-1">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
          Shift Templates
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-1 text-[12px] font-semibold transition-colors active:opacity-70"
          style={{ color: 'hsl(var(--primary))' }}
        >
          <Plus className="w-3.5 h-3.5" /> New
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', boxShadow: 'var(--card-shadow-sm)' }}>
          <div className="flex flex-col items-center py-8 px-4 text-center">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3"
              style={{ background: 'hsl(var(--muted))' }}>
              <Clock className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">No templates yet</p>
            <p className="text-xs text-muted-foreground mb-4">Create reusable templates for quick shift entry</p>
            <button type="button" onClick={openCreate}
              className="rounded-xl px-5 py-2.5 text-sm font-semibold transition-all active:scale-[0.97]"
              style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
              Create Template
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', boxShadow: 'var(--card-shadow-sm)' }}>
          {templates.map((t, i) => {
            const client = clients.find(c => c.id === t.client_id);
            const typeInfo = SHIFT_TYPES.find(s => s.value === t.shift_type) ?? SHIFT_TYPES[0];
            return (
              <div key={t.id}>
                {i > 0 && <div className="ml-4 h-px" style={{ background: 'hsl(var(--divider, var(--border)))' }} />}
                <div className="flex items-center gap-3 px-4" style={{ minHeight: 56 }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'hsl(var(--primary)/0.1)', color: 'hsl(var(--primary))' }}>
                    {typeInfo.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-foreground truncate">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatTime12(t.start_time.slice(0, 5))} – {formatTime12(t.end_time.slice(0, 5))}
                      {client ? ` · ${client.name}` : ''}
                    </p>
                  </div>
                  <button type="button" onClick={() => openEdit(t)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors active:bg-accent/30"
                    style={{ color: 'hsl(var(--muted-foreground))' }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => onDelete(t.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors active:bg-accent/30"
                    style={{ color: 'hsl(var(--destructive))' }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ShiftTemplatesManager;
