import type { Shift } from '@/hooks/useShifts';
import { effectiveGrossPay } from '@/hooks/useShifts';
import type { UserSettings } from '@/hooks/useUserSettings';
import { formatCurrency } from '@/lib/formatUtils';
import { shiftHasEveningHours } from '@/lib/shiftCalculator';

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
function parseDate(s: string) {
  const [y,m,d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function fmtTime(t: string) { return t.slice(0,5); }

function typeLabel(s: Shift): string {
  if (s.is_public_holiday && s.is_sleepover) return 'PH Sleepover';
  if (s.is_public_holiday) return 'Public Holiday';
  if (s.is_sleepover) return 'Sleepover';
  if (shiftHasEveningHours(s.start_time, s.end_time)) return 'Evening';
  return 'Day';
}

export interface PrintWeeklyReceiptOptions {
  weekStart: Date;
  weekEnd: Date;
  shifts: Shift[];
  settings: UserSettings | null;
  displayName?: string | null;
  recipientName?: string | null;
  invoiceNumber?: string | null;
  notes?: string | null;
}

export function buildWeeklyReceiptHTML(opts: PrintWeeklyReceiptOptions): string {
  const { weekStart, weekEnd, shifts, settings, displayName, recipientName, invoiceNumber, notes } = opts;

  const sorted = [...shifts].sort((a,b) =>
    a.date === b.date ? a.start_time.localeCompare(b.start_time) : a.date.localeCompare(b.date)
  );

  const totalHours = sorted.filter(s => !s.is_sleepover).reduce((sum, s) => sum + Number(s.hours_worked), 0);
  const sleepovers = sorted.filter(s => s.is_sleepover).length;
  const totalGross = sorted.reduce((sum, s) => sum + effectiveGrossPay(s), 0);

  const business = settings?.business_name || displayName || 'Support Worker';
  const now = new Date();

  const lineRows = sorted.map(s => {
    const d = parseDate(s.date);
    const label = `${DOW[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
    const meta  = `${fmtTime(s.start_time)}–${fmtTime(s.end_time)} · ${typeLabel(s)}${s.is_sleepover ? '' : ` · ${Number(s.hours_worked).toFixed(2)}h`}`;
    return `
      <div class="row">
        <div class="row-main">
          <div class="row-label">${escape(label)}</div>
          <div class="row-meta">${escape(meta)}</div>
        </div>
        <div class="row-amt">${escape(formatCurrency(effectiveGrossPay(s)))}</div>
      </div>
    `;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Weekly Hours · ${escape(fmtRange(weekStart, weekEnd))}</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  :root { --ink:#111; --muted:#666; --paper:#fafafa; --accent:#111; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; background: #d9d9d9;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased; color: var(--ink);
  }
  .stage { min-height: 100vh; display:flex; align-items:flex-start; justify-content:center; padding: 28px 16px 96px; }
  .receipt {
    width: 380px; background: var(--paper); color: var(--ink);
    padding: 32px 28px 36px; box-shadow: 0 14px 40px rgba(0,0,0,0.22);
    position: relative; font-feature-settings: "tnum" 1;
    --tear: radial-gradient(circle at 6px 0, transparent 5px, var(--paper) 5.5px) 0 0 / 12px 12px repeat-x;
  }
  .receipt::before, .receipt::after { content:""; position:absolute; left:0; right:0; height:12px; background: var(--tear); }
  .receipt::before { top:-11px; transform: rotate(180deg); }
  .receipt::after  { bottom:-11px; }

  .brand { text-align:center; margin-bottom: 10px; }
  .brand .name { font-size: 15px; font-weight: 700; letter-spacing: .04em; margin: 0; }
  .brand .meta { font-size: 10.5px; color: var(--muted); line-height:1.5; margin: 3px 0 0; }

  h1.title {
    text-align: center; font-size: 11px; font-weight: 700;
    letter-spacing: 0.32em; margin: 14px 0 12px; color: var(--ink);
  }
  .title-rule { display:flex; align-items:center; gap:8px; margin: 0 0 14px; }
  .title-rule::before, .title-rule::after { content:""; flex:1; border-top: 1px solid var(--ink); }

  .meta-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 4px 14px;
    font-size: 11px; margin: 0 0 12px;
  }
  .meta-grid .lbl { color: var(--muted); text-transform: uppercase; letter-spacing: .08em; font-size: 9.5px; }
  .meta-grid .val { font-weight: 600; font-variant-numeric: tabular-nums; }
  .meta-grid .span2 { grid-column: 1 / -1; }

  .billed {
    border: 1px dashed var(--ink); padding: 8px 10px; margin: 8px 0 12px;
    font-size: 11px;
  }
  .billed .lbl { color: var(--muted); text-transform: uppercase; letter-spacing: .08em; font-size: 9.5px; margin-bottom: 2px; }
  .billed .val { font-weight: 700; font-size: 13px; }

  .dashed { border:none; border-top: 1.2px dashed var(--ink); margin: 10px 0; }

  .items-head {
    display:flex; justify-content:space-between; font-size: 9.5px; color: var(--muted);
    text-transform: uppercase; letter-spacing: .1em; padding: 2px 0 4px;
  }
  .row {
    display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
    padding: 8px 0; border-bottom: 1px dotted rgba(0,0,0,0.2);
  }
  .row:last-child { border-bottom: none; }
  .row-main { min-width:0; flex:1; }
  .row-label { font-size: 13px; font-weight: 600; line-height:1.2; }
  .row-meta  { font-size: 10.5px; color: var(--muted); margin-top:2px; line-height:1.35; }
  .row-amt   { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }

  .totals { margin-top: 6px; }
  .kv { display:flex; justify-content:space-between; font-size:12px; padding: 2px 0; }
  .kv .v { font-variant-numeric: tabular-nums; }
  .total-row {
    display:flex; justify-content:space-between; align-items:baseline;
    font-size: 20px; font-weight: 800; padding: 10px 0 4px;
    border-top: 1.5px solid var(--ink); margin-top: 8px;
  }

  .notes { font-size: 11px; color: var(--ink); margin: 12px 0 0; line-height: 1.45; white-space: pre-wrap; }
  .notes .lbl { color: var(--muted); text-transform: uppercase; letter-spacing: .08em; font-size: 9.5px; display:block; margin-bottom: 3px; }

  .sig { margin-top: 22px; display:grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .sig .line { border-top: 1px solid var(--ink); padding-top: 4px; font-size: 9.5px; color: var(--muted); text-transform: uppercase; letter-spacing:.08em; }

  .thanks { text-align:center; margin-top: 18px; font-size: 16px; font-weight: 800; letter-spacing: .28em; }
  .stamp  { text-align:center; margin-top: 4px; font-size: 9.5px; color: var(--muted); letter-spacing: .06em; }

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
    @page { margin: 10mm; size: auto; }
    html, body { background:#fff; }
    .stage { padding: 0; min-height: 0; }
    .receipt { box-shadow:none; width: 100%; max-width: 380px; }
    .receipt::before, .receipt::after { display:none; }
    .toolbar { display:none !important; }
  }
</style>
</head>
<body>
  <div class="stage">
    <article class="receipt" role="document" aria-label="Weekly Hours Receipt">

      <div class="brand">
        <p class="name">${escape(business)}</p>
        <p class="meta">
          ${[settings?.email, settings?.phone, settings?.address, settings?.abn ? `ABN ${settings.abn}` : null]
            .filter(Boolean).map(v => escape(String(v))).join(' · ') || '&nbsp;'}
        </p>
      </div>

      <div class="title-rule"><h1 class="title">WEEKLY HOURS</h1></div>

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

      <div class="items-head"><span>Date · Shift</span><span>Amount</span></div>
      <div class="items">
        ${lineRows || `<div class="row"><div class="row-main"><div class="row-meta">No shifts in this week.</div></div></div>`}
      </div>

      <div class="totals">
        <div class="kv"><span>Hours worked</span><span class="v">${totalHours.toFixed(2)} h</span></div>
        <div class="kv"><span>Shifts</span><span class="v">${sorted.length}</span></div>
        ${sleepovers > 0 ? `<div class="kv"><span>Sleepovers</span><span class="v">${sleepovers}</span></div>` : ''}
        <div class="total-row"><span>Total</span><span>${escape(formatCurrency(totalGross))}</span></div>
      </div>

      ${notes ? `<div class="notes"><span class="lbl">Notes</span>${escape(notes)}</div>` : ''}

      <div class="sig">
        <div class="line">Worker signature</div>
        <div class="line">Client signature</div>
      </div>

      <p class="thanks">THANK YOU</p>
      <p class="stamp">Generated by Support Care · ${escape(now.toLocaleDateString('en-AU'))}</p>
    </article>
  </div>

  <div class="toolbar">
    <button class="btn secondary" onclick="window.close()">Close</button>
    <button class="btn" onclick="window.print()">Print / Save PDF</button>
  </div>
</body>
</html>`;
}

/**
 * Reliable printing: uses a hidden iframe (works on mobile Safari where popups are blocked).
 * Falls back to window.open if iframe printing fails.
 */
export function printWeeklyReceipt(opts: PrintWeeklyReceiptOptions) {
  const html = buildWeeklyReceiptHTML(opts);

  // Try iframe-based printing first (most reliable on mobile + desktop)
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
      // cleanup after a delay
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

  // Fallback: popup window
  const w = window.open('', '_blank', 'noopener,noreferrer,width=480,height=820');
  if (!w) {
    // Last resort: data url in current tab
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
