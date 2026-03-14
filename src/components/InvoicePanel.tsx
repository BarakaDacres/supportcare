import { useState, useMemo, useRef, useCallback } from 'react';
import {
  FileText, ChevronDown, Download, User, Send, CheckCircle,
  Clock, AlertCircle, XCircle, Trash2, RefreshCw, Eye,
} from 'lucide-react';
import { formatCurrency } from '@/lib/formatUtils';
import type { Shift } from '@/hooks/useShifts';
import { effectiveGrossPay } from '@/hooks/useShifts';
import type { UserSettings } from '@/hooks/useUserSettings';
import type { Client } from '@/hooks/useClients';
import { MONTH_NAMES } from '@/lib/dateUtils';
import { groupShiftsForInvoice, DEFAULT_NDIS_CODES, type NdisItemCodes } from '@/lib/invoiceGrouping';
import type { PayRates } from '@/lib/shiftCalculator';
import { DEFAULT_RATES } from '@/lib/shiftCalculator';
import { supabase } from '@/integrations/supabase/client';
import type { InvoiceSummary, InvoiceStatus } from '@/hooks/useInvoices';

interface InvoicePanelProps {
  shifts: Shift[];
  clients: Client[];
  settings: UserSettings | null;
  onIncrementCounter: () => Promise<number>;
  // Invoice list from DB
  invoices: InvoiceSummary[];
  invoicesLoading: boolean;
  onUpdateStatus: (id: string, status: InvoiceStatus, extra?: { sent_at?: string; paid_at?: string }) => Promise<void>;
  onDeleteInvoice: (id: string) => Promise<void>;
  onRefreshInvoices: () => void;
}

// ─── Stable invoice number: INV-YYYY-FNxx ───────────────────────────────────
function buildInvoiceNumber(year: number, fnNumber: number): string {
  return `INV-${year}-FN${String(fnNumber).padStart(2, '0')}`;
}

// ─── Fortnight helpers ───────────────────────────────────────────────────────
function getFortnightPeriodsForYear(year: number) {
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
    periods.push({ fnNumber: fn, label: `FN${pad(fn)} · ${fmt(start)} – ${fmt(end)}`, start, end });
    fn++;
    cursor.setDate(cursor.getDate() + 14);
    if (cursor.getFullYear() > year) break;
  }
  return periods;
}

function formatDateISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
function isOverdue(invoice: InvoiceSummary): boolean {
  if (['paid', 'cancelled'].includes(invoice.status)) return false;
  if (!invoice.due_date) return false;
  return new Date(invoice.due_date) < new Date();
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  draft:     { label: 'Draft',     color: '#6B7280', bg: '#F3F4F6', icon: <FileText className="w-3 h-3" /> },
  generated: { label: 'Generated', color: '#1D4ED8', bg: '#EFF6FF', icon: <Eye className="w-3 h-3" /> },
  sent:      { label: 'Sent',      color: '#7C3AED', bg: '#F5F3FF', icon: <Send className="w-3 h-3" /> },
  paid:      { label: 'Paid',      color: '#16A34A', bg: '#F0FDF4', icon: <CheckCircle className="w-3 h-3" /> },
  overdue:   { label: 'Overdue',   color: '#DC2626', bg: '#FEF2F2', icon: <AlertCircle className="w-3 h-3" /> },
  cancelled: { label: 'Cancelled', color: '#9CA3AF', bg: '#F9FAFB', icon: <XCircle className="w-3 h-3" /> },
};

// ─── Inline styles for PDF ────────────────────────────────────────────────────
const S = {
  page: {
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    background: '#ffffff',
    color: '#111827',
    fontSize: 11,
    lineHeight: 1.4,
    padding: '28px 32px 24px',
    maxWidth: 740,
    margin: '0 auto',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  label: { fontSize: 8, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: '#6B7280', marginBottom: 4 },
  value: { fontSize: 10.5, fontWeight: 600, color: '#111827' },
  th: {
    fontSize: 8, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em',
    color: '#6B7280', padding: '6px 8px', background: '#F3F4F6', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap' as const,
  },
  td: { fontSize: 10, color: '#374151', padding: '7px 8px', borderBottom: '0.5px solid #F3F4F6', verticalAlign: 'middle' as const },
};

// ─── Snapshot data stored with an invoice ────────────────────────────────────
interface InvoiceSnapshot {
  invoiceNumber: string;
  invoiceId: string;
  issueDate: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  fnNumber: number;
  year: number;
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
  // Client billing
  clientName: string;
  clientAddress: string;
  clientParticipantNumber: string;
  clientOrganisation: string;
  clientContact: string;
  clientEmail: string;
}

// ─── Status badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status }: { status: string }) => {
  const effective = status === 'generated' ? 'generated' : status;
  const cfg = STATUS_CONFIG[effective] ?? STATUS_CONFIG.draft;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 99,
      fontSize: 10, fontWeight: 600,
      color: cfg.color, background: cfg.bg,
    }}>
      {cfg.icon} {cfg.label}
    </span>
  );
};

// ─── Invoice list card ────────────────────────────────────────────────────────
const InvoiceCard = ({
  invoice, clients, onView, onUpdateStatus, onDelete,
}: {
  invoice: InvoiceSummary;
  clients: Client[];
  onView: () => void;
  onUpdateStatus: (id: string, s: InvoiceStatus, extra?: { sent_at?: string; paid_at?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) => {
  const [busy, setBusy] = useState(false);
  const effectiveStatus = isOverdue(invoice) && !['paid','cancelled'].includes(invoice.status) ? 'overdue' : invoice.status;
  const client = clients.find(c => c.id === invoice.client_id);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">{invoice.invoice_number}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatDateShort(invoice.period_start)} – {formatDateShort(invoice.period_end)}
          </p>
          {client && <p className="text-[10px] text-muted-foreground mt-0.5">{client.name}</p>}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <p className="text-base font-bold money-text">{formatCurrency(invoice.total_amount)}</p>
          <StatusBadge status={effectiveStatus} />
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={onView}
          className="glass-chip text-xs gap-1.5" style={{ color: 'hsl(var(--primary))' }}>
          <Eye className="w-3 h-3" /> View
        </button>

        {/* Mark as Sent */}
        {!['paid','cancelled','sent'].includes(invoice.status) && (
          <button disabled={busy} onClick={() => act(() => onUpdateStatus(invoice.id, 'sent', { sent_at: new Date().toISOString() }))}
            className="glass-chip text-xs gap-1.5 disabled:opacity-50" style={{ color: '#7C3AED' }}>
            <Send className="w-3 h-3" /> Mark Sent
          </button>
        )}

        {/* Mark as Paid */}
        {!['paid','cancelled'].includes(invoice.status) && (
          <button disabled={busy} onClick={() => act(() => onUpdateStatus(invoice.id, 'paid', { paid_at: new Date().toISOString() }))}
            className="glass-chip text-xs gap-1.5 disabled:opacity-50" style={{ color: '#16A34A' }}>
            <CheckCircle className="w-3 h-3" /> Mark Paid
          </button>
        )}

        {/* Delete */}
        <button disabled={busy} onClick={() => act(() => onDelete(invoice.id))}
          className="glass-chip text-xs gap-1.5 ml-auto disabled:opacity-50" style={{ color: 'hsl(var(--destructive))' }}>
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {invoice.due_date && !['paid','cancelled'].includes(invoice.status) && (
        <p className="text-[10px]" style={{ color: isOverdue(invoice) ? '#DC2626' : '#6B7280' }}>
          {isOverdue(invoice) ? '⚠ Overdue — ' : 'Due: '}
          {formatDateShort(invoice.due_date)}
        </p>
      )}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const InvoicePanel = ({
  shifts, clients, settings,
  onIncrementCounter,
  invoices, invoicesLoading,
  onUpdateStatus, onDeleteInvoice, onRefreshInvoices,
}: InvoicePanelProps) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedFnIdx, setSelectedFnIdx] = useState(0);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState<InvoiceSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<'generator' | 'list'>('generator');
  const [statusFilter, setStatusFilter] = useState<string>('all');
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
  const lineGroups = useMemo(() => groupShiftsForInvoice(periodShifts, rates, ndisCodes), [periodShifts, settings]); // eslint-disable-line

  // ─ Filtered invoices ─
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'overdue') return isOverdue(inv);
      return inv.status === statusFilter;
    });
  }, [invoices, statusFilter]);

  // ─ Look up existing invoice for this fortnight+client to avoid re-generating ─
  const existingInvoice = useMemo(() => {
    if (!selectedPeriod) return null;
    const startStr = formatDateISO(selectedPeriod.start);
    return invoices.find(inv =>
      inv.period_start === startStr &&
      (selectedClientId ? inv.client_id === selectedClientId : !inv.client_id || inv.client_id === null)
    ) ?? null;
  }, [invoices, selectedPeriod, selectedClientId]);

  // ─ Build snapshot from existing or create new invoice ─
  const buildSnapshot = useCallback(async (invoiceId: string, invoiceNumber: string, issueDate: string, dueDate: string): Promise<InvoiceSnapshot> => {
    const s = settings as unknown as Record<string, string | null>;
    const clientInvoiceNotes = selectedClient?.invoice_notes ?? null;
    return {
      invoiceNumber,
      invoiceId,
      issueDate,
      dueDate,
      fnNumber: selectedPeriod!.fnNumber,
      year: selectedYear,
      periodStart: formatDateISO(selectedPeriod!.start),
      periodEnd: formatDateISO(selectedPeriod!.end),
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
      clientOrganisation: (selectedClient as unknown as { organisation_name?: string })?.organisation_name ?? '',
      clientContact: (selectedClient as unknown as { billing_contact?: string })?.billing_contact ?? '',
      clientEmail: (selectedClient as unknown as { email?: string })?.email ?? '',
    };
  }, [settings, selectedClient, selectedPeriod, selectedYear, periodShifts, total]);

  // ─ Generate invoice (creates/reuses DB record, stable number) ─
  const generateInvoice = async () => {
    if (!selectedPeriod) return;
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      let invoiceId: string;
      let invoiceNumber: string;
      let issueDate: string;
      let dueDate: string;

      if (existingInvoice) {
        // Reuse existing record — same stable number
        invoiceId = existingInvoice.id;
        invoiceNumber = existingInvoice.invoice_number;
        issueDate = existingInvoice.created_at.split('T')[0];
        dueDate = existingInvoice.due_date ?? addDays(issueDate, 7);
      } else {
        // Create new invoice record with deterministic number
        const counter = await onIncrementCounter();
        invoiceNumber = buildInvoiceNumber(selectedYear, selectedPeriod.fnNumber);
        issueDate = formatDateISO(new Date());
        dueDate = addDays(issueDate, 7);

        const insertPayload = {
          user_id: session.user.id,
          invoice_number: invoiceNumber,
          status: 'generated',
          total_amount: total,
          period_start: formatDateISO(selectedPeriod.start),
          period_end: formatDateISO(selectedPeriod.end),
          notes: '',
        };
        const { data: newInv, error } = await supabase
          .from('invoices')
          .insert(insertPayload)
          .select('id')
          .single();

        if (error) { console.error('Create invoice error:', error); return; }
        invoiceId = (newInv as { id: string }).id;
        console.log('Invoice created, counter used:', counter);
      }

      const snapshot = await buildSnapshot(invoiceId, invoiceNumber, issueDate, dueDate);
      setPreview(snapshot);
      onRefreshInvoices();
    } finally {
      setGenerating(false);
    }
  };

  // ─ Export PDF — pure high-quality html2canvas + jsPDF (scale 4, PNG, no JPEG) ─
  const handleExportPDF = async () => {
    if (!printRef.current || !preview) return;
    setExporting(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const element = printRef.current;

      // Clone the element and apply print-safe styles
      const clone = element.cloneNode(true) as HTMLElement;
      clone.style.position = 'fixed';
      clone.style.left = '-9999px';
      clone.style.top = '0';
      clone.style.width = '794px';  // A4 at 96dpi
      clone.style.background = '#ffffff';
      document.body.appendChild(clone);

      const opt = {
        margin: [0, 0, 0, 0],
        filename: `${preview.invoiceNumber}.pdf`,
        image: { type: 'png' as const, quality: 1 },
        html2canvas: {
          scale: 4,          // 4× for crisp vector-like text rendering
          useCORS: true,
          letterRendering: true,
          logging: false,
          backgroundColor: '#ffffff',
          width: 794,
          windowWidth: 794,
          foreignObjectRendering: false,
        },
        jsPDF: {
          unit: 'mm' as const,
          format: 'a4' as const,
          orientation: 'portrait' as const,
          compress: false,  // No compression = best quality
          precision: 16,
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] as const },
      };

      await html2pdf().set(opt).from(clone).save();
      document.body.removeChild(clone);
    } catch (e) {
      console.error('PDF export error:', e);
      window.print();
    } finally {
      setExporting(false);
    }
  };

  // ─ View an existing invoice from the list ─
  const viewInvoiceFromList = async (inv: InvoiceSummary) => {
    const issueDate = inv.created_at.split('T')[0];
    const dueDate = inv.due_date ?? addDays(issueDate, 7);

    // Temporarily set context to match the invoice
    const matchedClient = clients.find(c => c.id === inv.client_id);
    const year = inv.year ?? new Date(inv.period_start).getFullYear();
    const fnNum = inv.fortnight_number ?? 1;

    const s = settings as unknown as Record<string, string | null>;
    const snapshot: InvoiceSnapshot = {
      invoiceNumber: inv.invoice_number,
      invoiceId: inv.id,
      issueDate,
      dueDate,
      fnNumber: fnNum,
      year,
      periodStart: inv.period_start,
      periodEnd: inv.period_end,
      shifts: [],
      total: inv.total_amount,
      issuerName: settings?.business_name ?? '',
      abn: settings?.abn ?? '',
      phone: (s?.phone as string) ?? '',
      address: (s?.address as string) ?? '',
      email: '',
      bankName: settings?.bank_name ?? '',
      bsb: settings?.bsb ?? '',
      accountNumber: settings?.account_number ?? '',
      accountName: (s?.account_name as string) ?? '',
      invoiceNotes: inv.notes || settings?.invoice_notes || 'GST-free supply – no GST charged. Payment due within 7 days.',
      clientName: matchedClient?.invoice_label ?? matchedClient?.name ?? '',
      clientAddress: matchedClient?.address ?? '',
      clientParticipantNumber: matchedClient?.participant_number ?? '',
      clientOrganisation: (matchedClient as unknown as { organisation_name?: string })?.organisation_name ?? '',
      clientContact: (matchedClient as unknown as { billing_contact?: string })?.billing_contact ?? '',
      clientEmail: (matchedClient as unknown as { email?: string })?.email ?? '',
    };
    setPreview(snapshot);
    setActiveTab('generator');
  };

  // ─ Render ─
  return (
    <div className="space-y-4 no-print-wrapper">
      <div className="flex items-center justify-between no-print">
        <h2 className="text-lg font-bold text-foreground">Invoices</h2>
        <button onClick={onRefreshInvoices} className="glass-chip text-xs gap-1.5" style={{ color: 'hsl(var(--primary))' }}>
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 rounded-2xl no-print" style={{ background: 'hsl(var(--muted))' }}>
        {(['generator', 'list'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className="flex-1 py-2 text-xs font-semibold rounded-xl transition-all duration-200"
            style={{
              background: activeTab === tab ? 'hsl(var(--card))' : 'transparent',
              color: activeTab === tab ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
              boxShadow: activeTab === tab ? '0 1px 4px hsl(var(--foreground)/0.08)' : 'none',
            }}>
            {tab === 'generator' ? 'Generator' : `Records (${invoices.length})`}
          </button>
        ))}
      </div>

      {/* ══════════════════ GENERATOR TAB ══════════════════ */}
      {activeTab === 'generator' && (
        <>
          <div className="glass-card p-4 space-y-3 no-print">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select Period</p>

            {/* Client filter */}
            {clients.length > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <User className="w-3 h-3" /> Client
                </label>
                <div className="relative">
                  <select value={selectedClientId}
                    onChange={e => { setSelectedClientId(e.target.value); setPreview(null); }}
                    className="glass-input w-full text-foreground min-h-[44px] appearance-none pr-8">
                    <option value="">All clients</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            )}

            <div className="flex gap-2 items-center">
              <label className="text-xs text-muted-foreground shrink-0">Year</label>
              <div className="relative">
                <select value={selectedYear}
                  onChange={e => { setSelectedYear(Number(e.target.value)); setSelectedFnIdx(0); setPreview(null); }}
                  className="glass-input text-foreground min-h-[40px] text-sm appearance-none pr-8 pl-3">
                  {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <div className="relative">
              <select value={selectedFnIdx}
                onChange={e => { setSelectedFnIdx(Number(e.target.value)); setPreview(null); }}
                className="glass-input w-full text-foreground min-h-[44px] appearance-none pr-8">
                {periods.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>

            <div className="flex items-center justify-between py-2 border-t border-border">
              <div>
                <p className="text-xs text-muted-foreground">
                  {periodShifts.length} shift{periodShifts.length !== 1 ? 's' : ''} in period
                </p>
                {existingInvoice && (
                  <p className="text-[10px] mt-0.5" style={{ color: 'hsl(var(--primary))' }}>
                    Invoice exists: {existingInvoice.invoice_number}
                  </p>
                )}
              </div>
              <p className="text-lg font-bold money-text">{formatCurrency(total)}</p>
            </div>

            <button onClick={generateInvoice} disabled={generating || periodShifts.length === 0}
              className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-2xl text-sm font-bold transition-all duration-200 disabled:opacity-40"
              style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', boxShadow: '0 4px 16px hsl(var(--primary)/0.3)' }}>
              <FileText className="w-4 h-4" />
              {generating ? 'Generating…' : existingInvoice ? `View ${existingInvoice.invoice_number}` : periodShifts.length === 0 ? 'No shifts in period' : 'Generate Invoice'}
            </button>
          </div>

          {/* ── Invoice Preview ── */}
          {preview && (
            <div className="space-y-3">
              <div className="flex items-center justify-between no-print">
                <div>
                  <p className="text-sm font-semibold text-foreground">{preview.invoiceNumber}</p>
                  {existingInvoice && <StatusBadge status={isOverdue(existingInvoice) ? 'overdue' : existingInvoice.status} />}
                </div>
                <div className="flex items-center gap-2">
                  {/* Mark as Sent */}
                  {existingInvoice && !['paid','cancelled','sent'].includes(existingInvoice.status) && (
                    <button onClick={() => onUpdateStatus(existingInvoice.id, 'sent', { sent_at: new Date().toISOString() })}
                      className="glass-chip text-xs gap-1.5" style={{ color: '#7C3AED' }}>
                      <Send className="w-3 h-3" /> Sent
                    </button>
                  )}
                  {/* Mark as Paid */}
                  {existingInvoice && !['paid','cancelled'].includes(existingInvoice.status) && (
                    <button onClick={() => onUpdateStatus(existingInvoice.id, 'paid', { paid_at: new Date().toISOString() })}
                      className="glass-chip text-xs gap-1.5" style={{ color: '#16A34A' }}>
                      <CheckCircle className="w-3 h-3" /> Paid
                    </button>
                  )}
                  <button onClick={handleExportPDF} disabled={exporting}
                    className="flex items-center gap-1.5 glass-chip text-xs disabled:opacity-50"
                    style={{ color: 'hsl(var(--primary))' }}>
                    <Download className="w-3.5 h-3.5" />
                    {exporting ? 'Exporting…' : 'Export PDF'}
                  </button>
                </div>
              </div>

              {/* ══════════════════════════════════════
                  PRINTABLE INVOICE — A4 professional
              ══════════════════════════════════════ */}
              <div ref={printRef} id="invoice-preview" style={S.page}>

                {/* Top accent bar */}
                <div style={{ height: 4, background: '#1D4ED8', borderRadius: '2px 2px 0 0', marginBottom: 22 }} />

                {/* HEADER */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em', marginBottom: 5 }}>
                      {preview.issuerName || 'Your Business Name'}
                    </div>
                    {preview.abn && <div style={{ fontSize: 9.5, color: '#6B7280', marginBottom: 1.5 }}>ABN: {preview.abn}</div>}
                    {preview.phone && <div style={{ fontSize: 9.5, color: '#6B7280', marginBottom: 1.5 }}>Ph: {preview.phone}</div>}
                    {preview.address && <div style={{ fontSize: 9.5, color: '#6B7280' }}>{preview.address}</div>}
                    {preview.email && <div style={{ fontSize: 9.5, color: '#6B7280' }}>{preview.email}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 26, fontWeight: 900, color: '#111827', letterSpacing: '-0.03em', marginBottom: 3 }}>INVOICE</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', marginBottom: 2 }}>{preview.invoiceNumber}</div>
                    <div style={{ fontSize: 9.5, color: '#6B7280', marginBottom: 1 }}>
                      Date: <span style={{ color: '#374151', fontWeight: 600 }}>{formatDateShort(preview.issueDate)}</span>
                    </div>
                    <div style={{ fontSize: 9.5, color: '#6B7280' }}>
                      Due: <span style={{ color: '#374151', fontWeight: 600 }}>{formatDateShort(preview.dueDate)}</span>
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1.5px solid #E5E7EB', marginBottom: 18 }} />

                {/* BILLING SECTION */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                  {/* Bill To */}
                  <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '12px 14px', border: '1px solid #E5E7EB' }}>
                    <div style={S.label}>Bill To</div>
                    {preview.clientOrganisation && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#111827', marginBottom: 2 }}>{preview.clientOrganisation}</div>
                    )}
                    <div style={{ fontSize: preview.clientOrganisation ? 10.5 : 11, fontWeight: preview.clientOrganisation ? 500 : 700, color: '#111827', marginBottom: 2 }}>
                      {preview.clientName || 'Participant / Organisation'}
                    </div>
                    {preview.clientContact && <div style={{ fontSize: 9.5, color: '#6B7280', marginBottom: 1.5 }}>Contact: {preview.clientContact}</div>}
                    {preview.clientAddress && <div style={{ fontSize: 9.5, color: '#6B7280', marginBottom: 1.5 }}>{preview.clientAddress}</div>}
                    {preview.clientEmail && <div style={{ fontSize: 9.5, color: '#6B7280', marginBottom: 1.5 }}>{preview.clientEmail}</div>}
                    {preview.clientParticipantNumber && (
                      <div style={{ fontSize: 9.5, color: '#6B7280' }}>NDIS No: <span style={{ color: '#374151', fontWeight: 600 }}>{preview.clientParticipantNumber}</span></div>
                    )}
                  </div>

                  {/* Invoice Details */}
                  <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '12px 14px', border: '1px solid #E5E7EB' }}>
                    <div style={S.label}>Invoice Details</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        {[
                          ['Service From', formatDateShort(preview.periodStart)],
                          ['Service To',   formatDateShort(preview.periodEnd)],
                          ['Due Date',     formatDateShort(preview.dueDate)],
                          ['GST',          '0% (GST-Free)'],
                          ['Balance Due',  formatCurrency(preview.total)],
                        ].map(([lbl, val]) => (
                          <tr key={lbl}>
                            <td style={{ fontSize: 9.5, color: '#6B7280', paddingBottom: 3, paddingRight: 8, whiteSpace: 'nowrap' }}>{lbl}</td>
                            <td style={{ fontSize: 9.5, fontWeight: 600, color: lbl === 'Balance Due' ? '#16A34A' : '#374151', paddingBottom: 3, textAlign: 'right' }}>{val}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* LINE ITEMS TABLE */}
                <div style={{ marginBottom: 18 }}>
                  <div style={S.label}>Services Rendered</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 5 }}>
                    <thead>
                      <tr>
                        {['#', 'Description', 'Item Code', 'Qty', 'Unit', 'Unit Rate', 'Total (ex)', 'GST', 'Total (inc)'].map((h, i) => (
                          <th key={h} style={{ ...S.th, textAlign: i >= 3 ? 'right' : 'left', paddingLeft: i === 0 ? 8 : undefined, width: i === 0 ? 20 : undefined }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lineGroups.map((group, idx) => {
                        const unit = group.isSleepover ? 'night' : 'hr';
                        return (
                          <tr key={group.category} style={{ background: idx % 2 === 1 ? '#FAFAFA' : '#FFFFFF' }}>
                            <td style={{ ...S.td, color: '#9CA3AF', paddingLeft: 8 }}>{idx + 1}</td>
                            <td style={{ ...S.td, fontWeight: 600, color: '#111827' }}>
                              {group.label}
                              <div style={{ fontSize: 8.5, color: '#9CA3AF', fontWeight: 400, marginTop: 1 }}>
                                {group.shifts.length} shift{group.shifts.length !== 1 ? 's' : ''}
                              </div>
                            </td>
                            <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 8.5, color: '#6B7280' }}>{group.ndisCode}</td>
                            <td style={{ ...S.td, textAlign: 'right' }}>{group.quantity}</td>
                            <td style={{ ...S.td, textAlign: 'right', color: '#9CA3AF' }}>{unit}</td>
                            <td style={{ ...S.td, textAlign: 'right' }}>{formatCurrency(group.rate)}</td>
                            <td style={{ ...S.td, textAlign: 'right', fontWeight: 600 }}>{formatCurrency(group.subtotal)}</td>
                            <td style={{ ...S.td, textAlign: 'right', color: '#9CA3AF' }}>$0.00</td>
                            <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: '#111827' }}>{formatCurrency(group.subtotal)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* TOTALS */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}>
                  <div style={{ width: 250 }}>
                    <div style={{ background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
                      {[
                        { label: 'Subtotal (ex GST)', value: formatCurrency(preview.total) },
                        { label: 'GST', value: '$0.00' },
                      ].map(row => (
                        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', borderBottom: '0.5px solid #E5E7EB' }}>
                          <span style={{ fontSize: 10, color: '#6B7280' }}>{row.label}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: '#374151' }}>{row.value}</span>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 12px', background: '#1D4ED8' }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#FFFFFF' }}>TOTAL (INC GST)</span>
                        <span style={{ fontSize: 15, fontWeight: 900, color: '#FFFFFF' }}>{formatCurrency(preview.total)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* PAYMENT DETAILS */}
                {(preview.bankName || preview.bsb || preview.accountNumber) && (
                  <div style={{ background: '#F0FDF4', borderRadius: 8, border: '1px solid #BBF7D0', padding: '12px 14px', marginBottom: 14 }}>
                    <div style={{ ...S.label, color: '#15803D' }}>Payment Details</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 8 }}>
                      {[
                        preview.accountName && { k: 'Account Name', v: preview.accountName },
                        preview.bankName && { k: 'Bank', v: preview.bankName },
                        preview.bsb && { k: 'BSB', v: preview.bsb },
                        preview.accountNumber && { k: 'Account No.', v: preview.accountNumber },
                      ].filter(Boolean).map(item => item && (
                        <div key={item.k}>
                          <div style={{ fontSize: 8.5, color: '#6B7280' }}>{item.k}</div>
                          <div style={{ ...S.value, fontSize: 9.5 }}>{item.v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 9, color: '#374151', borderTop: '0.5px solid #BBF7D0', paddingTop: 7 }}>
                      Reference: <strong>{preview.invoiceNumber}</strong> · Payment due within 7 days of invoice date.
                    </div>
                  </div>
                )}

                {/* NOTES */}
                {preview.invoiceNotes && (
                  <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '9px 12px', marginBottom: 14 }}>
                    <div style={S.label}>Notes</div>
                    <p style={{ fontSize: 9, color: '#6B7280', whiteSpace: 'pre-line', margin: 0 }}>{preview.invoiceNotes}</p>
                  </div>
                )}

                {/* FOOTER */}
                <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontSize: 8, color: '#9CA3AF', margin: 0 }}>
                    This invoice is GST-free under the NDIS.{preview.abn ? ` ABN: ${preview.abn}` : ''}
                  </p>
                  <p style={{ fontSize: 8, color: '#9CA3AF', margin: 0 }}>Thank you for your payment.</p>
                </div>

              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════ LIST TAB ══════════════════ */}
      {activeTab === 'list' && (
        <div className="space-y-3">
          {/* Status filter */}
          <div className="flex gap-1.5 flex-wrap no-print">
            {['all', 'generated', 'sent', 'paid', 'overdue', 'draft', 'cancelled'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className="text-[10px] font-semibold px-3 py-1.5 rounded-full transition-all duration-150"
                style={{
                  background: statusFilter === s ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                  color: statusFilter === s ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                }}>
                {s === 'all' ? `All (${invoices.length})` : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {invoicesLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-7 h-7 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="glass-card p-8 text-center space-y-2">
              <FileText className="w-8 h-8 mx-auto" style={{ color: 'hsl(var(--muted-foreground))' }} />
              <p className="text-sm text-muted-foreground">No invoices found</p>
            </div>
          ) : (
            filteredInvoices.map(inv => (
              <InvoiceCard
                key={inv.id}
                invoice={inv}
                clients={clients}
                onView={() => viewInvoiceFromList(inv)}
                onUpdateStatus={onUpdateStatus}
                onDelete={onDeleteInvoice}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default InvoicePanel;
