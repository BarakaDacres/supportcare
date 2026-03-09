import { useState, useEffect, useRef } from 'react';
import { X, Clock, Moon, User, FileText, ChevronDown } from 'lucide-react';
import { calculateShiftPay, formatTime12h, type PayRates, DEFAULT_RATES } from '@/lib/shiftCalculator';
import { formatCurrency } from '@/lib/formatUtils';
import type { NewShift } from '@/hooks/useShifts';
import type { Client } from '@/hooks/useClients';

interface ShiftFormProps {
  clients: Client[];
  rates?: PayRates;
  initialValues?: Partial<NewShift>;
  onSubmit: (shift: NewShift) => Promise<void>;
  onCancel: () => void;
  title?: string;
}

const today = () => new Date().toISOString().split('T')[0];

const DEFAULT_NOTE_NORMAL = 'Assistance with Self-Care Activities';
const DEFAULT_NOTE_SLEEPOVER = 'Night Sleepover Support - $300 weekday & $350 for weekend';

const getDefaultNote = (isSleepover: boolean) =>
  isSleepover ? DEFAULT_NOTE_SLEEPOVER : DEFAULT_NOTE_NORMAL;

const ShiftForm = ({
  clients,
  rates = DEFAULT_RATES,
  initialValues,
  onSubmit,
  onCancel,
  title = 'Add Shift',
}: ShiftFormProps) => {
  const [date, setDate] = useState(initialValues?.date ?? today());
  const [startTime, setStartTime] = useState(initialValues?.start_time ?? '09:00');
  const [endTime, setEndTime] = useState(initialValues?.end_time ?? '17:00');
  const [isSleepover, setIsSleepover] = useState(initialValues?.is_sleepover ?? false);
  const [clientId, setClientId] = useState(initialValues?.client_id ?? '');

  const isNew = !initialValues?.date;
  const [notes, setNotes] = useState(
    initialValues?.notes ?? getDefaultNote(initialValues?.is_sleepover ?? false)
  );

  const notesCustomised = useRef(
    !isNew &&
      initialValues?.notes != null &&
      initialValues.notes !== DEFAULT_NOTE_NORMAL &&
      initialValues.notes !== DEFAULT_NOTE_SLEEPOVER
  );

  const [submitting, setSubmitting] = useState(false);

  // Lock body scroll while sheet is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleSleepoverToggle = () => {
    setIsSleepover(prev => {
      const next = !prev;
      if (!notesCustomised.current) {
        setNotes(getDefaultNote(next));
      }
      return next;
    });
  };

  const handleNotesChange = (val: string) => {
    setNotes(val);
    const currentDefault = getDefaultNote(isSleepover);
    if (val !== currentDefault) {
      notesCustomised.current = true;
    } else {
      notesCustomised.current = false;
    }
  };

  const calc =
    date && startTime && endTime
      ? calculateShiftPay(date, startTime, endTime, isSleepover, rates)
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit({
      date,
      start_time: startTime,
      end_time: endTime,
      is_sleepover: isSleepover,
      client_id: clientId || null,
      notes: notes.trim() || null,
    });
    setSubmitting(false);
  };

  return (
    /* Scrim — z-[60] ensures it sits above the tab bar (z-50) */
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end md:items-center md:justify-center"
      style={{ background: 'hsl(var(--foreground)/0.4)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      {/*
        Sheet panel:
        - flex-col so header / scrollable-body / sticky-footer stack cleanly
        - max-height uses dvh (safe for Safari) to respect visible viewport
        - rounded top corners only (bottom is flush to screen edge)
      */}
      <div
        className="w-full md:max-w-md md:mx-auto flex flex-col"
        style={{
          background: 'hsl(var(--card))',
          borderRadius: '20px 20px 0 0',
          maxHeight: '92dvh',
          /* Ensure the sheet itself never overlaps the home indicator */
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Drag handle ── */}
        <div className="flex justify-center pt-2.5 pb-1 shrink-0">
          <div
            className="rounded-full"
            style={{ width: 36, height: 4, background: 'hsl(var(--muted-foreground)/0.3)' }}
          />
        </div>

        {/* ── Sticky header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          <button
            onClick={onCancel}
            className="glass-chip w-8 h-8 flex items-center justify-center !p-0"
            style={{ minHeight: 'unset' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/*
          ── Scrollable body ──
          flex-1 + overflow-y-auto = fills available space and scrolls independently.
          The footer is OUTSIDE this element so it never scrolls away.
        */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-3 space-y-3">
          {/* Date */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
              className="glass-input w-full text-foreground"
              style={{ minHeight: 42 }}
            />
          </div>

          {/* Times — side by side */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Clock className="w-3 h-3" /> Start
              </label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                required
                className="glass-input w-full text-foreground"
                style={{ minHeight: 42 }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Clock className="w-3 h-3" /> End
              </label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                required
                className="glass-input w-full text-foreground"
                style={{ minHeight: 42 }}
              />
            </div>
          </div>

          {/* Sleepover toggle */}
          <button
            type="button"
            onClick={handleSleepoverToggle}
            className="w-full flex items-center gap-3 rounded-2xl border transition-all duration-200 px-4"
            style={{
              minHeight: 46,
              borderColor: isSleepover ? 'hsl(var(--primary)/0.5)' : 'hsl(var(--border))',
              background: isSleepover ? 'hsl(var(--primary)/0.08)' : 'transparent',
            }}
          >
            <Moon
              className="w-4 h-4 shrink-0"
              style={{ color: isSleepover ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}
            />
            <span
              className="text-sm font-semibold flex-1 text-left"
              style={{ color: isSleepover ? 'hsl(var(--primary))' : 'hsl(var(--foreground))' }}
            >
              Sleepover
            </span>
            <span className="text-[10px] text-muted-foreground mr-2">Flat rate</span>
            <span
              className="relative shrink-0 rounded-full transition-all duration-200"
              style={{
                width: 42,
                height: 24,
                background: isSleepover ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
              }}
            >
              <span
                className="absolute top-[3px] rounded-full bg-white shadow-sm transition-all duration-200"
                style={{ width: 18, height: 18, left: isSleepover ? 21 : 3 }}
              />
            </span>
          </button>

          {/* Client (only if clients exist) */}
          {clients.length > 0 && (
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <User className="w-3 h-3" /> Client
                <span className="normal-case font-normal text-muted-foreground">(optional)</span>
              </label>
              <div className="relative">
                <select
                  value={clientId}
                  onChange={e => setClientId(e.target.value)}
                  className="glass-input w-full text-foreground appearance-none pr-8"
                  style={{ minHeight: 42 }}
                >
                  <option value="">No client</option>
                  {clients.filter(c => c.active).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <FileText className="w-3 h-3" /> Notes
              <span className="normal-case font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => handleNotesChange(e.target.value)}
              rows={2}
              placeholder="Any notes…"
              className="glass-input w-full text-foreground resize-none"
            />
          </div>

          {/* Calculated pay */}
          {calc && (
            <div
              className="rounded-2xl p-3 space-y-1.5"
              style={{
                background: 'hsl(var(--primary)/0.08)',
                border: '1px solid hsl(var(--primary)/0.2)',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xl font-bold text-foreground leading-none">{formatCurrency(calc.grossPay)}</p>
                  {!isSleepover && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{calc.hoursWorked}h total</p>
                  )}
                </div>
                <div className="text-right space-y-0.5 min-w-0 flex-1 overflow-hidden">
                  {calc.breakdown.map((b, i) => (
                    <p key={i} className="text-[10px] text-muted-foreground truncate">
                      {b.label}
                      {b.hours != null ? ` · ${b.hours}h @ $${b.rate}` : ''} = {formatCurrency(b.amount)}
                    </p>
                  ))}
                </div>
              </div>
              {!isSleepover && startTime && endTime && (
                <p className="text-[10px] text-muted-foreground border-t border-primary/10 pt-1.5">
                  {formatTime12h(startTime)} – {formatTime12h(endTime)}
                </p>
              )}
            </div>
          )}

          {/* Small spacer so last card doesn't hug the footer divider */}
          <div className="h-1" />
        </div>

        {/*
          ── Sticky footer — OUTSIDE the scroll area ──
          This element is always visible regardless of how far the user has scrolled.
          It lives above env(safe-area-inset-bottom) which is already handled by
          the sheet container's paddingBottom.
        */}
        <form onSubmit={handleSubmit} className="shrink-0">
          <div className="px-5 pt-3 pb-4 border-t border-border flex gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 glass-chip justify-center text-sm font-semibold"
              style={{ minHeight: 48 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-2xl text-sm font-bold transition-all duration-200 disabled:opacity-40"
              style={{
                minHeight: 48,
                background: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
                boxShadow: '0 4px 16px hsl(var(--primary)/0.3)',
              }}
            >
              {submitting ? 'Saving…' : title === 'Add Shift' ? 'Add Shift' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ShiftForm;
