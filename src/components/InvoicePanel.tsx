import { useState, useMemo } from 'react';
import { FileText, Download, ChevronDown, Printer } from 'lucide-react';
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
  fnIndex: number; // 1-based fortnight number for the year
  shifts: Shift[];
  total: number;
  issuerName: string;
  abn: string;
  bankName: string;
  bsb: string;
  accountNumber: string;
  invoiceNotes: string;
}

/**
 * Get Monday-aligned fortnight periods for a given year.
 * Anchor: The Monday on or before 1 Jan of the year.
 * FN01 = first fortnight starting in (or just before) the year.
 * We return only periods whose START falls within the selected year.
 */
function getFortnightPeriods(year: number): { label: string; start: Date; end: Date; fnNumber: number }[] {
  // Find the Monday on or before Jan 1
  const jan1 = new Date(year, 0, 1);
  const dow = jan1.getDay(); // 0=Sun,1=Mon...6=Sat
  // Days to subtract to get to the most recent Monday
  const daysToMon = dow === 0 ? 6 : dow - 1;
  const anchor = new Date(year, 0, 1 - daysToMon);

  const periods: { label: string; start: Date; end: Date; fnNumber: number }[] = [];
  let fn = 1;
  let cursor = new Date(anchor);

  // Iterate through all fortnights that START within the year
  while (true) {
    const start = new Date(cursor);
    const end = new Date(cursor);
    end.setDate(end.getDate() + 13);

    // Only include fortnights that start in the chosen year
    if (start.getFullYear() > year) break;

    if (start.getFullYear() === year || (start.getFullYear() < year && end.getFullYear() === year)) {
      // Include this period if it overlaps the year
      const pad = (n: number) => String(n).padStart(2, '0');
      const fmt = (d: Date) =>
        `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
      periods.push({
        fnNumber: fn,
        label: `FN${pad(fn)} · ${fmt(start)} – ${fmt(end)}`,
        start,
        end,
      });
      fn++;
    } else {
      fn++; // still increment so the numbering is stable
    }

    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 14);
  }

  return periods;
}

// Rebuild to only include periods starting in the year (cleaner)
function getFortnightPeriodsForYear(year: number): { label: string; start: Date; end: Date; fnNumber: number }[] {
  // Anchor: Monday on or before Jan 1
  const jan1 = new Date(year, 0, 1);
  const dow = jan1.getDay();
  const daysToMon = dow === 0 ? 6 : dow - 1;
  const anchor = new Date(year, 0, 1 - daysToMon);

  const periods: { label: string; start: Date; end: Date; fnNumber: number }[] = [];
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) =>
    `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;

  let fn = 1;
  let cursor = new Date(anchor);

  while (true) {
    const start = new Date(cursor);
    const end = new Date(cursor);
    end.setDate(end.getDate() + 13);

    if (start.getFullYear() > year) break;

    // Include all fortnights anchored to this year's Monday grid
    periods.push({
      fnNumber: fn,
      label: `FN${pad(fn)} · ${fmt(start)} – ${fmt(end)}`,
      start,
      end,
    });
    fn++;

    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 14);

    if (cursor.getFullYear() > year) break;
  }

  return periods;
}

function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

const InvoicePanel = ({ shifts, settings, onIncrementCounter: _onIncrementCounter }: InvoicePanelProps) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedFnIdx, setSelectedFnIdx] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<InvoiceData | null>(null);

  const periods = useMemo(() => getFortnightPeriodsForYear(selectedYear), [selectedYear]);

  // Auto-select the current fortnight on mount / year change
  const selectedPeriod = periods[selectedFnIdx] ?? periods[0];

  const periodShifts = useMemo(() => {
    if (!selectedPeriod) return [];
    const { start, end } = selectedPeriod;
    // Inclusive date range comparison using string comparison (YYYY-MM-DD)
    const startStr = formatDateISO(start);
    const endStr = formatDateISO(end);
    return shifts
      .filter(s => s.date >= startStr && s.date <= endStr)
      .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
  }, [shifts, selectedPeriod]);

  const total = periodShifts.reduce((s, sh) => s + Number(sh.gross_pay), 0);

  const generateInvoice = async () => {
    if (!selectedPeriod) return;
    setGenerating(true);

    // Invoice number is deterministic: INV-YYYY-FN##
    const pad = (n: number) => String(n).padStart(2, '0');
    const invoiceNumber = `INV-${selectedYear}-FN${pad(selectedPeriod.fnNumber)}`;

    const data: InvoiceData = {
      invoiceNumber,
      fnIndex: selectedPeriod.fnNumber,
      periodStart: formatDateISO(selectedPeriod.start),
      periodEnd: formatDateISO(selectedPeriod.end),
      shifts: periodShifts,
      total,
      issuerName: settings?.business_name ?? '',
      abn: settings?.abn ?? '',
      bankName: settings?.bank_name ?? '',
      bsb: settings?.bsb ?? '',
      accountNumber: settings?.account_number ?? '',
      invoiceNotes: settings?.invoice_notes || 'GST-free supply – no GST charged.',
    };

    setPreview(data);
    setGenerating(false);
  };

  const formatDateDisplay = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${days[date.getDay()]} ${d} ${MONTH_NAMES[m - 1]} ${y}`;
  };

  const today = new Date();
  const todayStr = formatDateISO(today);

  return (
    <div className="space-y-4 no-print-wrapper">
      <h2 className="text-lg font-bold text-foreground no-print">Invoice Generator</h2>

      {/* Period selector */}
      <div className="glass-card p-4 space-y-3 no-print">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select Fortnight Period</p>

        <div className="flex gap-2 items-center">
          <label className="text-xs text-muted-foreground shrink-0">Year</label>
          <div className="relative">
            <select
              value={selectedYear}
              onChange={e => {
                setSelectedYear(Number(e.target.value));
                setSelectedFnIdx(0);
                setPreview(null);
              }}
              className="glass-input text-foreground min-h-[40px] text-sm appearance-none pr-8 pl-3"
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
            value={selectedFnIdx}
            onChange={e => { setSelectedFnIdx(Number(e.target.value)); setPreview(null); }}
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
          <p className="text-xs text-muted-foreground">
            {periodShifts.length} shift{periodShifts.length !== 1 ? 's' : ''} in this period
          </p>
          <p className="text-lg font-bold text-foreground">{formatCurrency(total)}</p>
        </div>

        <button
          onClick={generateInvoice}
          disabled={generating || periodShifts.length === 0}
          className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-2xl text-sm font-bold transition-all duration-200 disabled:opacity-40"
          style={{
            background: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
            boxShadow: '0 4px 16px hsl(var(--primary)/0.3)',
          }}
        >
          <FileText className="w-4 h-4" />
          {generating ? 'Generating…' : periodShifts.length === 0 ? 'No shifts in period' : 'Generate Invoice'}
        </button>
      </div>

      {/* Preview */}
      {preview && (
        <div className="space-y-3">
          <div className="flex items-center justify-between no-print">
            <p className="text-sm font-semibold text-foreground">Preview — {preview.invoiceNumber}</p>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 glass-chip text-xs"
              style={{ color: 'hsl(var(--primary))' }}
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save PDF
            </button>
          </div>

          {/* ── PRINTABLE INVOICE ── */}
          <div
            id="invoice-preview"
            className="invoice-print-area glass-card p-6 space-y-5"
          >
            {/* Header row */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Invoice</h1>
                <p className="text-sm font-bold mt-1" style={{ color: 'hsl(var(--primary))' }}>
                  {preview.invoiceNumber}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Date issued: {formatDateDisplay(todayStr)}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-foreground text-sm">{preview.issuerName || 'Your Name'}</p>
                {preview.abn && (
                  <p className="text-xs text-muted-foreground">ABN: {preview.abn}</p>
                )}
              </div>
            </div>

            {/* Service period */}
            <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-0.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Service Period</p>
              <p className="text-sm font-semibold text-foreground">
                {formatDateDisplay(preview.periodStart)} – {formatDateDisplay(preview.periodEnd)}
              </p>
            </div>

            {/* Line items table */}
            <div className="space-y-1">
              {/* Table header */}
              <div className="grid gap-1 pb-1 border-b border-border"
                style={{ gridTemplateColumns: '1fr 120px 52px 80px' }}>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Description</span>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Time</span>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Hrs</span>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Amount</span>
              </div>

              {/* Rows */}
              {preview.shifts.map(shift => (
                <div
                  key={shift.id}
                  className="grid gap-1 py-2 border-b border-border/50 items-start"
                  style={{ gridTemplateColumns: '1fr 120px 52px 80px' }}
                >
                  <div>
                    <span className="text-xs font-medium text-foreground">
                      {formatDateDisplay(shift.date)}
                    </span>
                    {shift.is_sleepover && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">(Sleepover)</span>
                    )}
                    {shift.client_name && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{shift.client_name}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatTime12h(shift.start_time)}–{formatTime12h(shift.end_time)}
                  </span>
                  <span className="text-xs text-muted-foreground text-center">
                    {shift.is_sleepover ? '—' : `${Number(shift.hours_worked).toFixed(1)}`}
                  </span>
                  <span className="text-xs font-semibold text-foreground text-right">
                    {formatCurrency(Number(shift.gross_pay))}
                  </span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold text-foreground">{formatCurrency(preview.total)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">GST</span>
                <span className="font-semibold text-foreground">$0.00</span>
              </div>
              <div className="flex justify-between text-base font-bold pt-2 border-t border-border">
                <span className="text-foreground">Total (AUD)</span>
                <span style={{ color: 'hsl(var(--primary))' }}>{formatCurrency(preview.total)}</span>
              </div>
            </div>

            {/* Payment + notes */}
            <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
              {preview.bankName && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Payment Details</p>
                  <p className="text-xs text-foreground">
                    {preview.bankName}
                    {preview.bsb ? ` · BSB ${preview.bsb}` : ''}
                    {preview.accountNumber ? ` · Acc ${preview.accountNumber}` : ''}
                  </p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">{preview.invoiceNotes}</p>
            </div>
          </div>
          {/* End invoice-print-area */}
        </div>
      )}
    </div>
  );
};

export default InvoicePanel;
