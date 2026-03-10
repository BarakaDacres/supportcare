import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Copy, Moon, User, ChevronDown, SortAsc, Lock, Sun, AlertCircle, Star } from 'lucide-react';
import type { Shift, NewShift } from '@/hooks/useShifts';
import { effectiveGrossPay } from '@/hooks/useShifts';
import type { Client } from '@/hooks/useClients';
import type { PayRates } from '@/lib/shiftCalculator';
import { DEFAULT_RATES, formatTime12h, getDayOfWeek } from '@/lib/shiftCalculator';
import { formatCurrency } from '@/lib/formatUtils';
import { MONTH_NAMES } from '@/lib/dateUtils';
import ShiftForm from './ShiftForm';

interface ShiftListProps {
  shifts: Shift[];
  clients: Client[];
  loading: boolean;
  rates?: PayRates;
  locked?: boolean;
  onAdd: (shift: NewShift) => Promise<unknown> | Promise<void>;
  onUpdate: (id: string, shift: Partial<NewShift>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDuplicate: (id: string) => Promise<void>;
  onSheetOpenChange?: (open: boolean) => void;
}

type FilterPeriod = 'all' | 'week' | 'fortnight' | 'month' | 'year';
type SortMode = 'date-desc' | 'date-asc' | 'pay-desc';

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getMonday(d: Date): Date {
  const result = new Date(d);
  const dow = d.getDay();
  result.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  result.setHours(0, 0, 0, 0);
  return result;
}

function getShiftBadges(shift: Shift) {
  const dow = getDayOfWeek(shift.date);
  const isWeekend = dow === 0 || dow === 6;
  const isWeekday = !isWeekend;
  const isSleepover = shift.is_sleepover;
  return { isSleepover, isWeekend, isWeekday };
}

const ShiftList = ({
  shifts, clients, loading, rates = DEFAULT_RATES, locked = false,
  onAdd, onUpdate, onDelete, onDuplicate, onSheetOpenChange,
}: ShiftListProps) => {
  const [showForm, setShowForm] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);

  const openSheet = (open: boolean) => onSheetOpenChange?.(open);
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('month');
  const [filterClient, setFilterClient] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('date-desc');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const mondayThisWeek = getMonday(today);
  const startOfFortnight = new Date(today);
  startOfFortnight.setDate(today.getDate() - 13);
  startOfFortnight.setHours(0, 0, 0, 0);

  const filtered = useMemo(() => {
    let result = [...shifts];

    if (filterPeriod !== 'all') {
      result = result.filter(s => {
        const d = parseLocalDate(s.date);
        if (filterPeriod === 'week') return d >= mondayThisWeek && d <= today;
        if (filterPeriod === 'fortnight') return d >= startOfFortnight && d <= today;
        if (filterPeriod === 'month') {
          return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
        }
        if (filterPeriod === 'year') return d.getFullYear() === today.getFullYear();
        return true;
      });
    }

    if (filterClient) {
      result = result.filter(s => s.client_id === filterClient);
    }

    result.sort((a, b) => {
      if (sortMode === 'date-asc') return a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time);
      if (sortMode === 'pay-desc') return effectiveGrossPay(b) - effectiveGrossPay(a);
      return b.date.localeCompare(a.date) || b.start_time.localeCompare(a.start_time);
    });

    return result;
  }, [shifts, filterPeriod, filterClient, sortMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalGross = filtered.reduce((s, sh) => s + effectiveGrossPay(sh), 0);
  const totalHours = filtered.filter(s => !s.is_sleepover).reduce((s, sh) => s + Number(sh.hours_worked), 0);
  const sleepovers = filtered.filter(s => s.is_sleepover).length;

  const handleAdd = async (shift: NewShift) => {
    await onAdd(shift);
    setShowForm(false);
    openSheet(false);
  };

  const handleUpdate = async (shift: NewShift) => {
    if (!editingShift) return;
    await onUpdate(editingShift.id, shift);
    setEditingShift(null);
    openSheet(false);
  };

  const handleDelete = async (id: string) => {
    await onDelete(id);
    setConfirmDelete(null);
  };

  const formatDateLabel = (dateStr: string) => {
    const d = parseLocalDate(dateStr);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${dayNames[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Shifts</h2>
        {locked ? (
          <span className="flex items-center gap-1.5 glass-chip text-xs text-muted-foreground">
            <Lock className="w-3 h-3" /> Month Locked
          </span>
        ) : (
          <button
            onClick={() => { setShowForm(true); openSheet(true); }}
            className="flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-all min-h-[40px]"
            style={{
              background: 'hsl(var(--primary))',
              color: 'hsl(var(--primary-foreground))',
              boxShadow: '0 4px 16px hsl(var(--primary)/0.3)',
            }}
          >
            <Plus className="w-4 h-4" /> Add Shift
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="glass-card p-3 space-y-2.5">
        {/* Period filter — horizontal scroll on mobile */}
        <div className="flex gap-1 overflow-x-auto scrollbar-none glass-surface rounded-xl p-1">
          {(['week', 'fortnight', 'month', 'year', 'all'] as FilterPeriod[]).map(p => (
            <button
              key={p}
              onClick={() => setFilterPeriod(p)}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-200 whitespace-nowrap ${
                filterPeriod === p ? 'text-primary-foreground' : 'text-muted-foreground'
              }`}
              style={filterPeriod === p ? {
                background: 'hsl(var(--primary))',
                boxShadow: '0 2px 8px hsl(var(--primary)/0.3)',
              } : {}}
            >
              {p === 'fortnight' ? '2 Weeks' : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        {/* Client + Sort row */}
        <div className="flex gap-2">
          {clients.length > 0 && (
            <div className="relative flex-1 min-w-0">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <select
                value={filterClient}
                onChange={e => setFilterClient(e.target.value)}
                className="glass-input w-full pl-8 text-foreground min-h-[36px] text-xs appearance-none pr-7"
              >
                <option value="">All clients</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>
          )}

          <div className="relative shrink-0">
            <SortAsc className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <select
              value={sortMode}
              onChange={e => setSortMode(e.target.value as SortMode)}
              className="glass-input pl-8 text-foreground min-h-[36px] text-xs appearance-none pr-7"
            >
              <option value="date-desc">Newest</option>
              <option value="date-asc">Oldest</option>
              <option value="pay-desc">Highest pay</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        <span className="glass-chip">
          <span className="font-bold money-text">{formatCurrency(totalGross)}</span>
          <span className="text-muted-foreground text-[10px]"> gross</span>
        </span>
        <span className="glass-chip text-muted-foreground">
          <span className="font-bold text-foreground">{totalHours.toFixed(1)}h</span> worked
        </span>
        <span className="glass-chip text-muted-foreground">
          <span className="font-bold text-foreground">{filtered.length}</span> shifts
        </span>
        {sleepovers > 0 && (
          <span className="glass-chip">
            <Moon className="w-3 h-3 text-primary" />
            <span className="font-bold text-foreground">{sleepovers}</span>
            <span className="text-muted-foreground"> sleepovers</span>
          </span>
        )}
      </div>

      {/* Shift list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-8 text-center space-y-2">
          <p className="text-muted-foreground text-sm">No shifts found</p>
          {!locked && (
            <button
              onClick={() => { setShowForm(true); openSheet(true); }}
              className="text-sm font-semibold"
              style={{ color: 'hsl(var(--primary))' }}
            >
              Add your first shift →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(shift => {
            const { isSleepover, isWeekend, isWeekday } = getShiftBadges(shift);
            const hasOverride = shift.fee_override != null && shift.fee_override > 0;
            const displayPay = effectiveGrossPay(shift);
            return (
              <div key={shift.id} className="glass-card p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-bold text-foreground">{formatDateLabel(shift.date)}</span>

                      {isSleepover && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: '#2563EB' }}>
                          <Moon className="w-2.5 h-2.5" /> Sleepover
                        </span>
                      )}

                      {isWeekend && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: '#7C3AED' }}>
                          <Sun className="w-2.5 h-2.5" /> Weekend
                        </span>
                      )}

                      {isWeekday && !isSleepover && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
                          Weekday
                        </span>
                      )}

                      {hasOverride && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ background: 'hsl(var(--stat-amber)/0.15)', color: 'hsl(var(--stat-amber))' }}>
                          <AlertCircle className="w-2.5 h-2.5" /> Override
                        </span>
                      )}

                      {shift.client_name && (
                        <span className="glass-chip text-[10px] py-0.5 px-2 text-muted-foreground">
                          <User className="w-2.5 h-2.5" /> {shift.client_name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatTime12h(shift.start_time)} – {formatTime12h(shift.end_time)}
                      {!shift.is_sleepover && ` · ${Number(shift.hours_worked).toFixed(2)}h`}
                    </p>
                    {shift.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line line-clamp-3">{shift.notes}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-bold money-text">
                      {formatCurrency(displayPay)}
                    </p>
                    {hasOverride && (
                      <p className="text-[10px] text-muted-foreground line-through">
                        {formatCurrency(Number(shift.gross_pay))}
                      </p>
                    )}
                  </div>
                </div>

                {!locked ? (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { setEditingShift(shift); openSheet(true); }}
                      className="glass-chip text-xs py-1.5 flex-1 justify-center gap-1.5 min-h-[36px]"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                    <button
                      onClick={() => onDuplicate(shift.id)}
                      className="glass-chip text-xs py-1.5 flex-1 justify-center gap-1.5 min-h-[36px]"
                    >
                      <Copy className="w-3 h-3" /> Duplicate
                    </button>
                    <button
                      onClick={() => setConfirmDelete(shift.id)}
                      className="glass-chip text-xs py-1.5 px-3 justify-center min-h-[36px]"
                      style={{ color: 'hsl(var(--destructive))' }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 pt-1">
                    <Lock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">Locked — unlock month to edit</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirm dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm p-4">
          <div className="glass-card p-6 w-full max-w-sm space-y-4 text-center">
            <p className="font-semibold text-foreground">Delete this shift?</p>
            <p className="text-sm text-muted-foreground">This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 glass-chip min-h-[44px] justify-center text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="flex-1 min-h-[44px] rounded-2xl text-sm font-bold"
                style={{ background: 'hsl(var(--destructive))', color: 'white' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add form */}
      {showForm && !locked && (
        <ShiftForm
          clients={clients}
          rates={rates}
          onSubmit={handleAdd}
          onCancel={() => { setShowForm(false); openSheet(false); }}
        />
      )}

      {/* Edit form */}
      {editingShift && !locked && (
        <ShiftForm
          clients={clients}
          rates={rates}
          title="Edit Shift"
          initialValues={{
            date: editingShift.date,
            start_time: editingShift.start_time,
            end_time: editingShift.end_time,
            is_sleepover: editingShift.is_sleepover,
            client_id: editingShift.client_id,
            notes: editingShift.notes,
            fee_override: editingShift.fee_override,
          }}
          onSubmit={handleUpdate}
          onCancel={() => { setEditingShift(null); openSheet(false); }}
        />
      )}

      {/* Floating add button — mobile only */}
      {!locked && !showForm && !editingShift && (
        <button
          onClick={() => { setShowForm(true); openSheet(true); }}
          aria-label="Add shift"
          className="fixed bottom-28 right-5 z-40 md:hidden w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 active:scale-95"
          style={{
            background: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
            boxShadow: '0 8px 24px hsl(var(--primary)/0.45)',
          }}
        >
          <Plus className="w-6 h-6" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
};

export default ShiftList;
