import { useState, useMemo } from 'react';
import { FileText, ChevronDown, Printer, User } from 'lucide-react';
import { formatCurrency } from '@/lib/formatUtils';
import { formatTime12h } from '@/lib/shiftCalculator';
import type { Shift } from '@/hooks/useShifts';
import { effectiveGrossPay } from '@/hooks/useShifts';
import type { UserSettings } from '@/hooks/useUserSettings';
import type { Client } from '@/hooks/useClients';
import { MONTH_NAMES } from '@/lib/dateUtils';

interface InvoicePanelProps {
  shifts: Shift[];
  clients: Client[];
  settings: UserSettings | null;
  onIncrementCounter: () => Promise<number>;
}

interface InvoiceData {
  invoiceNumber: string;
  issueDate: string;
  periodStart: string;
  periodEnd: string;
  fnIndex: number;
  shifts: Shift[];
  total: number;
  issuerName: string;
  abn: string;
  bankName: string;
  bsb: string;
  accountNumber: string;
  invoiceNotes: string;
}

function getFortnightPeriodsForYear(year: number): { label: string; start: Date; end: Date; fnNumber: number }[] {
  const jan1 = new Date(year, 0, 1);
  const dow = jan1.getDay();
  const daysToMon = dow === 0 ? 6 : dow - 1;
  const anchor = new Date(year, 0, 1 - daysToMon);

  const periods: { label: string; start: Date; end: Date; fnNumber: number }[] = [];
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;

  let fn = 1;
  let cursor = new Date(anchor);

  while (true) {
    const start = new Date(cursor);
    const end = new Date(cursor);
    end.setDate(end.getDate() + 13);
    if (start.getFullYear() > year) break;
    periods.push({
      fnNumber: fn,
      label: `FN${pad(fn)} · ${fmt(start)} – ${fmt(end)}`,
      start,
      end,
    });
    fn++;
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

function formatDateFull(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return `${days[date.getDay()]} ${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

function formatDateShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTH_NAMES[m - 1].slice(0, 3)} ${y}`;
}

const InvoicePanel = ({ shifts, clients, settings, onIncrementCounter: _onIncrementCounter }: InvoicePanelProps) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedFnIdx, setSelectedFnIdx] = useState(0);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<InvoiceData | null>(null);

  const periods = useMemo(() => getFortnightPeriodsForYear(selectedYear), [selectedYear]);
  const selectedPeriod = periods[selectedFnIdx] ?? periods[0];
  const selectedClient = clients.find(c => c.id === selectedClientId) ?? null;

  const periodShifts = useMemo(() => {
    if (!selectedPeriod) return [];
    const startStr = formatDateISO(selectedPeriod.start);
    const endStr = formatDateISO(selectedPeriod.end);
    return shifts
      .filter(s => {
        if (s.date < startStr || s.date > endStr) return false;
        if (selectedClientId && s.client_id !== selectedClientId) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
  }, [shifts, selectedPeriod, selectedClientId]);

  const total = periodShifts.reduce((s, sh) => s + effectiveGrossPay(sh), 0);

  const generateInvoice = async () => {
    if (!selectedPeriod) return;
    setGenerating(true);

    const pad = (n: number) => String(n).padStart(2, '0');
    const clientSuffix = selectedClient ? `-${selectedClient.name.replace(/\s+/g, '').slice(0, 8).toUpperCase()}` : '';
    const invoiceNumber = `INV-${selectedYear}-FN${pad(selectedPeriod.fnNumber)}${clientSuffix}`;
    const today = new Date();

    // Use client-specific invoice notes if available, else fall back to settings
    const clientInvoiceNotes = selectedClient?.invoice_notes ?? null;

    const data: InvoiceData = {
      invoiceNumber,
      issueDate: formatDateISO(today),
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
      invoiceNotes: clientInvoiceNotes || settings?.invoice_notes || 'GST-free supply – no GST charged. Payment due within 14 days.',
    };

    setPreview(data);
    setGenerating(false);
  };

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

        <div className="flex items-center justify-between py-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {periodShifts.length} shift{periodShifts.length !== 1 ? 's' : ''} in this period
          </p>
          <p className="text-lg font-bold money-text">{formatCurrency(total)}</p>
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

      {/* Invoice preview */}
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

          {/* ══════════════════════════════════════════
              PRINTABLE INVOICE — matches reference layout
          ══════════════════════════════════════════ */}
          <div id="invoice-preview" className="invoice-print-area glass-card overflow-hidden">

            {/* ── Top accent bar ── */}
            <div className="h-1.5 w-full" style={{ background: 'hsl(var(--primary))' }} />

            <div className="p-6 space-y-6">

              {/* ── Header: Invoice title + Issuer ── */}
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-foreground">Invoice</h1>
                  <p className="text-xs text-muted-foreground mt-1">Support Services — GST-Free Supply</p>
                </div>
                <div className="text-right">
                  <p className="text-base font-bold text-foreground">{preview.issuerName || 'Your Name'}</p>
                  {preview.abn && (
                    <p className="text-xs text-muted-foreground mt-0.5">ABN {preview.abn}</p>
                  )}
                </div>
              </div>

              {/* ── Invoice meta: number, issue date, period ── */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">Invoice Number</p>
                  <p className="text-sm font-bold text-foreground">{preview.invoiceNumber}</p>
                </div>
                <div>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">Issue Date</p>
                  <p className="text-sm font-semibold text-foreground">{formatDateShort(preview.issueDate)}</p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">Service Period</p>
                  <p className="text-sm font-semibold text-foreground">
                    {formatDateShort(preview.periodStart)} – {formatDateShort(preview.periodEnd)}
                  </p>
                </div>
              </div>

              {/* ── Service description header ── */}
              <div className="rounded-xl p-3" style={{ background: 'hsl(var(--muted)/0.5)' }}>
                <p className="text-xs font-semibold text-foreground">NDIS Support Services — Independent Support Worker</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Disability support services provided during the fortnight period above.
                  All services are GST-free as per NDIS guidelines.
                </p>
              </div>

              {/* ── Line items table ── */}
              <div>
                {/* Table header */}
                <div
                  className="grid gap-2 py-2 px-3 rounded-t-xl"
                  style={{
                    gridTemplateColumns: '1fr 100px 48px 72px',
                    background: 'hsl(var(--primary)/0.1)',
                  }}
                >
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Date / Description</span>
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Time</span>
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest text-center">Hrs</span>
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest text-right">Amount</span>
                </div>

                {/* Rows */}
                <div className="border border-t-0 border-border rounded-b-xl overflow-hidden">
                  {preview.shifts.map((shift, idx) => (
                    <div
                      key={shift.id}
                      className="grid gap-2 py-3 px-3 items-center border-b border-border/50 last:border-b-0"
                      style={{
                        gridTemplateColumns: '1fr 100px 48px 72px',
                        background: idx % 2 === 1 ? 'hsl(var(--muted)/0.2)' : 'transparent',
                      }}
                    >
                      <div>
                        <p className="text-xs font-semibold text-foreground">{formatDateFull(shift.date)}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {shift.is_sleepover
                            ? 'Night Sleepover Support'
                            : shift.is_public_holiday
                            ? 'Public Holiday Support Services'
                            : shift.notes
                            ? shift.notes.split('\n')[0]
                            : 'Support Services'}
                          {shift.client_name ? ` · ${shift.client_name}` : ''}
                          {shift.is_public_holiday && !shift.is_sleepover && (
                            <span className="ml-1 text-[9px] font-semibold" style={{ color: 'hsl(34 97% 52%)' }}>
                              ★ PH Rate
                            </span>
                          )}
                        </p>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {formatTime12h(shift.start_time)}–{formatTime12h(shift.end_time)}
                      </p>
                      <p className="text-[11px] text-muted-foreground text-center">
                        {shift.is_sleepover ? '—' : Number(shift.hours_worked).toFixed(1)}
                      </p>
                      <p className="text-xs font-bold money-text text-right">
                        {formatCurrency(effectiveGrossPay(shift))}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Totals ── */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold text-foreground">{formatCurrency(preview.total)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">GST</span>
                  <span className="font-semibold text-muted-foreground">$0.00 (GST-free)</span>
                </div>
                <div
                  className="flex justify-between items-center py-3 px-4 rounded-xl mt-1"
                  style={{ background: 'hsl(var(--money-green)/0.1)', border: '1px solid hsl(var(--money-green)/0.25)' }}
                >
                  <span className="text-sm font-bold text-foreground">Total Amount Due (AUD)</span>
                  <span className="text-xl font-bold money-text">{formatCurrency(preview.total)}</span>
                </div>
              </div>

              {/* ── Payment details + Notes ── */}
              {(preview.bankName || preview.invoiceNotes) && (
                <div className="space-y-3">
                  {preview.bankName && (
                    <div className="rounded-xl border border-border p-4 space-y-2">
                      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Payment Details</p>
                      <div className="grid grid-cols-1 gap-1 sm:grid-cols-3 sm:gap-3">
                        <div>
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Bank</p>
                          <p className="text-xs font-semibold text-foreground">{preview.bankName}</p>
                        </div>
                        {preview.bsb && (
                          <div>
                            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">BSB</p>
                            <p className="text-xs font-semibold text-foreground">{preview.bsb}</p>
                          </div>
                        )}
                        {preview.accountNumber && (
                          <div>
                            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Account</p>
                            <p className="text-xs font-semibold text-foreground">{preview.accountNumber}</p>
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground pt-1 border-t border-border">
                        Please use invoice number <strong>{preview.invoiceNumber}</strong> as the payment reference.
                      </p>
                    </div>
                  )}

                  {preview.invoiceNotes && (
                    <div className="rounded-xl border border-border p-3">
                      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Notes</p>
                      <p className="text-xs text-muted-foreground whitespace-pre-line">{preview.invoiceNotes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Footer ── */}
              <div className="pt-2 border-t border-border text-center">
                <p className="text-[9px] text-muted-foreground">
                  This invoice is GST-free. No GST is charged on NDIS disability support services.
                  {preview.abn ? ` ABN: ${preview.abn}.` : ''}
                </p>
              </div>

            </div>
            {/* End p-6 */}
          </div>
          {/* End invoice-print-area */}
        </div>
      )}
    </div>
  );
};

export default InvoicePanel;
