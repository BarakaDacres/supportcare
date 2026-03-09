import { useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, User, Check, X } from 'lucide-react';
import type { Client } from '@/hooks/useClients';

interface ClientsPanelProps {
  clients: Client[];
  loading: boolean;
  onAdd: (name: string, notes?: string) => Promise<Client | null>;
  onUpdate: (id: string, updates: { name?: string; notes?: string; active?: boolean }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const ClientsPanel = ({ clients, loading, onAdd, onUpdate, onDelete }: ClientsPanelProps) => {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    await onAdd(newName.trim(), newNotes.trim() || undefined);
    setNewName('');
    setNewNotes('');
    setShowAdd(false);
    setAdding(false);
  };

  const startEdit = (c: Client) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditNotes(c.notes ?? '');
  };

  const saveEdit = async (id: string) => {
    await onUpdate(id, { name: editName.trim(), notes: editNotes.trim() || undefined });
    setEditingId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Clients</h2>
        <button
          onClick={() => setShowAdd(p => !p)}
          className="flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-all min-h-[40px]"
          style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', boxShadow: '0 4px 16px hsl(var(--primary)/0.3)' }}
        >
          <Plus className="w-4 h-4" /> Add Client
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="glass-card p-4 space-y-3">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Client name *"
            required
            autoFocus
            className="glass-input w-full text-foreground min-h-[44px]"
          />
          <textarea
            value={newNotes}
            onChange={e => setNewNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={2}
            className="glass-input w-full text-foreground resize-none"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowAdd(false)} className="flex-1 glass-chip min-h-[40px] justify-center text-sm">Cancel</button>
            <button
              type="submit"
              disabled={adding}
              className="flex-1 min-h-[40px] rounded-xl text-sm font-bold"
              style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
            >
              {adding ? 'Adding…' : 'Add Client'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-7 h-7 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      ) : clients.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <User className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No clients yet</p>
          <p className="text-xs text-muted-foreground mt-1">Add clients to associate them with your shifts</p>
        </div>
      ) : (
        <div className="space-y-2">
          {clients.map(client => (
            <div key={client.id} className="glass-card p-4 space-y-2">
              {editingId === client.id ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="glass-input w-full text-foreground min-h-[40px]"
                  />
                  <textarea
                    value={editNotes}
                    onChange={e => setEditNotes(e.target.value)}
                    rows={2}
                    placeholder="Notes (optional)"
                    className="glass-input w-full text-foreground resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setEditingId(null)} className="flex-1 glass-chip min-h-[36px] justify-center">
                      <X className="w-3.5 h-3.5" /> Cancel
                    </button>
                    <button
                      onClick={() => saveEdit(client.id)}
                      className="flex-1 min-h-[36px] rounded-xl text-sm font-bold"
                      style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
                    >
                      <Check className="w-3.5 h-3.5 inline mr-1" /> Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-semibold text-foreground">{client.name}</span>
                        {!client.active && (
                          <span className="text-[10px] text-muted-foreground glass-chip py-0.5 px-2">Inactive</span>
                        )}
                      </div>
                      {client.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5 ml-6">{client.notes}</p>
                      )}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => startEdit(client)}
                        className="glass-chip py-1.5 px-2.5 text-xs"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(client.id)}
                        className="glass-chip py-1.5 px-2.5 text-xs"
                        style={{ color: 'hsl(var(--destructive))' }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => onUpdate(client.id, { active: !client.active })}
                    className="text-[10px] font-semibold text-muted-foreground hover:opacity-80"
                  >
                    {client.active ? 'Mark inactive' : 'Mark active'}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm p-4">
          <div className="glass-card p-6 w-full max-w-sm space-y-4 text-center">
            <p className="font-semibold text-foreground">Remove this client?</p>
            <p className="text-sm text-muted-foreground">Their shifts won't be deleted.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 glass-chip min-h-[44px] justify-center text-sm font-semibold">Cancel</button>
              <button
                onClick={async () => { await onDelete(confirmDelete); setConfirmDelete(null); }}
                className="flex-1 min-h-[44px] rounded-2xl text-sm font-bold"
                style={{ background: 'hsl(var(--destructive))', color: 'white' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientsPanel;
