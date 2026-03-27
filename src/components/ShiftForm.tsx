import { useState, useEffect, useRef } from 'react';
import { X, Clock, Moon, User, FileText, ChevronDown, DollarSign, Star, Sunset, Calendar } from 'lucide-react';
import { calculateShiftPay, formatTime12h, type PayRates, DEFAULT_RATES, getDayOfWeek, isWeekendSleeperNight, shiftHasEveningHours, dayLabel } from '@/lib/shiftCalculator';
import { formatCurrency } from '@/lib/formatUtils';
import type { NewShift } from '@/hooks/useShifts';
import type { Client } from '@/hooks/useClients';

interface ShiftFormProps {
  clients: Client[];
  rates?: PayRates;
  initialValues?: Partial<NewShift & { fee_override?: number | null }>;
  onSubmit: (shift: NewShift) => Promise<void>;
  onCancel: () => void;
  title?: string;
}

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const DEFAULT_NOTE_NORMAL = 'Assistance with Self-Care Activities';
const DEFAULT_NOTE_EVENING = 'Assistance with Self-Care Activities — Evening';

function getSleeoverNote(dateStr?: string, rates?: PayRates): string {
  if (dateStr) {
    const dow = getDayOfWeek(dateStr);
    const isWeekend = isWeekendSleeperNight(dow);
    return isWeekend ? 'Night Sleepover Support - Weekend' : 'Night Sleepover Support - Weekday';
  }
  return 'Night Sleepover Support - Weekday';
}

const DEFAULT_NOTE_SLEEPOVER = getSleeoverNote();

function getDefaultNote(isSleepover: boolean, startTime: string, endTime: string, dateStr?: string, rates?: PayRates): string {
  if (isSleepover) return getSleeoverNote(dateStr, rates);
  if (shiftHasEveningHours(startTime, endTime)) return DEFAULT_NOTE_EVENING;
  return DEFAULT_NOTE_NORMAL;
}

/* Format date for display */
function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]}, ${d} ${months[m - 1]} ${y}`;
}

/* Format time for display */
function formatTimeDisplay(time: string): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const ShiftForm = ({
  clients,
  rates = DEFAULT_RATES,
  initialValues,
  onSubmit,
  onCancel,
  title = 'Add Shift',
}: ShiftFormProps) => {
  const [date, setDate] = useState(initialValues?.date ?? todayStr());
  const [startTime, setStartTime] = useState(initialValues?.start_time ?? '09:00');
  const [endTime, setEndTime] = useState(initialValues?.end_time ?? '17:00');
  const [isSleepover, setIsSleepover] = useState(initialValues?.is_sleepover ?? false);
  const [isPublicHoliday, setIsPublicHoliday] = useState(initialValues?.is_public_holiday ?? false);
  const [isPhSleepover, setIsPhSleepover] = useState(
    initialValues?.is_sleepover === true && initialValues?.is_public_holiday === true
  );
  const [clientId, setClientId] = useState(initialValues?.client_id ?? '');
  const [feeOverride, setFeeOverride] = useState<string>(
    initialValues?.fee_override != null && initialValues.fee_override > 0
      ? String(initialValues.fee_override)
      : ''
  );

  const isNew = !initialValues?.date;
  const initStart = initialValues?.start_time ?? '09:00';
  const initEnd   = initialValues?.end_time   ?? '17:00';
  const [notes, setNotes] = useState(
    initialValues?.notes ??
      getDefaultNote(initialValues?.is_sleepover ?? false, initStart, initEnd, initialValues?.date, rates)
  );

  const notesCustomised = useRef(
    !isNew &&
      initialValues?.notes != null &&
      initialValues.notes !== DEFAULT_NOTE_NORMAL &&
      initialValues.notes !== DEFAULT_NOTE_EVENING &&
      initialValues.notes !== DEFAULT_NOTE_SLEEPOVER
  );

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const dateRef = useRef<HTMLInputElement>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleClientChange = (newClientId: string) => {
    setClientId(newClientId);
    if (!isNew) return;
    const client = clients.find(c => c.id === newClientId);
    if (!client) return;
    if (client.default_start_time) setStartTime(client.default_start_time);
    if (client.default_end_time) setEndTime(client.default_end_time);
    if (client.default_is_sleepover !== isSleepover) {
      setIsSleepover(client.default_is_sleepover);
      if (client.default_is_sleepover && !client.default_start_time) setStartTime('22:00');
      if (client.default_is_sleepover && !client.default_end_time) setEndTime('06:00');
    }
    if (client.default_service_note && !notesCustomised.current) {
      setNotes(client.default_service_note);
      notesCustomised.current = true;
    }
  };

  const handleSleepoverToggle = () => {
    const nextStart = '22:00';
    const nextEnd   = '06:00';
    setIsSleepover(prev => {
      const next = !prev;
      if (!notesCustomised.current) {
        setNotes(getDefaultNote(next, next ? nextStart : startTime, next ? nextEnd : endTime, date, rates));
      }
      if (next) {
        setStartTime(nextStart);
        setEndTime(nextEnd);
      }
      if (!next) {
        setFeeOverride('');
        setIsPhSleepover(false);
      }
      return next;
    });
  };

  const handlePhSleepoverToggle = () => {
    setIsPhSleepover(prev => {
      const next = !prev;
      if (next) {
        setIsSleepover(true);
        setIsPublicHoliday(true);
        setStartTime('22:00');
        setEndTime('06:00');
        if (!feeOverride) setFeeOverride('400');
        if (!notesCustomised.current) {
          setNotes('Night Sleepover Support - Public Holiday');
          notesCustomised.current = true;
        }
      } else {
        setIsPublicHoliday(false);
        if (feeOverride === '400') setFeeOverride('');
      }
      return next;
    });
  };

  const handleDateChange = (val: string) => {
    setDate(val);
    if (!notesCustomised.current) {
      setNotes(getDefaultNote(isSleepover, startTime, endTime, val, rates));
    }
  };

  const handleStartTimeChange = (val: string) => {
    setStartTime(val);
    if (!notesCustomised.current && !isSleepover) {
      setNotes(getDefaultNote(false, val, endTime, date, rates));
    }
  };

  const handleEndTimeChange = (val: string) => {
    setEndTime(val);
    if (!notesCustomised.current && !isSleepover) {
      setNotes(getDefaultNote(false, startTime, val, date, rates));
    }
  };

  const handleNotesChange = (val: string) => {
    setNotes(val);
    const currentDefault = getDefaultNote(isSleepover, startTime, endTime, date, rates);
    notesCustomised.current = (
      val !== currentDefault &&
      val !== DEFAULT_NOTE_NORMAL &&
      val !== DEFAULT_NOTE_EVENING &&
      val !== DEFAULT_NOTE_SLEEPOVER
    );
  };

  const phRate = rates.rate_public_holiday ?? 150;
  const phSleepoverRate = 400;
  const eveningRate = rates.rate_evening ?? 75;

  const calc =
    date && startTime && endTime
      ? calculateShiftPay(date, startTime, endTime, isSleepover, rates, isPublicHoliday)
      : null;

  const feeOverrideNum = feeOverride !== '' ? parseFloat(feeOverride) : null;
  const effectivePay = feeOverrideNum != null && feeOverrideNum > 0
    ? feeOverrideNum
    : isPhSleepover
    ? phSleepoverRate
    : calc?.grossPay ?? 0;

  const phActive = isPublicHoliday && !isSleepover;
  const hasEvening = !isSleepover && !isPublicHoliday && shiftHasEveningHours(startTime, endTime);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const finalFeeOverride = isPhSleepover && (feeOverrideNum == null || feeOverrideNum <= 0)
        ? phSleepoverRate
        : (feeOverrideNum != null && feeOverrideNum > 0 ? feeOverrideNum : null);

      await onSubmit({
        date,
        start_time: startTime,
        end_time: endTime,
        is_sleepover: isSleepover,
        is_public_holiday: isPublicHoliday,
        client_id: clientId || null,
        notes: notes.trim() || null,
        fee_override: finalFeeOverride,
      });
    } catch (err) {
      console.error('Failed to save shift:', err);
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to save shift. Please try again.'
      );
      setSubmitting(false);
    }
  };

  /* Styled input tile component */
  const InputTile = ({
    label,
    icon,
    displayValue,
    onClick,
  }: {
    label: string;
    icon: React.ReactNode;
    displayValue: string;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border transition-all duration-150 active:scale-[0.98] w-full text-left"
      style={{
        minHeight: 52,
        padding: '10px 14px',
        borderColor: 'hsl(var(--border))',
        background: 'hsl(var(--muted)/0.4)',
      }}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: 'hsl(var(--primary)/0.1)' }}
      >
        <span style={{ color: 'hsl(var(--primary))' }}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider leading-none mb-1">{label}</p>
        <p className="text-sm font-semibold text-foreground truncate">{displayValue || '—'}</p>
      </div>
      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{
        paddingLeft: 16,
        paddingRight: 16,
        paddingTop: 'max(16px, env(safe-area-inset-top, 16px))',
        paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
        background: 'hsl(var(--foreground)/0.45)',
        backdropFilter: 'blur(6px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <form
        onSubmit={handleSubmit}
        className="flex flex-col"
        style={{
          width: 'calc(100vw - 32px)',
          maxWidth: 420,
          maxHeight: 'min(90dvh, 700px)',
          background: 'hsl(var(--card))',
          borderRadius: 24,
          boxShadow:
            '0 2px 8px hsl(var(--foreground)/0.08), ' +
            '0 20px 60px hsl(var(--foreground)/0.22), ' +
            '0 0 0 0.5px hsl(var(--border))',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between shrink-0"
          style={{ borderBottom: '0.5px solid hsl(var(--border))', padding: '14px 20px' }}
        >
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onCancel}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
            style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
          style={{ padding: '16px 20px 4px', boxSizing: 'border-box' }}
        >
          <div className="space-y-3" style={{ width: '100%', boxSizing: 'border-box' }}>

            {/* ── Date & Time Section ── */}
            <div className="space-y-2">
              {/* Hidden native inputs */}
              <input
                ref={dateRef}
                type="date"
                value={date}
                onChange={e => handleDateChange(e.target.value)}
                className="sr-only"
                tabIndex={-1}
              />
              <input
                ref={startRef}
                type="time"
                value={startTime}
                onChange={e => handleStartTimeChange(e.target.value)}
                className="sr-only"
                tabIndex={-1}
              />
              <input
                ref={endRef}
                type="time"
                value={endTime}
                onChange={e => handleEndTimeChange(e.target.value)}
                className="sr-only"
                tabIndex={-1}
              />

              {/* Date tile */}
              <InputTile
                label="Date"
                icon={<Calendar className="w-4 h-4" />}
                displayValue={formatDateDisplay(date)}
                onClick={() => dateRef.current?.showPicker?.() || dateRef.current?.focus()}
              />

              {/* Time tiles row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%', boxSizing: 'border-box' }}>
                <InputTile
                  label="Start"
                  icon={<Clock className="w-4 h-4" />}
                  displayValue={formatTimeDisplay(startTime)}
                  onClick={() => startRef.current?.showPicker?.() || startRef.current?.focus()}
                />
                <InputTile
                  label="End"
                  icon={<Clock className="w-4 h-4" />}
                  displayValue={formatTimeDisplay(endTime)}
                  onClick={() => endRef.current?.showPicker?.() || endRef.current?.focus()}
                />
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-2">
              {/* Sleepover */}
              <button
                type="button"
                onClick={handleSleepoverToggle}
                className="w-full flex items-center gap-3 rounded-2xl border transition-all duration-200 px-4"
                style={{
                  minHeight: 48,
                  borderColor: isSleepover && !isPhSleepover ? 'hsl(var(--primary)/0.5)' : 'hsl(var(--border))',
                  background: isSleepover && !isPhSleepover ? 'hsl(var(--primary)/0.08)' : 'transparent',
                }}
              >
                <Moon
                  className="w-4 h-4 shrink-0"
                  style={{ color: isSleepover && !isPhSleepover ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}
                />
                <span
                  className="text-sm font-semibold flex-1 text-left"
                  style={{ color: isSleepover && !isPhSleepover ? 'hsl(var(--primary))' : 'hsl(var(--foreground))' }}
                >
                  Sleepover
                </span>
                <span className="text-[10px] text-muted-foreground mr-2">Flat rate</span>
                <span
                  className="relative shrink-0 rounded-full transition-all duration-200"
                  style={{ width: 42, height: 24, background: isSleepover && !isPhSleepover ? 'hsl(var(--primary))' : 'hsl(var(--muted))' }}
                >
                  <span
                    className="absolute top-[3px] rounded-full bg-white shadow-sm transition-all duration-200"
                    style={{ width: 18, height: 18, left: isSleepover && !isPhSleepover ? 21 : 3 }}
                  />
                </span>
              </button>

              {/* Public Holiday (hourly) */}
              {!isSleepover && (
                <button
                  type="button"
                  onClick={() => setIsPublicHoliday(prev => !prev)}
                  className="w-full flex items-center gap-3 rounded-2xl border transition-all duration-200 px-4"
                  style={{
                    minHeight: 48,
                    borderColor: isPublicHoliday ? 'hsl(34 97% 52% / 0.5)' : 'hsl(var(--border))',
                    background: isPublicHoliday ? 'hsl(34 97% 52% / 0.08)' : 'transparent',
                  }}
                >
                  <Star
                    className="w-4 h-4 shrink-0"
                    style={{ color: isPublicHoliday ? 'hsl(34 97% 52%)' : 'hsl(var(--muted-foreground))' }}
                  />
                  <span
                    className="text-sm font-semibold flex-1 text-left"
                    style={{ color: isPublicHoliday ? 'hsl(34 97% 52%)' : 'hsl(var(--foreground))' }}
                  >
                    Public Holiday
                  </span>
                  <span className="text-[10px] text-muted-foreground mr-2">${phRate}/hr</span>
                  <span
                    className="relative shrink-0 rounded-full transition-all duration-200"
                    style={{ width: 42, height: 24, background: isPublicHoliday ? 'hsl(34 97% 52%)' : 'hsl(var(--muted))' }}
                  >
                    <span
                      className="absolute top-[3px] rounded-full bg-white shadow-sm transition-all duration-200"
                      style={{ width: 18, height: 18, left: isPublicHoliday ? 21 : 3 }}
                    />
                  </span>
                </button>
              )}

              {/* Public Holiday Sleepover */}
              {isSleepover && (
                <button
                  type="button"
                  onClick={handlePhSleepoverToggle}
                  className="w-full flex items-center gap-3 rounded-2xl border transition-all duration-200 px-4"
                  style={{
                    minHeight: 48,
                    borderColor: isPhSleepover ? 'hsl(34 97% 52% / 0.6)' : 'hsl(var(--border))',
                    background: isPhSleepover ? 'hsl(34 97% 52% / 0.10)' : 'transparent',
                  }}
                >
                  <div className="relative shrink-0">
                    <Moon
                      className="w-4 h-4"
                      style={{ color: isPhSleepover ? 'hsl(34 97% 52%)' : 'hsl(var(--muted-foreground))' }}
                    />
                    <Star
                      className="w-2.5 h-2.5 absolute -top-1 -right-1"
                      style={{
                        color: isPhSleepover ? 'hsl(34 97% 52%)' : 'hsl(var(--muted-foreground))',
                        fill: isPhSleepover ? 'hsl(34 97% 52%)' : 'transparent',
                      }}
                    />
                  </div>
                  <span
                    className="text-sm font-semibold flex-1 text-left"
                    style={{ color: isPhSleepover ? 'hsl(34 90% 40%)' : 'hsl(var(--foreground))' }}
                  >
                    Public Holiday Sleepover
                  </span>
                  <span className="text-[10px] text-muted-foreground mr-2">${phSleepoverRate} flat</span>
                  <span
                    className="relative shrink-0 rounded-full transition-all duration-200"
                    style={{ width: 42, height: 24, background: isPhSleepover ? 'hsl(34 97% 52%)' : 'hsl(var(--muted))' }}
                  >
                    <span
                      className="absolute top-[3px] rounded-full bg-white shadow-sm transition-all duration-200"
                      style={{ width: 18, height: 18, left: isPhSleepover ? 21 : 3 }}
                    />
                  </span>
                </button>
              )}
            </div>

            {/* Fee override */}
            {(isSleepover || (!isNew && initialValues?.fee_override != null)) && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <DollarSign className="w-3 h-3" /> Override Flat Fee
                  <span className="normal-case font-normal text-muted-foreground">(optional)</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground shrink-0">$</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={feeOverride}
                    onChange={e => setFeeOverride(e.target.value)}
                    placeholder={isPhSleepover ? '400' : calc ? String(calc.grossPay) : ''}
                    className="glass-input flex-1 text-foreground"
                    style={{ minHeight: 44, width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {isPhSleepover
                    ? `PH Sleepover flat fee. Default: $${phSleepoverRate}.`
                    : `One-off override. Leave blank to use calculated rate (${calc ? formatCurrency(calc.grossPay) : '—'}).`
                  }
                </p>
              </div>
            )}

            {/* Client */}
            {clients.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <User className="w-3 h-3" /> Client
                  <span className="normal-case font-normal text-muted-foreground">(optional)</span>
                </label>
                <div className="relative">
                  <select
                    value={clientId}
                    onChange={e => handleClientChange(e.target.value)}
                    className="glass-input w-full text-foreground appearance-none pr-8"
                    style={{ minHeight: 44, boxSizing: 'border-box' }}
                  >
                    <option value="">No client</option>
                    {clients.filter(c => c.active).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                </div>
                {isNew && clientId && clients.find(c => c.id === clientId)?.default_service_note && (
                  <p className="text-[10px] text-muted-foreground">
                    ↑ Client defaults applied. Edit any field as needed.
                  </p>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
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
                style={{ boxSizing: 'border-box' }}
              />
            </div>

            {/* Pay preview */}
            {(calc || isPhSleepover) && (
              <div
                className="rounded-2xl p-3 space-y-1.5 transition-all duration-300"
                style={isPhSleepover ? {
                  background: 'hsl(34 97% 52% / 0.10)',
                  border: '1px solid hsl(34 97% 52% / 0.4)',
                } : phActive ? {
                  background: 'hsl(34 97% 52% / 0.1)',
                  border: '1px solid hsl(34 97% 52% / 0.35)',
                } : hasEvening ? {
                  background: 'hsl(38 90% 52% / 0.08)',
                  border: '1px solid hsl(38 90% 52% / 0.25)',
                } : {
                  background: 'hsl(var(--money-green)/0.08)',
                  border: '1px solid hsl(var(--money-green)/0.2)',
                }}
              >
                {isPhSleepover && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="relative shrink-0">
                      <Moon className="w-3 h-3" style={{ color: 'hsl(34 97% 52%)' }} />
                      <Star className="w-2 h-2 absolute -top-0.5 -right-0.5" style={{ color: 'hsl(34 97% 52%)', fill: 'hsl(34 97% 52%)' }} />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'hsl(34 90% 40%)' }}>
                      Public Holiday Sleepover — $400 flat
                    </span>
                  </div>
                )}
                {!isPhSleepover && phActive && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <Star className="w-3 h-3" style={{ color: 'hsl(34 97% 52%)' }} />
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'hsl(34 97% 52%)' }}>
                      Public Holiday Rate Active — ${phRate}/hr
                    </span>
                  </div>
                )}
                {hasEvening && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sunset className="w-3 h-3" style={{ color: 'hsl(38 90% 45%)' }} />
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'hsl(38 90% 45%)' }}>
                      Evening Shift — ${eveningRate}/hr (18:00–22:00)
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p
                      className="text-xl font-bold leading-none"
                      style={{ color: (isPhSleepover || phActive) ? 'hsl(34 97% 52%)' : 'hsl(var(--money-green))' }}
                    >
                      {formatCurrency(effectivePay)}
                    </p>
                    {feeOverrideNum != null && feeOverrideNum > 0 && calc && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Override active · calculated was {formatCurrency(calc.grossPay)}
                      </p>
                    )}
                    {!isSleepover && calc && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{calc.hoursWorked}h total</p>
                    )}
                  </div>
                  {calc && !isPhSleepover && (
                    <div className="text-right space-y-0.5 min-w-0 flex-1 overflow-hidden">
                      {calc.breakdown.map((b, i) => (
                        <p key={i} className="text-[10px] text-muted-foreground truncate">
                          {b.label}
                          {b.hours != null ? ` · ${b.hours}h @ $${b.rate}` : ''} = {formatCurrency(b.amount)}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                {!isSleepover && startTime && endTime && calc && (
                  <p
                    className="text-[10px] text-muted-foreground border-t pt-1.5"
                    style={{ borderColor: phActive ? 'hsl(34 97% 52% / 0.2)' : 'hsl(var(--primary)/0.1)' }}
                  >
                    {formatTime12h(startTime)} – {formatTime12h(endTime)}
                  </p>
                )}
              </div>
            )}

            <div className="h-1" />
          </div>
        </div>

        {/* ── Footer ── */}
        <div
          className="shrink-0 space-y-2"
          style={{ borderTop: '0.5px solid hsl(var(--border))', padding: '12px 20px 20px', boxSizing: 'border-box' }}
        >
          {submitError && (
            <p className="text-xs text-destructive text-center px-2">{submitError}</p>
          )}
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-2xl text-sm font-semibold transition-colors"
              style={{
                minHeight: 48,
                background: 'hsl(var(--muted))',
                color: 'hsl(var(--muted-foreground))',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-2xl text-sm font-bold transition-all duration-200 disabled:opacity-50"
              style={{
                minHeight: 48,
                background: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
                boxShadow: submitting ? 'none' : '0 4px 16px hsl(var(--primary)/0.3)',
              }}
            >
              {submitting ? 'Saving…' : title === 'Add Shift' ? 'Add Shift' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default ShiftForm;
