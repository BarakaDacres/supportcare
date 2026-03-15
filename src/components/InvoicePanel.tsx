/**
 * InvoicePanel — Invoice generator + records list
 *
 * Layout corrections applied:
 * - Header: left=Name/ABN:/P:/E: right=INVOICE/Submitted:/Invoice #: — same font size, values bold
 * - Due date always = issueDate + 7 days
 * - No filled blue blocks — light borders/accents only
 * - Services table: optimised column widths, no clipping
 * - Bottom totals: SUBTOTAL / GST / TOTALS (AUD) — no filled bg
 * - Payment details: structured rows, "Payment due..." on own line
 * - Participant details flow correctly to BILL TO
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
  issuerEmail: string;
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
function buildInvoiceNumber(counter: number): string {
  return `INV-${String(counter).padStart(3, '0')}`;
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

function getCurrentFortnightIdx(periods: ReturnType<typeof getFortnightPeriodsForYear>): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < periods.length; i++) {
    const s = new Date(periods[i].start); s.setHours(0, 0, 0, 0);
    const e = new Date(periods[i].end);   e.setHours(23, 59, 59, 999);
    if (today >= s && today <= e) return i;
  }
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

// ─── Palette — dark minimal, no blue fills ───────────────────────────────────
const P = {
  accent:      '#111827',   // near-black for headings
  accentMid:   '#374151',   // dark mid
  accentLight: '#F9FAFB',   // off-white
  accentBorder:'#D1D5DB',  // neutral gray-300 border
  ink:         '#111827',
  dark:        '#1F2937',
  mid:         '#374151',
  muted:       '#6B7280',
  faint:       '#9CA3AF',
  border:      '#E5E7EB',
  rowAlt:      '#F9FAFB',
  bg:          '#F9FAFB',
  white:       '#FFFFFF',
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

// ─── PDF export ───────────────────────────────────────────────────────────────
async function exportToPDF(snap: InvoiceSnapshot, lineGroups: ReturnType<typeof groupShiftsForInvoice>) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const W  = 210;
  const M  = 16;           // left/right margin
  const CW = W - M * 2;   // 178 mm content width
  let y = 0;

  const rgb = (hex: string): [number, number, number] => {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const sf = (size: number, style: 'normal' | 'bold' = 'normal', color = P.ink) => {
    doc.setFontSize(size); doc.setFont('helvetica', style); doc.setTextColor(...rgb(color));
  };
  const tx = (t: string, x: number, yp: number, opts?: Parameters<typeof doc.text>[3]) =>
    doc.text(t, x, yp, opts);
  const hln = (y1: number, color = P.border, lw = 0.25) => {
    doc.setDrawColor(...rgb(color)); doc.setLineWidth(lw);
    doc.line(M, y1, W - M, y1);
  };
  const box = (x: number, yp: number, w: number, h: number, stroke: string, lw = 0.3) => {
    doc.setDrawColor(...rgb(stroke)); doc.setLineWidth(lw);
    doc.roundedRect(x, yp, w, h, 2, 2, 'S');
  };
  // leftBar removed — no solid accent bars

  // ── No top rule — clean start ─────────────────────────────────────────────
  y = 22; // generous top padding

  // ── HEADER ────────────────────────────────────────────────────────────────
  // Left block: Name / ABN: val / P: val / E: val
  // Right block: INVOICE / Submitted: val / Invoice #: val
  // Both start at same y; INVOICE same font size as issuer name

  const HEADER_FONT = 12; // same size for issuer name AND "INVOICE"
  const META_FONT   = 8;

  // Left column label+value pairs — no justification, no bold
  const issuerName = snap.issuerName || 'Your Business';
  const leftMeta: Array<[string, string]> = [];
  if (snap.abn)         leftMeta.push(['ABN:', snap.abn]);
  if (snap.phone)       leftMeta.push(['P:', snap.phone]);
  if (snap.issuerEmail) leftMeta.push(['E:', snap.issuerEmail]);

  // Right column
  const issueDate = formatDateShort(snap.issueDate);
  const rightMeta: Array<[string, string]> = [
    ['Submitted:', issueDate],
    ['Invoice #:', snap.invoiceNumber],
  ];

  // Draw issuer name (left)
  sf(HEADER_FONT, 'bold', P.ink);
  tx(issuerName, M, y);

  // Draw INVOICE (right) — same size
  sf(HEADER_FONT, 'bold', P.ink);
  tx('INVOICE', W - M, y, { align: 'right' });
  y += 5.5;

  // Left meta rows
  const leftMetaStartY = y;
  let lmy = leftMetaStartY;
  const labelColW = 14; // width for "ABN:" etc
  leftMeta.forEach(([lbl, val]) => {
    sf(META_FONT, 'normal', P.muted); tx(lbl, M, lmy);
    sf(META_FONT, 'bold',   P.mid);   tx(val, M + labelColW, lmy);
    lmy += 4.5;
  });

  // Right meta rows (right-aligned, label light, value bold)
  let rmy = leftMetaStartY;
  const valOffset = 38; // space for right-col labels
  rightMeta.forEach(([lbl, val]) => {
    sf(META_FONT, 'normal', P.muted); tx(lbl, W - M - valOffset, rmy);
    sf(META_FONT, 'bold',   P.mid);   tx(val, W - M, rmy, { align: 'right' });
    rmy += 4.5;
  });

  y = Math.max(lmy, rmy) + 6;

  // Divider
  hln(y, P.accentBorder, 0.5);
  y += 8;

  // ── BILL TO + INVOICE DETAILS ─────────────────────────────────────────────
  const halfW = (CW - 6) / 2;

  const billLines: Array<[string, 'bold' | 'normal', string]> = [];
  if (snap.clientOrganisation) billLines.push([snap.clientOrganisation, 'bold', P.ink]);
  billLines.push([snap.clientName || 'Participant', snap.clientOrganisation ? 'normal' : 'bold', P.ink]);
  if (snap.clientContact)           billLines.push([`Contact: ${snap.clientContact}`, 'normal', P.muted]);
  if (snap.clientAddress)           billLines.push([snap.clientAddress,               'normal', P.muted]);
  if (snap.clientEmail)             billLines.push([snap.clientEmail,                 'normal', P.muted]);
  if (snap.clientPhone)             billLines.push([`Ph: ${snap.clientPhone}`,         'normal', P.muted]);
  if (snap.clientParticipantNumber) billLines.push([`NDIS No: ${snap.clientParticipantNumber}`, 'normal', P.accent]);

  const cardH = Math.max(50, 14 + billLines.length * 5);

  // BILL TO box — border only, left accent bar
  box(M, y, halfW, cardH, P.accentBorder);
  leftBar(M, y, cardH);
  let cy = y + 7;
  sf(6, 'bold', P.accent); tx('BILL TO', M + 6, cy); cy += 5.5;
  billLines.forEach(([text, weight, color]) => {
    sf(weight === 'bold' ? 8.5 : 8, weight, color);
    tx(text, M + 6, cy); cy += 5;
  });

  // INVOICE DETAILS box — border only, left accent bar
  const rx = M + halfW + 6;
  box(rx, y, halfW, cardH, P.accentBorder);
  leftBar(rx, y, cardH);
  let dy = y + 7;
  sf(6, 'bold', P.accent); tx('INVOICE DETAILS', rx + 6, dy); dy += 5.5;

  const detailPairs: [string, string][] = [
    ['Service From', formatDateShort(snap.periodStart)],
    ['Service To',   formatDateShort(snap.periodEnd)],
    ['Due Date',     formatDateShort(snap.dueDate)],
    ['GST Rate',     '0% (GST-Free)'],
  ];
  detailPairs.forEach(([lbl, val]) => {
    sf(7.5, 'normal', P.muted); tx(lbl, rx + 6, dy);
    sf(7.5, 'bold',   P.mid);   tx(val, rx + halfW - 4, dy, { align: 'right' });
    dy += 5;
  });

  // Separator + BALANCE DUE — no fill, just text emphasis
  dy += 3;
  doc.setDrawColor(...rgb(P.border)); doc.setLineWidth(0.3);
  doc.line(rx + 6, dy, rx + halfW - 6, dy);
  dy += 6;
  sf(8, 'bold', P.accent);  tx('BALANCE DUE', rx + 6, dy);
  sf(11, 'bold', P.accent); tx(fmt$(snap.total), rx + halfW - 4, dy, { align: 'right' });

  y += cardH + 8;

  // ── SERVICES RENDERED ────────────────────────────────────────────────────
  sf(6.5, 'bold', P.accent);
  tx('SERVICES RENDERED', M, y);
  y += 4;

  // Column widths (must sum to CW = 178)
  // #(6) DESC(46) ITEMCODE(36) QTY(12) UNIT(11) RATE(20) TOTALEX(20) GST(12) TOTALINC(15)
  // sum: 6+46+36+12+11+20+20+12+15 = 178 ✓
  type Col = { lbl: string; w: number; al: 'left' | 'right' | 'center' };
  const cols: Col[] = [
    { lbl: '#',          w: 6,  al: 'center' },
    { lbl: 'DESCRIPTION',w: 46, al: 'left'   },
    { lbl: 'ITEM CODE',  w: 36, al: 'left'   },
    { lbl: 'QTY',        w: 12, al: 'right'  },
    { lbl: 'UNIT',       w: 11, al: 'right'  },
    { lbl: 'RATE',       w: 20, al: 'right'  },
    { lbl: 'TOTAL EX',   w: 20, al: 'right'  },
    { lbl: 'GST',        w: 12, al: 'right'  },
    { lbl: 'TOTAL INC',  w: 15, al: 'right'  },
  ];

  // Pre-compute x offsets
  const colX: number[] = [];
  let cx2 = 0;
  cols.forEach(c => { colX.push(cx2); cx2 += c.w; });

  const hdrH = 8;
  const rowH = 10;
  const nRows = Math.max(lineGroups.length, 1);
  const tableH = hdrH + nRows * rowH;

  // Table outer border
  box(M, y, CW, tableH, P.accentBorder, 0.4);

  // Header bg — very faint tint (not filled blue)
  doc.setFillColor(240, 246, 255);
  doc.roundedRect(M, y, CW, hdrH, 2, 2, 'F');
  // Ensure bottom portion of header bg is square (no rounding clash)
  doc.rect(M, y + hdrH - 3, CW, 3, 'F');

  // Header labels
  const hY = y + 5.5;
  cols.forEach((c, i) => {
    sf(5.5, 'bold', P.accent);
    const baseX = M + colX[i];
    if (c.al === 'right') {
      tx(c.lbl, baseX + c.w - 1, hY, { align: 'right' });
    } else if (c.al === 'center') {
      tx(c.lbl, baseX + c.w / 2, hY, { align: 'center' });
    } else {
      tx(c.lbl, baseX + 1, hY);
    }
  });

  // Header/body separator
  doc.setDrawColor(...rgb(P.accentBorder)); doc.setLineWidth(0.3);
  doc.line(M, y + hdrH, M + CW, y + hdrH);
  y += hdrH;

  if (lineGroups.length === 0) {
    sf(7.5, 'normal', P.faint);
    tx('No services — select a period with shifts', M + CW / 2, y + rowH / 2 + 2, { align: 'center' });
    y += rowH;
  } else {
    lineGroups.forEach((group, idx) => {
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 255);
        doc.rect(M, y, CW, rowH, 'F');
      }
      const ry = y + 6;
      const unit = group.isSleepover ? 'night' : 'hr';

      // #
      sf(7, 'normal', P.faint);
      tx(String(idx + 1), M + colX[0] + cols[0].w / 2, ry, { align: 'center' });

      // Description
      sf(7.5, 'bold', P.ink);
      tx(group.label, M + colX[1] + 1, ry - 1.5);
      sf(6, 'normal', P.faint);
      tx(`${group.shifts.length} shift${group.shifts.length !== 1 ? 's' : ''}`, M + colX[1] + 1, ry + 2.5);

      // Item code — monospace-ish, smaller, no clipping
      sf(5.5, 'normal', P.muted);
      tx(group.ndisCode ?? '', M + colX[2] + 1, ry, { maxWidth: cols[2].w - 2 });

      // Numeric right-aligned columns
      const rCol = (ci: number, val: string, sz = 7.5, wt: 'normal' | 'bold' = 'normal', col = P.mid) => {
        sf(sz, wt, col);
        tx(val, M + colX[ci] + cols[ci].w - 1, ry, { align: 'right' });
      };
      rCol(3, String(group.quantity));
      rCol(4, unit, 7, 'normal', P.faint);
      rCol(5, fmt$(group.rate));
      rCol(6, fmt$(group.subtotal), 7.5, 'bold');
      rCol(7, '$0.00', 7, 'normal', P.faint);
      rCol(8, fmt$(group.subtotal), 7.5, 'bold', P.ink);

      // Row separator
      if (idx < lineGroups.length - 1) {
        doc.setDrawColor(...rgb(P.border)); doc.setLineWidth(0.2);
        doc.line(M, y + rowH, M + CW, y + rowH);
      }
      y += rowH;
    });
  }
  y += 6;

  // ── TOTALS — no filled bg, just bordered box + lines ─────────────────────
  const totW = 72;
  const totX = W - M - totW;
  const totRows: Array<[string, string, boolean]> = [
    ['SUBTOTAL', fmt$(snap.total), false],
    ['GST',      '$0.00',          false],
    ['TOTALS (AUD)', fmt$(snap.total), true],
  ];
  const totRowH = 8.5;
  const totH = totRows.length * totRowH + 2;

  box(totX, y, totW, totH, P.accentBorder, 0.3);
  let ty = y + 7;
  totRows.forEach(([lbl, val, isFinal], ri) => {
    if (isFinal) {
      sf(8.5, 'bold', P.ink);    tx(lbl, totX + 5, ty);
      sf(10,  'bold', P.accent); tx(val, totX + totW - 4, ty, { align: 'right' });
    } else {
      sf(7.5, 'normal', P.muted); tx(lbl, totX + 5, ty);
      sf(7.5, 'bold',   P.mid);   tx(val, totX + totW - 4, ty, { align: 'right' });
      // Separator
      doc.setDrawColor(...rgb(P.border)); doc.setLineWidth(0.2);
      doc.line(totX + 2, ty + 3, totX + totW - 2, ty + 3);
    }
    ty += totRowH;
  });
  y += totH + 7;

  // ── PAYMENT DETAILS ───────────────────────────────────────────────────────
  if (snap.accountName || snap.bsb || snap.accountNumber || snap.bankName) {
    const payRows: Array<[string, string]> = [];
    if (snap.accountName)   payRows.push(['Account Name', snap.accountName]);
    if (snap.bankName)      payRows.push(['Bank',          snap.bankName]);
    if (snap.bsb)           payRows.push(['BSB',           snap.bsb]);
    if (snap.accountNumber) payRows.push(['Account No.',   snap.accountNumber]);
    payRows.push(['Reference', snap.invoiceNumber]);

    // Payment box: rows stacked vertically (2 per line, 2 lines max) + separator + "Payment due" line
    const colsPerRow = Math.min(payRows.length, 5);
    const colW3 = CW / colsPerRow;
    const payH  = 40;

    box(M, y, CW, payH, P.accentBorder);
    leftBar(M, y, payH);
    let py = y + 6;
    sf(6, 'bold', P.accent); tx('PAYMENT DETAILS', M + 6, py); py += 6;

    payRows.forEach(([k, v], i) => {
      const fx = M + 6 + i * colW3;
      sf(7, 'normal', P.muted); tx(k,  fx, py);
      sf(8.5, 'bold', P.ink);   tx(v,  fx, py + 4.5);
    });
    py += 10;

    doc.setDrawColor(...rgb(P.border)); doc.setLineWidth(0.2);
    doc.line(M + 6, py, M + CW - 4, py);
    py += 4.5;
    sf(7, 'normal', P.muted);
    tx('Payment due within 7 days of invoice date.', M + 6, py);
    y += payH + 5;
  }

  // ── NOTES ─────────────────────────────────────────────────────────────────
  if (snap.invoiceNotes) {
    const noteLines = doc.splitTextToSize(snap.invoiceNotes, CW - 10);
    const notH = 12 + noteLines.slice(0, 4).length * 4;
    box(M, y, CW, notH, P.border, 0.25);
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

  // ─── Helper: extract client billing fields ──────────────────────────────────
  const clientExtra = useCallback((c: Client | null) => ({
    organisation: c?.organisation_name ?? '',
    contact:      c?.billing_contact   ?? '',
    email:        c?.email             ?? '',
    phone:        c?.phone             ?? '',
  }), []);

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
      issuerEmail:   settings?.email             ?? '',
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
        // Always compute due date as 7 days from issue date
        dueDate = addDays(issueDate, 7);
      } else {
        invoiceNumber = buildInvoiceNumber(await onIncrementCounter());
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
    // Always 7 days from issue date
    const dueDate   = addDays(issueDate, 7);
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
      issuerEmail:   settings?.email             ?? '',
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
                {/* Thin top rule — accent only */}
                <div style={{ height: 3, background: P.accent }} />

                <div style={{
                  padding: '22px 18px 16px',
                  fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
                  fontSize: 11, color: P.ink,
                  background: 'hsl(var(--card))',
                }}>

                  {/* ── HEADER: issuer left / INVOICE right ── */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>

                    {/* Left — issuer name + meta */}
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: P.ink, letterSpacing: '-0.02em', marginBottom: 6 }}>
                        {preview.issuerName || 'Your Business Name'}
                      </div>
                      {/* ABN: / P: / E: rows with bold values */}
                      {preview.abn && (
                        <div style={{ fontSize: 8.5, color: P.muted, marginBottom: 3, display: 'flex', gap: 4 }}>
                          <span style={{ minWidth: 26 }}>ABN:</span>
                          <span style={{ fontWeight: 700, color: P.mid }}>{preview.abn}</span>
                        </div>
                      )}
                      {preview.phone && (
                        <div style={{ fontSize: 8.5, color: P.muted, marginBottom: 3, display: 'flex', gap: 4 }}>
                          <span style={{ minWidth: 26 }}>P:</span>
                          <span style={{ fontWeight: 700, color: P.mid }}>{preview.phone}</span>
                        </div>
                      )}
                      {preview.issuerEmail && (
                        <div style={{ fontSize: 8.5, color: P.muted, marginBottom: 3, display: 'flex', gap: 4 }}>
                          <span style={{ minWidth: 26 }}>E:</span>
                          <span style={{ fontWeight: 700, color: P.mid }}>{preview.issuerEmail}</span>
                        </div>
                      )}
                    </div>

                    {/* Right — INVOICE same size as name, then meta below */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: P.ink, letterSpacing: '-0.02em', marginBottom: 6 }}>
                        INVOICE
                      </div>
                      {/* Submitted: / Invoice #: rows with bold values */}
                      <div style={{ fontSize: 8.5, color: P.muted, marginBottom: 3, display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                        <span>Submitted:</span>
                        <span style={{ fontWeight: 700, color: P.mid }}>{formatDateShort(preview.issueDate)}</span>
                      </div>
                      <div style={{ fontSize: 8.5, color: P.muted, marginBottom: 3, display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                        <span>Invoice #:</span>
                        <span style={{ fontWeight: 700, color: P.mid }}>{preview.invoiceNumber}</span>
                      </div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div style={{ borderTop: `1.5px solid ${P.accentBorder}`, marginBottom: 13 }} />

                  {/* ── BILL TO + INVOICE DETAILS ── */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 13 }}>

                    {/* BILL TO — border + left accent bar, no fill */}
                    <div style={{
                      borderRadius: 8, padding: '10px 12px 10px 14px',
                      border: `1px solid ${P.accentBorder}`,
                      borderLeft: `3px solid ${P.accent}`,
                    }}>
                      <div style={{ fontSize: 7.5, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: P.accent, marginBottom: 6 }}>BILL TO</div>
                      {preview.clientOrganisation && (
                        <div style={{ fontSize: 10, fontWeight: 700, color: P.ink, marginBottom: 2 }}>{preview.clientOrganisation}</div>
                      )}
                      <div style={{ fontSize: 10, fontWeight: preview.clientOrganisation ? 400 : 700, color: P.ink, marginBottom: 3 }}>
                        {preview.clientName || 'Participant / Organisation'}
                      </div>
                      {preview.clientContact && <div style={{ fontSize: 8.5, color: P.muted, marginBottom: 2 }}>Contact: {preview.clientContact}</div>}
                      {preview.clientAddress && <div style={{ fontSize: 8.5, color: P.muted, marginBottom: 2 }}>{preview.clientAddress}</div>}
                      {preview.clientEmail   && <div style={{ fontSize: 8.5, color: P.muted, marginBottom: 2 }}>{preview.clientEmail}</div>}
                      {preview.clientPhone   && <div style={{ fontSize: 8.5, color: P.muted, marginBottom: 2 }}>Ph: {preview.clientPhone}</div>}
                      {preview.clientParticipantNumber && (
                        <div style={{ fontSize: 8.5, color: P.accent, fontWeight: 600 }}>NDIS No: {preview.clientParticipantNumber}</div>
                      )}
                    </div>

                    {/* INVOICE DETAILS — border + left accent bar, no fill */}
                    <div style={{
                      borderRadius: 8, padding: '10px 12px 10px 14px',
                      border: `1px solid ${P.accentBorder}`,
                      borderLeft: `3px solid ${P.accent}`,
                    }}>
                      <div style={{ fontSize: 7.5, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: P.accent, marginBottom: 6 }}>INVOICE DETAILS</div>
                      {[
                        ['Service From', formatDateShort(preview.periodStart)],
                        ['Service To',   formatDateShort(preview.periodEnd)],
                        ['Due Date',     formatDateShort(preview.dueDate)],
                        ['GST Rate',     '0% (GST-Free)'],
                      ].map(([l, v]) => (
                        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 8.5, color: P.muted }}>{l}</span>
                          <span style={{ fontSize: 8.5, fontWeight: 700, color: P.mid }}>{v}</span>
                        </div>
                      ))}
                      {/* Separator + BALANCE DUE — no fill */}
                      <div style={{ borderTop: `1px solid ${P.border}`, marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 8, fontWeight: 800, color: P.accent, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>BALANCE DUE</span>
                        <span style={{ fontSize: 13, fontWeight: 900, color: P.accent }}>{fmt$(preview.total)}</span>
                      </div>
                    </div>
                  </div>

                  {/* ── SERVICES RENDERED ── */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 7.5, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: P.accent, marginBottom: 5 }}>SERVICES RENDERED</div>
                    <div style={{ border: `1px solid ${P.accentBorder}`, borderRadius: 8, overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                        <colgroup>
                          <col style={{ width: '4%' }} />
                          <col style={{ width: '25%' }} />
                          <col style={{ width: '20%' }} />
                          <col style={{ width: '7%' }} />
                          <col style={{ width: '6%' }} />
                          <col style={{ width: '12%' }} />
                          <col style={{ width: '11%' }} />
                          <col style={{ width: '7%' }} />
                          <col style={{ width: '11%' }} />
                        </colgroup>
                        <thead>
                          <tr style={{ background: P.rowAlt }}>
                            {[
                              { h: '#',           a: 'center' as const },
                              { h: 'DESCRIPTION', a: 'left'   as const },
                              { h: 'ITEM CODE',   a: 'left'   as const },
                              { h: 'QTY',         a: 'right'  as const },
                              { h: 'UNIT',        a: 'right'  as const },
                              { h: 'RATE',        a: 'right'  as const },
                              { h: 'TOTAL EX',    a: 'right'  as const },
                              { h: 'GST',         a: 'right'  as const },
                              { h: 'TOTAL INC',   a: 'right'  as const },
                            ].map(({ h, a }) => (
                              <th key={h} style={{
                                padding: '5px 4px',
                                fontSize: 6.5, fontWeight: 700,
                                textTransform: 'uppercase', letterSpacing: '0.04em',
                                color: P.accent, textAlign: a,
                                borderBottom: `1px solid ${P.accentBorder}`,
                              }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {lineGroups.map((group, idx) => (
                            <tr key={group.category} style={{ background: idx % 2 === 1 ? P.rowAlt : P.white }}>
                              <td style={{ fontSize: 7.5, color: P.faint, padding: '5px 4px', textAlign: 'center', borderBottom: `1px solid ${P.border}` }}>{idx + 1}</td>
                              <td style={{ padding: '5px 4px', borderBottom: `1px solid ${P.border}` }}>
                                <div style={{ fontSize: 8, fontWeight: 600, color: P.ink }}>{group.label}</div>
                                <div style={{ fontSize: 6.5, color: P.faint, marginTop: 1 }}>{group.shifts.length} shift{group.shifts.length !== 1 ? 's' : ''}</div>
                              </td>
                              <td style={{ fontSize: 6.5, color: P.muted, fontFamily: 'monospace', padding: '5px 4px', borderBottom: `1px solid ${P.border}`, wordBreak: 'break-all' }}>{group.ndisCode}</td>
                              <td style={{ fontSize: 8, color: P.mid, padding: '5px 4px', textAlign: 'right', borderBottom: `1px solid ${P.border}`, fontVariantNumeric: 'tabular-nums' }}>{group.quantity}</td>
                              <td style={{ fontSize: 7, color: P.faint, padding: '5px 4px', textAlign: 'right', borderBottom: `1px solid ${P.border}` }}>{group.isSleepover ? 'night' : 'hr'}</td>
                              <td style={{ fontSize: 8, color: P.mid, padding: '5px 4px', textAlign: 'right', borderBottom: `1px solid ${P.border}`, fontVariantNumeric: 'tabular-nums' }}>{fmt$(group.rate)}</td>
                              <td style={{ fontSize: 8, fontWeight: 600, color: P.mid, padding: '5px 4px', textAlign: 'right', borderBottom: `1px solid ${P.border}`, fontVariantNumeric: 'tabular-nums' }}>{fmt$(group.subtotal)}</td>
                              <td style={{ fontSize: 7.5, color: P.faint, padding: '5px 4px', textAlign: 'right', borderBottom: `1px solid ${P.border}` }}>$0.00</td>
                              <td style={{ fontSize: 8, fontWeight: 700, color: P.ink, padding: '5px 4px', textAlign: 'right', borderBottom: `1px solid ${P.border}`, fontVariantNumeric: 'tabular-nums' }}>{fmt$(group.subtotal)}</td>
                            </tr>
                          ))}
                          {lineGroups.length === 0 && (
                            <tr>
                              <td colSpan={9} style={{ padding: '12px 5px', textAlign: 'center', fontSize: 8.5, color: P.faint }}>
                                No services — select a period with shifts.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* ── TOTALS — no filled bg ── */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                    <div style={{ minWidth: 230, maxWidth: 270, border: `1px solid ${P.accentBorder}`, borderRadius: 8, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: `1px solid ${P.border}` }}>
                        <span style={{ fontSize: 8.5, color: P.muted }}>SUBTOTAL</span>
                        <span style={{ fontSize: 8.5, fontWeight: 600, color: P.mid, fontVariantNumeric: 'tabular-nums' }}>{fmt$(preview.total)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: `1px solid ${P.accentBorder}` }}>
                        <span style={{ fontSize: 8.5, color: P.muted }}>GST</span>
                        <span style={{ fontSize: 8.5, fontWeight: 600, color: P.mid }}>$0.00</span>
                      </div>
                      {/* TOTALS (AUD) — prominent, no blue fill */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px' }}>
                        <span style={{ fontSize: 9, fontWeight: 800, color: P.ink, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>TOTALS (AUD)</span>
                        <span style={{ fontSize: 15, fontWeight: 900, color: P.accent, fontVariantNumeric: 'tabular-nums' }}>{fmt$(preview.total)}</span>
                      </div>
                    </div>
                  </div>

                  {/* ── PAYMENT DETAILS ── */}
                  {(preview.accountName || preview.bankName || preview.bsb || preview.accountNumber) && (
                    <div style={{
                      borderRadius: 8,
                      border: `1px solid ${P.accentBorder}`,
                      borderLeft: `3px solid ${P.accent}`,
                      padding: '10px 12px 10px 14px',
                      marginBottom: 10,
                    }}>
                      <div style={{ fontSize: 7.5, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: P.accent, marginBottom: 9 }}>PAYMENT DETAILS</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 9 }}>
                        {[
                          preview.accountName   ? { k: 'Account Name', v: preview.accountName }   : null,
                          preview.bankName      ? { k: 'Bank',          v: preview.bankName }      : null,
                          preview.bsb           ? { k: 'BSB',           v: preview.bsb }           : null,
                          preview.accountNumber ? { k: 'Account No.',   v: preview.accountNumber } : null,
                          { k: 'Reference', v: preview.invoiceNumber },
                        ].filter(Boolean).map(item => item && (
                          <div key={item.k}>
                            <div style={{ fontSize: 7.5, color: P.muted, marginBottom: 2 }}>{item.k}</div>
                            <div style={{ fontSize: 9, fontWeight: 700, color: P.ink }}>{item.v}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ borderTop: `1px solid ${P.border}`, paddingTop: 7, fontSize: 8, color: P.muted }}>
                        Payment due within 7 days of invoice date.
                      </div>
                    </div>
                  )}

                  {/* ── NOTES ── */}
                  {preview.invoiceNotes && (
                    <div style={{ border: `1px solid ${P.border}`, borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
                      <div style={{ fontSize: 7.5, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: P.muted, marginBottom: 5 }}>NOTES</div>
                      <p style={{ fontSize: 8.5, color: P.muted, whiteSpace: 'pre-line', margin: 0 }}>{preview.invoiceNotes}</p>
                    </div>
                  )}

                  {/* ── FOOTER ── */}
                  <div style={{ borderTop: `1px solid ${P.border}`, paddingTop: 7, display: 'flex', justifyContent: 'space-between' }}>
                    <p style={{ fontSize: 7.5, color: P.faint, margin: 0 }}>
                      This invoice is GST-free under the NDIS.{preview.abn ? ` ABN: ${preview.abn}` : ''}
                    </p>
                    <p style={{ fontSize: 7.5, color: P.faint, margin: 0 }}>Thank you for your payment.</p>
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
