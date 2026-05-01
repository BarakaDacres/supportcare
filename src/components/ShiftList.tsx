import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Plus, Moon, User, ChevronDown, SortAsc, Lock, Sun, AlertCircle, Star, Sunset, Pencil, Copy, Trash2, CalendarPlus, RefreshCw } from 'lucide-react';
import type { Shift, NewShift } from '@/hooks/useShifts';
import { effectiveGrossPay } from '@/hooks/useShifts';
import type { Client } from '@/hooks/useClients';
import type { PayRates } from '@/lib/shiftCalculator';
import { DEFAULT_RATES, formatTime12h, getDayOfWeek, shiftHasEveningHours } from '@/lib/shiftCalculator';
import { formatCurrency } from '@/lib/formatUtils';
import { MONTH_NAMES } from '@/lib/dateUtils';
import { downloadBulkICS, checkAutoSync, performAutoSync, markAllSynced, isAutoSyncEnabled, setAutoSyncEnabled, cleanSyncedIds, buildSequenceMap, type CalendarEvent } from '@/lib/calendarExport';
import ShiftForm from './ShiftForm';

interface ShiftListProps {
  shifts: Shift[];
  clients: Client[];
  loading: boolean;
  rates?: PayRates;
  locked?: boolean;
  isMonthLocked?: (year: number, month: number) => boolean;
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

type ShiftStatus = 'active' | 'upcoming' | 'completed';

function getShiftStatus(shift: Shift): ShiftStatus {
  const now = new Date();
  const [sy, sm, sd] = shift.date.split('-').map(Number);
  const [startH, startM] = shift.start_time.split(':').map(Number);
  const [endH, endM] = shift.end_time.split(':').map(Number);
  const shiftStart = new Date(sy, sm - 1, sd, startH, startM, 0, 0);
  const isOvernight = shift.is_sleepover || endH < startH || (endH === startH && endM < startM);
  const shiftEnd = new Date(sy, sm - 1, sd + (isOvernight ? 1 : 0), endH, endM, 0, 0);
  if (now >= shiftStart && now < shiftEnd) return 'active';
  if (shiftStart > now) return 'upcoming';
  return 'completed';
}

function buildCalendarEvent(shift: Shift, clientAddress?: string | null): CalendarEvent {
  const title = shift.client_name || 'Shift';
  const description = [
    shift.client_name ? `Client: ${shift.client_name}` : '',
    shift.notes || '',
  ].filter(Boolean).join('\n');

  return {
    uid: shift.id,
    title,
    startDate: shift.date,
    startTime: shift.start_time,
    endDate: shift.date,
    endTime: shift.end_time,
    location: clientAddress || undefined,
    description: description || undefined,
  };
}

// ── Long-press context menu ──────────────────────────────────────────────────
interface ContextMenuState {
  shiftId: string;
  x: number;
  y: number;
}

const ShiftList = ({
  shifts, clients, loading, rates = DEFAULT_RATES, locked = false,
  isMonthLocked,
  onAdd, onUpdate, onDelete, onDuplicate, onSheetOpenChange,
}: ShiftListProps) => {
  const [showForm, setShowForm] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const openSheet = (open: boolean) => onSheetOpenChange?.(open);

  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('month');
  const [filterClient, setFilterClient] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('date-asc');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [autoSync, setAutoSync] = useState(isAutoSyncEnabled);

  // Auto-sync: re-export upcoming shifts whenever any of them change.
  // Uses fingerprint+SEQUENCE so calendar apps update events with the same UID
  // instead of duplicating them.
  useEffect(() => {
    if (!autoSync) return;
    const upcomingShifts = shifts.filter(s => getShiftStatus(s) === 'upcoming');
    cleanSyncedIds(shifts.map(s => s.id));
    const events: CalendarEvent[] = upcomingShifts.map(s =>
      buildCalendarEvent(s, clients.find(c => c.id === s.client_id)?.service_address)
    );
    const payload = checkAutoSync(events);
    if (payload && payload.events.length > 0) {
      const timer = setTimeout(() => performAutoSync(payload), 1500);
      return () => clearTimeout(timer);
    }
  }, [shifts, clients, autoSync]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const todayStr = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  })();
  const tomorrowStr = (() => {
    const t = new Date(); t.setDate(t.getDate() + 1);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  })();

  // Group filtered shifts by date for sticky day headers.
  // While today has shifts, pin it to the very top of the list — it floats
  // back to its natural chronological position once the day passes.
  const grouped = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const s of filtered) {
      const arr = map.get(s.date) ?? [];
      arr.push(s);
      map.set(s.date, arr);
    }
    const entries = Array.from(map.entries());
    const todayIdx = entries.findIndex(([d]) => d === todayStr);
    if (todayIdx > 0) {
      const [todayEntry] = entries.splice(todayIdx, 1);
      entries.unshift(todayEntry);
    }
    return entries;
  }, [filtered, todayStr]);

  const formatGroupHeader = (dateStr: string) => {
    const d = parseLocalDate(dateStr);
    const dayNamesLong = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const isToday = dateStr === todayStr;
    const isTomorrow = dateStr === tomorrowStr;
    const main = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : dayNamesLong[d.getDay()];
    const sub = `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    return { main, sub, isToday, day: d.getDate(), monthShort: MONTH_NAMES[d.getMonth()].slice(0, 3), weekdayShort: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()] };
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

        {/* Export All Upcoming + Auto-Sync toggle */}
        {(() => {
          const upcomingShifts = shifts.filter(s => getShiftStatus(s) === 'upcoming');
          if (upcomingShifts.length === 0) return null;
          return (
            <>
              <button
                onClick={() => {
                  const events: CalendarEvent[] = upcomingShifts.map(s => buildCalendarEvent(s, clients.find(c => c.id === s.client_id)?.service_address));
                  const sequences = buildSequenceMap(events);
                  downloadBulkICS(events, sequences);
                  markAllSynced(events);
                }}
                className="glass-chip py-1 px-2.5 text-[11px] font-semibold transition-all duration-200 active:scale-95"
                style={{ color: 'hsl(var(--primary))', border: '1px solid hsl(var(--primary)/0.2)' }}
              >
                <CalendarPlus className="w-3 h-3" />
                Export {upcomingShifts.length} upcoming
              </button>
              <button
                onClick={() => {
                  const next = !autoSync;
                  setAutoSync(next);
                  setAutoSyncEnabled(next);
                  if (next) {
                    const events: CalendarEvent[] = upcomingShifts.map(s => buildCalendarEvent(s, clients.find(c => c.id === s.client_id)?.service_address));
                    markAllSynced(events);
                  }
                }}
                className="glass-chip py-1 px-2.5 text-[11px] font-semibold transition-all duration-200 active:scale-95"
                style={{
                  color: autoSync ? 'hsl(var(--stat-green))' : 'hsl(var(--muted-foreground))',
                  border: autoSync ? '1px solid hsl(var(--stat-green)/0.3)' : '1px solid hsl(var(--border))',
                  background: autoSync ? 'hsl(var(--stat-green)/0.08)' : undefined,
                }}
              >
                <RefreshCw className="w-3 h-3" />
                {autoSync ? 'Auto-sync on' : 'Auto-sync'}
              </button>
            </>
          );
        })()}
      </div>

      {/* Shift list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-elevated p-8 text-center space-y-2">
          <p className="text-muted-foreground text-sm">No shifts found</p>
          {(
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
        <div className="space-y-5">
          {grouped.map(([dateStr, dayShifts]) => {
            const header = formatGroupHeader(dateStr);
            const dayTotal = dayShifts.reduce((s, sh) => s + effectiveGrossPay(sh), 0);
            return (
              <section key={dateStr} className="space-y-2">
                {/* Sticky day header — Liquid Glass treatment.
                    Today gets the bright "selected pill" look (specular sheen,
                    primary tint, dual stroke). Past/upcoming days stay subdued. */}
                <div
                  className="sticky z-20 -mx-1 px-1"
                  style={{ top: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}
                >
                  <div
                    className={`relative flex items-center justify-between gap-3 px-3.5 py-2 rounded-2xl overflow-hidden ${header.isToday ? 'lg-day-header-today' : 'lg-day-header'}`}
                  >
                    {header.isToday && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 rounded-2xl"
                        style={{
                          background: 'linear-gradient(180deg, hsl(var(--glass-highlight)) 0%, transparent 38%, transparent 62%, hsl(var(--glass-shadow)) 100%)',
                          opacity: 0.6,
                          mixBlendMode: 'overlay',
                        }}
                      />
                    )}
                    <div className="relative flex items-baseline gap-2 min-w-0">
                      {header.isToday && (
                        <span
                          aria-hidden
                          className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
                          style={{
                            background: 'hsl(var(--primary))',
                            boxShadow: '0 0 0 3px hsl(var(--primary)/0.18), 0 0 8px hsl(var(--primary)/0.55)',
                          }}
                        />
                      )}
                      <span
                        className="text-[13px] font-bold tracking-tight truncate"
                        style={{ color: header.isToday ? 'hsl(var(--primary))' : 'hsl(var(--foreground))' }}
                      >
                        {header.main}
                      </span>
                      <span className="text-[11px] text-muted-foreground truncate">{header.sub}</span>
                    </div>
                    <span className="relative text-[11px] font-semibold money-text shrink-0">
                      {formatCurrency(dayTotal)}
                    </span>
                  </div>
                </div>

                {dayShifts.map(shift => {
                  const { isSleepover, isWeekend, isWeekday, isPublicHoliday, isEvening } = getShiftBadges(shift);
                  void isWeekday;
                  const hasOverride = shift.fee_override != null && shift.fee_override > 0;
                  const displayPay = effectiveGrossPay(shift);
                  const shiftStatus = getShiftStatus(shift);
                  const active = shiftStatus === 'active';

                  const shiftDate = parseLocalDate(shift.date);
                  const shiftLocked = isMonthLocked
                    ? isMonthLocked(shiftDate.getFullYear(), shiftDate.getMonth())
                    : locked;

                  const shiftTypeLabel = (() => {
                    if (isPublicHoliday) return { label: 'Public Holiday', icon: <Star className="w-2.5 h-2.5" />, style: { background: 'hsl(34 97% 52% / 0.13)', color: 'hsl(34 97% 44%)', border: '1px solid hsl(34 97% 52% / 0.25)' } };
                    if (isSleepover) return { label: 'Sleepover', icon: <Moon className="w-2.5 h-2.5" />, style: { background: 'hsl(var(--sleepover-color)/0.13)', color: 'hsl(var(--sleepover-color))', border: '1px solid hsl(var(--sleepover-color)/0.25)' } };
                    if (isEvening) return { label: 'Evening', icon: <Sunset className="w-2.5 h-2.5" />, style: { background: 'hsl(var(--evening-color)/0.12)', color: 'hsl(var(--evening-color))', border: '1px solid hsl(var(--evening-color)/0.25)' } };
                    if (isWeekend) return { label: 'Weekend', icon: <Sun className="w-2.5 h-2.5" />, style: { background: 'hsl(var(--weekend-color)/0.12)', color: 'hsl(var(--weekend-color))', border: '1px solid hsl(var(--weekend-color)/0.25)' } };
                    return { label: 'Weekday', icon: null, style: { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', border: '1px solid hsl(var(--border))' } };
                  })();

                  const timeDisplay = isSleepover
                    ? `${formatTime12h(shift.start_time)} – ${formatTime12h(shift.end_time)}`
                    : `${formatTime12h(shift.start_time)} – ${formatTime12h(shift.end_time)} · ${Number(shift.hours_worked).toFixed(1)}h`;

                  return (
                    <ShiftCard
                      key={shift.id}
                      shift={shift}
                      locked={shiftLocked}
                      shiftStatus={shiftStatus}
                      active={active}
                      isSleepover={isSleepover}
                      isEvening={isEvening}
                      displayPay={displayPay}
                      hasOverride={hasOverride}
                      shiftTypeLabel={shiftTypeLabel}
                      timeDisplay={timeDisplay}
                      dateStamp={{ day: header.day, weekday: header.weekdayShort, month: header.monthShort, isToday: header.isToday }}
                      clientAddress={clients.find(c => c.id === shift.client_id)?.service_address}
                      onEdit={() => { setEditingShift(shift); openSheet(true); }}
                      onDuplicate={() => onDuplicate(shift.id)}
                      onDelete={() => setConfirmDelete(shift.id)}
                      onContextMenu={e => openContextMenu(shift.id, e)}
                    />
                  );
                })}
              </section>
            );
          })}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (() => {
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
              className="lg-settings-card"
              style={{ minWidth: menuW }}
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

      {/* Floating add button */}
      {!showForm && !editingShift && (
        <button
          onClick={() => { setShowForm(true); openSheet(true); }}
          aria-label="Add shift"
          className="fixed bottom-28 right-5 z-40 md:hidden rounded-full flex items-center justify-center transition-all duration-200 active:scale-90"
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

      {/* Add form */}
      {showForm && (
        <ShiftForm
          clients={clients}
          rates={rates}
          onSubmit={handleAdd}
          onCancel={() => { setShowForm(false); openSheet(false); }}
        />
      )}

      {/* Edit form */}
      {editingShift && (
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
    </div>
  );
};

// ── Individual shift card with swipe gestures ─────────────────────────────────
interface ShiftCardProps {
  shift: Shift;
  locked: boolean;
  shiftStatus: ShiftStatus;
  active: boolean;
  isSleepover: boolean;
  isEvening: boolean;
  displayPay: number;
  hasOverride: boolean;
  shiftTypeLabel: { label: string; icon: React.ReactNode; style: React.CSSProperties };
  timeDisplay: string;
  dateStamp: { day: number; weekday: string; month: string; isToday: boolean };
  clientAddress?: string | null;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onContextMenu: (e: React.MouseEvent | React.TouchEvent) => void;
}

const SWIPE_THRESHOLD = 48;
const SWIPE_SNAP      = 88;     // resting position when revealing actions
const SWIPE_CONFIRM   = 140;    // px to auto-trigger
const SWIPE_MAX       = 160;

const ShiftCard = ({
  shift, locked, shiftStatus, active, isSleepover, isEvening,
  displayPay, hasOverride, shiftTypeLabel, timeDisplay, dateStamp,
  clientAddress, onEdit, onDuplicate, onDelete, onContextMenu,
}: ShiftCardProps) => {
  void clientAddress; void onDuplicate;
  const [translateX, setTranslateX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const trackingRef = useRef(false);
  const animatingRef = useRef(false);

  const snapTo = useCallback((x: number) => {
    animatingRef.current = true;
    setTranslateX(x);
    setSwiping(false);
    setTimeout(() => { animatingRef.current = false; }, 320);
  }, []);

  const snapBack = useCallback(() => snapTo(0), [snapTo]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (locked) return;
    // Tap on revealed action area? Close first.
    if (translateX !== 0) {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      trackingRef.current = false;
      return;
    }
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    trackingRef.current = false;
  }, [locked, translateX]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (locked) return;
    const dx = e.touches[0].clientX - touchStartX.current + translateX;
    const dy = e.touches[0].clientY - touchStartY.current;

    if (!trackingRef.current) {
      if (Math.abs(dy) > Math.abs(dx) + 4) return;
      if (Math.abs(e.touches[0].clientX - touchStartX.current) > 8) {
        trackingRef.current = true;
        setSwiping(true);
      } else {
        return;
      }
    }

    e.preventDefault();
    // Rubber-band past max
    let next = dx;
    if (next > SWIPE_MAX) next = SWIPE_MAX + (next - SWIPE_MAX) * 0.25;
    if (next < -SWIPE_MAX) next = -SWIPE_MAX + (next + SWIPE_MAX) * 0.25;
    setTranslateX(next);
  }, [locked, translateX]);

  const onTouchEnd = useCallback(() => {
    if (!trackingRef.current) { setSwiping(false); return; }
    if (translateX > SWIPE_CONFIRM) {
      snapBack();
      setTimeout(onEdit, 60);
    } else if (translateX < -SWIPE_CONFIRM) {
      snapBack();
      setTimeout(onDelete, 60);
    } else if (translateX > SWIPE_THRESHOLD) {
      snapTo(SWIPE_SNAP);            // hold open: edit revealed
    } else if (translateX < -SWIPE_THRESHOLD) {
      snapTo(-SWIPE_SNAP);           // hold open: delete revealed
    } else {
      snapBack();
    }
    trackingRef.current = false;
  }, [translateX, snapBack, snapTo, onEdit, onDelete]);

  const handleCardClick = (e: React.MouseEvent) => {
    if (locked) return;
    // If actions are revealed, just close
    if (translateX !== 0) {
      e.stopPropagation();
      snapBack();
      return;
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl" style={{ touchAction: swiping ? 'none' : 'pan-y' }}>
      {/* Edit reveal (left) */}
      <div
        className="absolute inset-y-0 left-0 flex items-center justify-start pl-6 pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, hsl(142 71% 45%), hsl(142 71% 50%))',
          width: '100%',
          borderRadius: 'inherit',
          opacity: Math.min(1, Math.max(0, translateX - 12) / (SWIPE_THRESHOLD - 12)),
          transition: swiping ? 'none' : 'opacity 0.2s',
        }}
      >
        <div className="flex items-center gap-2"
          style={{ transform: `scale(${Math.min(1, Math.max(0.8, translateX / SWIPE_SNAP))})`, transition: swiping ? 'none' : 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
          <Pencil className="w-4 h-4 text-white" strokeWidth={2.5} />
          <span className="text-white text-sm font-bold tracking-tight">Edit</span>
        </div>
      </div>

      {/* Delete reveal (right) */}
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-end pr-6 pointer-events-none"
        style={{
          background: 'linear-gradient(270deg, hsl(var(--destructive)), hsl(var(--destructive) / 0.85))',
          width: '100%',
          borderRadius: 'inherit',
          opacity: Math.min(1, Math.max(0, -translateX - 12) / (SWIPE_THRESHOLD - 12)),
          transition: swiping ? 'none' : 'opacity 0.2s',
        }}
      >
        <div className="flex items-center gap-2"
          style={{ transform: `scale(${Math.min(1, Math.max(0.8, -translateX / SWIPE_SNAP))})`, transition: swiping ? 'none' : 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
          <span className="text-white text-sm font-bold tracking-tight">Delete</span>
          <Trash2 className="w-4 h-4 text-white" strokeWidth={2.5} />
        </div>
      </div>

      {/* Card body — slides */}
      <div
        className="lg-surface-2 select-none relative z-10"
        style={{
          padding: '12px 14px',
          cursor: locked ? 'default' : 'pointer',
          transform: `translateX(${translateX}px)`,
          transition: swiping
            ? 'none'
            : 'transform 0.42s cubic-bezier(0.34, 1.56, 0.64, 1)',
          willChange: 'transform',
          borderRadius: '18px',
          ...(active ? {
            borderColor: 'hsl(var(--stat-green) / 0.45)',
            boxShadow: 'var(--card-shadow-md), 0 0 0 1.5px hsl(var(--stat-green) / 0.22)',
          } : {}),
          ...(isEvening && !active ? {
            borderColor: 'hsl(var(--evening-color) / 0.28)',
          } : {}),
        }}
        onClick={handleCardClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onContextMenu={e => { if (!locked) onContextMenu(e); }}
      >
        <div className="flex items-stretch gap-3">
          {/* Left: date stamp */}
          <div
            className="shrink-0 flex flex-col items-center justify-center rounded-xl"
            style={{
              width: 48,
              padding: '6px 4px',
              background: dateStamp.isToday
                ? 'hsl(var(--primary) / 0.12)'
                : 'hsl(var(--muted) / 0.55)',
              border: dateStamp.isToday
                ? '0.5px solid hsl(var(--primary) / 0.28)'
                : '0.5px solid hsl(var(--border) / 0.6)',
            }}
            aria-hidden
          >
            <span
              className="text-[9.5px] font-bold uppercase tracking-[0.06em] leading-none"
              style={{ color: dateStamp.isToday ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}
            >
              {dateStamp.weekday}
            </span>
            <span
              className="font-bold leading-none mt-1 tabular-nums"
              style={{
                fontSize: '1.25rem',
                letterSpacing: '-0.02em',
                color: dateStamp.isToday ? 'hsl(var(--primary))' : 'hsl(var(--foreground))',
              }}
            >
              {dateStamp.day}
            </span>
            <span
              className="text-[9px] font-semibold uppercase tracking-[0.06em] leading-none mt-0.5"
              style={{ color: 'hsl(var(--muted-foreground))' }}
            >
              {dateStamp.month}
            </span>
          </div>

          {/* Right: content */}
          <div className="flex-1 min-w-0">
            {/* Row 1: time + amount */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                <span className="text-[12.5px] font-semibold text-foreground leading-tight truncate">
                  {timeDisplay}
                </span>
                {shiftStatus === 'active' && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold animate-pulse"
                    style={{
                      background: 'hsl(var(--stat-green)/0.18)',
                      color: 'hsl(var(--stat-green))',
                      border: '0.5px solid hsl(var(--stat-green)/0.35)',
                    }}
                  >
                    ● Live
                  </span>
                )}
                {shiftStatus === 'upcoming' && (
                  <span
                    className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold"
                    style={{
                      background: 'hsl(var(--primary)/0.10)',
                      color: 'hsl(var(--primary))',
                      border: '0.5px solid hsl(var(--primary)/0.22)',
                    }}
                  >
                    Upcoming
                  </span>
                )}
              </div>
              <div className="text-right shrink-0">
                <span className="text-[14px] font-bold money-text tabular-nums leading-tight">
                  {formatCurrency(displayPay)}
                </span>
                {hasOverride && (
                  <p className="text-[9.5px] text-muted-foreground line-through leading-tight tabular-nums">
                    {formatCurrency(Number(shift.gross_pay))}
                  </p>
                )}
              </div>
            </div>

            {/* Row 2: client + type chip */}
            <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
              {shift.client_name && (
                <span className="text-[11px] text-muted-foreground flex items-center gap-1 min-w-0 truncate">
                  <User className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">{shift.client_name}</span>
                </span>
              )}
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={shiftTypeLabel.style}
              >
                {shiftTypeLabel.icon}
                {isSleepover ? 'Sleepover' : shiftTypeLabel.label}
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

            {/* Row 3: notes */}
            {shift.notes && (
              <p className="text-[11px] text-muted-foreground/75 mt-1.5 line-clamp-2 leading-relaxed">
                {shift.notes}
              </p>
            )}

            {/* Locked indicator */}
            {locked && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <Lock className="w-2.5 h-2.5 text-muted-foreground/60" />
                <span className="text-[10px] text-muted-foreground/60">Locked</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};


export default ShiftList;
