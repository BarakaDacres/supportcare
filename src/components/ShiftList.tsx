import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Plus, Moon, User, ChevronDown, SortAsc, Lock, Sun, AlertCircle, Star, Sunset, Pencil, Copy, Trash2 } from 'lucide-react';
import type { Shift, NewShift } from '@/hooks/useShifts';
import { effectiveGrossPay } from '@/hooks/useShifts';
import type { Client } from '@/hooks/useClients';
import type { PayRates } from '@/lib/shiftCalculator';
import { DEFAULT_RATES, formatTime12h, getDayOfWeek, shiftHasEveningHours } from '@/lib/shiftCalculator';
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
  const isPublicHoliday = shift.is_public_holiday;
  const isEvening = !isSleepover && !isPublicHoliday && shiftHasEveningHours(shift.start_time, shift.end_time);
  return { isSleepover, isWeekend, isWeekday, isPublicHoliday, isEvening };
}

function isShiftActive(shift: Shift): boolean {
  const now = new Date();
  const [sy, sm, sd] = shift.date.split('-').map(Number);
  const [startH, startM] = shift.start_time.split(':').map(Number);
  const [endH, endM] = shift.end_time.split(':').map(Number);
  const shiftStart = new Date(sy, sm - 1, sd, startH, startM, 0, 0);
  const isOvernight = shift.is_sleepover || endH < startH || (endH === startH && endM < startM);
  const shiftEnd = new Date(sy, sm - 1, sd + (isOvernight ? 1 : 0), endH, endM, 0, 0);
  return now >= shiftStart && now < shiftEnd;
}

// ── Long-press context menu ──────────────────────────────────────────────────
interface ContextMenuState {
  shiftId: string;
  x: number;
  y: number;
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
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mondayThisWeek = getMonday(today);
  const startOfFortnight = new Date(today);
  startOfFortnight.setDate(today.getDate() - 13);
  startOfFortnight.setHours(0, 0, 0, 0);

  // Close context menu on outside tap
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('touchstart', handler, { passive: true });
    document.addEventListener('mousedown', handler);
    return () => {
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('mousedown', handler);
    };
  }, [contextMenu]);

  const filtered = useMemo(() => {
    let result = [...shifts];
    if (filterPeriod !== 'all') {
      result = result.filter(s => {
        const d = parseLocalDate(s.date);
        if (filterPeriod === 'week') return d >= mondayThisWeek && d <= today;
        if (filterPeriod === 'fortnight') return d >= startOfFortnight && d <= today;
        if (filterPeriod === 'month') return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
        if (filterPeriod === 'year') return d.getFullYear() === today.getFullYear();
        return true;
      });
    }
    if (filterClient) result = result.filter(s => s.client_id === filterClient);
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

  const openContextMenu = (shiftId: string, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    let x = 0, y = 0;
    if ('touches' in e && e.touches.length > 0) {
      x = e.touches[0].clientX;
      y = e.touches[0].clientY;
    } else if ('clientX' in e) {
      x = e.clientX;
      y = e.clientY;
    }
    setContextMenu({ shiftId, x, y });
  };

  return (
    <div className="space-y-3">
      {/* Header — title only, no Add button */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Shifts</h2>
        {locked && (
          <span className="flex items-center gap-1.5 glass-chip text-xs text-muted-foreground">
            <Lock className="w-3 h-3" /> Month Locked
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="card-elevated p-3 space-y-2">
        {/* Period filter pills */}
        <div
          className="flex gap-1 overflow-x-auto scrollbar-none rounded-xl p-1"
          style={{ background: 'hsl(var(--secondary))' }}
        >
          {(['week', 'fortnight', 'month', 'year', 'all'] as FilterPeriod[]).map(p => (
            <button
              key={p}
              onClick={() => setFilterPeriod(p)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all duration-200 whitespace-nowrap ${
                filterPeriod === p ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              style={filterPeriod === p ? {
                background: 'hsl(var(--primary)/0.85)',
                boxShadow: '0 1px 6px hsl(var(--primary)/0.22)',
              } : {}}
            >
              {p === 'fortnight' ? '2 Weeks' : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        {/* Client + Sort */}
        <div className="flex gap-2">
          {clients.length > 0 && (
            <div className="relative flex-1 min-w-0">
              <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
              <select
                value={filterClient}
                onChange={e => setFilterClient(e.target.value)}
                className="glass-input w-full pl-7 text-foreground min-h-[34px] text-[11px] appearance-none pr-6"
              >
                <option value="">All clients</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            </div>
          )}
          <div className="relative shrink-0">
            <SortAsc className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            <select
              value={sortMode}
              onChange={e => setSortMode(e.target.value as SortMode)}
              className="glass-input pl-7 text-foreground min-h-[34px] text-[11px] appearance-none pr-6"
            >
              <option value="date-desc">Newest</option>
              <option value="date-asc">Oldest</option>
              <option value="pay-desc">Highest pay</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Summary chips — gross amount primary */}
      <div className="flex flex-wrap gap-1.5">
        <span className="glass-chip py-1 px-2.5">
          <span className="font-bold money-text text-sm">{formatCurrency(totalGross)}</span>
          <span className="text-muted-foreground text-[10px] ml-0.5">gross</span>
        </span>
        <span className="glass-chip py-1 px-2.5 text-muted-foreground text-[11px]">
          <span className="font-semibold text-foreground">{totalHours.toFixed(1)}h</span>
          <span className="ml-0.5">worked</span>
        </span>
        <span className="glass-chip py-1 px-2.5 text-muted-foreground text-[11px]">
          <span className="font-semibold text-foreground">{filtered.length}</span>
          <span className="ml-0.5">shifts</span>
        </span>
        {sleepovers > 0 && (
          <span className="glass-chip py-1 px-2.5 text-[11px] text-muted-foreground">
            <Moon className="w-3 h-3" style={{ color: 'hsl(var(--sleepover-color))' }} />
            <span className="font-semibold text-foreground ml-0.5">{sleepovers}</span>
            <span className="ml-0.5">nights</span>
          </span>
        )}
      </div>

      {/* Shift list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-elevated p-8 text-center space-y-2">
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
            const { isSleepover, isWeekend, isWeekday, isPublicHoliday, isEvening } = getShiftBadges(shift);
            const hasOverride = shift.fee_override != null && shift.fee_override > 0;
            const displayPay = effectiveGrossPay(shift);
            const active = isShiftActive(shift);

            // Determine single primary shift-type label
            const shiftTypeLabel = (() => {
              if (isPublicHoliday) return { label: 'Public Holiday', icon: <Star className="w-2.5 h-2.5" />, style: { background: 'hsl(34 97% 52% / 0.13)', color: 'hsl(34 97% 44%)', border: '1px solid hsl(34 97% 52% / 0.25)' } };
              if (isSleepover) return { label: 'Sleepover', icon: <Moon className="w-2.5 h-2.5" />, style: { background: 'hsl(var(--sleepover-color)/0.13)', color: 'hsl(var(--sleepover-color))', border: '1px solid hsl(var(--sleepover-color)/0.25)' } };
              if (isEvening) return { label: 'Evening', icon: <Sunset className="w-2.5 h-2.5" />, style: { background: 'hsl(var(--evening-color)/0.12)', color: 'hsl(var(--evening-color))', border: '1px solid hsl(var(--evening-color)/0.25)' } };
              if (isWeekend) return { label: 'Weekend', icon: <Sun className="w-2.5 h-2.5" />, style: { background: 'hsl(var(--weekend-color)/0.12)', color: 'hsl(var(--weekend-color))', border: '1px solid hsl(var(--weekend-color)/0.25)' } };
              return { label: 'Weekday', icon: null, style: { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', border: '1px solid hsl(var(--border))' } };
            })();

            // Duration / time line — simplified for sleepovers
            const timeDisplay = isSleepover
              ? `${formatTime12h(shift.start_time)} – ${formatTime12h(shift.end_time)}`
              : `${formatTime12h(shift.start_time)} – ${formatTime12h(shift.end_time)} · ${Number(shift.hours_worked).toFixed(1)}h`;

            return (
              <ShiftCard
                key={shift.id}
                shift={shift}
                locked={locked}
                active={active}
                isSleepover={isSleepover}
                isEvening={isEvening}
                displayPay={displayPay}
                hasOverride={hasOverride}
                shiftTypeLabel={shiftTypeLabel}
                timeDisplay={timeDisplay}
                dateLabel={formatDateLabel(shift.date)}
                onEdit={() => { setEditingShift(shift); openSheet(true); }}
                onDuplicate={() => onDuplicate(shift.id)}
                onDelete={() => setConfirmDelete(shift.id)}
                onContextMenu={e => openContextMenu(shift.id, e)}
              />
            );
          })}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && !locked && (() => {
        const menuShift = shifts.find(s => s.id === contextMenu.shiftId);
        if (!menuShift) return null;
        // Position: clamp to screen
        const menuW = 180;
        const menuH = 140;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const left = Math.min(contextMenu.x, vw - menuW - 12);
        const top = Math.min(contextMenu.y - 8, vh - menuH - 12);
        return (
          <div
            className="fixed z-50"
            style={{ left, top }}
            onMouseDown={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
          >
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'hsl(var(--card))',
                border: '0.5px solid hsl(var(--border))',
                boxShadow: '0 8px 32px hsl(var(--foreground)/0.14), 0 2px 8px hsl(var(--foreground)/0.06)',
                minWidth: menuW,
              }}
            >
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-foreground hover:bg-accent/60 transition-colors text-left"
                onClick={() => { setEditingShift(menuShift); openSheet(true); setContextMenu(null); }}
              >
                <Pencil className="w-4 h-4 text-muted-foreground" />
                Edit shift
              </button>
              <div style={{ height: '0.5px', background: 'hsl(var(--border))' }} />
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-foreground hover:bg-accent/60 transition-colors text-left"
                onClick={() => { onDuplicate(menuShift.id); setContextMenu(null); }}
              >
                <Copy className="w-4 h-4 text-muted-foreground" />
                Duplicate
              </button>
              <div style={{ height: '0.5px', background: 'hsl(var(--border))' }} />
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-left transition-colors hover:bg-destructive/8"
                style={{ color: 'hsl(var(--destructive))' }}
                onClick={() => { setConfirmDelete(menuShift.id); setContextMenu(null); }}
              >
                <Trash2 className="w-4 h-4" />
                Delete shift
              </button>
            </div>
          </div>
        );
      })()}

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
                className="flex-1 min-h-[44px] rounded-2xl text-sm font-bold active:scale-[0.97] transition-transform"
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
            is_public_holiday: editingShift.is_public_holiday,
            client_id: editingShift.client_id,
            notes: editingShift.notes,
            fee_override: editingShift.fee_override,
          }}
          onSubmit={handleUpdate}
          onCancel={() => { setEditingShift(null); openSheet(false); }}
        />
      )}

      {/* Floating add button */}
      {!locked && !showForm && !editingShift && (
        <button
          onClick={() => { setShowForm(true); openSheet(true); }}
          aria-label="Add shift"
          className="fixed bottom-28 right-5 z-40 md:hidden w-13 h-13 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90"
          style={{
            width: 52,
            height: 52,
            background: 'hsl(var(--primary)/0.92)',
            color: 'hsl(var(--primary-foreground))',
            boxShadow: '0 4px 16px hsl(var(--primary)/0.30), 0 1px 4px hsl(var(--foreground)/0.08)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <Plus className="w-5 h-5" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
};

// ── Individual shift card ─────────────────────────────────────────────────────
interface ShiftCardProps {
  shift: Shift;
  locked: boolean;
  active: boolean;
  isSleepover: boolean;
  isEvening: boolean;
  displayPay: number;
  hasOverride: boolean;
  shiftTypeLabel: { label: string; icon: React.ReactNode; style: React.CSSProperties };
  timeDisplay: string;
  dateLabel: string;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onContextMenu: (e: React.MouseEvent | React.TouchEvent) => void;
}

const ShiftCard = ({
  shift, locked, active, isSleepover, isEvening,
  displayPay, hasOverride, shiftTypeLabel, timeDisplay, dateLabel,
  onEdit, onDuplicate, onDelete, onContextMenu,
}: ShiftCardProps) => {
  const longPress = useLongPress(onContextMenu as () => void, 450);

  return (
    <div
      className="card-elevated select-none"
      style={{
        padding: '12px 14px',
        cursor: locked ? 'default' : 'pointer',
        ...(active ? {
          borderColor: 'hsl(var(--stat-green) / 0.4)',
          boxShadow: 'var(--card-shadow-sm), 0 0 0 1.5px hsl(var(--stat-green) / 0.2)',
          background: 'hsl(var(--stat-green) / 0.04)',
        } : {}),
        ...(isEvening && !active ? {
          borderColor: 'hsl(var(--evening-color) / 0.25)',
        } : {}),
      }}
      {...(!locked ? longPress : {})}
    >
      {/* Row 1: Date + Amount */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="text-sm font-bold text-foreground">{dateLabel}</span>
          {active && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold animate-pulse"
              style={{
                background: 'hsl(var(--stat-green)/0.18)',
                color: 'hsl(var(--stat-green))',
                border: '1px solid hsl(var(--stat-green)/0.35)',
              }}
            >
              ● Active
            </span>
          )}
        </div>
        <div className="text-right shrink-0">
          <span className="text-sm font-bold money-text">{formatCurrency(displayPay)}</span>
          {hasOverride && (
            <p className="text-[10px] text-muted-foreground line-through leading-tight">{formatCurrency(Number(shift.gross_pay))}</p>
          )}
        </div>
      </div>

      {/* Row 2: Time + duration */}
      <p className="text-[11px] text-muted-foreground mb-1.5">{timeDisplay}</p>

      {/* Row 3: Client + type tag */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {shift.client_name && (
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <User className="w-2.5 h-2.5" />
            {shift.client_name}
          </span>
        )}
        {shift.client_name && <span className="text-[10px] text-muted-foreground/40">·</span>}
        {/* Primary shift type pill — simplified for sleepover */}
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={shiftTypeLabel.style}
        >
          {shiftTypeLabel.icon}
          {isSleepover ? `Sleepover · ${formatCurrency(displayPay)}` : shiftTypeLabel.label}
        </span>
        {hasOverride && !isSleepover && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            style={{ background: 'hsl(var(--stat-amber)/0.12)', color: 'hsl(var(--stat-amber))' }}
          >
            <AlertCircle className="w-2.5 h-2.5" /> Override
          </span>
        )}
      </div>

      {/* Row 4: Notes — muted, optional */}
      {shift.notes && (
        <p className="text-[11px] text-muted-foreground/70 mt-1.5 line-clamp-2 leading-relaxed">{shift.notes}</p>
      )}

      {/* Locked indicator */}
      {locked && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <Lock className="w-2.5 h-2.5 text-muted-foreground/50" />
          <span className="text-[10px] text-muted-foreground/50">Locked</span>
        </div>
      )}

      {/* Hint for unlocked cards */}
      {!locked && (
        <div className="flex items-center justify-end mt-1.5">
          <span className="text-[10px] text-muted-foreground/35">Hold to edit</span>
        </div>
      )}
    </div>
  );
};


export default ShiftList;
