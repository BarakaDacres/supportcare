import { useState, useMemo, useRef } from 'react';
import { FileText, ChevronDown, Download, User } from 'lucide-react';
import { formatCurrency } from '@/lib/formatUtils';
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

function formatDateShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTH_NAMES[m - 1].slice(0, 3)} ${y}`;
}

const InvoicePanel = ({ shifts, clients, settings, onIncrementCounter }: InvoicePanelProps) => {
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
    try {
      // New format: INV-006 (zero-padded sequential counter)
      const counter = await onIncrementCounter();
      const invoiceNumber = `INV-${String(counter).padStart(3, '0')}`;
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
    } finally {
      setGenerating(false);
    }
  };

  const handleExportPDF = async () => {
    if (!printRef.current || !preview) return;
    setExporting(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const element = printRef.current;
      const opt = {
        margin: [10, 12, 10, 12],
        filename: `${preview.invoiceNumber}.pdf`,
        image: { type: 'png' },
        html2canvas: {
          scale: 3,
          useCORS: true,
          letterRendering: true,
          logging: false,
          backgroundColor: '#ffffff',
        },
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
              PRINTABLE INVOICE — compact single-page layout
              Only grouped category rows, no per-day detail.
          ══════════════════════════════════════════ */}
          <div
            ref={printRef}
            id="invoice-preview"
            className="invoice-print-area glass-card overflow-hidden"
            style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
          >
            {/* ── Top accent bar ── */}
            <div className="h-1 w-full" style={{ background: 'hsl(var(--primary))' }} />

            <div style={{ padding: '20px 24px' }}>

              {/* ── Header row ── */}
              <div
                className="flex items-start justify-between gap-4"
                style={{ paddingBottom: 14, marginBottom: 14, borderBottom: '1px solid hsl(var(--border))' }}
              >
                <div>
                  <h1 style={{ fontSize: 24, fontWeight: 800, color: 'hsl(var(--foreground))', margin: 0, letterSpacing: '-0.02em' }}>
                    Invoice
                  </h1>
                  <p style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
                    NDIS Support Services — GST-Free Supply
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'hsl(var(--foreground))', margin: 0 }}>
                    {preview.issuerName || 'Your Name'}
                  </p>
                  {preview.abn && (
                    <p style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
                      ABN {preview.abn}
                    </p>
                  )}
                </div>
              </div>

              {/* ── Meta row ── */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 8,
                  marginBottom: 14,
                }}
              >
                {[
                  { label: 'Invoice No.', value: preview.invoiceNumber },
                  { label: 'Issue Date', value: formatDateShort(preview.issueDate) },
                  { label: 'Period From', value: formatDateShort(preview.periodStart) },
                  { label: 'Period To', value: formatDateShort(preview.periodEnd) },
                ].map(m => (
                  <div key={m.label}>
                    <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))', marginBottom: 2 }}>
                      {m.label}
                    </p>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'hsl(var(--foreground))' }}>{m.value}</p>
                  </div>
                ))}
              </div>

              {/* ── Bill To ── */}
              {preview.clientName && (
                <div
                  style={{
                    background: 'hsl(var(--muted)/0.5)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    marginBottom: 14,
                  }}
                >
                  <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))', marginBottom: 3 }}>
                    Participant / Bill To
                  </p>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'hsl(var(--foreground))', margin: 0 }}>{preview.clientName}</p>
                  {preview.clientParticipantNumber && (
                    <p style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
                      NDIS Participant No: {preview.clientParticipantNumber}
                    </p>
                  )}
                </div>
              )}

              {/* ── Line items table — grouped categories only ── */}
              <div style={{ marginBottom: 14 }}>
                {/* Table header */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1.6fr 60px 60px 72px',
                    gap: 6,
                    padding: '7px 12px',
                    background: 'hsl(var(--primary)/0.1)',
                    borderRadius: '8px 8px 0 0',
                  }}
                >
                  {['Support Category', 'NDIS Item Code', 'Qty', 'Rate', 'Subtotal'].map((h, i) => (
                    <span
                      key={h}
                      style={{
                        fontSize: 8,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: 'hsl(var(--muted-foreground))',
                        textAlign: i >= 2 ? 'right' : 'left',
                      }}
                    >
                      {h}
                    </span>
                  ))}
                </div>

                {/* Category rows — no per-day breakdown */}
                <div
                  style={{
                    border: '1px solid hsl(var(--border))',
                    borderTop: 'none',
                    borderRadius: '0 0 8px 8px',
                    overflow: 'hidden',
                  }}
                >
                  {lineGroups.map((group, idx) => (
                    <div
                      key={group.category}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1.6fr 60px 60px 72px',
                        gap: 6,
                        padding: '10px 12px',
                        background: idx % 2 === 1 ? 'hsl(var(--muted)/0.18)' : 'transparent',
                        borderTop: idx === 0 ? 'none' : '0.5px solid hsl(var(--border)/0.5)',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 700, color: 'hsl(var(--foreground))', margin: 0 }}>
                          {group.label}
                        </p>
                        <p style={{ fontSize: 9, color: 'hsl(var(--muted-foreground))', marginTop: 1 }}>
                          {group.shifts.length} shift{group.shifts.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <p style={{ fontSize: 9, fontFamily: 'monospace', color: 'hsl(var(--muted-foreground))' }}>
                        {group.ndisCode}
                      </p>
                      <p style={{ fontSize: 11, color: 'hsl(var(--foreground))', textAlign: 'right' }}>
                        {group.isSleepover
                          ? `${group.quantity}n`
                          : `${group.quantity}h`}
                      </p>
                      <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', textAlign: 'right' }}>
                        {group.isSleepover ? `$${group.rate}` : `$${group.rate}/h`}
                      </p>
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'hsl(var(--money-green))', textAlign: 'right' }}>
                        {formatCurrency(group.subtotal)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Totals ── */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  marginBottom: 14,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'hsl(var(--muted-foreground))' }}>Subtotal</span>
                  <span style={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>{formatCurrency(preview.total)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'hsl(var(--muted-foreground))' }}>GST</span>
                  <span style={{ color: 'hsl(var(--muted-foreground))' }}>$0.00 (GST-free)</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: 'hsl(var(--money-green)/0.1)',
                    border: '1px solid hsl(var(--money-green)/0.25)',
                    marginTop: 4,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'hsl(var(--foreground))' }}>
                    Total Amount Due (AUD)
                  </span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: 'hsl(var(--money-green))' }}>
                    {formatCurrency(preview.total)}
                  </span>
                </div>
              </div>

              {/* ── Payment details ── */}
              {preview.bankName && (
                <div
                  style={{
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 10,
                    padding: '10px 14px',
                    marginBottom: 10,
                  }}
                >
                  <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))', marginBottom: 6 }}>
                    Payment Details
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    <div>
                      <p style={{ fontSize: 8, color: 'hsl(var(--muted-foreground))' }}>Bank</p>
                      <p style={{ fontSize: 11, fontWeight: 600, color: 'hsl(var(--foreground))' }}>{preview.bankName}</p>
                    </div>
                    {preview.bsb && (
                      <div>
                        <p style={{ fontSize: 8, color: 'hsl(var(--muted-foreground))' }}>BSB</p>
                        <p style={{ fontSize: 11, fontWeight: 600, color: 'hsl(var(--foreground))' }}>{preview.bsb}</p>
                      </div>
                    )}
                    {preview.accountNumber && (
                      <div>
                        <p style={{ fontSize: 8, color: 'hsl(var(--muted-foreground))' }}>Account</p>
                        <p style={{ fontSize: 11, fontWeight: 600, color: 'hsl(var(--foreground))' }}>{preview.accountNumber}</p>
                      </div>
                    )}
                  </div>
                  <p style={{ fontSize: 9, color: 'hsl(var(--muted-foreground))', marginTop: 6, paddingTop: 6, borderTop: '0.5px solid hsl(var(--border))' }}>
                    Please use <strong>{preview.invoiceNumber}</strong> as the payment reference.
                  </p>
                </div>
              )}

              {/* ── Notes ── */}
              {preview.invoiceNotes && (
                <div
                  style={{
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 10,
                    padding: '8px 14px',
                    marginBottom: 10,
                  }}
                >
                  <p style={{ fontSize: 9, color: 'hsl(var(--muted-foreground))', whiteSpace: 'pre-line' }}>{preview.invoiceNotes}</p>
                </div>
              )}

              {/* ── Footer ── */}
              <div style={{ paddingTop: 8, borderTop: '0.5px solid hsl(var(--border))', textAlign: 'center' }}>
                <p style={{ fontSize: 8, color: 'hsl(var(--muted-foreground))' }}>
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
