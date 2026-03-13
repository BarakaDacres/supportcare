import { useState, useMemo, useRef } from 'react';
import { FileText, ChevronDown, Download, User, Code2 } from 'lucide-react';
import { formatCurrency } from '@/lib/formatUtils';
import { formatTime12h } from '@/lib/shiftCalculator';
import type { Shift } from '@/hooks/useShifts';
import { effectiveGrossPay } from '@/hooks/useShifts';
import type { UserSettings } from '@/hooks/useUserSettings';
import type { Client } from '@/hooks/useClients';
import { MONTH_NAMES } from '@/lib/dateUtils';
import { groupShiftsForInvoice, DEFAULT_NDIS_CODES, type NdisItemCodes } from '@/lib/invoiceGrouping';
import type { PayRates } from '@/lib/shiftCalculator';
import { DEFAULT_RATES } from '@/lib/shiftCalculator';

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
  clientName: string;
  clientParticipantNumber: string;
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
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState<InvoiceData | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const periods = useMemo(() => getFortnightPeriodsForYear(selectedYear), [selectedYear]);
  const selectedPeriod = periods[selectedFnIdx] ?? periods[0];
  const selectedClient = clients.find(c => c.id === selectedClientId) ?? null;

  const rates: PayRates = {
    rate_weekday: settings?.rate_weekday ?? DEFAULT_RATES.rate_weekday,
    rate_saturday: settings?.rate_saturday ?? DEFAULT_RATES.rate_saturday,
    rate_sunday: settings?.rate_sunday ?? DEFAULT_RATES.rate_sunday,
    rate_sleepover_weekday: settings?.rate_sleepover_weekday ?? DEFAULT_RATES.rate_sleepover_weekday,
    rate_sleepover_weekend: settings?.rate_sleepover_weekend ?? DEFAULT_RATES.rate_sleepover_weekend,
    rate_public_holiday: settings?.rate_public_holiday ?? DEFAULT_RATES.rate_public_holiday,
    rate_evening: settings?.rate_evening ?? DEFAULT_RATES.rate_evening,
  };

  // Parse NDIS codes from settings invoice_notes field or use defaults
  // We store them as JSON in a special field — for now use defaults
  const ndisCodesStr = (settings as unknown as { ndis_codes?: string })?.ndis_codes;
  const ndisCodes: Partial<NdisItemCodes> = ndisCodesStr ? JSON.parse(ndisCodesStr) : {};

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

  const lineGroups = useMemo(
    () => groupShiftsForInvoice(periodShifts, rates, ndisCodes),
    [periodShifts, settings], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const generateInvoice = async () => {
    if (!selectedPeriod) return;
    setGenerating(true);

    const pad = (n: number) => String(n).padStart(2, '0');
    const clientSuffix = selectedClient ? `-${selectedClient.name.replace(/\s+/g, '').slice(0, 8).toUpperCase()}` : '';
    const invoiceNumber = `INV-${selectedYear}-FN${pad(selectedPeriod.fnNumber)}${clientSuffix}`;
    const today = new Date();

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
      clientName: selectedClient?.invoice_label ?? selectedClient?.name ?? '',
      clientParticipantNumber: selectedClient?.participant_number ?? '',
    };

    setPreview(data);
    setGenerating(false);
  };

  const handleExportPDF = async () => {
    if (!printRef.current || !preview) return;
    setExporting(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const element = printRef.current;
      const opt = {
        margin: [10, 10, 10, 10],
        filename: `${preview.invoiceNumber}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      };
      await html2pdf().set(opt).from(element).save();
    } catch (e) {
      console.error('PDF export error:', e);
      window.print();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 no-print-wrapper">
      <h2 className="text-lg font-bold text-foreground no-print">Invoice Generator</h2>

      {/* Period selector */}
      <div className="glass-card p-4 space-y-3 no-print">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select Fortnight Period</p>

        {/* Client filter */}
        {clients.length > 0 && (
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <User className="w-3 h-3" /> Client Filter
            </label>
            <div className="relative">
              <select
                value={selectedClientId}
                onChange={e => { setSelectedClientId(e.target.value); setPreview(null); }}
                className="glass-input w-full text-foreground min-h-[44px] appearance-none pr-8"
              >
                <option value="">All clients</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
            {selectedClient && (
              <p className="text-[10px] text-muted-foreground">
                Invoice will only include shifts for <strong>{selectedClient.name}</strong>
                {selectedClient.participant_number && ` (#${selectedClient.participant_number})`}.
              </p>
            )}
          </div>
        )}

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
              onClick={handleExportPDF}
              disabled={exporting}
              className="flex items-center gap-1.5 glass-chip text-xs disabled:opacity-50"
              style={{ color: 'hsl(var(--primary))' }}
            >
              <Download className="w-3.5 h-3.5" />
              {exporting ? 'Exporting…' : 'Export PDF'}
            </button>
          </div>

          {/* ══════════════════════════════════════════
              PRINTABLE INVOICE
          ══════════════════════════════════════════ */}
          <div ref={printRef} id="invoice-preview" className="invoice-print-area glass-card overflow-hidden">

            {/* ── Top accent bar ── */}
            <div className="h-1.5 w-full" style={{ background: 'hsl(var(--primary))' }} />

            <div className="p-6 space-y-6">

              {/* ── Header: Invoice title + Issuer ── */}
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-foreground">Invoice</h1>
                  <p className="text-xs text-muted-foreground mt-1">NDIS Support Services — GST-Free Supply</p>
                </div>
                <div className="text-right">
                  <p className="text-base font-bold text-foreground">{preview.issuerName || 'Your Name'}</p>
                  {preview.abn && (
                    <p className="text-xs text-muted-foreground mt-0.5">ABN {preview.abn}</p>
                  )}
                </div>
              </div>

              {/* ── Invoice meta ── */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">Invoice No.</p>
                  <p className="text-sm font-bold text-foreground">{preview.invoiceNumber}</p>
                </div>
                <div>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">Issue Date</p>
                  <p className="text-sm font-semibold text-foreground">{formatDateShort(preview.issueDate)}</p>
                </div>
                <div className="col-span-2 sm:col-span-2">
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">Service Period</p>
                  <p className="text-sm font-semibold text-foreground">
                    {formatDateShort(preview.periodStart)} – {formatDateShort(preview.periodEnd)}
                  </p>
                </div>
              </div>

              {/* ── Bill to (if client) ── */}
              {preview.clientName && (
                <div className="rounded-xl p-3 space-y-0.5" style={{ background: 'hsl(var(--muted)/0.5)' }}>
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Bill To / Participant</p>
                  <p className="text-sm font-bold text-foreground">{preview.clientName}</p>
                  {preview.clientParticipantNumber && (
                    <p className="text-xs text-muted-foreground">NDIS Participant No: {preview.clientParticipantNumber}</p>
                  )}
                </div>
              )}

              {/* ── Grouped Line Items ── */}
              <div>
                {/* Table header */}
                <div
                  className="grid gap-2 py-2 px-3 rounded-t-xl"
                  style={{
                    gridTemplateColumns: '1fr 130px 56px 56px 80px',
                    background: 'hsl(var(--primary)/0.1)',
                  }}
                >
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Support Type</span>
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">NDIS Code</span>
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest text-center">Qty</span>
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest text-right">Rate</span>
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest text-right">Subtotal</span>
                </div>

                {/* Grouped rows */}
                <div className="border border-t-0 border-border rounded-b-xl overflow-hidden">
                  {lineGroups.map((group, idx) => (
                    <div key={group.category}>
                      {/* Group summary row */}
                      <div
                        className="grid gap-2 py-3 px-3 items-center"
                        style={{
                          gridTemplateColumns: '1fr 130px 56px 56px 80px',
                          background: idx % 2 === 1 ? 'hsl(var(--muted)/0.2)' : 'transparent',
                        }}
                      >
                        <div>
                          <p className="text-xs font-bold text-foreground">{group.label}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {group.shifts.length} shift{group.shifts.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Code2 className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                          <p className="text-[9px] font-mono text-muted-foreground leading-tight break-all">{group.ndisCode}</p>
                        </div>
                        <p className="text-[11px] text-muted-foreground text-center">
                          {group.isSleepover
                            ? `${group.quantity} night${group.quantity !== 1 ? 's' : ''}`
                            : `${group.quantity}h`}
                        </p>
                        <p className="text-[11px] text-muted-foreground text-right">
                          {group.isSleepover
                            ? `${formatCurrency(group.rate)} flat`
                            : `$${group.rate}/hr`}
                        </p>
                        <p className="text-xs font-bold money-text text-right">{formatCurrency(group.subtotal)}</p>
                      </div>

                      {/* Shift detail rows (collapsed, subtle) */}
                      {group.shifts.map((shift) => (
                        <div
                          key={shift.id}
                          className="grid gap-2 py-1.5 px-3 items-center border-t"
                          style={{
                            gridTemplateColumns: '1fr 130px 56px 56px 80px',
                            borderColor: 'hsl(var(--border)/0.4)',
                            background: 'hsl(var(--muted)/0.06)',
                          }}
                        >
                          <div className="pl-2">
                            <p className="text-[10px] text-muted-foreground">{formatDateFull(shift.date)}</p>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {formatTime12h(shift.start_time)}–{formatTime12h(shift.end_time)}
                          </p>
                          <p className="text-[10px] text-muted-foreground text-center">
                            {shift.is_sleepover ? '1 night' : `${Number(shift.hours_worked).toFixed(1)}h`}
                          </p>
                          <p className="text-[10px] text-muted-foreground text-right">—</p>
                          <p className="text-[10px] text-muted-foreground text-right">
                            {formatCurrency(effectiveGrossPay(shift))}
                          </p>
                        </div>
                      ))}
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
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoicePanel;
