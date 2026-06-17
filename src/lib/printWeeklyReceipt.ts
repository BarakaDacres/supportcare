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
  invoiceNumber?: string | null;
  notes?: string | null;
  /** When true, omit the on-screen toolbar and stage background (for in-app iframe preview). */
  preview?: boolean;
}

export function buildWeeklyReceiptHTML(opts: PrintWeeklyReceiptOptions): string {
  const {
    weekStart, weekEnd, breakdownRows,
    totalHours, totalShifts, totalSleepovers, totalGross,
    recipientName, invoiceNumber, notes, preview,
  } = opts;

  const now = new Date();

  const rowsHtml = breakdownRows.length
    ? breakdownRows.map(r => `
      <div class="row">
        <div class="row-main">
          <div class="row-label">${escape(r.label)}</div>
          <div class="row-meta">${escape(r.meta)}</div>
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
  :root { --ink:#111; --muted:#666; --paper:#ffffff; --accent:#1d6fff; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    background: ${preview ? '#ffffff' : '#d9d9d9'};
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased; color: var(--ink);
  }
    background: ${preview ? '#ffffff' : '#d9d9d9'};
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased; color: var(--ink);
  }
  .stage {
    min-height: ${preview ? 'auto' : '100vh'};
    display:flex; align-items:flex-start; justify-content:center;
    padding: ${preview ? '0' : '20px 12px 96px'};
  }
  .receipt {
    width: 80mm;            /* true thermal receipt width */
    background: var(--paper); color: var(--ink);
    padding: 8mm 6mm 10mm;
    ${preview ? '' : 'box-shadow: 0 14px 40px rgba(0,0,0,0.22);'}
    font-feature-settings: "tnum" 1;
    font-size: 11px; line-height: 1.35;
  }

  h1.title {
    text-align: center; font-size: 26px; font-weight: 900;
    letter-spacing: 0.14em; margin: 0 0 14px;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif;
  }

  .meta-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 3px 10px;
    font-size: 10.5px; margin: 0 0 10px;
  }
  .meta-grid .lbl { color: var(--muted); text-transform: uppercase; letter-spacing: .08em; font-size: 9px; }
  .meta-grid .val { font-weight: 600; font-variant-numeric: tabular-nums; }
  .meta-grid .span2 { grid-column: 1 / -1; }

  .billed {
    border: 1px dashed var(--ink); padding: 6px 8px; margin: 6px 0 10px;
    font-size: 10.5px;
  }
  .billed .lbl { color: var(--muted); text-transform: uppercase; letter-spacing: .08em; font-size: 9px; margin-bottom: 2px; }
  .billed .val { font-weight: 700; font-size: 12px; }

  .dashed { border:none; border-top: 1.2px dashed var(--ink); margin: 8px 0; }

  .items-head {
    display:flex; justify-content:space-between; font-size: 9px; color: var(--muted);
    text-transform: uppercase; letter-spacing: .1em; padding: 2px 0 4px;
  }
  .row {
    display:flex; align-items:flex-start; justify-content:space-between; gap:10px;
    padding: 6px 0; border-bottom: 1px dotted rgba(0,0,0,0.18);
  }
  .row:last-child { border-bottom: none; }
  .row-main { min-width:0; flex:1; }
  .row-label { font-size: 12px; font-weight: 600; line-height:1.2; }
  .row-meta  { font-size: 10px; color: var(--muted); margin-top:2px; }
  .row-amt   { font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }

  .totals { margin-top: 6px; }
  .kv { display:flex; justify-content:space-between; font-size:11px; padding: 2px 0; }
  .kv .v { font-variant-numeric: tabular-nums; }
  .total-row {
    display:flex; justify-content:space-between; align-items:baseline;
    font-size: 17px; font-weight: 800; padding: 8px 0 4px;
    border-top: 1.5px solid var(--ink); margin-top: 8px;
  }

  .notes { font-size: 10.5px; color: var(--ink); margin: 10px 0 0; line-height: 1.45; white-space: pre-wrap; }
  .notes .lbl { color: var(--muted); text-transform: uppercase; letter-spacing: .08em; font-size: 9px; display:block; margin-bottom: 3px; }

  .thanks { text-align:center; margin-top: 14px; font-size: 14px; font-weight: 800; letter-spacing: .28em; }
  .stamp  { text-align:center; margin-top: 4px; font-size: 9px; color: var(--accent); letter-spacing: .06em; font-weight:600; }

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
    .receipt { box-shadow:none; width: 80mm; padding: 5mm 5mm 8mm; }
    .toolbar { display:none !important; }
  }
</style>
</head>
<body>
  <div class="stage">
    <article class="receipt" role="document" aria-label="Weekly Hours Receipt">

      <h1 class="title">INVOICE</h1>

      <div class="meta-grid">
        <div><div class="lbl">Invoice #</div><div class="val">${escape(invoiceNumber || '—')}</div></div>
        <div><div class="lbl">Issued</div><div class="val">${escape(fmtDateLong(now))}</div></div>
        <div class="span2"><div class="lbl">Period</div><div class="val">${escape(fmtRange(weekStart, weekEnd))}</div></div>
      </div>

      ${recipientName ? `
      <div class="billed">
        <div class="lbl">Billed to</div>
        <div class="val">${escape(recipientName)}</div>
      </div>` : ''}

      <hr class="dashed" />

      <div class="items-head"><span>Hours</span><span>Amount</span></div>
      <div class="items">${rowsHtml}</div>

      <div class="totals">
        <div class="kv"><span>Hours worked</span><span class="v">${totalHours.toFixed(2)} h</span></div>
        <div class="kv"><span>Shifts</span><span class="v">${totalShifts}</span></div>
        ${totalSleepovers > 0 ? `<div class="kv"><span>Sleepovers</span><span class="v">${totalSleepovers}</span></div>` : ''}
        <div class="total-row"><span>Total</span><span>${escape(formatCurrency(totalGross))}</span></div>
      </div>

      ${notes ? `<div class="notes"><span class="lbl">Notes</span>${escape(notes)}</div>` : ''}

      <p class="thanks">THANK YOU</p>
      <p class="stamp">Generated by Support Care · ${escape(now.toLocaleDateString('en-AU'))}</p>
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

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
