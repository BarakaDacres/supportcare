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

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  FileText, ChevronDown, Download, User, Send, CheckCircle,
  AlertCircle, XCircle, Trash2, RefreshCw, Eye, AlertTriangle, RotateCcw,
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
  shiftsLoading?: boolean;
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
  invoiceDueDays: number;
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
  if (days === 0) return dateStr; // "Due on Receipt" — same date
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

// ─── Palette — reference style: blue accents on name/title, clean rows ────────
const P = {
  accent:      '#1D4ED8',   // blue — used for issuer name, INVOICE title, final total
  accentMid:   '#374151',
  accentLight: '#F9FAFB',
  accentBorder:'#BFDBFE',   // subtle blue border for containers
  ink:         '#111827',
  dark:        '#1F2937',
  mid:         '#374151',
  muted:       '#6B7280',
  faint:       '#9CA3AF',
  border:      '#E5E7EB',
  cardBorder:  '#BFDBFE',   // blue-200 — subtle blue accent for all cards
  rowAlt:      '#FFFFFF',   // no alternating tint — all rows plain white
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

const StatusBadge = React.forwardRef<HTMLSpanElement, { status: string }>(
  ({ status }, ref) => {
    const cfg = STATUS_CFG[status] ?? STATUS_CFG.draft;
    return (
      <span ref={ref} style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 9px', borderRadius: 99,
        fontSize: 10, fontWeight: 600,
        color: cfg.color, background: cfg.bg,
      }}>
        {cfg.label}
      </span>
    );
  }
);
StatusBadge.displayName = 'StatusBadge';

// ─── PDF export ───────────────────────────────────────────────────────────────
async function loadFontBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function exportToPDF(snap: InvoiceSnapshot, lineGroups: ReturnType<typeof groupShiftsForInvoice>) {
  const { jsPDF } = await import('jspdf');

  // ── Load & embed Inter (SF Pro substitute) + Roboto Mono (item codes) ──────
  const [interRegB64, interSemiB64, monoB64] = await Promise.all([
    loadFontBase64('/fonts/Inter-Regular.ttf'),
    loadFontBase64('/fonts/Inter-SemiBold.ttf'),
    loadFontBase64('/fonts/RobotoMono-Regular.ttf'),
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Register Inter Regular (weight 400 → 'normal')
  doc.addFileToVFS('Inter-Regular.ttf', interRegB64);
  doc.addFont('Inter-Regular.ttf', 'Inter', 'normal');

  // Register Inter SemiBold (weight 600 → 'bold')
  doc.addFileToVFS('Inter-SemiBold.ttf', interSemiB64);
  doc.addFont('Inter-SemiBold.ttf', 'Inter', 'bold');

  // Register Roboto Mono Regular (item codes)
  doc.addFileToVFS('RobotoMono-Regular.ttf', monoB64);
  doc.addFont('RobotoMono-Regular.ttf', 'RobotoMono', 'normal');

  const W  = 210;
  const M  = 16;
  const CW = W - M * 2;
  let y = 0;

  const SF     = 'Inter';       // Embedded Inter — Apple SF Pro substitute
  const SFMONO = 'RobotoMono';  // Embedded Roboto Mono — for item codes

  const rgb = (hex: string): [number, number, number] => {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const sf = (size: number, style: 'normal' | 'bold' = 'normal', color = P.ink) => {
    doc.setFontSize(size); doc.setFont(SF, style); doc.setTextColor(...rgb(color));
  };
  // sfm — Roboto Mono for item codes
  const sfm = (size: number, color = P.muted) => {
    doc.setFontSize(size); doc.setFont(SFMONO, 'normal'); doc.setTextColor(...rgb(color));
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

  // ── HEADER ────────────────────────────────────────────────────────────────
  y = 20;

  const HEADER_FONT = 12;
  const META_FONT   = 7.5;

  const issuerName = snap.issuerName || 'Your Business';

  // Format ABN as "XX XXX XXX XXX" (groups: 2-3-3-3)
  const formatABN = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 11) {
      return `${digits.slice(0,2)} ${digits.slice(2,5)} ${digits.slice(5,8)} ${digits.slice(8,11)}`;
    }
    // Already formatted or non-standard — preserve as-is
    return raw;
  };
  // Format phone as "XXXX XXX XXX" (4-3-3)
  const formatPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 10) {
      return `${digits.slice(0,4)} ${digits.slice(4,7)} ${digits.slice(7,10)}`;
    }
    return raw;
  };
  // Format BSB as "XXX XXX" (3-3)
  const formatBSB = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 6) {
      return `${digits.slice(0,3)} ${digits.slice(3,6)}`;
    }
    return raw;
  };
  // Format account number as "XXXX XXXX" (4-4)
  const formatAccountNumber = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 8) {
      return `${digits.slice(0,4)} ${digits.slice(4,8)}`;
    }
    return raw;
  };

  const leftMeta: Array<[string, string]> = [];
  if (snap.abn)         leftMeta.push(['ABN:', formatABN(snap.abn)]);
  if (snap.phone)       leftMeta.push(['P:', formatPhone(snap.phone)]);
  if (snap.issuerEmail) leftMeta.push(['E:', snap.issuerEmail]);

  const issueDate = formatDateShort(snap.issueDate);
  const rightMeta: Array<[string, string]> = [
    ['Submitted:', issueDate],
    ['Invoice #:', snap.invoiceNumber],
  ];

  sf(HEADER_FONT, 'bold', P.accent);
  tx(issuerName, M, y);
  tx('INVOICE', W - M, y, { align: 'right' });
  y += 5;

  const leftMetaStartY = y;
  let lmy = leftMetaStartY;
  // ABN/P/E: inline — label immediately followed by value, no extra gap
  leftMeta.forEach(([lbl, val]) => {
    sf(META_FONT, 'normal', P.muted);
    tx(lbl, M, lmy);
    const lblW2 = doc.getTextWidth(lbl) + 1.5;
    sf(META_FONT, 'normal', P.ink);  // ink (darkest), not bold
    tx(val, M + lblW2, lmy);
    lmy += 4.2;
  });

  // Right meta: fixed two-column layout — label at COL_START, value right-aligned with clear space
  const RIGHT_META_COL = W - M - 52; // fixed left edge of right meta column
  let rmy = leftMetaStartY;
  rightMeta.forEach(([lbl, val]) => {
    sf(META_FONT, 'normal', P.muted);
    tx(lbl, RIGHT_META_COL, rmy);
    sf(META_FONT, 'normal', P.ink);  // ink (darkest), not bold
    tx(val, W - M, rmy, { align: 'right' });
    rmy += 4.2;
  });

  y = Math.max(lmy, rmy) + 5;
  hln(y, P.cardBorder, 0.5);
  y += 6;

  // ── BILL TO + INVOICE DETAILS ─────────────────────────────────────────────
  const halfW = (CW - 6) / 2;

  // BILL TO: Organisation, Participant, Email, Address (no NDIS No)
  type BillRow = { label: string; value: string; valueBold?: boolean };
  const billRows: BillRow[] = [];
  if (snap.clientOrganisation) billRows.push({ label: 'Organisation', value: snap.clientOrganisation, valueBold: true });
  if (snap.clientName)         billRows.push({ label: 'Participant',  value: snap.clientName });
  if (snap.clientEmail)        billRows.push({ label: 'Email',        value: snap.clientEmail });
  if (snap.clientAddress)      billRows.push({ label: 'Address',      value: snap.clientAddress });

  // Row layout constants
  const CARD_PAD_X = 6;     // internal horizontal padding
  const CARD_TOP   = 5;     // padding before section label (moved down slightly)
  const SECTION_H  = 5.5;   // section label + gap (tighter)
  const BILL_ROW_H = 5.2;   // height per BILL TO row (allows slight wrap)
  const DET_ROW_H  = 5.2;   // same height for INVOICE DETAILS rows
  const CARD_BOT   = 2;     // minimal bottom padding
  const SEP_BLOCK  = 7;     // separator + BALANCE DUE area (tighter)

  // Card heights
  const billCardH  = CARD_TOP + SECTION_H + billRows.length * BILL_ROW_H + CARD_BOT;
  const detCardH   = CARD_TOP + SECTION_H + 4 * DET_ROW_H + SEP_BLOCK + CARD_BOT;
  const finalCardH = Math.max(billCardH, detCardH);

  // BILL TO box — labels left-aligned, values right-aligned, blue accent border
  box(M, y, halfW, finalCardH, P.cardBorder, 0.5);
  let cy = y + CARD_TOP;
  sf(7, 'bold', P.muted);
  tx('BILL TO', M + CARD_PAD_X, cy);
  cy += SECTION_H;
  billRows.forEach(({ label, value, valueBold }) => {
    sf(6.5, 'normal', P.muted);
    tx(label, M + CARD_PAD_X, cy);
    sf(6.5, valueBold ? 'bold' : 'normal', P.dark);

    let displayLines: string[];
    if (label === 'Address') {
      // Split address so suburb/state/postcode is always on line 2
      // Handles: "123 Street, Cardiff, NSW 2285" or "123 Street, Cardiff, NSW, 2285"
      const parts = value.split(',').map((p: string) => p.trim()).filter(Boolean);
      if (parts.length >= 3) {
        // Line 1 = street address (all parts except last 2)
        // Line 2 = suburb + state/postcode (last 2 parts joined)
        const line1 = parts.slice(0, parts.length - 2).join(', ');
        const line2 = parts.slice(parts.length - 2).join(', ');
        displayLines = [line1, line2];
      } else if (parts.length === 2) {
        displayLines = [parts[0], parts[1]];
      } else if (parts.length === 1) {
        // Try splitting on last space-separated token as postcode fallback
        displayLines = doc.splitTextToSize(value, 36).slice(0, 2);
      } else {
        displayLines = [value];
      }
    } else if (label === 'Organisation') {
      displayLines = doc.splitTextToSize(value, 34).slice(0, 2);
    } else {
      displayLines = doc.splitTextToSize(value, 40).slice(0, 2);
    }

    displayLines.forEach((line: string, li: number) => {
      tx(line, M + halfW - CARD_PAD_X, cy + li * 3.8, { align: 'right' });
    });
    cy += BILL_ROW_H + (displayLines.length > 1 ? 3.8 : 0);
  });

  // INVOICE DETAILS box — labels left, values right, blue accent border
  const rx = M + halfW + 6;
  box(rx, y, halfW, finalCardH, P.cardBorder, 0.5);
  let dy = y + CARD_TOP;
  sf(7, 'bold', P.muted);
  tx('INVOICE DETAILS', rx + CARD_PAD_X, dy);
  dy += SECTION_H;
  const detailPairs: [string, string][] = [
    ['Service From', formatDateShort(snap.periodStart)],
    ['Service To',   formatDateShort(snap.periodEnd)],
    ['Due Date',     (snap.invoiceDueDays ?? 7) === 0 ? 'Due on Receipt' : formatDateShort(snap.dueDate)],
    ['GST Rate',     '0% (GST-Free)'],
  ];
  detailPairs.forEach(([lbl, val]) => {
    sf(6.5, 'normal', P.muted);
    tx(lbl, rx + CARD_PAD_X, dy);
    sf(6.5, 'normal', P.mid);   // not bold — only BALANCE DUE is bold
    tx(val, rx + halfW - CARD_PAD_X, dy, { align: 'right' });
    dy += DET_ROW_H;
  });
  dy += 1.5;
  doc.setDrawColor(...rgb(P.cardBorder)); doc.setLineWidth(0.25);
  doc.line(rx + CARD_PAD_X, dy, rx + halfW - CARD_PAD_X, dy);
  dy += 4;
  sf(7.5, 'bold', P.accent);
  tx('BALANCE DUE', rx + CARD_PAD_X, dy);
  sf(10, 'bold', P.accent);
  tx(fmt$(snap.total), rx + halfW - CARD_PAD_X, dy, { align: 'right' });

  y += finalCardH + 6;

  // ── SERVICES RENDERED ────────────────────────────────────────────────────
  const TABLE_PAD_X = 4; // consistent internal horizontal padding
  sf(5.5, 'bold', P.muted);
  tx('SERVICES RENDERED', M + TABLE_PAD_X, y);
  y += 3.5;

  type Col = { lbl: string; w: number; al: 'left' | 'right' | 'center' };
  const cols: Col[] = [
    { lbl: '#',           w: 6,  al: 'center' },
    { lbl: 'DESCRIPTION', w: 44, al: 'left'   },
    { lbl: 'ITEM CODE',   w: 34, al: 'left'   },
    { lbl: 'QTY',         w: 12, al: 'right'  },
    { lbl: 'UNIT',        w: 11, al: 'right'  },
    { lbl: 'RATE',        w: 20, al: 'right'  },
    { lbl: 'TOTAL EX',    w: 20, al: 'right'  },
    { lbl: 'GST',         w: 12, al: 'right'  },
    { lbl: 'TOTAL INC',   w: 17, al: 'right'  },
  ];

  // Recalculate column positions with internal padding accounted for
  const contentW = CW - TABLE_PAD_X * 2;
  const colX: number[] = [];
  let cx2 = 0;
  cols.forEach(c => { colX.push(cx2); cx2 += c.w; });
  // Scale to fit content width
  const scale = contentW / cx2;
  for (let i = 0; i < colX.length; i++) colX[i] *= scale;
  for (let i = 0; i < cols.length; i++) cols[i].w *= scale;

  const hdrH = 7.5;
  const rowH = 9.5;
  const nRows = Math.max(lineGroups.length, 1);
  // No extra bottom padding - box height fits content exactly
  const tableH = hdrH + nRows * rowH;
  const tableStartY = y;

  // Draw box AFTER we know the exact height (prevents top/bottom asymmetry)
  box(M, tableStartY, CW, tableH, P.cardBorder, 0.5);

  // Header bg — light blue-tinted, with internal padding
  doc.setFillColor(239, 246, 255);
  doc.roundedRect(M, tableStartY, CW, hdrH + 2, 2, 2, 'F');
  doc.setFillColor(239, 246, 255);
  doc.rect(M, tableStartY + hdrH - 1, CW, 3, 'F');

  const hY = tableStartY + 5.2;
  cols.forEach((c, i) => {
    sf(6, 'bold', P.mid);
    const baseX = M + TABLE_PAD_X + colX[i];
    if (c.al === 'right')       tx(c.lbl, baseX + c.w - 1, hY, { align: 'right' });
    else if (c.al === 'center') tx(c.lbl, baseX + c.w / 2, hY, { align: 'center' });
    else                        tx(c.lbl, baseX + 1, hY);
  });

  doc.setDrawColor(...rgb(P.cardBorder)); doc.setLineWidth(0.4);
  doc.line(M + TABLE_PAD_X, tableStartY + hdrH, M + CW - TABLE_PAD_X, tableStartY + hdrH);
  y = tableStartY + hdrH;

  if (lineGroups.length === 0) {
    sf(7, 'normal', P.faint);
    tx('No services — select a period with shifts', M + CW / 2, y + rowH / 2 + 2, { align: 'center' });
    y += rowH;
  } else {
    lineGroups.forEach((group, idx) => {
      doc.setFillColor(255, 255, 255);
      doc.rect(M, y, CW, rowH, 'F');

      const ry = y + 5.8;
      const unit = group.isSleepover ? 'night' : 'hr';

      sf(6.5, 'normal', P.faint);
      tx(String(idx + 1), M + TABLE_PAD_X + colX[0] + cols[0].w / 2, ry, { align: 'center' });

      sf(7, 'normal', P.ink);
      tx(group.label, M + TABLE_PAD_X + colX[1] + 1, ry - 1.2);
      sf(5.5, 'normal', P.faint);
      tx(`${group.shifts.length} shift${group.shifts.length !== 1 ? 's' : ''}`, M + TABLE_PAD_X + colX[1] + 1, ry + 2.2);

      sfm(5.5, P.muted);
      tx(group.ndisCode ?? '', M + TABLE_PAD_X + colX[2] + 1, ry, { maxWidth: cols[2].w - 2 });

      const rCol = (ci: number, val: string, sz = 7, wt: 'normal' | 'bold' = 'normal', col = P.mid) => {
        sf(sz, wt, col);
        tx(val, M + TABLE_PAD_X + colX[ci] + cols[ci].w - 1, ry, { align: 'right' });
      };
      rCol(3, String(group.quantity));
      rCol(4, unit, 6.5, 'normal', P.faint);
      rCol(5, fmt$(group.rate));
      rCol(6, fmt$(group.subtotal), 7, 'bold');
      rCol(7, '$0.00', 6.5, 'normal', P.faint);
      rCol(8, fmt$(group.subtotal), 7, 'bold', P.ink);

      // Draw divider between rows (not after the last row)
      if (idx < lineGroups.length - 1) {
        doc.setDrawColor(...rgb(P.cardBorder)); doc.setLineWidth(0.25);
        doc.line(M + TABLE_PAD_X, y + rowH, M + CW - TABLE_PAD_X, y + rowH);
      }
      y += rowH;
    });
  }
  // y now sits at bottom of last row; move to end of table + gap
  y = tableStartY + tableH + 5;

  // ── TOTALS — tight content-fitted box ────────────────────────────────────
  const totW = 70;
  const totX = W - M - totW;
  const totRows: Array<[string, string, boolean]> = [
    ['SUBTOTAL',     fmt$(snap.total), false],
    ['GST',          '$0.00',          false],
    ['TOTALS (AUD)', fmt$(snap.total), true],
  ];
  const totRowH = 7;
  const totH = totRows.length * totRowH + 2;

  box(totX, y, totW, totH, P.cardBorder, 0.5);
  let ty = y + 5.5;
  totRows.forEach(([lbl, val, isFinal]) => {
    if (isFinal) {
      sf(8, 'bold', P.accent); tx(lbl, totX + 5, ty);
      sf(9.5, 'bold', P.accent); tx(val, totX + totW - 4, ty, { align: 'right' });
    } else {
      sf(7, 'normal', P.muted); tx(lbl, totX + 5, ty);
      sf(7, 'bold',   P.ink);   tx(val, totX + totW - 4, ty, { align: 'right' });
      doc.setDrawColor(...rgb(P.cardBorder)); doc.setLineWidth(0.2);
      doc.line(totX + 2, ty + 2.5, totX + totW - 2, ty + 2.5);
    }
    ty += totRowH;
  });
  y += totH + 5;

  // ── PAYMENT DETAILS — tight box, dynamic due-date text ───────────────────
  if (snap.accountName || snap.bsb || snap.accountNumber || snap.bankName) {
    const referenceVal = snap.clientName || snap.invoiceNumber;
    const payRows: Array<[string, string]> = [];
    if (snap.accountName)   payRows.push(['Account Name', snap.accountName]);
    if (snap.bankName)      payRows.push(['Bank',          snap.bankName]);
    if (snap.bsb)           payRows.push(['BSB',           formatBSB(snap.bsb)]);
    if (snap.accountNumber) payRows.push(['Account No.',   formatAccountNumber(snap.accountNumber)]);
    payRows.push(['Reference', referenceVal]);

    const colsPerRow = Math.min(payRows.length, 5);
    const payInnerW = CW - TABLE_PAD_X * 2;
    const colW3 = payInnerW / colsPerRow;
    const payH  = 28;

    box(M, y, CW, payH, P.cardBorder, 0.5);
    let py = y + 5;
    sf(5.5, 'bold', P.muted); tx('PAYMENT DETAILS', M + TABLE_PAD_X, py); py += 5.5;

    payRows.forEach(([k, v], i) => {
      const fx = M + TABLE_PAD_X + i * colW3;
      sf(6.5, 'normal', P.muted); tx(k,  fx, py);
      sf(8, 'bold', P.ink);       tx(v,  fx, py + 3.8);
    });
    py += 9.5;

    doc.setDrawColor(...rgb(P.cardBorder)); doc.setLineWidth(0.2);
    doc.line(M + TABLE_PAD_X, py, M + CW - TABLE_PAD_X, py);
    py += 5.5;
    sf(6.5, 'normal', P.muted);
    // Dynamic payment due text: "Due on receipt" vs "Payment due within N days..."
    const dueDaysVal = snap.invoiceDueDays ?? 7;
    const payDueText = dueDaysVal === 0
      ? 'Payment due on receipt of this invoice.'
      : `Payment due within ${dueDaysVal} day${dueDaysVal !== 1 ? 's' : ''} of invoice date.`;
    tx(payDueText, M + TABLE_PAD_X, py);
    y += payH + 5;
  }

  // ── NOTES ─────────────────────────────────────────────────────────────────
  if (snap.invoiceNotes) {
    const noteLines = doc.splitTextToSize(snap.invoiceNotes, CW - 10);
    const notH = 10 + noteLines.slice(0, 4).length * 4;
    box(M, y, CW, notH, P.cardBorder, 0.4);
    sf(5.5, 'bold', P.muted); tx('NOTES', M + 4, y + 5);
    sf(7, 'normal', P.muted);
    noteLines.slice(0, 4).forEach((l: string, i: number) => tx(l, M + 4, y + 9 + i * 4));
    y += notH + 5;
  }

  // ── FOOTER ────────────────────────────────────────────────────────────────
  const footY = 285;
  doc.setDrawColor(...rgb(P.cardBorder)); doc.setLineWidth(0.4);
  doc.line(M, footY, W - M, footY);
  sf(6.5, 'normal', P.faint);
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

// ─── Persisted last-selected client key ─────────────────────────────────────
const LAST_CLIENT_KEY = 'invoice_last_client_id';

// ─── Main component ────────────────────────────────────────────────────────────
const InvoicePanel = ({
  shifts, shiftsLoading = false, clients, settings,
  onIncrementCounter,
  invoices, invoicesLoading,
  onUpdateStatus, onDeleteInvoice, onRefreshInvoices,
}: InvoicePanelProps) => {
  const currentYear = new Date().getFullYear();

  const [selectedYear, setSelectedYear]         = useState(currentYear);
  // Smart default: restore last-selected client from localStorage
  const [selectedClientId, setSelectedClientId] = useState<string>(() => {
    try { return localStorage.getItem(LAST_CLIENT_KEY) ?? ''; } catch { return ''; }
  });
  const [generating, setGenerating]             = useState(false);
  const [reloadSuccess, setReloadSuccess]       = useState(false);
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

  // Validate stored client still exists; if not, clear to "All clients"
  useEffect(() => {
    if (clients.length === 0) return;
    if (selectedClientId && !clients.find(c => c.id === selectedClientId)) {
      setSelectedClientId('');
      try { localStorage.removeItem(LAST_CLIENT_KEY); } catch { /* noop */ }
    }
  }, [clients, selectedClientId]);

  // Persist client selection
  const handleClientChange = useCallback((id: string) => {
    setSelectedClientId(id);
    setPreview(null);
    setGenerateError(null);
    setReloadSuccess(false);
    try {
      if (id) localStorage.setItem(LAST_CLIENT_KEY, id);
      else localStorage.removeItem(LAST_CLIENT_KEY);
    } catch { /* noop */ }
  }, []);

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

  // Detect if shifts have changed since invoice was last saved
  const invoiceIsStale = useMemo(() => {
    if (!existingInvoice) return false;
    return +total.toFixed(2) !== +existingInvoice.total_amount.toFixed(2);
  }, [existingInvoice, total]);

  // ─── Confirm overwrite of sent/paid invoice ─────────────────────────────────
  const [reloadConfirmOpen, setReloadConfirmOpen] = useState(false);

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
      invoiceDueDays:     settings?.invoice_due_days ?? 7,
    };
  }, [settings, selectedClient, selectedPeriod, selectedYear, periodShifts, total, clientExtra]);

  // ─── Core: reload existing invoice content without changing invoice number ────
  // The submitted date is updated to today on each reload so the PDF reflects when it was last refreshed.
  const reloadInvoice = useCallback(async () => {
    if (!existingInvoice || !selectedPeriod) return;
    setGenerating(true);
    setGenerateError(null);
    setReloadConfirmOpen(false);
    setReloadSuccess(false);
    try {
      const refreshedDate = formatDateISO(new Date()); // new submitted date = today
      const dueDate = addDays(refreshedDate, settings?.invoice_due_days ?? 7);
      const nowISO = new Date().toISOString();
      const { error } = await supabase
        .from('invoices')
        .update({
          total_amount: total,
          updated_at:   nowISO,
          // Store the refreshed submitted date in due_date logic via the new issueDate
          due_date:     dueDate,
        })
        .eq('id', existingInvoice.id);
      if (error) { setGenerateError(`Failed to reload invoice: ${error.message}`); return; }
      onRefreshInvoices();
      setPreview(buildSnapshot(existingInvoice.id, existingInvoice.invoice_number, refreshedDate, dueDate));
      setReloadSuccess(true);
      setTimeout(() => setReloadSuccess(false), 4000);
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : 'An unexpected error occurred.');
    } finally {
      setGenerating(false);
    }
  }, [existingInvoice, selectedPeriod, total, buildSnapshot, onRefreshInvoices, settings]);

  // ─── View existing invoice without changing DB ────────────────────────────────
  const viewExistingInvoice = useCallback(() => {
    if (!existingInvoice) return;
    const issueDate = existingInvoice.created_at.split('T')[0];
    const dueDate   = addDays(issueDate, settings?.invoice_due_days ?? 7);
    setPreview(buildSnapshot(existingInvoice.id, existingInvoice.invoice_number, issueDate, dueDate));
  }, [existingInvoice, buildSnapshot]);

  // ─── Create new invoice ────────────────────────────────────────────────────────
  const createInvoice = async () => {
    if (!selectedPeriod) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setGenerateError('Not signed in. Please sign in and try again.'); return; }

      const invoiceNumber = buildInvoiceNumber(await onIncrementCounter());
      const issueDate     = formatDateISO(new Date());
      const dueDate       = addDays(issueDate, settings?.invoice_due_days ?? 7);

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
      onRefreshInvoices();
      setPreview(buildSnapshot((newInv as { id: string }).id, invoiceNumber, issueDate, dueDate));
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : 'An unexpected error occurred.');
    } finally {
      setGenerating(false);
    }
  };

  // ─── Handle reload click — guard sent/paid ────────────────────────────────────
  const handleReloadClick = () => {
    if (!existingInvoice) return;
    if (['sent', 'paid'].includes(existingInvoice.status)) {
      setReloadConfirmOpen(true);
    } else {
      reloadInvoice();
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
    const dueDate   = addDays(issueDate, settings?.invoice_due_days ?? 7);
    const mc        = clients.find(c => c.id === inv.client_id) ?? null;
    const s         = settings as unknown as Record<string, string | null>;
    const useDefaults = settings?.use_default_invoice_notes !== false;
    const ext       = clientExtra(mc);

    // Sync the period selector to match the invoice's period so lineGroups is correct
    const invYear = inv.year ?? new Date(inv.period_start).getFullYear();
    const invPeriods = getFortnightPeriodsForYear(invYear);
    const invPeriodIdx = invPeriods.findIndex(p =>
      formatDateISO(p.start) === inv.period_start
    );

    setSelectedYear(invYear);
    if (invPeriodIdx >= 0) setSelectedFnIdx(invPeriodIdx);
    setSelectedClientId(inv.client_id ?? '');

    setPreview({
      invoiceNumber: inv.invoice_number,
      invoiceId:     inv.id,
      issueDate,
      dueDate,
      fnNumber:   inv.fortnight_number ?? 1,
      year:       invYear,
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
      invoiceDueDays:     settings?.invoice_due_days ?? 7,
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
          {/* ── Invoice Generator Card ── */}
          <div className="glass-card overflow-hidden">

            {/* Section title */}
            <div className="px-4 pt-4 pb-0">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Select Period</p>
            </div>

            {/* Inputs group */}
            <div className="px-4 pt-3 space-y-2">
              {/* Client */}
              {clients.length > 0 && (
                <div className="relative">
                  <label className="absolute left-3 top-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider z-10 pointer-events-none">
                    Client
                  </label>
                  <select
                    value={selectedClientId}
                    onChange={e => handleClientChange(e.target.value)}
                    className="glass-input w-full text-foreground text-sm appearance-none pt-5 pb-2 pr-8 pl-3 min-h-[54px]"
                  >
                    <option value="">All clients</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              )}

              {/* Year + Fortnight in a row */}
              <div className="flex gap-2">
                <div className="relative w-[100px] shrink-0">
                  <label className="absolute left-3 top-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider z-10 pointer-events-none">
                    Year
                  </label>
                  <select
                    value={selectedYear}
                    onChange={e => { setSelectedYear(Number(e.target.value)); setPreview(null); setGenerateError(null); setReloadSuccess(false); }}
                    className="glass-input w-full text-foreground text-sm appearance-none pt-5 pb-2 pr-7 pl-3 min-h-[54px]"
                  >
                    {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                </div>
                <div className="relative flex-1 min-w-0">
                  <label className="absolute left-3 top-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider z-10 pointer-events-none">
                    Fortnight
                  </label>
                  <select
                    value={selectedFnIdx}
                    onChange={e => { setSelectedFnIdx(Number(e.target.value)); setPreview(null); setGenerateError(null); setReloadSuccess(false); }}
                    className="glass-input w-full text-foreground text-sm appearance-none pt-5 pb-2 pr-8 pl-3 min-h-[54px]"
                  >
                    {periods.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="mx-4 mt-3 border-t border-border" />

            {/* Summary section */}
            <div className="px-4 pt-3 pb-1">
              <div className="flex items-start justify-between gap-3">

                {/* Left: shift count + invoice status */}
                <div className="space-y-1.5 min-w-0">
                  {/* Shift count */}
                  <div className="flex items-center gap-1.5">
                    {shiftsLoading ? (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                    <span className="text-xs text-muted-foreground">
                      {shiftsLoading ? 'Loading…' : `${periodShifts.length} shift${periodShifts.length !== 1 ? 's' : ''} in period`}
                    </span>
                  </div>

                  {/* Invoice identity line */}
                  {existingInvoice ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold" style={{ color: 'hsl(var(--primary))' }}>
                        {existingInvoice.invoice_number}
                      </span>
                      <StatusBadge status={isOverdue(existingInvoice) ? 'overdue' : existingInvoice.status} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">No invoice yet</span>
                    </div>
                  )}

                  {/* Staleness indicator */}
                  {existingInvoice && (
                    <div className="flex items-center gap-1">
                      {reloadSuccess ? (
                        <span className="text-[10px] font-semibold flex items-center gap-1" style={{ color: 'hsl(var(--stat-green))' }}>
                          <CheckCircle className="w-2.5 h-2.5" /> Updated just now
                        </span>
                      ) : invoiceIsStale ? (
                        <span className="text-[10px] font-semibold flex items-center gap-1" style={{ color: '#D97706' }}>
                          <AlertTriangle className="w-2.5 h-2.5" /> New shifts added
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium flex items-center gap-1" style={{ color: 'hsl(var(--stat-green))' }}>
                          <CheckCircle className="w-2.5 h-2.5" /> Up to date
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Right: total amount — primary emphasis */}
                <div className="text-right shrink-0">
                  <p className="text-2xl font-bold money-text leading-none">{fmt$(total)}</p>
                  {periodShifts.length > 0 && (
                    <p className="text-[9px] text-muted-foreground mt-1 uppercase tracking-wider">Total</p>
                  )}
                </div>
              </div>
            </div>

            {/* Error display */}
            {generateError && (
              <div className="mx-4 mt-2 flex items-start gap-2 p-3 rounded-xl"
                style={{ background: 'hsl(var(--destructive)/0.08)', border: '1px solid hsl(var(--destructive)/0.2)' }}>
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'hsl(var(--destructive))' }} />
                <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{generateError}</p>
              </div>
            )}

            {/* Sent/Paid reload confirmation */}
            {reloadConfirmOpen && existingInvoice && (
              <div className="mx-4 mt-2 p-3 rounded-2xl space-y-3"
                style={{ background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))' }}>
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    {existingInvoice.invoice_number} is marked{' '}
                    <span style={{ color: existingInvoice.status === 'paid' ? 'hsl(var(--stat-green))' : '#7C3AED' }}>
                      {existingInvoice.status}
                    </span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Reloading updates totals but keeps the same invoice number.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={reloadInvoice} disabled={generating}
                    className="flex-1 flex items-center justify-center gap-1.5 min-h-[40px] rounded-xl text-xs font-bold transition-all duration-150 disabled:opacity-50 active:scale-[0.97]"
                    style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                    <RotateCcw className="w-3 h-3" /> Update {existingInvoice.invoice_number}
                  </button>
                  <button onClick={() => setReloadConfirmOpen(false)}
                    className="flex-1 min-h-[40px] rounded-xl text-xs font-semibold text-muted-foreground transition-all duration-150 active:scale-[0.97]"
                    style={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* ── Action buttons ── */}
            {!reloadConfirmOpen && (
              <div className="px-4 pt-3 pb-4">
                {existingInvoice ? (
                  <div className="flex gap-2">
                    {/* PRIMARY — View Invoice (~60%) */}
                    <button
                      onClick={viewExistingInvoice}
                      disabled={shiftsLoading}
                      className="flex items-center justify-center gap-2 min-h-[46px] rounded-2xl text-sm font-bold transition-all duration-150 disabled:opacity-40 active:scale-[0.97]"
                      style={{
                        flex: '6 0 0',
                        background: 'hsl(var(--primary))',
                        color: 'hsl(var(--primary-foreground))',
                        boxShadow: '0 2px 10px hsl(var(--primary)/0.25)',
                      }}
                    >
                      <Eye className="w-4 h-4" />
                      View Invoice
                    </button>

                    {/* SECONDARY — Reload (~40%) or Up to date pill */}
                    {invoiceIsStale ? (
                      <button
                        onClick={handleReloadClick}
                        disabled={generating || shiftsLoading}
                        className="flex items-center justify-center gap-1.5 min-h-[46px] rounded-2xl text-sm font-semibold transition-all duration-150 disabled:opacity-40 active:scale-[0.97]"
                        style={{
                          flex: '4 0 0',
                          background: 'transparent',
                          color: 'hsl(var(--primary))',
                          border: '1.5px solid hsl(var(--primary)/0.3)',
                        }}
                      >
                        <RotateCcw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
                        {generating ? 'Updating…' : 'Reload'}
                      </button>
                    ) : (
                      <div
                        className="flex items-center justify-center gap-1.5 min-h-[46px] rounded-2xl text-xs font-semibold"
                        style={{
                          flex: '4 0 0',
                          color: 'hsl(var(--stat-green))',
                          border: '1.5px solid hsl(var(--stat-green)/0.25)',
                          background: 'hsl(var(--stat-green)/0.06)',
                        }}
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Up to date
                      </div>
                    )}
                  </div>
                ) : (
                  /* No invoice — Create button full width */
                  <button
                    onClick={createInvoice}
                    disabled={generating || shiftsLoading || (periodShifts.length === 0 && !shiftsLoading)}
                    className="w-full flex items-center justify-center gap-2 min-h-[46px] rounded-2xl text-sm font-bold transition-all duration-150 disabled:opacity-40 active:scale-[0.97]"
                    style={{
                      background: periodShifts.length === 0 && !shiftsLoading && !generating
                        ? 'hsl(var(--muted))'
                        : 'hsl(var(--primary))',
                      color: periodShifts.length === 0 && !shiftsLoading && !generating
                        ? 'hsl(var(--muted-foreground))'
                        : 'hsl(var(--primary-foreground))',
                      boxShadow: periodShifts.length > 0 ? '0 2px 10px hsl(var(--primary)/0.25)' : 'none',
                    }}
                  >
                    {shiftsLoading ? (
                      <><div className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin" /> Loading…</>
                    ) : generating ? (
                      <><FileText className="w-4 h-4" /> Creating…</>
                    ) : periodShifts.length === 0 ? (
                      <><FileText className="w-4 h-4" /> No shifts in period</>
                    ) : (
                      <><FileText className="w-4 h-4" /> Create Invoice</>
                    )}
                  </button>
                )}
              </div>
            )}
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

                <div style={{
                  padding: '22px 18px 16px',
                  fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Inter", "Helvetica Neue", sans-serif',
                  fontSize: 11, color: P.ink,
                  background: P.white,
                }}>

                  {/* ── HEADER: issuer left / INVOICE right ── */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>

                    {/* Left — ABN/P/E inline (label + value tightly together, no extra gap) */}
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: P.accent, letterSpacing: '-0.02em', marginBottom: 6 }}>
                        {preview.issuerName || 'Your Business Name'}
                      </div>
                      {preview.abn && (
                        <div style={{ fontSize: 8.5, marginBottom: 3 }}>
                          <span style={{ color: P.muted }}>ABN: </span>
                          <span style={{ color: P.ink }}>{preview.abn}</span>
                        </div>
                      )}
                      {preview.phone && (
                        <div style={{ fontSize: 8.5, marginBottom: 3 }}>
                          <span style={{ color: P.muted }}>P: </span>
                          <span style={{ color: P.ink }}>{preview.phone}</span>
                        </div>
                      )}
                      {preview.issuerEmail && (
                        <div style={{ fontSize: 8.5, marginBottom: 3 }}>
                          <span style={{ color: P.muted }}>E: </span>
                          <span style={{ color: P.ink }}>{preview.issuerEmail}</span>
                        </div>
                      )}
                    </div>

                    {/* Right — INVOICE title, then Submitted/Invoice# with deliberate spacing */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: P.accent, letterSpacing: '-0.02em', marginBottom: 6 }}>
                        INVOICE
                      </div>
                      <div style={{ fontSize: 8.5, marginBottom: 3, display: 'flex', justifyContent: 'flex-end', gap: 16, alignItems: 'baseline' }}>
                        <span style={{ color: P.muted }}>Submitted:</span>
                        <span style={{ color: P.ink, minWidth: 72, textAlign: 'right' }}>{formatDateShort(preview.issueDate)}</span>
                      </div>
                      <div style={{ fontSize: 8.5, marginBottom: 3, display: 'flex', justifyContent: 'flex-end', gap: 16, alignItems: 'baseline' }}>
                        <span style={{ color: P.muted }}>Invoice #:</span>
                        <span style={{ color: P.ink, minWidth: 72, textAlign: 'right' }}>{preview.invoiceNumber}</span>
                      </div>
                    </div>
                  </div>

                  {/* Divider — blue accent */}
                  <div style={{ borderTop: `1px solid ${P.cardBorder}`, marginBottom: 13 }} />

                  {/* ── BILL TO + INVOICE DETAILS ── */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>

                    {/* BILL TO — Organisation / Participant / Email / Address */}
                     <div style={{ borderRadius: 8, padding: '8px 11px 9px', border: `1px solid ${P.cardBorder}` }}>
                       <div style={{ fontSize: 6.5, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: P.muted, marginBottom: 4 }}>BILL TO</div>
                       {[
                         preview.clientOrganisation ? { label: 'Organisation', value: preview.clientOrganisation } : null,
                         preview.clientName         ? { label: 'Participant',  value: preview.clientName }         : null,
                         preview.clientEmail        ? { label: 'Email',        value: preview.clientEmail }        : null,
                         preview.clientAddress      ? { label: 'Address',      value: preview.clientAddress }      : null,
                       ].filter(Boolean).map(row => {
                         if (!row) return null;
                         // Address: street on line 1, suburb/state/postcode on line 2
                         let displayValue: React.ReactNode = row.value;
                         if (row.label === 'Address') {
                           const parts = row.value.split(',').map((p: string) => p.trim()).filter(Boolean);
                           if (parts.length >= 3) {
                             // last 2 comma-parts = suburb, STATE POSTCODE
                             const line1 = parts.slice(0, parts.length - 2).join(', ');
                             const line2 = parts.slice(parts.length - 2).join(', ');
                             displayValue = <>{line1}<br />{line2}</>;
                           } else if (parts.length === 2) {
                             displayValue = <>{parts[0]}<br />{parts[1]}</>;
                           }
                         }
                         return (
                           <div key={row.label} style={{
                             display: 'flex', justifyContent: 'space-between',
                             alignItems: 'flex-start', gap: 6, marginBottom: 3.5,
                           }}>
                             <span style={{ fontSize: 7.5, color: P.muted, flexShrink: 0, lineHeight: '1.35' }}>{row.label}</span>
                             <span style={{
                               fontSize: 7.5, fontWeight: 400, color: P.ink,
                               textAlign: 'right', lineHeight: '1.45',
                               maxWidth: '55%', overflowWrap: 'break-word', wordBreak: 'break-word',
                             }}>{displayValue}</span>
                           </div>
                         );
                       })}
                      </div>

                     {/* INVOICE DETAILS — values not bold (except BALANCE DUE) */}
                      <div style={{ borderRadius: 8, padding: '8px 11px 9px', border: `1px solid ${P.cardBorder}` }}>
                       <div style={{ fontSize: 6.5, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: P.muted, marginBottom: 4 }}>INVOICE DETAILS</div>
                        {[
                          ['Service From', formatDateShort(preview.periodStart)],
                          ['Service To',   formatDateShort(preview.periodEnd)],
                          ['Due Date',     (preview.invoiceDueDays ?? 7) === 0 ? 'Due on Receipt' : formatDateShort(preview.dueDate)],
                          ['GST Rate',     '0% (GST-Free)'],
                        ].map(([l, v]) => (
                         <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 3.5 }}>
                           <span style={{ fontSize: 7.5, color: P.muted, flexShrink: 0, lineHeight: '1.35' }}>{l}</span>
                           <span style={{ fontSize: 7.5, fontWeight: 400, color: P.mid, textAlign: 'right', lineHeight: '1.35' }}>{v}</span>
                         </div>
                       ))}
                       <div style={{ borderTop: `1px solid ${P.cardBorder}`, marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                         <span style={{ fontSize: 7.5, fontWeight: 700, color: P.mid, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>BALANCE DUE</span>
                         <span style={{ fontSize: 12, fontWeight: 800, color: P.ink }}>{fmt$(preview.total)}</span>
                       </div>
                     </div>
                  </div>

                  {/* ── SERVICES RENDERED ── */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 7.5, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: P.muted, marginBottom: 5 }}>SERVICES RENDERED</div>
                    <div style={{ border: `1px solid ${P.cardBorder}`, borderRadius: 8, overflow: 'hidden' }}>
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
                          <tr style={{ background: '#EFF6FF' }}>
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
                                fontSize: 7.5, fontWeight: 700,
                                textTransform: 'uppercase', letterSpacing: '0.04em',
                                color: P.mid, textAlign: a,
                                borderBottom: `1px solid ${P.cardBorder}`,
                              }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {lineGroups.map((group, idx) => {
                            const isLast = idx === lineGroups.length - 1;
                            const rowBorder = isLast ? 'none' : `1px solid ${P.cardBorder}`;
                            return (
                              <tr key={group.category} style={{ background: P.white }}>
                                <td style={{ fontSize: 7.5, color: P.faint, padding: '5px 4px', textAlign: 'center', borderBottom: rowBorder }}>{idx + 1}</td>
                                <td style={{ padding: '5px 4px', borderBottom: rowBorder }}>
                                  <div style={{ fontSize: 8, fontWeight: 400, color: P.ink }}>{group.label}</div>
                                  <div style={{ fontSize: 6.5, color: P.faint, marginTop: 1 }}>{group.shifts.length} shift{group.shifts.length !== 1 ? 's' : ''}</div>
                                </td>
                                <td style={{ fontSize: 6.5, color: P.muted, fontFamily: 'monospace', padding: '5px 4px', borderBottom: rowBorder, wordBreak: 'break-all' }}>{group.ndisCode}</td>
                                <td style={{ fontSize: 8, color: P.mid, padding: '5px 4px', textAlign: 'right', borderBottom: rowBorder, fontVariantNumeric: 'tabular-nums' }}>{group.quantity}</td>
                                <td style={{ fontSize: 7, color: P.faint, padding: '5px 4px', textAlign: 'right', borderBottom: rowBorder }}>{group.isSleepover ? 'night' : 'hr'}</td>
                                <td style={{ fontSize: 8, color: P.mid, padding: '5px 4px', textAlign: 'right', borderBottom: rowBorder, fontVariantNumeric: 'tabular-nums' }}>{fmt$(group.rate)}</td>
                                <td style={{ fontSize: 8, fontWeight: 600, color: P.mid, padding: '5px 4px', textAlign: 'right', borderBottom: rowBorder, fontVariantNumeric: 'tabular-nums' }}>{fmt$(group.subtotal)}</td>
                                <td style={{ fontSize: 7.5, color: P.faint, padding: '5px 4px', textAlign: 'right', borderBottom: rowBorder }}>$0.00</td>
                                <td style={{ fontSize: 8, fontWeight: 700, color: P.ink, padding: '5px 4px', textAlign: 'right', borderBottom: rowBorder, fontVariantNumeric: 'tabular-nums' }}>{fmt$(group.subtotal)}</td>
                              </tr>
                            );
                          })}
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

                  {/* ── TOTALS ── */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                    <div style={{ minWidth: 210, maxWidth: 250, border: `1px solid ${P.cardBorder}`, borderRadius: 8, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', borderBottom: `1px solid ${P.cardBorder}` }}>
                        <span style={{ fontSize: 7.5, color: P.muted }}>SUBTOTAL</span>
                        <span style={{ fontSize: 7.5, fontWeight: 600, color: P.mid, fontVariantNumeric: 'tabular-nums' }}>{fmt$(preview.total)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', borderBottom: `1px solid ${P.cardBorder}` }}>
                        <span style={{ fontSize: 7.5, color: P.muted }}>GST</span>
                        <span style={{ fontSize: 7.5, fontWeight: 600, color: P.mid }}>$0.00</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px' }}>
                        <span style={{ fontSize: 8, fontWeight: 800, color: P.accent, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>TOTALS (AUD)</span>
                        <span style={{ fontSize: 13, fontWeight: 900, color: P.accent, fontVariantNumeric: 'tabular-nums' }}>{fmt$(preview.total)}</span>
                      </div>
                    </div>
                  </div>

                  {/* ── PAYMENT DETAILS ── */}
                  {(preview.accountName || preview.bankName || preview.bsb || preview.accountNumber) && (
                    <div style={{
                      borderRadius: 8,
                      border: `1px solid ${P.cardBorder}`,
                      padding: '8px 10px',
                      marginBottom: 9,
                    }}>
                      <div style={{ fontSize: 6.5, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: P.muted, marginBottom: 7 }}>PAYMENT DETAILS</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 7 }}>
                        {[
                          preview.accountName   ? { k: 'Account Name', v: preview.accountName }   : null,
                          preview.bankName      ? { k: 'Bank',          v: preview.bankName }      : null,
                          preview.bsb           ? { k: 'BSB',           v: preview.bsb }           : null,
                          preview.accountNumber ? { k: 'Account No.',   v: preview.accountNumber } : null,
                          { k: 'Reference', v: preview.clientName || preview.invoiceNumber },
                        ].filter(Boolean).map(item => item && (
                          <div key={item.k}>
                            <div style={{ fontSize: 7, color: P.muted, marginBottom: 1.5 }}>{item.k}</div>
                            <div style={{ fontSize: 8.5, fontWeight: 700, color: P.ink }}>{item.v}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ borderTop: `1px solid ${P.cardBorder}`, paddingTop: 5, fontSize: 7.5, color: P.muted }}>
                        Payment due within 7 days of invoice date.
                      </div>
                    </div>
                  )}

                  {/* ── NOTES ── */}
                  {preview.invoiceNotes && (
                    <div style={{ border: `1px solid ${P.cardBorder}`, borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
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
