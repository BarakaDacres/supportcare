/**
 * InvoicePanel — Invoice generator + records list
 *
 * Fixes applied in this version:
 * - Generator auto-selects the CURRENT FORTNIGHT on every mount
 * - Participant / billing details fully pulled from client
 * - Invoice preview: all section titles CAPITALISED, boxed services table,
 *   consistent accent (slate/dark), BALANCE DUE bold + prominent,
 *   reference inside PAYMENT DETAILS, no stray blue print line,
 *   all numeric columns right-aligned
 * - jsPDF export mirrors the same layout faithfully
 * - Loading performance: invoicesLoading guard on Records tab
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
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
  clientPhone: string;
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

/** Returns the index of the fortnight that contains today. */
function getCurrentFortnightIdx(periods: ReturnType<typeof getFortnightPeriodsForYear>): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < periods.length; i++) {
    const s = new Date(periods[i].start); s.setHours(0, 0, 0, 0);
    const e = new Date(periods[i].end);   e.setHours(23, 59, 59, 999);
    if (today >= s && today <= e) return i;
  }
  // fallback: last period
  return periods.length - 1;
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

// ─── Accent palette ───────────────────────────────────────────────────────────
const P = {
  ink:        '#111827',
  dark:       '#1F2937',
  mid:        '#374151',
  muted:      '#6B7280',
  faint:      '#9CA3AF',
  border:     '#E5E7EB',
  rowAlt:     '#FAFAFA',
  bg:         '#F9FAFB',
  white:      '#FFFFFF',
  balanceBg:  '#1F2937',
};

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

// ─── PDF export — pure jsPDF vector, no canvas ────────────────────────────────
async function exportToPDF(snap: InvoiceSnapshot, lineGroups: ReturnType<typeof groupShiftsForInvoice>) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const W = 210;
  const M = 16;           // margin
  const CW = W - M * 2;  // content width = 178mm
  let y = 0;

  // Helpers
  const rgb = (hex: string): [number, number, number] => {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const sf = (size: number, style: 'normal' | 'bold' = 'normal', color = P.ink) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', style);
    doc.setTextColor(...rgb(color));
  };
  const tx = (t: string, x: number, yp: number, opts?: Parameters<typeof doc.text>[3]) =>
    doc.text(t, x, yp, opts);
  const hln = (y1: number, color = P.border, lw = 0.25) => {
    doc.setDrawColor(...rgb(color)); doc.setLineWidth(lw);
    doc.line(M, y1, W - M, y1);
  };
  const rect = (x: number, yp: number, w: number, h: number, fill: string, stroke?: string) => {
    doc.setFillColor(...rgb(fill));
    if (stroke) { doc.setDrawColor(...rgb(stroke)); doc.setLineWidth(0.25); doc.roundedRect(x, yp, w, h, 2, 2, 'FD'); }
    else { doc.roundedRect(x, yp, w, h, 2, 2, 'F'); }
  };

  // ── TOP RULE (dark slate) ──────────────────────────────────────────────────
  doc.setFillColor(...rgb(P.ink));
  doc.rect(0, 0, W, 2.5, 'F');
  y = 11;

  // ── HEADER: left = issuer details, right = INVOICE + number + date ─────────
  const headerLeftX = M;
  const headerRightX = W - M;

  sf(16, 'bold', P.ink);
  tx(snap.issuerName || 'Your Business', headerLeftX, y);

  sf(22, 'bold', P.ink);
  tx('INVOICE', headerRightX, y, { align: 'right' });
  y += 5;

  sf(7.5, 'normal', P.muted);
  const issuerLines: string[] = [];
  if (snap.abn)     issuerLines.push(`ABN: ${snap.abn}`);
  if (snap.phone)   issuerLines.push(`Phone: ${snap.phone}`);
  if (snap.address) issuerLines.push(snap.address);
  issuerLines.forEach(line => { tx(line, headerLeftX, y); y += 3.8; });

  // Right-side meta (pinned from original top)
  const metaTopY = 16;
  sf(9.5, 'bold', P.mid);
  tx(snap.invoiceNumber, headerRightX, metaTopY, { align: 'right' });
  sf(7.5, 'normal', P.muted);
  tx(`Submitted: ${formatDateShort(snap.issueDate)}`, headerRightX, metaTopY + 4.5, { align: 'right' });
  tx(`Due: ${formatDateShort(snap.dueDate)}`,          headerRightX, metaTopY + 9,   { align: 'right' });

  y = Math.max(y, metaTopY + 13) + 4;

  // Divider
  hln(y, P.border, 0.4);
  y += 7;

  // ── BILL TO + INVOICE DETAILS (side by side cards) ────────────────────────
  const halfW = (CW - 6) / 2;
  // Measure content height for both cards
  const billLines: [string, 'bold' | 'normal', string][] = [];
  if (snap.clientOrganisation) billLines.push([snap.clientOrganisation, 'bold', P.ink]);
  billLines.push([snap.clientName || 'Participant', snap.clientOrganisation ? 'normal' : 'bold', P.ink]);
  if (snap.clientContact)          billLines.push([`Contact: ${snap.clientContact}`, 'normal', P.muted]);
  if (snap.clientAddress)          billLines.push([snap.clientAddress,               'normal', P.muted]);
  if (snap.clientEmail)            billLines.push([snap.clientEmail,                 'normal', P.muted]);
  if (snap.clientPhone)            billLines.push([`Ph: ${snap.clientPhone}`,         'normal', P.muted]);
  if (snap.clientParticipantNumber) billLines.push([`NDIS No: ${snap.clientParticipantNumber}`, 'normal', P.muted]);
  const cardH = Math.max(40, 12 + billLines.length * 4.2);

  // BILL TO card
  rect(M, y, halfW, cardH, P.bg, P.border);
  let cy = y + 6;
  sf(6, 'bold', P.muted); tx('BILL TO', M + 4, cy); cy += 4.5;
  billLines.forEach(([text, weight, color]) => {
    sf(weight === 'bold' ? 8.5 : 8, weight, color);
    tx(text, M + 4, cy); cy += 4;
  });

  // INVOICE DETAILS card
  const rx = M + halfW + 6;
  rect(rx, y, halfW, cardH, P.bg, P.border);
  let dy = y + 6;
  sf(6, 'bold', P.muted); tx('INVOICE DETAILS', rx + 4, dy); dy += 4.5;

  const detailPairs: [string, string][] = [
    ['Service From', formatDateShort(snap.periodStart)],
    ['Service To',   formatDateShort(snap.periodEnd)],
    ['Due Date',     formatDateShort(snap.dueDate)],
    ['GST Rate',     '0% (GST-Free)'],
  ];
  detailPairs.forEach(([lbl, val]) => {
    sf(7.5, 'normal', P.muted);       tx(lbl, rx + 4, dy);
    sf(7.5, 'normal', P.mid);         tx(val, rx + halfW - 4, dy, { align: 'right' });
    dy += 4;
  });

  // Separator then BALANCE DUE
  dy += 1;
  doc.setDrawColor(...rgb(P.border)); doc.setLineWidth(0.25);
  doc.line(rx + 4, dy, rx + halfW - 4, dy);
  dy += 4;
  sf(7.5, 'bold', P.ink);   tx('BALANCE DUE', rx + 4, dy);
  sf(10, 'bold', P.ink);    tx(fmt$(snap.total), rx + halfW - 4, dy, { align: 'right' });

  y += cardH + 6;

  // ── SERVICES RENDERED ─────────────────────────────────────────────────────
  sf(6, 'bold', P.muted);
  tx('SERVICES RENDERED', M, y);
  y += 3;

  const hdrH  = 7.5;
  const rowH  = 9;
  const nRows = Math.max(lineGroups.length, 1);
  const tableH = hdrH + nRows * rowH;

  // Outer border
  doc.setDrawColor(...rgb(P.border)); doc.setLineWidth(0.3);
  doc.roundedRect(M, y, CW, tableH, 2, 2, 'S');

  // Header bg
  doc.setFillColor(...rgb('#F3F4F6'));
  doc.roundedRect(M, y, CW, hdrH, 2, 2, 'F');
  // Cover bottom-rounded corners of header with a flat fill strip
  doc.setFillColor(...rgb('#F3F4F6'));
  doc.rect(M, y + hdrH - 2, CW, 2, 'F');

  // Column definitions [label, x-offset from M, width, align]
  type ColDef = { lbl: string; x: number; w: number; al: 'left' | 'right' | 'center' };
  const cols: ColDef[] = [
    { lbl: '#',           x: 0,   w: 7,   al: 'center' },
    { lbl: 'DESCRIPTION', x: 7,   w: 54,  al: 'left'   },
    { lbl: 'ITEM CODE',   x: 61,  w: 34,  al: 'left'   },
    { lbl: 'QTY',         x: 95,  w: 12,  al: 'right'  },
    { lbl: 'UNIT',        x: 107, w: 11,  al: 'right'  },
    { lbl: 'RATE',        x: 118, w: 18,  al: 'right'  },
    { lbl: 'TOTAL EX',    x: 136, w: 20,  al: 'right'  },
    { lbl: 'GST',         x: 156, w: 10,  al: 'right'  },
    { lbl: 'TOTAL INC',   x: 166, w: 12,  al: 'right'  },
  ];
  const hY = y + 5;
  cols.forEach(c => {
    sf(5.5, 'bold', P.muted);
    const cx = M + c.x + (c.al === 'right' ? c.w : c.al === 'center' ? c.w / 2 : 0);
    tx(c.label, cx, hY, { align: c.al === 'center' ? 'center' : c.al });
  });

  // Header / body separator
  doc.setDrawColor(...rgb(P.border)); doc.setLineWidth(0.25);
  doc.line(M, y + hdrH, M + CW, y + hdrH);
  y += hdrH;

  if (lineGroups.length === 0) {
    sf(7.5, 'normal', P.faint);
    tx('No services — select a period with shifts', M + CW / 2, y + rowH / 2 + 2, { align: 'center' });
    y += rowH;
  } else {
    lineGroups.forEach((group, idx) => {
      if (idx % 2 === 1) {
        doc.setFillColor(...rgb(P.rowAlt));
        doc.rect(M, y, CW, rowH, 'F');
      }
      const ry = y + 5.5;
      const unit = group.isSleepover ? 'night' : 'hr';

      sf(7, 'normal', P.faint);
      tx(String(idx + 1), M + cols[0].x + 3.5, ry, { align: 'center' });

      sf(7.5, 'bold', P.ink);
      tx(group.label, M + cols[1].x, ry - 1.5);
      sf(6, 'normal', P.faint);
      tx(`${group.shifts.length} shift${group.shifts.length !== 1 ? 's' : ''}`, M + cols[1].x, ry + 2.5);

      sf(6.5, 'normal', P.muted);
      tx(group.ndisCode ?? '', M + cols[2].x, ry, { maxWidth: 33 });

      const right = (ci: number, val: string, sz = 7.5, wt: 'normal' | 'bold' = 'normal', col = P.mid) => {
        sf(sz, wt, col);
        tx(val, M + cols[ci].x + cols[ci].w, ry, { align: 'right' });
      };
      right(3, String(group.quantity));
      right(4, unit, 7, 'normal', P.faint);
      right(5, fmt$(group.rate));
      right(6, fmt$(group.subtotal), 7.5, 'bold');
      right(7, '$0.00', 7, 'normal', P.faint);
      right(8, fmt$(group.subtotal), 7.5, 'bold', P.ink);

      if (idx < lineGroups.length - 1) {
        doc.setDrawColor(...rgb('#F3F4F6')); doc.setLineWidth(0.15);
        doc.line(M, y + rowH, M + CW, y + rowH);
      }
      y += rowH;
    });
  }
  y += 5;

  // ── TOTALS CONTAINER ──────────────────────────────────────────────────────
  const totW = 70;
  const totX = W - M - totW;
  const totRows: [string, string, boolean?][] = [
    ['SUBTOTAL (EX GST)', fmt$(snap.total)],
    ['GST',               '$0.00'],
    ['BALANCE DUE',       fmt$(snap.total), true],
  ];
  const totH = totRows.length * 7.5 + 1;

  rect(totX, y, totW, totH, P.bg, P.border);
  let ty = y + 6;
  totRows.forEach(([lbl, val, isBal], ri) => {
    if (isBal) {
      // Dark row bg for BALANCE DUE
      doc.setFillColor(...rgb(P.balanceBg));
      doc.roundedRect(totX, y + ri * 7.5, totW, 7.5 + 1, 2, 2, 'F');
      sf(8, 'bold', P.white); tx(lbl, totX + 4, ty);
      sf(10, 'bold', P.white); tx(val, totX + totW - 4, ty, { align: 'right' });
    } else {
      sf(7.5, 'normal', P.muted); tx(lbl, totX + 4, ty);
      sf(7.5, 'normal', P.mid);   tx(val, totX + totW - 4, ty, { align: 'right' });
      // Separator
      doc.setDrawColor(...rgb(P.border)); doc.setLineWidth(0.2);
      doc.line(totX, ty + 3.5, totX + totW, ty + 3.5);
    }
    ty += 7.5;
  });
  y += totH + 6;

  // ── PAYMENT DETAILS ───────────────────────────────────────────────────────
  if (snap.accountName || snap.bsb || snap.accountNumber || snap.bankName) {
    const payRows: [string, string][] = [];
    if (snap.accountName)   payRows.push(['Account Name', snap.accountName]);
    if (snap.bankName)      payRows.push(['Bank',          snap.bankName]);
    if (snap.bsb)           payRows.push(['BSB',           snap.bsb]);
    if (snap.accountNumber) payRows.push(['Account No.',   snap.accountNumber]);
    payRows.push(['Reference', snap.invoiceNumber]);

    const numCols = Math.min(payRows.length, 5);
    const colW3   = CW / numCols;
    const payH    = 22;

    rect(M, y, CW, payH, P.bg, P.border);
    let py = y + 5.5;
    sf(6, 'bold', P.muted); tx('PAYMENT DETAILS', M + 4, py); py += 5;

    payRows.forEach(([k, v], i) => {
      const fx = M + 4 + i * colW3;
      sf(7, 'normal', P.muted);  tx(k, fx, py);
      sf(8.5, 'bold', P.ink);    tx(v, fx, py + 4.5);
    });

    py += 10;
    doc.setDrawColor(...rgb(P.border)); doc.setLineWidth(0.2);
    doc.line(M + 4, py, M + CW - 4, py);
    py += 3.5;
    sf(7, 'normal', P.muted);
    tx('Payment due within 7 days of invoice date.', M + 4, py);
    y += payH + 5;
  }

  // ── NOTES ─────────────────────────────────────────────────────────────────
  if (snap.invoiceNotes) {
    const noteLines = doc.splitTextToSize(snap.invoiceNotes, CW - 10);
    const notH = 12 + noteLines.slice(0, 4).length * 4;
    rect(M, y, CW, notH, P.white, P.border);
    sf(6, 'bold', P.muted); tx('NOTES', M + 4, y + 5.5);
    sf(7.5, 'normal', P.muted);
    noteLines.slice(0, 4).forEach((l: string, i: number) => tx(l, M + 4, y + 10 + i * 4));
    y += notH + 5;
  }

  // ── FOOTER ────────────────────────────────────────────────────────────────
  const footY = 285;
  doc.setDrawColor(...rgb(P.border)); doc.setLineWidth(0.3);
  doc.line(M, footY, W - M, footY);
  sf(7, 'normal', P.faint);
  tx(`This invoice is GST-free under the NDIS.${snap.abn ? `  ABN: ${snap.abn}` : ''}`, M, footY + 4);
  tx('Thank you for your payment.', W - M, footY + 4, { align: 'right' });

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

  const [selectedYear, setSelectedYear]         = useState(currentYear);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [generating, setGenerating]             = useState(false);
  const [generateError, setGenerateError]       = useState<string | null>(null);
  const [exporting, setExporting]               = useState(false);
  const [exportError, setExportError]           = useState<string | null>(null);
  const [preview, setPreview]                   = useState<InvoiceSnapshot | null>(null);
  const [activeTab, setActiveTab]               = useState<'generator' | 'list'>('generator');
  const [statusFilter, setStatusFilter]         = useState<string>('all');

  const periods = useMemo(() => getFortnightPeriodsForYear(selectedYear), [selectedYear]);

  // ── Default to current fortnight on mount / year change ──
  const [selectedFnIdx, setSelectedFnIdx] = useState(() => getCurrentFortnightIdx(getFortnightPeriodsForYear(currentYear)));
  useEffect(() => {
    setSelectedFnIdx(getCurrentFortnightIdx(periods));
    setPreview(null);
    setGenerateError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear]);

  const selectedPeriod = periods[selectedFnIdx] ?? periods[0];
  const selectedClient = clients.find(c => c.id === selectedClientId) ?? null;

  const rates: PayRates = {
    rate_weekday:           settings?.rate_weekday           ?? DEFAULT_RATES.rate_weekday,
    rate_saturday:          settings?.rate_saturday          ?? DEFAULT_RATES.rate_saturday,
    rate_sunday:            settings?.rate_sunday            ?? DEFAULT_RATES.rate_sunday,
    rate_sleepover_weekday: settings?.rate_sleepover_weekday ?? DEFAULT_RATES.rate_sleepover_weekday,
    rate_sleepover_weekend: settings?.rate_sleepover_weekend ?? DEFAULT_RATES.rate_sleepover_weekend,
    rate_public_holiday:    settings?.rate_public_holiday    ?? DEFAULT_RATES.rate_public_holiday,
    rate_evening:           settings?.rate_evening           ?? DEFAULT_RATES.rate_evening,
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

  // ─── Helper: cast client extra fields ──────────────────────────────────────
  const clientExtra = useCallback((c: Client | null) => {
    const cx = c as unknown as Record<string, string | undefined>;
    return {
      organisation: cx?.organisation_name ?? '',
      contact:      cx?.billing_contact   ?? '',
      email:        cx?.email             ?? '',
      phone:        c?.phone              ?? '',
    };
  }, []);

  // ─── Build snapshot ─────────────────────────────────────────────────────────
  const buildSnapshot = useCallback((
    invoiceId: string, invoiceNumber: string, issueDate: string, dueDate: string,
  ): InvoiceSnapshot => {
    const s   = settings as unknown as Record<string, string | null>;
    const ext = clientExtra(selectedClient);
    const clientNotes  = selectedClient?.invoice_notes ?? null;
    const useDefaults  = settings?.use_default_invoice_notes !== false;
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
      issuerName:    settings?.business_name    ?? '',
      abn:           settings?.abn               ?? '',
      phone:         (s?.phone  as string)        ?? '',
      address:       (s?.address as string)       ?? '',
      bankName:      settings?.bank_name          ?? '',
      bsb:           settings?.bsb               ?? '',
      accountNumber: settings?.account_number    ?? '',
      accountName:   (s?.account_name as string)  ?? '',
      invoiceNotes:  clientNotes || (useDefaults ? settings?.invoice_notes : null) || '',
      clientName:    selectedClient?.invoice_label ?? selectedClient?.name ?? '',
      clientAddress: selectedClient?.address ?? '',
      clientParticipantNumber: selectedClient?.participant_number ?? '',
      clientOrganisation: ext.organisation,
      clientContact:      ext.contact,
      clientEmail:        ext.email,
      clientPhone:        ext.phone,
    };
  }, [settings, selectedClient, selectedPeriod, selectedYear, periodShifts, total, clientExtra]);

  // ─── Generate invoice ────────────────────────────────────────────────────────
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
            user_id:          session.user.id,
            invoice_number:   invoiceNumber,
            status:           'generated',
            total_amount:     total,
            period_start:     formatDateISO(selectedPeriod.start),
            period_end:       formatDateISO(selectedPeriod.end),
            due_date:         dueDate,
            fortnight_number: selectedPeriod.fnNumber,
            year:             selectedYear,
            client_id:        selectedClientId || null,
            notes:            '',
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

  // ─── Export PDF ──────────────────────────────────────────────────────────────
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

  // ─── View existing invoice from Records tab ──────────────────────────────────
  const viewInvoiceFromList = useCallback((inv: InvoiceSummary) => {
    const issueDate = inv.created_at.split('T')[0];
    const dueDate   = inv.due_date ?? addDays(issueDate, 7);
    const mc        = clients.find(c => c.id === inv.client_id) ?? null;
    const s         = settings as unknown as Record<string, string | null>;
    const useDefaults = settings?.use_default_invoice_notes !== false;
    const ext       = clientExtra(mc);

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
      issuerName:    settings?.business_name    ?? '',
      abn:           settings?.abn               ?? '',
      phone:         (s?.phone  as string)        ?? '',
      address:       (s?.address as string)       ?? '',
      bankName:      settings?.bank_name          ?? '',
      bsb:           settings?.bsb               ?? '',
      accountNumber: settings?.account_number    ?? '',
      accountName:   (s?.account_name as string)  ?? '',
      invoiceNotes:  inv.notes || (useDefaults ? settings?.invoice_notes : null) || '',
      clientName:    mc?.invoice_label ?? mc?.name ?? '',
      clientAddress: mc?.address ?? '',
      clientParticipantNumber: mc?.participant_number ?? '',
      clientOrganisation: ext.organisation,
      clientContact:      ext.contact,
      clientEmail:        ext.email,
      clientPhone:        ext.phone,
    });
    setActiveTab('generator');
  }, [clients, settings, clientExtra]);

  // ─── Effective status of previewed invoice ───────────────────────────────────
  const previewInvoice = useMemo(
    () => preview ? (invoices.find(inv => inv.id === preview.invoiceId) ?? null) : null,
    [invoices, preview],
  );

  // ─── Shared label style helpers ──────────────────────────────────────────────
  const sectionTitle: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.06em', color: '#6B7280', marginBottom: 4,
  };
  const cellLabel: React.CSSProperties = { fontSize: 9, color: '#6B7280' };
  const cellValue: React.CSSProperties = { fontSize: 9, fontWeight: 600, color: '#374151' };

  // ─── Render ──────────────────────────────────────────────────────────────────
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
                  onChange={e => { setSelectedYear(Number(e.target.value)); setPreview(null); setGenerateError(null); }}
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
              {/* Action bar */}
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

              {exportError && (
                <div className="flex items-start gap-2 p-3 rounded-xl"
                  style={{ background: 'hsl(var(--destructive)/0.08)', border: '1px solid hsl(var(--destructive)/0.2)' }}>
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'hsl(var(--destructive))' }} />
                  <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{exportError}</p>
                </div>
              )}

              {/* ────────────── Invoice Preview Card ────────────── */}
              <div className="glass-card overflow-hidden">
                {/* Thin top rule — slate, not blue */}
                <div style={{ height: 3, background: '#111827' }} />

                <div style={{
                  padding: '20px 20px',
                  fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
                  fontSize: 11, color: '#111827',
                  background: 'hsl(var(--card))',
                }}>

                  {/* ── HEADER ── */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em', marginBottom: 4 }}>
                        {preview.issuerName || 'Your Business Name'}
                      </div>
                      {preview.abn     && <div style={{ fontSize: 9, color: '#6B7280', marginBottom: 2 }}>ABN: {preview.abn}</div>}
                      {preview.phone   && <div style={{ fontSize: 9, color: '#6B7280', marginBottom: 2 }}>Ph: {preview.phone}</div>}
                      {preview.address && <div style={{ fontSize: 9, color: '#6B7280' }}>{preview.address}</div>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: '#111827', letterSpacing: '-0.03em', marginBottom: 3 }}>INVOICE</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 2 }}>{preview.invoiceNumber}</div>
                      <div style={{ fontSize: 9, color: '#6B7280', marginBottom: 1 }}>Date: <strong style={{ color: '#374151' }}>{formatDateShort(preview.issueDate)}</strong></div>
                      <div style={{ fontSize: 9, color: '#6B7280' }}>Due: <strong style={{ color: '#374151' }}>{formatDateShort(preview.dueDate)}</strong></div>
                    </div>
                  </div>

                  <div style={{ borderTop: '1.5px solid #E5E7EB', marginBottom: 14 }} />

                  {/* ── BILL TO + INVOICE DETAILS ── */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                    {/* BILL TO */}
                    <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '10px 12px', border: '1px solid #E5E7EB' }}>
                      <div style={sectionTitle}>Bill To</div>
                      {preview.clientOrganisation && (
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#111827', marginBottom: 2 }}>{preview.clientOrganisation}</div>
                      )}
                      <div style={{ fontSize: 10, fontWeight: preview.clientOrganisation ? 400 : 700, color: '#111827', marginBottom: 2 }}>
                        {preview.clientName || 'Participant / Organisation'}
                      </div>
                      {preview.clientContact && (
                        <div style={{ fontSize: 8.5, color: '#6B7280', marginBottom: 1 }}>Contact: {preview.clientContact}</div>
                      )}
                      {preview.clientAddress && (
                        <div style={{ fontSize: 8.5, color: '#6B7280', marginBottom: 1 }}>{preview.clientAddress}</div>
                      )}
                      {preview.clientEmail && (
                        <div style={{ fontSize: 8.5, color: '#6B7280', marginBottom: 1 }}>{preview.clientEmail}</div>
                      )}
                      {preview.clientPhone && (
                        <div style={{ fontSize: 8.5, color: '#6B7280', marginBottom: 1 }}>Ph: {preview.clientPhone}</div>
                      )}
                      {preview.clientParticipantNumber && (
                        <div style={{ fontSize: 8.5, color: '#6B7280' }}>NDIS No: <strong style={{ color: '#374151' }}>{preview.clientParticipantNumber}</strong></div>
                      )}
                    </div>

                    {/* INVOICE DETAILS */}
                    <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '10px 12px', border: '1px solid #E5E7EB' }}>
                      <div style={sectionTitle}>Invoice Details</div>
                      {[
                        ['Service From', formatDateShort(preview.periodStart)],
                        ['Service To',   formatDateShort(preview.periodEnd)],
                        ['Due Date',     formatDateShort(preview.dueDate)],
                        ['GST',          '0% (GST-Free)'],
                      ].map(([l, v]) => (
                        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2.5 }}>
                          <span style={cellLabel}>{l}</span>
                          <span style={cellValue}>{v}</span>
                        </div>
                      ))}
                      {/* BALANCE DUE — prominent */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: '1px solid #E5E7EB' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#111827', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Balance Due</span>
                        <span style={{ fontSize: 13, fontWeight: 900, color: '#111827' }}>{fmt$(preview.total)}</span>
                      </div>
                    </div>
                  </div>

                  {/* ── SERVICES RENDERED ── */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={sectionTitle}>Services Rendered</div>
                    {/* Boxed table */}
                    <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                        <thead>
                          <tr style={{ background: '#F3F4F6' }}>
                            {[
                              { h: '#',          w: '5%',  align: 'center' as const },
                              { h: 'DESCRIPTION', w: '28%', align: 'left' as const },
                              { h: 'ITEM CODE',  w: '18%', align: 'left' as const },
                              { h: 'QTY',        w: '8%',  align: 'right' as const },
                              { h: 'UNIT',       w: '7%',  align: 'right' as const },
                              { h: 'RATE',       w: '11%', align: 'right' as const },
                              { h: 'TOTAL EX',   w: '11%', align: 'right' as const },
                              { h: 'GST',        w: '6%',  align: 'right' as const },
                              { h: 'TOTAL INC',  w: '11%', align: 'right' as const },
                            ].map(({ h, w, align }) => (
                              <th key={h} style={{
                                width: w, padding: '5px 6px',
                                fontSize: 7, fontWeight: 700,
                                textTransform: 'uppercase', letterSpacing: '0.05em',
                                color: '#6B7280', textAlign: align,
                                borderBottom: '1px solid #E5E7EB',
                              }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {lineGroups.map((group, idx) => (
                            <tr key={group.category} style={{ background: idx % 2 === 1 ? '#FAFAFA' : '#FFFFFF' }}>
                              <td style={{ fontSize: 8.5, color: '#9CA3AF', padding: '7px 6px', textAlign: 'center', borderBottom: '0.5px solid #F3F4F6' }}>{idx + 1}</td>
                              <td style={{ padding: '7px 6px', borderBottom: '0.5px solid #F3F4F6' }}>
                                <div style={{ fontSize: 9, fontWeight: 600, color: '#111827' }}>{group.label}</div>
                                <div style={{ fontSize: 7.5, color: '#9CA3AF', marginTop: 1 }}>{group.shifts.length} shift{group.shifts.length !== 1 ? 's' : ''}</div>
                              </td>
                              <td style={{ fontSize: 7.5, color: '#6B7280', fontFamily: 'monospace', padding: '7px 6px', borderBottom: '0.5px solid #F3F4F6' }}>{group.ndisCode}</td>
                              <td style={{ fontSize: 9, color: '#374151', padding: '7px 6px', textAlign: 'right', borderBottom: '0.5px solid #F3F4F6', fontVariantNumeric: 'tabular-nums' }}>{group.quantity}</td>
                              <td style={{ fontSize: 8.5, color: '#9CA3AF', padding: '7px 6px', textAlign: 'right', borderBottom: '0.5px solid #F3F4F6' }}>{group.isSleepover ? 'night' : 'hr'}</td>
                              <td style={{ fontSize: 9, color: '#374151', padding: '7px 6px', textAlign: 'right', borderBottom: '0.5px solid #F3F4F6', fontVariantNumeric: 'tabular-nums' }}>{fmt$(group.rate)}</td>
                              <td style={{ fontSize: 9, fontWeight: 600, color: '#374151', padding: '7px 6px', textAlign: 'right', borderBottom: '0.5px solid #F3F4F6', fontVariantNumeric: 'tabular-nums' }}>{fmt$(group.subtotal)}</td>
                              <td style={{ fontSize: 8.5, color: '#9CA3AF', padding: '7px 6px', textAlign: 'right', borderBottom: '0.5px solid #F3F4F6' }}>$0.00</td>
                              <td style={{ fontSize: 9, fontWeight: 700, color: '#111827', padding: '7px 6px', textAlign: 'right', borderBottom: '0.5px solid #F3F4F6', fontVariantNumeric: 'tabular-nums' }}>{fmt$(group.subtotal)}</td>
                            </tr>
                          ))}
                          {lineGroups.length === 0 && (
                            <tr>
                              <td colSpan={9} style={{ padding: '12px 6px', textAlign: 'center', fontSize: 9, color: '#9CA3AF' }}>
                                No line items — shifts will appear here after selecting a period.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* ── TOTALS ── */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                    <div style={{ minWidth: 220, maxWidth: 260 }}>
                      <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
                        {[
                          ['SUBTOTAL (EX GST)', fmt$(preview.total)],
                          ['GST',               '$0.00'],
                        ].map(([l, v]) => (
                          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderBottom: '0.5px solid #E5E7EB' }}>
                            <span style={cellLabel}>{l}</span>
                            <span style={cellValue}>{v}</span>
                          </div>
                        ))}
                        {/* BALANCE DUE row */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 10px', background: '#111827' }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>BALANCE DUE</span>
                          <span style={{ fontSize: 15, fontWeight: 900, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>{fmt$(preview.total)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── PAYMENT DETAILS ── */}
                  {(preview.bankName || preview.bsb || preview.accountNumber) && (
                    <div style={{ background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB', padding: '10px 12px', marginBottom: 10 }}>
                      <div style={sectionTitle}>Payment Details</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 }}>
                        {[
                          preview.accountName   && { k: 'Account Name', v: preview.accountName },
                          preview.bankName      && { k: 'Bank',          v: preview.bankName },
                          preview.bsb           && { k: 'BSB',           v: preview.bsb },
                          preview.accountNumber && { k: 'Account No.',   v: preview.accountNumber },
                        ].filter(Boolean).map(item => item && (
                          <div key={item.k}>
                            <div style={cellLabel}>{item.k}</div>
                            <div style={{ ...cellValue, fontSize: 9.5 }}>{item.v}</div>
                          </div>
                        ))}
                      </div>
                      {/* Reference — inside the payment box */}
                      <div style={{ borderTop: '0.5px solid #E5E7EB', paddingTop: 6, fontSize: 8.5, color: '#374151' }}>
                        Reference: <strong>{preview.invoiceNumber}</strong> · Payment due within 7 days of invoice date.
                      </div>
                    </div>
                  )}

                  {/* ── NOTES ── */}
                  {preview.invoiceNotes && (
                    <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
                      <div style={sectionTitle}>Notes</div>
                      <p style={{ fontSize: 8.5, color: '#6B7280', whiteSpace: 'pre-line', margin: 0 }}>{preview.invoiceNotes}</p>
                    </div>
                  )}

                  {/* ── FOOTER ── */}
                  <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <p style={{ fontSize: 7.5, color: '#9CA3AF', margin: 0 }}>
                      This invoice is GST-free under the NDIS.{preview.abn ? ` ABN: ${preview.abn}` : ''}
                    </p>
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
