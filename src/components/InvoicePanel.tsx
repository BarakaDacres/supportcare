import { useState, useMemo } from 'react';
import { FileText, Plus, Download, ChevronDown } from 'lucide-react';
import { formatCurrency } from '@/lib/formatUtils';
import { formatTime12h } from '@/lib/shiftCalculator';
import type { Shift } from '@/hooks/useShifts';
import type { UserSettings } from '@/hooks/useUserSettings';
import { MONTH_NAMES } from '@/lib/dateUtils';

interface InvoicePanelProps {
  shifts: Shift[];
  settings: UserSettings | null;
  onIncrementCounter: () => Promise<number>;
}

interface InvoiceData {
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
  shifts: Shift[];
  total: number;
  issuerName: string;
  abn: string;
  bankName: string;
  bsb: string;
  accountNumber: string;
  invoiceNotes: string;
}

// Get Monday-aligned fortnights for a given year
function getFortnightPeriods(year: number): { label: string; start: Date; end: Date }[] {
  // Anchor: first Monday of the year
  const jan1 = new Date(year, 0, 1);
  const offset = jan1.getDay() === 0 ? 1 : jan1.getDay() === 1 ? 0 : 8 - jan1.getDay() + 1;
  let monday = new Date(year, 0, 1 + (jan1.getDay() === 1 ? 0 : offset));

  const periods: { label: string; start: Date; end: Date }[] = [];
  let fn = 1;

  while (monday.getFullYear() <= year) {
    const start = new Date(monday);
    const end = new Date(monday);
    end.setDate(end.getDate() + 13);

    if (start.getFullYear() <= year) {
      const pad = (n: number) => String(n).padStart(2, '0');
      const fmt = (d: Date) => `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
      periods.push({
        label: `FN${pad(fn)} · ${fmt(start)} – ${fmt(end)}`,
        start,
        end,
      });
      fn++;
    }

    monday = new Date(monday);
    monday.setDate(monday.getDate() + 14);
  }

  return periods;
}

function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

const InvoicePanel = ({ shifts, settings, onIncrementCounter }: InvoicePanelProps) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedFn, setSelectedFn] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<InvoiceData | null>(null);

  const periods = useMemo(() => getFortnightPeriods(selectedYear), [selectedYear]);

  const periodShifts = useMemo(() => {
    if (!periods[selectedFn]) return [];
    const { start, end } = periods[selectedFn];
    return shifts.filter(s => {
      const d = new Date(s.date + 'T00:00:00');
      return d >= start && d <= end;
    }).sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
  }, [shifts, periods, selectedFn]);

  const total = periodShifts.reduce((s, sh) => s + Number(sh.gross_pay), 0);

  const generateInvoice = async () => {
    setGenerating(true);
    const counter = await onIncrementCounter();
    const pad = (n: number) => String(n).padStart(2, '0');
    const invoiceNumber = `INV-${selectedYear}-FN${pad(counter)}`;
    const { start, end } = periods[selectedFn];

    const data: InvoiceData = {
      invoiceNumber,
      periodStart: formatDateISO(start),
      periodEnd: formatDateISO(end),
      shifts: periodShifts,
      total,
      issuerName: settings?.business_name ?? '',
      abn: settings?.abn ?? '',
      bankName: settings?.bank_name ?? '',
      bsb: settings?.bsb ?? '',
      accountNumber: settings?.account_number ?? '',
      invoiceNotes: settings?.invoice_notes ?? 'GST-free supply – no GST charged.',
    };

    setPreview(data);
    setGenerating(false);
  };

  const printInvoice = () => {
    window.print();
  };

  const formatDateDisplay = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${days[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-foreground">Invoice Generator</h2>

      {/* Period selector */}
      <div className="glass-card p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select Fortnight Period</p>

        <div className="flex gap-2 items-center">
          <label className="text-xs text-muted-foreground shrink-0">Year</label>
          <div className="relative">
            <select
              value={selectedYear}
              onChange={e => { setSelectedYear(Number(e.target.value)); setSelectedFn(0); setPreview(null); }}
              className="glass-input text-foreground min-h-[40px] text-sm appearance-none pr-7"
            >
              {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        <div className="relative">
          <select
            value={selectedFn}
            onChange={e => { setSelectedFn(Number(e.target.value)); setPreview(null); }}
            className="glass-input w-full text-foreground min-h-[44px] appearance-none pr-8"
          >
            {periods.map((p, i) => (
              <option key={i} value={i}>{p.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>

        {/* Summary */}
        <div className="flex items-center justify-between py-2 border-t border-border">
          <div>
            <p className="text-xs text-muted-foreground">{periodShifts.length} shift{periodShifts.length !== 1 ? 's' : ''} in this period</p>
          </div>
          <p className="text-lg font-bold text-foreground">{formatCurrency(total)}</p>
        </div>

        <button
          onClick={generateInvoice}
          disabled={generating || periodShifts.length === 0}
          className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-2xl text-sm font-bold transition-all duration-200 disabled:opacity-40"
          style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', boxShadow: '0 4px 16px hsl(var(--primary)/0.3)' }}
        >
          <FileText className="w-4 h-4" />
          {generating ? 'Generating…' : 'Generate Invoice'}
        </button>
      </div>

      {/* Preview */}
      {preview && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Invoice Preview</p>
            <button
              onClick={printInvoice}
              className="flex items-center gap-1.5 glass-chip text-xs"
              style={{ color: 'hsl(var(--primary))' }}
            >
              <Download className="w-3.5 h-3.5" /> Print / Save PDF
            </button>
          </div>

          {/* Invoice Card — print-friendly */}
          <div id="invoice-preview" className="glass-card p-6 space-y-5 print:shadow-none print:border-0 print:bg-white print:text-black">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-foreground print:text-black">Invoice</h1>
                <p className="text-sm font-semibold mt-1" style={{ color: 'hsl(var(--primary))' }}>
                  {preview.invoiceNumber}
                </p>
              </div>
              <div className="text-right text-sm text-muted-foreground print:text-gray-600">
                <p className="font-semibold text-foreground print:text-black">{preview.issuerName || 'Your Name'}</p>
                {preview.abn && <p>ABN: {preview.abn}</p>}
              </div>
            </div>

            {/* Period */}
            <div className="glass-card p-3 space-y-1 print:border print:border-gray-200 print:bg-gray-50">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Service Period</p>
              <p className="text-sm font-semibold text-foreground print:text-black">
                {formatDateDisplay(preview.periodStart)} – {formatDateDisplay(preview.periodEnd)}
              </p>
            </div>

            {/* Line items */}
            <div className="space-y-1">
              <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-1 border-b border-border">
                <span className="col-span-5">Date</span>
                <span className="col-span-3">Time</span>
                <span className="col-span-2 text-center">Hours</span>
                <span className="col-span-2 text-right">Amount</span>
              </div>
              {preview.shifts.map(shift => (
                <div key={shift.id} className="grid grid-cols-12 gap-2 text-xs py-1.5 border-b border-border/50">
                  <span className="col-span-5 text-foreground print:text-black font-medium">
                    {formatDateDisplay(shift.date)}
                    {shift.is_sleepover && <span className="ml-1 text-[10px] text-muted-foreground">(Sleepover)</span>}
                    {shift.client_name && <span className="block text-[10px] text-muted-foreground">{shift.client_name}</span>}
                  </span>
                  <span className="col-span-3 text-muted-foreground print:text-gray-600">
                    {formatTime12h(shift.start_time)} – {formatTime12h(shift.end_time)}
                  </span>
                  <span className="col-span-2 text-center text-muted-foreground print:text-gray-600">
                    {shift.is_sleepover ? '—' : `${Number(shift.hours_worked).toFixed(1)}h`}
                  </span>
                  <span className="col-span-2 text-right font-semibold text-foreground print:text-black">
                    {formatCurrency(Number(shift.gross_pay))}
                  </span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold text-foreground print:text-black">{formatCurrency(preview.total)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">GST</span>
                <span className="font-semibold text-foreground print:text-black">$0.00</span>
              </div>
              <div className="flex justify-between text-base font-bold pt-1 border-t border-border">
                <span className="text-foreground print:text-black">Total (AUD)</span>
                <span style={{ color: 'hsl(var(--primary))' }}>{formatCurrency(preview.total)}</span>
              </div>
            </div>

            {/* Bank + Notes */}
            {(preview.bankName || preview.invoiceNotes) && (
              <div className="glass-card p-3 space-y-2 print:border print:border-gray-200 print:bg-gray-50">
                {preview.bankName && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Payment Details</p>
                    <p className="text-sm text-foreground print:text-black">{preview.bankName} · BSB {preview.bsb} · Acc {preview.accountNumber}</p>
                  </div>
                )}
                {preview.invoiceNotes && (
                  <p className="text-xs text-muted-foreground print:text-gray-600">{preview.invoiceNotes}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoicePanel;
