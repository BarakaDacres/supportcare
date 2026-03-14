/**
 * InvoicePanel — Stable invoice generator + records list
 *
 * Architecture:
 * - Generator tab and Records (list) tab each have explicit loading / loaded / empty / error states.
 * - PDF export uses jsPDF directly (pure vector text + lines) — NO html2canvas / screenshot.
 * - Invoice generation is idempotent: reusing an existing record for the same fortnight+client.
 * - Invoice numbers are deterministic (INV-YYYY-FNxx).
 */

import { useState, useMemo, useCallback } from 'react';
import {
  FileText, ChevronDown, Download, User, Send, CheckCircle,
  AlertCircle, XCircle, Trash2, RefreshCw, Eye, AlertTriangle,
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

// ─── Types ────────────────────────────────────────────────────────────────────
interface InvoicePanelProps {
  shifts: Shift[];
  clients: Client[];
  settings: UserSettings | null;
  onIncrementCounter: () => Promise<number>;
  invoices: InvoiceSummary[];
  invoicesLoading: boolean;
  onUpdateStatus: (id: string, status: InvoiceStatus, extra?: { sent_at?: string; paid_at?: string }) => Promise<void>;
  onDeleteInvoice: (id: string) => Promise<void>;
  onRefreshInvoices: () => void;
}

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
  bankName: string;
  bsb: string;
  accountNumber: string;
  accountName: string;
  invoiceNotes: string;
  clientName: string;
  clientAddress: string;
  clientParticipantNumber: string;
  clientOrganisation: string;
  clientContact: string;
  clientEmail: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildInvoiceNumber(year: number, fnNumber: number): string {
  return `INV-${year}-FN${String(fnNumber).padStart(2, '0')}`;
}

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
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTH_NAMES[m - 1]?.slice(0, 3) ?? ''} ${y}`;
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
function fmt$(n: number): string { return formatCurrency(n); }

// ─── Status config ─────────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: 'Draft',     color: '#6B7280', bg: 'rgba(243,244,246,1)' },
  generated: { label: 'Generated', color: '#1D4ED8', bg: 'rgba(239,246,255,1)' },
  sent:      { label: 'Sent',      color: '#7C3AED', bg: 'rgba(245,243,255,1)' },
  paid:      { label: 'Paid',      color: '#16A34A', bg: 'rgba(240,253,244,1)' },
  overdue:   { label: 'Overdue',   color: '#DC2626', bg: 'rgba(254,242,242,1)' },
  cancelled: { label: 'Cancelled', color: '#9CA3AF', bg: 'rgba(249,250,251,1)' },
};

const StatusBadge = ({ status }: { status: string }) => {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.draft;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 9px', borderRadius: 99,
      fontSize: 10, fontWeight: 600,
      color: cfg.color, background: cfg.bg,
    }}>
      {cfg.label}
    </span>
  );
};

// ─── PDF export — pure jsPDF vector text, no canvas ──────────────────────────
async function exportToPDF(snap: InvoiceSnapshot, lineGroups: ReturnType<typeof groupShiftsForInvoice>) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const W = 210;          // A4 width mm
  const MARGIN = 16;
  const CONTENT_W = W - MARGIN * 2;
  let y = 0;

  // ── helpers ──
  const rgb = (hex: string): [number, number, number] => {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const setFont = (size: number, style: 'normal' | 'bold' = 'normal', color = '#111827') => {
    doc.setFontSize(size);
    doc.setFont('helvetica', style);
    doc.setTextColor(...rgb(color));
  };
  const text = (t: string, x: number, yPos: number, opts?: Parameters<typeof doc.text>[3]) => {
    doc.text(t, x, yPos, opts);
  };
  const line = (x1: number, y1: number, x2: number, y2: number, color = '#E5E7EB', lw = 0.2) => {
    doc.setDrawColor(...rgb(color));
    doc.setLineWidth(lw);
    doc.line(x1, y1, x2, y2);
  };
  const rect = (x: number, yPos: number, w: number, h: number, fillHex: string, borderHex?: string) => {
    doc.setFillColor(...rgb(fillHex));
    if (borderHex) {
      doc.setDrawColor(...rgb(borderHex));
      doc.setLineWidth(0.2);
      doc.roundedRect(x, yPos, w, h, 2, 2, borderHex ? 'FD' : 'F');
    } else {
      doc.roundedRect(x, yPos, w, h, 2, 2, 'F');
    }
  };

  // ── Top accent bar ──
  doc.setFillColor(...rgb('#1D4ED8'));
  doc.rect(0, 0, W, 3, 'F');
  y = 10;

  // ── HEADER: issuer left, INVOICE right ──
  setFont(16, 'bold', '#111827');
  text(snap.issuerName || 'Your Business', MARGIN, y);

  setFont(22, 'bold', '#111827');
  text('INVOICE', W - MARGIN, y, { align: 'right' });
  y += 5;

  setFont(8, 'normal', '#6B7280');
  if (snap.abn) { text(`ABN: ${snap.abn}`, MARGIN, y); y += 4; }
  if (snap.phone) { text(`Ph: ${snap.phone}`, MARGIN, y); y += 4; }
  if (snap.address) { text(snap.address, MARGIN, y); y += 4; }

  // Right-side invoice meta (re-sync y to original header baseline)
  const metaY = 15;
  setFont(9, 'bold', '#1D4ED8');
  text(snap.invoiceNumber, W - MARGIN, metaY, { align: 'right' });
  setFont(7.5, 'normal', '#6B7280');
  text(`Date: ${formatDateShort(snap.issueDate)}`, W - MARGIN, metaY + 5, { align: 'right' });
  text(`Due:  ${formatDateShort(snap.dueDate)}`, W - MARGIN, metaY + 10, { align: 'right' });

  y = Math.max(y, metaY + 14) + 3;

  // ── Divider ──
  line(MARGIN, y, W - MARGIN, y, '#E5E7EB', 0.4);
  y += 6;

  // ── BILLING SECTION ──
  const halfW = (CONTENT_W - 6) / 2;

  // Bill To box
  rect(MARGIN, y, halfW, 30, '#F9FAFB', '#E5E7EB');
  let by = y + 5;
  setFont(7, 'bold', '#6B7280');
  text('BILL TO', MARGIN + 4, by);
  by += 4;
  if (snap.clientOrganisation) {
    setFont(8.5, 'bold', '#111827'); text(snap.clientOrganisation, MARGIN + 4, by); by += 4;
  }
  setFont(8, snap.clientOrganisation ? 'normal' : 'bold', '#111827');
  text(snap.clientName || 'Participant / Organisation', MARGIN + 4, by); by += 4;
  setFont(7.5, 'normal', '#6B7280');
  if (snap.clientContact) { text(`Contact: ${snap.clientContact}`, MARGIN + 4, by); by += 3.5; }
  if (snap.clientAddress) { text(snap.clientAddress, MARGIN + 4, by); by += 3.5; }
  if (snap.clientEmail) { text(snap.clientEmail, MARGIN + 4, by); by += 3.5; }
  if (snap.clientParticipantNumber) { text(`NDIS No: ${snap.clientParticipantNumber}`, MARGIN + 4, by); }

  // Invoice Details box
  const rx = MARGIN + halfW + 6;
  rect(rx, y, halfW, 30, '#F9FAFB', '#E5E7EB');
  let dy = y + 5;
  setFont(7, 'bold', '#6B7280');
  text('INVOICE DETAILS', rx + 4, dy);
  dy += 4;
  const details: [string, string, boolean?][] = [
    ['Service From', formatDateShort(snap.periodStart)],
    ['Service To',   formatDateShort(snap.periodEnd)],
    ['Due Date',     formatDateShort(snap.dueDate)],
    ['GST',          '0% (GST-Free)'],
    ['Balance Due',  fmt$(snap.total), true],
  ];
  details.forEach(([lbl, val, highlight]) => {
    setFont(7.5, 'normal', '#6B7280');
    text(lbl, rx + 4, dy);
    setFont(7.5, highlight ? 'bold' : 'normal', highlight ? '#16A34A' : '#374151');
    text(val, rx + halfW - 4, dy, { align: 'right' });
    dy += 4;
  });

  y += 34;

  // ── LINE ITEMS TABLE ──
  setFont(7, 'bold', '#6B7280');
  text('SERVICES RENDERED', MARGIN, y);
  y += 4;

  // Table header row
  const cols = [
    { label: '#',            x: MARGIN,      w: 6,  align: 'left'  as const },
    { label: 'Description',  x: MARGIN + 6,  w: 42, align: 'left'  as const },
    { label: 'Item Code',    x: MARGIN + 48, w: 28, align: 'left'  as const },
    { label: 'Qty',          x: MARGIN + 76, w: 14, align: 'right' as const },
    { label: 'Unit',         x: MARGIN + 90, w: 12, align: 'right' as const },
    { label: 'Rate',         x: MARGIN + 102, w: 18, align: 'right' as const },
    { label: 'Total (ex)',   x: MARGIN + 120, w: 22, align: 'right' as const },
    { label: 'GST',          x: MARGIN + 142, w: 14, align: 'right' as const },
    { label: 'Total (inc)',  x: MARGIN + 156, w: 22, align: 'right' as const },
  ];

  rect(MARGIN, y, CONTENT_W, 7, '#F3F4F6', '#E5E7EB');
  const hY = y + 4.5;
  cols.forEach(c => {
    setFont(6.5, 'bold', '#6B7280');
    text(c.label, c.align === 'right' ? c.x + c.w : c.x, hY, { align: c.align });
  });
  y += 7;

  // Data rows
  lineGroups.forEach((group, idx) => {
    const rowH = 9;
    if (idx % 2 === 1) rect(MARGIN, y, CONTENT_W, rowH, '#FAFAFA');
    const ry = y + 5.5;
    const unit = group.isSleepover ? 'night' : 'hr';

    setFont(7, 'normal', '#9CA3AF');
    text(String(idx + 1), MARGIN + 3, ry, { align: 'center' });

    setFont(7.5, 'bold', '#111827');
    text(group.label, MARGIN + 6, ry - 1.5);
    setFont(6.5, 'normal', '#9CA3AF');
    text(`${group.shifts.length} shift${group.shifts.length !== 1 ? 's' : ''}`, MARGIN + 6, ry + 2.5);

    setFont(7, 'normal', '#6B7280');
    text(group.ndisCode ?? '', MARGIN + 48, ry, { maxWidth: 27 });

    setFont(7.5, 'normal', '#374151');
    text(String(group.quantity), MARGIN + 76 + 14, ry, { align: 'right' });
    setFont(7, 'normal', '#9CA3AF');
    text(unit, MARGIN + 90 + 12, ry, { align: 'right' });
    setFont(7.5, 'normal', '#374151');
    text(fmt$(group.rate), MARGIN + 102 + 18, ry, { align: 'right' });
    setFont(7.5, 'bold', '#374151');
    text(fmt$(group.subtotal), MARGIN + 120 + 22, ry, { align: 'right' });
    setFont(7, 'normal', '#9CA3AF');
    text('$0.00', MARGIN + 142 + 14, ry, { align: 'right' });
    setFont(7.5, 'bold', '#111827');
    text(fmt$(group.subtotal), MARGIN + 156 + 22, ry, { align: 'right' });

    line(MARGIN, y + rowH, MARGIN + CONTENT_W, y + rowH, '#F3F4F6', 0.15);
    y += rowH;
  });
  y += 4;

  // ── TOTALS ──
  const totW = 60;
  const totX = W - MARGIN - totW;

  rect(totX, y, totW, 6.5, '#F9FAFB', '#E5E7EB');
  setFont(7, 'normal', '#6B7280'); text('Subtotal (ex GST)', totX + 3, y + 4.3);
  setFont(7, 'normal', '#374151'); text(fmt$(snap.total), totX + totW - 3, y + 4.3, { align: 'right' });
  y += 6.5;
  rect(totX, y, totW, 6.5, '#F9FAFB', '#E5E7EB');
  setFont(7, 'normal', '#6B7280'); text('GST', totX + 3, y + 4.3);
  setFont(7, 'normal', '#374151'); text('$0.00', totX + totW - 3, y + 4.3, { align: 'right' });
  y += 6.5;
  doc.setFillColor(...rgb('#1D4ED8'));
  doc.roundedRect(totX, y, totW, 9, 2, 2, 'F');
  setFont(7.5, 'bold', '#FFFFFF'); text('TOTAL (INC GST)', totX + 3, y + 5.7);
  setFont(10, 'bold', '#FFFFFF'); text(fmt$(snap.total), totX + totW - 3, y + 5.7, { align: 'right' });
  y += 13;

  // ── PAYMENT DETAILS ──
  if (snap.bankName || snap.bsb || snap.accountNumber) {
    rect(MARGIN, y, CONTENT_W, 16, '#F0FDF4', '#BBF7D0');
    setFont(7, 'bold', '#15803D'); text('PAYMENT DETAILS', MARGIN + 4, y + 5);
    const fields: [string, string][] = [];
    if (snap.accountName)  fields.push(['Account Name', snap.accountName]);
    if (snap.bankName)     fields.push(['Bank', snap.bankName]);
    if (snap.bsb)          fields.push(['BSB', snap.bsb]);
    if (snap.accountNumber) fields.push(['Account No.', snap.accountNumber]);
    const colW = CONTENT_W / Math.max(fields.length, 1);
    fields.forEach(([k, v], i) => {
      const fx = MARGIN + 4 + i * colW;
      setFont(7, 'normal', '#6B7280'); text(k, fx, y + 9.5);
      setFont(7.5, 'bold', '#111827'); text(v, fx, y + 13.5);
    });
    y += 19;
    setFont(7, 'normal', '#374151');
    text(`Reference: ${snap.invoiceNumber} · Payment due within 7 days of invoice date.`, MARGIN, y);
    y += 5;
  }

  // ── NOTES ──
  if (snap.invoiceNotes) {
    y += 2;
    rect(MARGIN, y, CONTENT_W, 16, '#FFFFFF', '#E5E7EB');
    setFont(7, 'bold', '#6B7280'); text('NOTES', MARGIN + 4, y + 5);
    setFont(7, 'normal', '#6B7280');
    const lines = doc.splitTextToSize(snap.invoiceNotes, CONTENT_W - 8);
    lines.slice(0, 3).forEach((l: string, i: number) => text(l, MARGIN + 4, y + 9.5 + i * 4));
    y += 18;
  }

  // ── FOOTER ──
  y = 285; // near bottom of A4 (297mm - margin)
  line(MARGIN, y, W - MARGIN, y, '#E5E7EB', 0.3);
  y += 4;
  setFont(7, 'normal', '#9CA3AF');
  text(`This invoice is GST-free under the NDIS.${snap.abn ? '  ABN: ' + snap.abn : ''}`, MARGIN, y);
  text('Thank you for your payment.', W - MARGIN, y, { align: 'right' });

  doc.save(`${snap.invoiceNumber}.pdf`);
}

// ─── Invoice list card ─────────────────────────────────────────────────────────
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
  const effectiveStatus = isOverdue(invoice) && !['paid', 'cancelled'].includes(invoice.status) ? 'overdue' : invoice.status;
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
          <p className="text-base font-bold money-text">{fmt$(invoice.total_amount)}</p>
          <StatusBadge status={effectiveStatus} />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={onView} className="glass-chip text-xs gap-1.5" style={{ color: 'hsl(var(--primary))' }}>
          <Eye className="w-3 h-3" /> View
        </button>
        {!['paid', 'cancelled', 'sent'].includes(invoice.status) && (
          <button disabled={busy}
            onClick={() => act(() => onUpdateStatus(invoice.id, 'sent', { sent_at: new Date().toISOString() }))}
            className="glass-chip text-xs gap-1.5 disabled:opacity-50" style={{ color: '#7C3AED' }}>
            <Send className="w-3 h-3" /> Mark Sent
          </button>
        )}
        {!['paid', 'cancelled'].includes(invoice.status) && (
          <button disabled={busy}
            onClick={() => act(() => onUpdateStatus(invoice.id, 'paid', { paid_at: new Date().toISOString() }))}
            className="glass-chip text-xs gap-1.5 disabled:opacity-50" style={{ color: '#16A34A' }}>
            <CheckCircle className="w-3 h-3" /> Mark Paid
          </button>
        )}
        <button disabled={busy}
          onClick={() => act(() => onDelete(invoice.id))}
          className="glass-chip text-xs gap-1.5 ml-auto disabled:opacity-50" style={{ color: 'hsl(var(--destructive))' }}>
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {invoice.due_date && !['paid', 'cancelled'].includes(invoice.status) && (
        <p className="text-[10px]" style={{ color: isOverdue(invoice) ? '#DC2626' : '#6B7280' }}>
          {isOverdue(invoice) ? '⚠ Overdue — ' : 'Due: '}{formatDateShort(invoice.due_date)}
        </p>
      )}
    </div>
  );
};

// ─── Main component ────────────────────────────────────────────────────────────
const InvoicePanel = ({
  shifts, clients, settings,
  onIncrementCounter,
  invoices, invoicesLoading,
  onUpdateStatus, onDeleteInvoice, onRefreshInvoices,
}: InvoicePanelProps) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear]     = useState(currentYear);
  const [selectedFnIdx, setSelectedFnIdx]   = useState(0);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [generating, setGenerating]         = useState(false);
  const [generateError, setGenerateError]   = useState<string | null>(null);
  const [exporting, setExporting]           = useState(false);
  const [exportError, setExportError]       = useState<string | null>(null);
  const [preview, setPreview]               = useState<InvoiceSnapshot | null>(null);
  const [activeTab, setActiveTab]           = useState<'generator' | 'list'>('generator');
  const [statusFilter, setStatusFilter]     = useState<string>('all');

  const periods = useMemo(() => getFortnightPeriodsForYear(selectedYear), [selectedYear]);
  const selectedPeriod = periods[selectedFnIdx] ?? periods[0];
  const selectedClient = clients.find(c => c.id === selectedClientId) ?? null;

  const rates: PayRates = {
    rate_weekday:         settings?.rate_weekday         ?? DEFAULT_RATES.rate_weekday,
    rate_saturday:        settings?.rate_saturday        ?? DEFAULT_RATES.rate_saturday,
    rate_sunday:          settings?.rate_sunday          ?? DEFAULT_RATES.rate_sunday,
    rate_sleepover_weekday: settings?.rate_sleepover_weekday ?? DEFAULT_RATES.rate_sleepover_weekday,
    rate_sleepover_weekend: settings?.rate_sleepover_weekend ?? DEFAULT_RATES.rate_sleepover_weekend,
    rate_public_holiday:  settings?.rate_public_holiday  ?? DEFAULT_RATES.rate_public_holiday,
    rate_evening:         settings?.rate_evening         ?? DEFAULT_RATES.rate_evening,
  };

  const ndisCodesStr = (settings as unknown as { ndis_codes?: string })?.ndis_codes;
  const ndisCodes: Partial<NdisItemCodes> = ndisCodesStr ? JSON.parse(ndisCodesStr) : {};

  const periodShifts = useMemo(() => {
    if (!selectedPeriod) return [];
    const startStr = formatDateISO(selectedPeriod.start);
    const endStr   = formatDateISO(selectedPeriod.end);
    return shifts
      .filter(s => {
        if (s.date < startStr || s.date > endStr) return false;
        if (selectedClientId && s.client_id !== selectedClientId) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
  }, [shifts, selectedPeriod, selectedClientId]);

  const total = periodShifts.reduce((s, sh) => s + effectiveGrossPay(sh), 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lineGroups = useMemo(() => groupShiftsForInvoice(periodShifts, rates, ndisCodes), [periodShifts, settings]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'overdue') return isOverdue(inv);
      return inv.status === statusFilter;
    });
  }, [invoices, statusFilter]);

  const existingInvoice = useMemo(() => {
    if (!selectedPeriod) return null;
    const startStr = formatDateISO(selectedPeriod.start);
    return invoices.find(inv =>
      inv.period_start === startStr &&
      (selectedClientId ? inv.client_id === selectedClientId : !inv.client_id)
    ) ?? null;
  }, [invoices, selectedPeriod, selectedClientId]);

  // ─ Build snapshot ─
  const buildSnapshot = useCallback((
    invoiceId: string, invoiceNumber: string, issueDate: string, dueDate: string,
  ): InvoiceSnapshot => {
    const s = settings as unknown as Record<string, string | null>;
    const clientNotes = selectedClient?.invoice_notes ?? null;
    const useDefaults = settings?.use_default_invoice_notes !== false;
    return {
      invoiceNumber,
      invoiceId,
      issueDate,
      dueDate,
      fnNumber:   selectedPeriod!.fnNumber,
      year:       selectedYear,
      periodStart: formatDateISO(selectedPeriod!.start),
      periodEnd:   formatDateISO(selectedPeriod!.end),
      shifts:      periodShifts,
      total,
      issuerName:    settings?.business_name ?? '',
      abn:           settings?.abn ?? '',
      phone:         (s?.phone as string) ?? '',
      address:       (s?.address as string) ?? '',
      bankName:      settings?.bank_name ?? '',
      bsb:           settings?.bsb ?? '',
      accountNumber: settings?.account_number ?? '',
      accountName:   (s?.account_name as string) ?? '',
      invoiceNotes:  clientNotes || (useDefaults ? settings?.invoice_notes : null) || '',
      clientName:    selectedClient?.invoice_label ?? selectedClient?.name ?? '',
      clientAddress: selectedClient?.address ?? '',
      clientParticipantNumber: selectedClient?.participant_number ?? '',
      clientOrganisation: (selectedClient as unknown as { organisation_name?: string })?.organisation_name ?? '',
      clientContact:      (selectedClient as unknown as { billing_contact?: string })?.billing_contact ?? '',
      clientEmail:        (selectedClient as unknown as { email?: string })?.email ?? '',
    };
  }, [settings, selectedClient, selectedPeriod, selectedYear, periodShifts, total]);

  // ─ Generate invoice ─
  const generateInvoice = async () => {
    if (!selectedPeriod) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setGenerateError('Not signed in. Please sign in and try again.'); return; }

      let invoiceId: string;
      let invoiceNumber: string;
      let issueDate: string;
      let dueDate: string;

      if (existingInvoice) {
        invoiceId     = existingInvoice.id;
        invoiceNumber = existingInvoice.invoice_number;
        issueDate     = existingInvoice.created_at.split('T')[0];
        dueDate       = existingInvoice.due_date ?? addDays(issueDate, 7);
      } else {
        await onIncrementCounter();
        invoiceNumber = buildInvoiceNumber(selectedYear, selectedPeriod.fnNumber);
        issueDate     = formatDateISO(new Date());
        dueDate       = addDays(issueDate, 7);

        const { data: newInv, error } = await supabase
          .from('invoices')
          .insert({
            user_id:      session.user.id,
            invoice_number: invoiceNumber,
            status:       'generated',
            total_amount: total,
            period_start: formatDateISO(selectedPeriod.start),
            period_end:   formatDateISO(selectedPeriod.end),
            due_date:     dueDate,
            fortnight_number: selectedPeriod.fnNumber,
            year:         selectedYear,
            client_id:    selectedClientId || null,
            notes:        '',
          })
          .select('id')
          .single();

        if (error) { setGenerateError(`Failed to create invoice: ${error.message}`); return; }
        invoiceId = (newInv as { id: string }).id;
        onRefreshInvoices();
      }

      setPreview(buildSnapshot(invoiceId, invoiceNumber, issueDate, dueDate));
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : 'An unexpected error occurred.');
    } finally {
      setGenerating(false);
    }
  };

  // ─ Export PDF — pure jsPDF vector ─
  const handleExportPDF = async () => {
    if (!preview) return;
    if (lineGroups.length === 0 && preview.total === 0) {
      setExportError('No invoice data to export.');
      return;
    }
    setExporting(true);
    setExportError(null);
    try {
      await exportToPDF(preview, lineGroups);
    } catch (e) {
      console.error('PDF export error:', e);
      setExportError('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // ─ View existing invoice from Records tab ─
  const viewInvoiceFromList = useCallback((inv: InvoiceSummary) => {
    const issueDate = inv.created_at.split('T')[0];
    const dueDate   = inv.due_date ?? addDays(issueDate, 7);
    const mc        = clients.find(c => c.id === inv.client_id);
    const s         = settings as unknown as Record<string, string | null>;
    const useDefaults = settings?.use_default_invoice_notes !== false;

    setPreview({
      invoiceNumber: inv.invoice_number,
      invoiceId:     inv.id,
      issueDate,
      dueDate,
      fnNumber:   inv.fortnight_number ?? 1,
      year:       inv.year ?? new Date(inv.period_start).getFullYear(),
      periodStart: inv.period_start,
      periodEnd:   inv.period_end,
      shifts:      [],
      total:       inv.total_amount,
      issuerName:    settings?.business_name ?? '',
      abn:           settings?.abn ?? '',
      phone:         (s?.phone as string) ?? '',
      address:       (s?.address as string) ?? '',
      bankName:      settings?.bank_name ?? '',
      bsb:           settings?.bsb ?? '',
      accountNumber: settings?.account_number ?? '',
      accountName:   (s?.account_name as string) ?? '',
      invoiceNotes:  inv.notes || (useDefaults ? settings?.invoice_notes : null) || '',
      clientName:    mc?.invoice_label ?? mc?.name ?? '',
      clientAddress: mc?.address ?? '',
      clientParticipantNumber: mc?.participant_number ?? '',
      clientOrganisation: (mc as unknown as { organisation_name?: string })?.organisation_name ?? '',
      clientContact:      (mc as unknown as { billing_contact?: string })?.billing_contact ?? '',
      clientEmail:        (mc as unknown as { email?: string })?.email ?? '',
    });
    setActiveTab('generator');
  }, [clients, settings]);

  // ─ Compute effective status of the preview's stored invoice ─
  const previewInvoice = useMemo(
    () => preview ? (invoices.find(inv => inv.id === preview.invoiceId) ?? null) : null,
    [invoices, preview],
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Invoices</h2>
        <button onClick={onRefreshInvoices} aria-label="Refresh invoices"
          className="glass-chip text-xs gap-1.5" style={{ color: 'hsl(var(--primary))' }}>
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'hsl(var(--muted))' }}>
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

      {/* ══════════════ GENERATOR TAB ══════════════ */}
      {activeTab === 'generator' && (
        <>
          {/* Period selection card */}
          <div className="glass-card p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select Period</p>

            {clients.length > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <User className="w-3 h-3" /> Client
                </label>
                <div className="relative">
                  <select value={selectedClientId}
                    onChange={e => { setSelectedClientId(e.target.value); setPreview(null); setGenerateError(null); }}
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
                  onChange={e => { setSelectedYear(Number(e.target.value)); setSelectedFnIdx(0); setPreview(null); setGenerateError(null); }}
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
                onChange={e => { setSelectedFnIdx(Number(e.target.value)); setPreview(null); setGenerateError(null); }}
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
                    ✓ Invoice exists: {existingInvoice.invoice_number}
                  </p>
                )}
              </div>
              <p className="text-lg font-bold money-text">{fmt$(total)}</p>
            </div>

            {/* Generate error */}
            {generateError && (
              <div className="flex items-start gap-2 p-3 rounded-xl"
                style={{ background: 'hsl(var(--destructive)/0.08)', border: '1px solid hsl(var(--destructive)/0.2)' }}>
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'hsl(var(--destructive))' }} />
                <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{generateError}</p>
              </div>
            )}

            <button onClick={generateInvoice}
              disabled={generating || periodShifts.length === 0}
              className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-2xl text-sm font-bold transition-all duration-200 disabled:opacity-40"
              style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', boxShadow: '0 4px 16px hsl(var(--primary)/0.3)' }}>
              <FileText className="w-4 h-4" />
              {generating ? 'Generating…' : existingInvoice
                ? `View ${existingInvoice.invoice_number}`
                : periodShifts.length === 0
                  ? 'No shifts in period'
                  : 'Generate Invoice'}
            </button>
          </div>

          {/* ── Invoice Preview ── */}
          {preview && (
            <div className="space-y-3">
              {/* Preview action bar */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">{preview.invoiceNumber}</p>
                  {previewInvoice && (
                    <StatusBadge status={isOverdue(previewInvoice) ? 'overdue' : previewInvoice.status} />
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {previewInvoice && !['paid', 'cancelled', 'sent'].includes(previewInvoice.status) && (
                    <button onClick={() => onUpdateStatus(previewInvoice.id, 'sent', { sent_at: new Date().toISOString() })}
                      className="glass-chip text-xs gap-1.5" style={{ color: '#7C3AED' }}>
                      <Send className="w-3 h-3" /> Sent
                    </button>
                  )}
                  {previewInvoice && !['paid', 'cancelled'].includes(previewInvoice.status) && (
                    <button onClick={() => onUpdateStatus(previewInvoice.id, 'paid', { paid_at: new Date().toISOString() })}
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

              {/* Export error */}
              {exportError && (
                <div className="flex items-start gap-2 p-3 rounded-xl"
                  style={{ background: 'hsl(var(--destructive)/0.08)', border: '1px solid hsl(var(--destructive)/0.2)' }}>
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'hsl(var(--destructive))' }} />
                  <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{exportError}</p>
                </div>
              )}

              {/* ── Invoice preview card ── */}
              <div className="glass-card overflow-hidden">
                {/* Blue accent bar */}
                <div style={{ height: 4, background: '#1D4ED8' }} />

                <div style={{ padding: '20px 22px', fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', fontSize: 11, color: '#111827', background: '#fff' }}>

                  {/* HEADER */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em', marginBottom: 4 }}>
                        {preview.issuerName || 'Your Business Name'}
                      </div>
                      {preview.abn && <div style={{ fontSize: 9, color: '#6B7280', marginBottom: 2 }}>ABN: {preview.abn}</div>}
                      {preview.phone && <div style={{ fontSize: 9, color: '#6B7280', marginBottom: 2 }}>Ph: {preview.phone}</div>}
                      {preview.address && <div style={{ fontSize: 9, color: '#6B7280' }}>{preview.address}</div>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: '#111827', letterSpacing: '-0.03em', marginBottom: 2 }}>INVOICE</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#1D4ED8', marginBottom: 2 }}>{preview.invoiceNumber}</div>
                      <div style={{ fontSize: 9, color: '#6B7280', marginBottom: 1 }}>Date: <strong style={{ color: '#374151' }}>{formatDateShort(preview.issueDate)}</strong></div>
                      <div style={{ fontSize: 9, color: '#6B7280' }}>Due: <strong style={{ color: '#374151' }}>{formatDateShort(preview.dueDate)}</strong></div>
                    </div>
                  </div>

                  <div style={{ borderTop: '1.5px solid #E5E7EB', marginBottom: 14 }} />

                  {/* BILLING */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                    <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '10px 12px', border: '1px solid #E5E7EB' }}>
                      <div style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6B7280', marginBottom: 4 }}>Bill To</div>
                      {preview.clientOrganisation && <div style={{ fontSize: 10, fontWeight: 700, color: '#111827', marginBottom: 2 }}>{preview.clientOrganisation}</div>}
                      <div style={{ fontSize: 10, fontWeight: preview.clientOrganisation ? 400 : 700, color: '#111827', marginBottom: 2 }}>{preview.clientName || 'Participant / Organisation'}</div>
                      {preview.clientContact && <div style={{ fontSize: 8.5, color: '#6B7280', marginBottom: 1 }}>Contact: {preview.clientContact}</div>}
                      {preview.clientAddress && <div style={{ fontSize: 8.5, color: '#6B7280', marginBottom: 1 }}>{preview.clientAddress}</div>}
                      {preview.clientEmail && <div style={{ fontSize: 8.5, color: '#6B7280', marginBottom: 1 }}>{preview.clientEmail}</div>}
                      {preview.clientParticipantNumber && <div style={{ fontSize: 8.5, color: '#6B7280' }}>NDIS No: <strong style={{ color: '#374151' }}>{preview.clientParticipantNumber}</strong></div>}
                    </div>
                    <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '10px 12px', border: '1px solid #E5E7EB' }}>
                      <div style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6B7280', marginBottom: 4 }}>Invoice Details</div>
                      {[
                        ['Service From', formatDateShort(preview.periodStart)],
                        ['Service To',   formatDateShort(preview.periodEnd)],
                        ['Due Date',     formatDateShort(preview.dueDate)],
                        ['GST',          '0% (GST-Free)'],
                        ['Balance Due',  fmt$(preview.total)],
                      ].map(([l, v]) => (
                        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2.5 }}>
                          <span style={{ fontSize: 8.5, color: '#6B7280' }}>{l}</span>
                          <span style={{ fontSize: 8.5, fontWeight: 600, color: l === 'Balance Due' ? '#16A34A' : '#374151' }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* LINE ITEMS */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6B7280', marginBottom: 4 }}>Services Rendered</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['#', 'Description', 'Item Code', 'Qty', 'Unit', 'Rate', 'Total (ex)', 'GST', 'Total (inc)'].map((h, i) => (
                            <th key={h} style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', padding: '5px 6px', background: '#F3F4F6', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap', textAlign: i >= 3 ? 'right' : 'left' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {lineGroups.map((group, idx) => (
                          <tr key={group.category} style={{ background: idx % 2 === 1 ? '#FAFAFA' : '#FFFFFF' }}>
                            <td style={{ fontSize: 8.5, color: '#9CA3AF', padding: '6px 6px', borderBottom: '0.5px solid #F3F4F6' }}>{idx + 1}</td>
                            <td style={{ fontSize: 9, fontWeight: 600, color: '#111827', padding: '6px 6px', borderBottom: '0.5px solid #F3F4F6' }}>
                              {group.label}
                              <div style={{ fontSize: 7.5, color: '#9CA3AF', fontWeight: 400, marginTop: 1 }}>{group.shifts.length} shift{group.shifts.length !== 1 ? 's' : ''}</div>
                            </td>
                            <td style={{ fontSize: 7.5, color: '#6B7280', fontFamily: 'monospace', padding: '6px 6px', borderBottom: '0.5px solid #F3F4F6' }}>{group.ndisCode}</td>
                            <td style={{ fontSize: 9, color: '#374151', padding: '6px 6px', textAlign: 'right', borderBottom: '0.5px solid #F3F4F6' }}>{group.quantity}</td>
                            <td style={{ fontSize: 8.5, color: '#9CA3AF', padding: '6px 6px', textAlign: 'right', borderBottom: '0.5px solid #F3F4F6' }}>{group.isSleepover ? 'night' : 'hr'}</td>
                            <td style={{ fontSize: 9, color: '#374151', padding: '6px 6px', textAlign: 'right', borderBottom: '0.5px solid #F3F4F6' }}>{fmt$(group.rate)}</td>
                            <td style={{ fontSize: 9, fontWeight: 600, color: '#374151', padding: '6px 6px', textAlign: 'right', borderBottom: '0.5px solid #F3F4F6' }}>{fmt$(group.subtotal)}</td>
                            <td style={{ fontSize: 8.5, color: '#9CA3AF', padding: '6px 6px', textAlign: 'right', borderBottom: '0.5px solid #F3F4F6' }}>$0.00</td>
                            <td style={{ fontSize: 9, fontWeight: 700, color: '#111827', padding: '6px 6px', textAlign: 'right', borderBottom: '0.5px solid #F3F4F6' }}>{fmt$(group.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* TOTALS */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                    <div style={{ width: 220 }}>
                      <div style={{ background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
                        {[['Subtotal (ex GST)', fmt$(preview.total)], ['GST', '$0.00']].map(([l, v]) => (
                          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderBottom: '0.5px solid #E5E7EB' }}>
                            <span style={{ fontSize: 9, color: '#6B7280' }}>{l}</span>
                            <span style={{ fontSize: 9, fontWeight: 600, color: '#374151' }}>{v}</span>
                          </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 10px', background: '#1D4ED8' }}>
                          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#FFFFFF' }}>TOTAL (INC GST)</span>
                          <span style={{ fontSize: 13, fontWeight: 900, color: '#FFFFFF' }}>{fmt$(preview.total)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* PAYMENT DETAILS */}
                  {(preview.bankName || preview.bsb || preview.accountNumber) && (
                    <div style={{ background: '#F0FDF4', borderRadius: 8, border: '1px solid #BBF7D0', padding: '10px 12px', marginBottom: 10 }}>
                      <div style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#15803D', marginBottom: 6 }}>Payment Details</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 6 }}>
                        {[
                          preview.accountName  && { k: 'Account Name', v: preview.accountName },
                          preview.bankName     && { k: 'Bank',          v: preview.bankName },
                          preview.bsb          && { k: 'BSB',           v: preview.bsb },
                          preview.accountNumber && { k: 'Account No.',  v: preview.accountNumber },
                        ].filter(Boolean).map(item => item && (
                          <div key={item.k}>
                            <div style={{ fontSize: 7.5, color: '#6B7280' }}>{item.k}</div>
                            <div style={{ fontSize: 9, fontWeight: 600, color: '#111827' }}>{item.v}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 8, color: '#374151', borderTop: '0.5px solid #BBF7D0', paddingTop: 6 }}>
                        Reference: <strong>{preview.invoiceNumber}</strong> · Payment due within 7 days of invoice date.
                      </div>
                    </div>
                  )}

                  {/* NOTES */}
                  {preview.invoiceNotes && (
                    <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
                      <div style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6B7280', marginBottom: 4 }}>Notes</div>
                      <p style={{ fontSize: 8.5, color: '#6B7280', whiteSpace: 'pre-line', margin: 0 }}>{preview.invoiceNotes}</p>
                    </div>
                  )}

                  {/* FOOTER */}
                  <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <p style={{ fontSize: 7.5, color: '#9CA3AF', margin: 0 }}>This invoice is GST-free under the NDIS.{preview.abn ? ` ABN: ${preview.abn}` : ''}</p>
                    <p style={{ fontSize: 7.5, color: '#9CA3AF', margin: 0 }}>Thank you for your payment.</p>
                  </div>

                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════ RECORDS TAB ══════════════ */}
      {activeTab === 'list' && (
        <div className="space-y-3">
          {/* Status filters */}
          <div className="flex gap-1.5 flex-wrap">
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

          {/* Loading */}
          {invoicesLoading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-7 h-7 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
              <p className="text-xs text-muted-foreground">Loading invoices…</p>
            </div>
          )}

          {/* Empty */}
          {!invoicesLoading && invoices.length === 0 && (
            <div className="glass-card p-10 text-center space-y-3">
              <FileText className="w-10 h-10 mx-auto text-muted-foreground opacity-50" />
              <p className="text-sm font-semibold text-foreground">No invoices yet</p>
              <p className="text-xs text-muted-foreground">Generate an invoice in the Generator tab.</p>
              <button onClick={() => setActiveTab('generator')}
                className="glass-chip text-xs" style={{ color: 'hsl(var(--primary))' }}>
                Go to Generator
              </button>
            </div>
          )}

          {/* Filtered empty */}
          {!invoicesLoading && invoices.length > 0 && filteredInvoices.length === 0 && (
            <div className="glass-card p-8 text-center space-y-2">
              <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">No invoices match this filter.</p>
              <button onClick={() => setStatusFilter('all')}
                className="glass-chip text-xs" style={{ color: 'hsl(var(--primary))' }}>
                Show all
              </button>
            </div>
          )}

          {/* Invoice list */}
          {!invoicesLoading && filteredInvoices.length > 0 && filteredInvoices.map(inv => (
            <InvoiceCard
              key={inv.id}
              invoice={inv}
              clients={clients}
              onView={() => viewInvoiceFromList(inv)}
              onUpdateStatus={onUpdateStatus}
              onDelete={onDeleteInvoice}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default InvoicePanel;
