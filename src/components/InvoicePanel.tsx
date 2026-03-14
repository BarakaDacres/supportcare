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
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  fnIndex: number;
  shifts: Shift[];
  total: number;
  issuerName: string;
  abn: string;
  phone: string;
  address: string;
  email: string;
  bankName: string;
  bsb: string;
  accountNumber: string;
  accountName: string;
  invoiceNotes: string;
  clientName: string;
  clientAddress: string;
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

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return formatDateISO(dt);
}

// ── Professional invoice styles (used inline for PDF accuracy) ──
const S = {
  page: {
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    background: '#ffffff',
    color: '#111827',
    fontSize: 11,
    lineHeight: 1.4,
    padding: '32px 36px 28px',
    maxWidth: 760,
    margin: '0 auto',
  } as React.CSSProperties,
  label: {
    fontSize: 8.5,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.07em',
    color: '#6B7280',
    marginBottom: 3,
  },
  value: {
    fontSize: 11,
    fontWeight: 600,
    color: '#111827',
  },
  th: {
    fontSize: 8.5,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: '#6B7280',
    padding: '7px 10px',
    background: '#F3F4F6',
    borderBottom: '1px solid #E5E7EB',
    whiteSpace: 'nowrap' as const,
  },
  td: {
    fontSize: 10.5,
    color: '#374151',
    padding: '8px 10px',
    borderBottom: '0.5px solid #F3F4F6',
    verticalAlign: 'middle' as const,
  },
};

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
      const counter = await onIncrementCounter();
      const invoiceNumber = `INV-${String(counter).padStart(3, '0')}`;
      const today = new Date();
      const issueDateStr = formatDateISO(today);
      const dueDateStr = addDays(issueDateStr, 7);
      const clientInvoiceNotes = selectedClient?.invoice_notes ?? null;
      const s = settings as unknown as Record<string, string | null>;

      const data: InvoiceData = {
        invoiceNumber,
        issueDate: issueDateStr,
        dueDate: dueDateStr,
        fnIndex: selectedPeriod.fnNumber,
        periodStart: formatDateISO(selectedPeriod.start),
        periodEnd: formatDateISO(selectedPeriod.end),
        shifts: periodShifts,
        total,
        issuerName: settings?.business_name ?? '',
        abn: settings?.abn ?? '',
        phone: (s?.phone as string) ?? '',
        address: (s?.address as string) ?? '',
        email: '',
        bankName: settings?.bank_name ?? '',
        bsb: settings?.bsb ?? '',
        accountNumber: settings?.account_number ?? '',
        accountName: (s?.account_name as string) ?? '',
        invoiceNotes: clientInvoiceNotes || settings?.invoice_notes || 'GST-free supply – no GST charged. Payment due within 7 days.',
        clientName: selectedClient?.invoice_label ?? selectedClient?.name ?? '',
        clientAddress: selectedClient?.address ?? '',
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
        margin: [8, 0, 8, 0],
        filename: `${preview.invoiceNumber}.pdf`,
        image: { type: 'jpeg', quality: 1.0 },
        html2canvas: {
          scale: 2.5,
          useCORS: true,
          letterRendering: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: 794,
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
              PRINTABLE INVOICE — professional A4 layout
              White background, clean accounting style
          ══════════════════════════════════════════ */}
          <div
            ref={printRef}
            id="invoice-preview"
            style={S.page}
          >

            {/* ── Top accent bar ── */}
            <div style={{ height: 4, background: '#1D4ED8', borderRadius: '2px 2px 0 0', marginBottom: 24 }} />

            {/* ── HEADER: Two-column layout ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              {/* Left: Issuer */}
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em', marginBottom: 6 }}>
                  {preview.issuerName || 'Your Business Name'}
                </div>
                {preview.abn && (
                  <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 2 }}>ABN: {preview.abn}</div>
                )}
                {preview.phone && (
                  <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 2 }}>Ph: {preview.phone}</div>
                )}
                {preview.address && (
                  <div style={{ fontSize: 10, color: '#6B7280' }}>{preview.address}</div>
                )}
              </div>
              {/* Right: Invoice title block */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#111827', letterSpacing: '-0.03em', marginBottom: 4 }}>
                  INVOICE
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8', marginBottom: 2 }}>{preview.invoiceNumber}</div>
                <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 1 }}>
                  Date: <span style={{ color: '#374151', fontWeight: 600 }}>{formatDateShort(preview.issueDate)}</span>
                </div>
                <div style={{ fontSize: 10, color: '#6B7280' }}>
                  Due: <span style={{ color: '#374151', fontWeight: 600 }}>{formatDateShort(preview.dueDate)}</span>
                </div>
              </div>
            </div>

            {/* ── Divider ── */}
            <div style={{ borderTop: '1.5px solid #E5E7EB', marginBottom: 20 }} />

            {/* ── BILLING SECTION: Two cards side by side ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              {/* Card 1: Bill To */}
              <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '14px 16px', border: '1px solid #E5E7EB' }}>
                <div style={S.label}>Bill To</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: 3 }}>
                  {preview.clientName || 'Participant / Organisation'}
                </div>
                {preview.clientAddress && (
                  <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 2 }}>{preview.clientAddress}</div>
                )}
                {preview.clientParticipantNumber && (
                  <div style={{ fontSize: 10, color: '#6B7280' }}>
                    NDIS No: <span style={{ color: '#374151', fontWeight: 600 }}>{preview.clientParticipantNumber}</span>
                  </div>
                )}
              </div>
              {/* Card 2: Invoice Details */}
              <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '14px 16px', border: '1px solid #E5E7EB' }}>
                <div style={S.label}>Invoice Details</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      ['Service From', formatDateShort(preview.periodStart)],
                      ['Service To', formatDateShort(preview.periodEnd)],
                      ['Due Date', formatDateShort(preview.dueDate)],
                      ['GST Rate', '0% (GST-Free)'],
                      ['Balance Due', formatCurrency(preview.total)],
                    ].map(([lbl, val]) => (
                      <tr key={lbl}>
                        <td style={{ fontSize: 10, color: '#6B7280', paddingBottom: 3, paddingRight: 8, whiteSpace: 'nowrap' }}>{lbl}</td>
                        <td style={{ fontSize: 10, fontWeight: 600, color: lbl === 'Balance Due' ? '#16A34A' : '#374151', paddingBottom: 3, textAlign: 'right' }}>{val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── LINE ITEMS TABLE ── */}
            <div style={{ marginBottom: 20 }}>
              <div style={S.label}>Services Rendered</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
                <thead>
                  <tr>
                    {['#', 'Description', 'Item Code', 'Qty', 'Unit', 'Unit Rate', 'Total (ex)', 'GST', 'Total (inc)'].map((h, i) => (
                      <th key={h} style={{
                        ...S.th,
                        textAlign: i >= 3 ? 'right' : 'left',
                        paddingLeft: i === 0 ? 10 : undefined,
                        width: i === 0 ? 24 : undefined,
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineGroups.map((group, idx) => {
                    const isSleepover = group.isSleepover;
                    const qty = group.quantity;
                    const unit = isSleepover ? 'night' : 'hr';
                    const rate = group.rate;
                    const totalEx = group.subtotal;
                    return (
                      <tr key={group.category} style={{ background: idx % 2 === 1 ? '#FAFAFA' : '#FFFFFF' }}>
                        <td style={{ ...S.td, color: '#9CA3AF', paddingLeft: 10 }}>{idx + 1}</td>
                        <td style={{ ...S.td, fontWeight: 600, color: '#111827' }}>
                          {group.label}
                          <div style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 400, marginTop: 1 }}>
                            {group.shifts.length} shift{group.shifts.length !== 1 ? 's' : ''}
                          </div>
                        </td>
                        <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 9, color: '#6B7280' }}>{group.ndisCode}</td>
                        <td style={{ ...S.td, textAlign: 'right' }}>{qty}</td>
                        <td style={{ ...S.td, textAlign: 'right', color: '#9CA3AF' }}>{unit}</td>
                        <td style={{ ...S.td, textAlign: 'right' }}>{formatCurrency(rate)}</td>
                        <td style={{ ...S.td, textAlign: 'right', fontWeight: 600 }}>{formatCurrency(totalEx)}</td>
                        <td style={{ ...S.td, textAlign: 'right', color: '#9CA3AF' }}>$0.00</td>
                        <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: '#111827' }}>{formatCurrency(totalEx)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── TOTALS ── */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
              <div style={{ width: 260 }}>
                <div style={{ background: '#F9FAFB', borderRadius: 10, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
                  {[
                    { label: 'Subtotal (ex GST)', value: formatCurrency(preview.total), bold: false },
                    { label: 'GST', value: '$0.00', bold: false },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: '0.5px solid #E5E7EB' }}>
                      <span style={{ fontSize: 10.5, color: '#6B7280' }}>{row.label}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: '#374151' }}>{row.value}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#1D4ED8' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#FFFFFF' }}>TOTAL (INC GST)</span>
                    <span style={{ fontSize: 16, fontWeight: 900, color: '#FFFFFF' }}>{formatCurrency(preview.total)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── PAYMENT DETAILS ── */}
            {(preview.bankName || preview.bsb || preview.accountNumber) && (
              <div style={{ background: '#F0FDF4', borderRadius: 10, border: '1px solid #BBF7D0', padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ ...S.label, color: '#15803D' }}>Payment Details</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 8 }}>
                  {preview.accountName && (
                    <div>
                      <div style={{ fontSize: 9, color: '#6B7280' }}>Account Name</div>
                      <div style={{ ...S.value, fontSize: 10 }}>{preview.accountName}</div>
                    </div>
                  )}
                  {preview.bankName && (
                    <div>
                      <div style={{ fontSize: 9, color: '#6B7280' }}>Bank</div>
                      <div style={{ ...S.value, fontSize: 10 }}>{preview.bankName}</div>
                    </div>
                  )}
                  {preview.bsb && (
                    <div>
                      <div style={{ fontSize: 9, color: '#6B7280' }}>BSB</div>
                      <div style={{ ...S.value, fontSize: 10 }}>{preview.bsb}</div>
                    </div>
                  )}
                  {preview.accountNumber && (
                    <div>
                      <div style={{ fontSize: 9, color: '#6B7280' }}>Account No.</div>
                      <div style={{ ...S.value, fontSize: 10 }}>{preview.accountNumber}</div>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 9.5, color: '#374151', borderTop: '0.5px solid #BBF7D0', paddingTop: 8 }}>
                  Reference: <strong>{preview.invoiceNumber}</strong> · Payment due within 7 days of invoice date.
                </div>
              </div>
            )}

            {/* ── NOTES ── */}
            {preview.invoiceNotes && (
              <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
                <div style={S.label}>Notes</div>
                <p style={{ fontSize: 9.5, color: '#6B7280', whiteSpace: 'pre-line', margin: 0 }}>{preview.invoiceNotes}</p>
              </div>
            )}

            {/* ── FOOTER ── */}
            <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: 8.5, color: '#9CA3AF', margin: 0 }}>
                This invoice is GST-free under the NDIS.{preview.abn ? ` ABN: ${preview.abn}` : ''}
              </p>
              <p style={{ fontSize: 8.5, color: '#9CA3AF', margin: 0 }}>Thank you for your payment.</p>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default InvoicePanel;
