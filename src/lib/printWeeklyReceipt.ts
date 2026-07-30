import type { UserSettings } from '@/hooks/useUserSettings';
import { formatCurrency } from '@/lib/formatUtils';

const MONTH = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DOW   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function fmtDateLong(d: Date) {
  return `${DOW[d.getDay()]} ${String(d.getDate()).padStart(2,'0')} ${MONTH[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtRange(a: Date, b: Date) {
  const sameYear = a.getFullYear() === b.getFullYear();
  const left = `${a.getDate()} ${MONTH[a.getMonth()]}${sameYear ? '' : ' ' + a.getFullYear()}`;
  const right = `${b.getDate()} ${MONTH[b.getMonth()]} ${b.getFullYear()}`;
  return `${left} – ${right}`;
}

export interface ReceiptBreakdownRow {
  label: string;
  meta: string;   // e.g. "12.5h" or "2 nights"
  amount: number;
  /** Effective unit price (per hour / per night) — shown next to the quantity. */
  unitPrice?: number | null;
}

/** One fully itemised service line on the invoice. */
export interface ReceiptServiceRow {
  /** Short-form service date, e.g. "Mon 15/06". */
  date: string;
  /** Service type, e.g. "Personal Care", "Social Support". */
  service: string;
  /** Optional NDIS support item number. */
  ndisCode?: string | null;
  /** Quantity label, e.g. "6.00 hrs" or "1 night". */
  qty: string;
  /** Unit rate (per hour / per night). */
  rate: number;
  /** Line total. */
  amount: number;
}

/** "12.5h" + 67.56 → "12.5h × $67.56" */
export function formatRowMeta(meta: string, unitPrice?: number | null): string {
  if (unitPrice == null || !isFinite(unitPrice) || unitPrice <= 0) return meta;
  const price = formatCurrency(unitPrice);
  return meta ? `${meta} × ${price}` : price;
}

/** Short service date: "Mon 15/06" */
export function fmtDateShort(d: Date): string {
  return `${DOW[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}



/**
 * Format a free-form address into clean lines:
 *   line 1 = street, line 2 = suburb, state postcode.
 * Missing parts degrade gracefully (1 part → 1 line).
 * Mirrors the Invoices page address logic.
 */
export function formatAddressLines(value?: string | null): string[] {
  const raw = (value || '').replace(/\n+/g, ',').trim();
  if (!raw) return [];
  const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return [];
  if (parts.length === 1) return [parts[0]];
  if (parts.length === 2) return [parts[0], parts[1]];
  return [parts.slice(0, parts.length - 2).join(', '), parts.slice(parts.length - 2).join(', ')];
}

/** "61837428157" → "61 837 428 157" */
export function formatABN(v: string): string {
  const d = v.replace(/\D/g, '');
  if (d.length !== 11) return v.trim();
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
}
/** "670864" → "670 864" */
export function formatBSB(v: string): string {
  const d = v.replace(/\D/g, '');
  if (d.length !== 6) return v.trim();
  return `${d.slice(0, 3)} ${d.slice(3)}`;
}
/** "29626731" → "2962 6731" */
export function formatAcctNo(v: string): string {
  const d = v.replace(/\D/g, '');
  if (d.length < 6) return v.trim();
  return d.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

export interface PrintWeeklyReceiptOptions {
  weekStart: Date;
  weekEnd: Date;
  breakdownRows: ReceiptBreakdownRow[];
  totalHours: number;
  totalShifts: number;
  totalSleepovers: number;
  totalGross: number;
  settings?: UserSettings | null;
  recipientName?: string | null;
  recipientAddress?: string | null;
  invoiceNumber?: string | null;
  notes?: string | null;
  /** When true, omit the on-screen toolbar and stage background (for in-app iframe preview). */
  preview?: boolean;
}

export function buildWeeklyReceiptHTML(opts: PrintWeeklyReceiptOptions): string {
  const {
    weekStart, weekEnd, breakdownRows,
    totalGross,
    recipientName, recipientAddress, invoiceNumber, notes, preview, settings,
  } = opts;

  const now = new Date();
  const issuedShort = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

  const abn = settings?.abn?.trim() ? formatABN(settings.abn.trim()) : '';
  const bankRows: Array<[string, string]> = [];
  if (settings?.account_name?.trim())   bankRows.push(['Account', settings.account_name.trim().toUpperCase()]);
  if (settings?.bank_name?.trim())      bankRows.push(['Bank',    settings.bank_name.trim()]);
  if (settings?.bsb?.trim())            bankRows.push(['BSB',     formatBSB(settings.bsb.trim())]);
  if (settings?.account_number?.trim()) bankRows.push(['Acct No', formatAcctNo(settings.account_number.trim())]);

  const bankHtml = bankRows.length ? `
      <div class="pay">
        <span class="lbl">Payment Details</span>
        ${bankRows.map(([k, v]) => `<div class="kv"><span>${escape(k)}</span><span class="v">${escape(v)}</span></div>`).join('')}
      </div>` : '';

  const rowsHtml = breakdownRows.length
    ? breakdownRows.map(r => `
      <div class="row">
        <div class="row-main">
          <div class="row-label">${escape(r.label)}</div>
          <div class="row-meta">${escape(formatRowMeta(r.meta, r.unitPrice))}</div>
        </div>
        <div class="row-amt">${escape(formatCurrency(r.amount))}</div>
      </div>
    `).join('')
    : `<div class="row"><div class="row-main"><div class="row-meta">No hours this week.</div></div></div>`;


  // True thermal-receipt dimensions: 80mm wide (matches uploaded 225pt × 750pt sample).
  // Height is auto on screen; print uses a custom @page width with auto length.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Weekly Hours · ${escape(fmtRange(weekStart, weekEnd))}</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  :root { --ink:#0b0b0c; --muted:#7a7a82; --hair:#e6e6ea; --paper:#ffffff; --accent:#1d6fff; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    background: ${preview ? '#ffffff' : '#ececef'};
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    text-rendering: geometricPrecision;
    color: var(--ink);
  }
  .stage {
    min-height: ${preview ? 'auto' : '100vh'};
    display:flex; align-items:flex-start; justify-content:center;
    padding: ${preview ? '0' : '20px 12px 96px'};
  }
  .receipt {
    width: 80mm;
    background: var(--paper); color: var(--ink);
    padding: 9mm 4.5mm 10mm;
    ${preview ? '' : 'box-shadow: 0 14px 40px rgba(0,0,0,0.18);'}
    font-feature-settings: "tnum" 1, "ss01" 1;
    font-size: 11px; line-height: 1.4;
  }

  h1.title {
    text-align: center; font-size: 28px; font-weight: 800;
    letter-spacing: 0.18em; margin: 0 0 4px;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif;
  }
  .subtitle {
    text-align:center; font-size: 9px; color: var(--muted);
    letter-spacing: .22em; text-transform: uppercase; margin: 0 0 14px;
  }

  .meta-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px;
    font-size: 10.5px; margin: 0 0 12px;
  }
  .meta-grid .lbl { color: var(--muted); text-transform: uppercase; letter-spacing: .1em; font-size: 8.5px; margin-bottom: 2px; }
  .meta-grid .val { font-weight: 600; font-variant-numeric: tabular-nums; font-size: 11.5px; }
  .meta-grid .right { text-align: right; }
  .meta-grid .span2 { grid-column: 1 / -1; }

  .billed {
    padding: 2px 0 0; margin: 2px 0 12px;
    font-size: 10.5px;
  }
  .billed .lbl { color: var(--muted); text-transform: uppercase; letter-spacing: .1em; font-size: 8.5px; margin-bottom: 3px; }
  .billed .val { font-weight: 600; font-size: 11px; letter-spacing: -0.005em; color: #3a3a40; }
  .billed .addr { font-size: 9.5px; color: var(--muted); margin-top: 2px; line-height: 1.35; }
  .billed .addr div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .rule { border:none; border-top: 1px solid var(--hair); margin: 10px 0; }

  .items-head {
    display:flex; justify-content:space-between; font-size: 8.5px; color: var(--muted);
    text-transform: uppercase; letter-spacing: .12em; padding: 2px 0 6px;
  }
  .row {
    display:flex; align-items:flex-start; justify-content:space-between; gap:10px;
    padding: 7px 0; border-bottom: 1px solid var(--hair);
  }
  .row:last-child { border-bottom: none; }
  .row-main { min-width:0; flex:1; }
  .row-label { font-size: 12px; font-weight: 600; line-height:1.25; letter-spacing: -0.005em; }
  .row-meta  { font-size: 10px; color: var(--muted); margin-top:2px; }
  .row-amt   { font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }

  .totals { margin-top: 8px; }
  .kv { display:flex; justify-content:space-between; font-size:11px; color: var(--muted); padding: 3px 0; }
  .kv .v { font-variant-numeric: tabular-nums; color: var(--ink); font-weight: 600; }
  .total-row {
    display:flex; justify-content:space-between; align-items:baseline;
    font-size: 18px; font-weight: 600; padding: 10px 0 4px;
    border-top: 1.5px solid var(--hair); margin-top: 10px;
    letter-spacing: -0.01em; color: #3a3a40;
  }
  .total-row .v { font-variant-numeric: tabular-nums; }

  .notes { font-size: 10.5px; color: var(--ink); margin: 12px 0 0; line-height: 1.5; white-space: pre-wrap; }
  .notes .lbl { color: var(--muted); text-transform: uppercase; letter-spacing: .1em; font-size: 8.5px; display:block; margin-bottom: 4px; }

  .abn { text-align:center; font-size: 9.5px; color: var(--muted); letter-spacing: .06em; margin: -10px 0 14px; }
  .abn b { color: var(--ink); font-weight: 600; }

  .pay { margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--hair); }
  .pay .lbl { color: var(--muted); text-transform: uppercase; letter-spacing: .1em; font-size: 8.5px; display:block; margin-bottom: 5px; }
  .pay .kv { font-size: 10.5px; padding: 2px 0; }

  .thanks { text-align:center; margin-top: 18px; font-size: 13px; font-weight: 700; letter-spacing: .32em; }
  .stamp  { text-align:center; margin-top: 4px; font-size: 9px; color: var(--accent); letter-spacing: .08em; font-weight:600; }


  .toolbar {
    position: fixed; left:0; right:0; bottom:0;
    padding: 12px; display:flex; gap:10px; justify-content:center;
    background: linear-gradient(to top, rgba(0,0,0,0.4), transparent); z-index: 10;
  }
  .btn {
    appearance:none; border:none; cursor:pointer;
    background:#111; color:#fff;
    font: 600 14px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
    padding: 12px 20px; border-radius: 999px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.28);
    -webkit-tap-highlight-color: transparent;
  }
  .btn.secondary { background:#fff; color:#111; }

  @media print {
    @page { size: 80mm auto; margin: 0; }
    html, body { background:#fff; }
    .stage { padding: 0; min-height: 0; }
    .receipt { box-shadow:none; width: 80mm; padding: 6mm 4.5mm 8mm; }
    .toolbar { display:none !important; }
  }
</style>
</head>
<body>
  <div class="stage">
    <article class="receipt" role="document" aria-label="Weekly Hours Receipt">

      <h1 class="title">INVOICE</h1>
      <p class="subtitle">Weekly Statement</p>
      ${abn ? `<p class="abn">ABN <b>${escape(abn)}</b></p>` : ''}


      <div class="meta-grid">
        <div><div class="lbl">Invoice #</div><div class="val">${escape(invoiceNumber || '—')}</div></div>
        <div class="right"><div class="lbl">Due Date</div><div class="val">Upon receipt</div></div>
        <div class="span2"><div class="lbl">Period</div><div class="val">${escape(fmtRange(weekStart, weekEnd))}</div></div>
      </div>

      ${recipientName ? `
      <div class="billed">
        <div class="lbl">Billed to</div>
        <div class="val">${escape(recipientName.toUpperCase())}</div>
        ${formatAddressLines(recipientAddress).length ? `<div class="addr">${formatAddressLines(recipientAddress).map(l => `<div>${escape(l)}</div>`).join('')}</div>` : ''}
      </div>` : ''}

      <hr class="rule" />

      <div class="items-head"><span>Services Rendered</span><span>Amount</span></div>
      <div class="items">${rowsHtml}</div>

      <div class="totals">
        <div class="total-row"><span>Total</span><span class="v">${escape(formatCurrency(totalGross))}</span></div>
      </div>

      ${notes ? `<div class="notes"><span class="lbl">Notes</span>${escape(notes)}</div>` : ''}

      ${bankHtml}



      <p class="thanks">THANK YOU</p>
      <p class="stamp">Generated by Support Care · ${escape(issuedShort)}</p>
    </article>
  </div>

  ${preview ? '' : `
  <div class="toolbar">
    <button class="btn secondary" onclick="window.close()">Close</button>
    <button class="btn" onclick="window.print()">Print / Save PDF</button>
  </div>`}
</body>
</html>`;
}

/**
 * Reliable printing: uses a hidden iframe (works on mobile Safari where popups are blocked).
 * Falls back to window.open if iframe printing fails.
 */
export function printWeeklyReceipt(opts: PrintWeeklyReceiptOptions) {
  const html = buildWeeklyReceiptHTML({ ...opts, preview: false });

  try {
    const existing = document.getElementById('weekly-receipt-print-frame');
    if (existing) existing.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'weekly-receipt-print-frame';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) throw new Error('No iframe document');
    doc.open();
    doc.write(html);
    doc.close();

    const trigger = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.error('print failed', e);
      }
      setTimeout(() => iframe.remove(), 60000);
    };

    if (iframe.contentWindow?.document.readyState === 'complete') {
      setTimeout(trigger, 120);
    } else {
      iframe.onload = () => setTimeout(trigger, 120);
    }
    return;
  } catch (e) {
    console.warn('iframe print failed, falling back to window.open', e);
  }

  const w = window.open('', '_blank', 'noopener,noreferrer,width=480,height=820');
  if (!w) {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.location.href = url;
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// ─── Vector PDF export (matches Invoices page quality) ──────────────────────
// Uses jsPDF with embedded Inter fonts — true vector output, DPI-independent.
// Pixel-perfect on any printer/device; mirrors layout of the on-screen receipt.

async function loadFontBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

const RPAL = {
  ink:    '#0B0B0C',
  mid:    '#3A3A40',
  muted:  '#7A7A82',
  hair:   '#E6E6EA',
  accent: '#1D6FFF',
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Vector PDF generation — matches Invoices page DPI/scale exactly because there
 * is no rasterization step. Text is embedded as fonts, lines as PDF vectors.
 * Output: 80mm wide thermal-receipt format with auto-computed height.
 */
export async function downloadWeeklyReceiptPDF(opts: PrintWeeklyReceiptOptions) {
  const { jsPDF } = await import('jspdf');

  const [interReg, interSemi] = await Promise.all([
    loadFontBase64('/fonts/Inter-Regular.ttf'),
    loadFontBase64('/fonts/Inter-SemiBold.ttf'),
  ]);

  const W = 80;       // mm — thermal receipt width
  const M = 4.5;      // mm — side margin (tightened so content uses more width)
  const CW = W - M * 2;
  const now = new Date();

  // Render in two passes: first measures total height, second produces the
  // final PDF at the exact page size so the receipt is trimmed perfectly.
  const render = (doc: InstanceType<typeof jsPDF>, draw: boolean): number => {
    doc.addFileToVFS('Inter-Regular.ttf', interReg);
    doc.addFont('Inter-Regular.ttf', 'Inter', 'normal');
    doc.addFileToVFS('Inter-SemiBold.ttf', interSemi);
    doc.addFont('Inter-SemiBold.ttf', 'Inter', 'bold');

    const sf = (size: number, weight: 'normal' | 'bold' = 'normal', color = RPAL.ink) => {
      doc.setFontSize(size); doc.setFont('Inter', weight); doc.setTextColor(...hexToRgb(color));
    };
    const tx = (t: string, x: number, yp: number, o?: Parameters<typeof doc.text>[3]) => {
      if (draw) doc.text(t, x, yp, o);
    };
    const hline = (yp: number, color = RPAL.hair, lw = 0.2) => {
      if (!draw) return;
      doc.setDrawColor(...hexToRgb(color)); doc.setLineWidth(lw);
      doc.line(M, yp, W - M, yp);
    };

    const issuedShort = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

    // Top margin matches HTML preview's `padding-top: 9mm`
    let y = 9 + 3; // 9mm padding + ~3mm baseline offset for 22pt title

    // Title — no charSpace so center alignment is true
    sf(22, 'bold', RPAL.ink);
    tx('INVOICE', W / 2, y, { align: 'center' });
    y += 4.6;
    sf(6.5, 'normal', RPAL.muted);
    tx('WEEKLY STATEMENT', W / 2, y, { align: 'center' });
    const abn = opts.settings?.abn?.trim() ? formatABN(opts.settings.abn.trim()) : '';
    if (abn) {
      y += 4;
      sf(6.5, 'normal', RPAL.mid);
      tx(`ABN ${abn}`, W / 2, y, { align: 'center' });
    }
    y += 10;


    // Meta grid (2-col) — extra breathing space
    const colR = W - M;
    sf(5.8, 'normal', RPAL.muted);
    tx('INVOICE #', M, y);
    tx('DUE DATE',  colR, y, { align: 'right' });
    y += 3.6;
    sf(8, 'normal', RPAL.ink);
    tx(opts.invoiceNumber || '—', M, y);
    tx('Upon receipt', colR, y, { align: 'right' });
    y += 6.4;

    sf(5.8, 'normal', RPAL.muted);
    tx('PERIOD', M, y);
    y += 3.6;
    sf(8, 'normal', RPAL.ink);
    tx(fmtRange(opts.weekStart, opts.weekEnd), M, y);
    y += 7;

    // Billed to
    if (opts.recipientName) {
      sf(5.8, 'normal', RPAL.muted);
      tx('BILLED TO', M, y);
      y += 3.6;
      sf(8, 'normal', RPAL.mid);
      tx(opts.recipientName.toUpperCase(), M, y);
      y += 3.6;
      const addrLines = formatAddressLines(opts.recipientAddress);
      if (addrLines.length) {
        sf(6, 'normal', RPAL.muted);
        addrLines.forEach(ln => {
          (doc.splitTextToSize(ln, CW) as string[]).forEach(sub => { tx(sub, M, y); y += 2.9; });
        });
      }
      y += 2;
    }


    y += 2;
    hline(y); y += 5;

    // Items head — match Invoices page (6pt bold mid)
    sf(6, 'bold', RPAL.mid);
    tx('SERVICES RENDERED', M, y);
    tx('AMOUNT',            colR, y, { align: 'right' });
    y += 4;

    // Rows — match Invoices page text scale (7pt label, 5.5pt meta)
    const rows = opts.breakdownRows.length
      ? opts.breakdownRows
      : [{ label: 'No hours this week', meta: '', amount: 0 }];

    rows.forEach((r, i) => {
      if (i > 0) { hline(y - 0.5); }
      y += 3;
      sf(7, 'normal', RPAL.ink);
      tx(r.label, M, y);
      sf(7, 'normal', RPAL.mid);
      tx(formatCurrency(r.amount), colR, y, { align: 'right' });
      const metaText = formatRowMeta(r.meta, (r as ReceiptBreakdownRow).unitPrice);
      if (metaText) {
        y += 2.8;
        sf(5.5, 'normal', RPAL.muted);
        tx(metaText, M, y);
      }

      y += 3;
    });

    y += 3;


    // TOTAL row — hairline top rule
    y += 2;
    if (draw) {
      doc.setDrawColor(...hexToRgb(RPAL.hair));
      doc.setLineWidth(0.4);
      doc.line(M, y, W - M, y);
    }
    y += 5.8;
    sf(12, 'normal', RPAL.mid);
    tx('TOTAL', M, y);
    tx(formatCurrency(opts.totalGross), colR, y, { align: 'right' });
    y += 6;

    // Notes
    if (opts.notes && opts.notes.trim()) {
      y += 3;
      sf(5.8, 'normal', RPAL.muted);
      tx('NOTES', M, y);
      y += 3.4;
      sf(7, 'normal', RPAL.ink);
      const lines = doc.splitTextToSize(opts.notes.trim(), CW) as string[];
      lines.forEach(ln => { tx(ln, M, y); y += 3.4; });
    }

    // Payment details — bank info for the plan manager
    const st = opts.settings;
    const bankRows: Array<[string, string]> = [];
    if (st?.account_name?.trim())   bankRows.push(['Account', st.account_name.trim().toUpperCase()]);
    if (st?.bank_name?.trim())      bankRows.push(['Bank',    st.bank_name.trim()]);
    if (st?.bsb?.trim())            bankRows.push(['BSB',     formatBSB(st.bsb.trim())]);
    if (st?.account_number?.trim()) bankRows.push(['Acct No', formatAcctNo(st.account_number.trim())]);

    if (bankRows.length) {
      y += 5;
      hline(y);
      y += 4.4;
      sf(5.8, 'normal', RPAL.muted);
      tx('PAYMENT DETAILS', M, y);
      y += 4;
      bankRows.forEach(([k, v]) => {
        sf(7, 'normal', RPAL.muted);
        tx(k, M, y);
        sf(7, 'normal', RPAL.ink);
        tx(v, colR, y, { align: 'right' });
        y += 3.8;
      });
    }

    // Footer — THANK YOU + generated by (signature removed per user request).
    y += 10;

    const footY = y + 4;

    sf(10, 'bold', RPAL.ink);
    tx('THANK YOU', W / 2, footY, { align: 'center' });
    sf(5.2, 'normal', RPAL.muted);
    tx(`Generated by Support Care · ${issuedShort}`, W / 2, footY + 3.6, { align: 'center' });
    y = footY + 8;

    return y;
  };

  // Pass 1 — measure on a tall scratch doc
  const measureDoc = new jsPDF({ unit: 'mm', format: [W, 1000], orientation: 'portrait' });
  const finalH = Math.max(120, render(measureDoc, false));

  // Pass 2 — real doc at the exact size
  const doc = new jsPDF({ unit: 'mm', format: [W, finalH], orientation: 'portrait', compress: true });
  render(doc, true);

  const filename = `invoice-${(opts.invoiceNumber || 'WK').replace(/[^\w-]+/g, '')}.pdf`;
  doc.save(filename);
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
