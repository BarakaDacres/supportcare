import { useState } from 'react';
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

const ShiftForm = ({ clients, rates = DEFAULT_RATES, initialValues, onSubmit, onCancel, title = 'Add Shift' }: ShiftFormProps) => {
  const [date, setDate] = useState(initialValues?.date ?? today());
  const [startTime, setStartTime] = useState(initialValues?.start_time ?? '09:00');
  const [endTime, setEndTime] = useState(initialValues?.end_time ?? '17:00');
  const [isSleepover, setIsSleepover] = useState(initialValues?.is_sleepover ?? false);
  const [clientId, setClientId] = useState(initialValues?.client_id ?? '');
  const [notes, setNotes] = useState(initialValues?.notes ?? '');
  const [submitting, setSubmitting] = useState(false);

  const calc = date && startTime && endTime
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/20 backdrop-blur-sm p-4">
      <div className="glass-card w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <button onClick={onCancel} className="glass-chip min-h-[36px] min-w-[36px] flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
              className="glass-input w-full text-foreground min-h-[44px]"
            />
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Clock className="w-3 h-3" /> Start
              </label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                required
                className="glass-input w-full text-foreground min-h-[44px]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Clock className="w-3 h-3" /> End
              </label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                required
                className="glass-input w-full text-foreground min-h-[44px]"
              />
            </div>
          </div>

          {/* Sleepover toggle */}
          <button
            type="button"
            onClick={() => setIsSleepover(p => !p)}
            className={`w-full flex items-center gap-3 p-4 rounded-2xl border transition-all duration-200 ${
              isSleepover
                ? 'border-primary bg-primary/10'
                : 'border-border bg-transparent'
            }`}
          >
            <Moon className={`w-5 h-5 ${isSleepover ? 'text-primary' : 'text-muted-foreground'}`} />
            <div className="text-left flex-1">
              <p className={`text-sm font-semibold ${isSleepover ? 'text-primary' : 'text-foreground'}`}>
                Sleepover
              </p>
              <p className="text-xs text-muted-foreground">Flat rate applies</p>
            </div>
            <div
              className={`w-11 h-6 rounded-full transition-all duration-200 relative ${isSleepover ? 'bg-primary' : 'bg-muted'}`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200 ${
                  isSleepover ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </div>
          </button>

          {/* Client */}
          {clients.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <User className="w-3 h-3" /> Client (optional)
              </label>
              <div className="relative">
                <select
                  value={clientId}
                  onChange={e => setClientId(e.target.value)}
                  className="glass-input w-full text-foreground min-h-[44px] appearance-none pr-8"
                >
                  <option value="">No client</option>
                  {clients.filter(c => c.active).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <FileText className="w-3 h-3" /> Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Any notes..."
              className="glass-input w-full text-foreground resize-none"
            />
          </div>

          {/* Pay preview */}
          {calc && (
            <div className="glass-card-glow p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Calculated Pay</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(calc.grossPay)}</p>
                  {!isSleepover && (
                    <p className="text-xs text-muted-foreground mt-0.5">{calc.hoursWorked} hrs</p>
                  )}
                </div>
                <div className="text-right space-y-1">
                  {calc.breakdown.map((b, i) => (
                    <div key={i} className="text-xs text-muted-foreground">
                      {b.label}{b.hours ? ` · ${b.hours}h @ $${b.rate}` : ''} = {formatCurrency(b.amount)}
                    </div>
                  ))}
                </div>
              </div>
              {!isSleepover && startTime && endTime && (
                <p className="text-xs text-muted-foreground">
                  {formatTime12h(startTime)} – {formatTime12h(endTime)}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 glass-chip min-h-[48px] justify-center text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 min-h-[48px] rounded-2xl text-sm font-bold transition-all duration-200 disabled:opacity-40"
              style={{
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
