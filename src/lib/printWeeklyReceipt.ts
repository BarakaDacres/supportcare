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
  return `${a.getDate()} ${MONTH[a.getMonth()]} – ${b.getDate()} ${MONTH[b.getMonth()]} ${b.getFullYear()}`;
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
  shifts: Shift[];      // shifts in the week
  settings: UserSettings | null;
  displayName?: string | null;
  recipientName?: string | null; // optional override
}

export function printWeeklyReceipt(opts: PrintWeeklyReceiptOptions) {
  const { weekStart, weekEnd, shifts, settings, displayName, recipientName } = opts;

  const sorted = [...shifts].sort((a,b) =>
    a.date === b.date ? a.start_time.localeCompare(b.start_time) : a.date.localeCompare(b.date)
  );

  const totalHours = sorted.filter(s => !s.is_sleepover).reduce((sum, s) => sum + Number(s.hours_worked), 0);
  const sleepovers = sorted.filter(s => s.is_sleepover).length;
  const totalGross = sorted.reduce((sum, s) => sum + effectiveGrossPay(s), 0);

  // Group clients
  const clientNames = Array.from(new Set(sorted.map(s => s.client_name).filter(Boolean) as string[]));
  const recipient = recipientName ?? (clientNames.length === 1 ? clientNames[0] : null);

  const business = settings?.business_name || displayName || 'Support Worker';
  const now = new Date();

  const lineRows = sorted.map(s => {
    const d = parseDate(s.date);
    const label = `${DOW[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
    const meta  = `${fmtTime(s.start_time)}–${fmtTime(s.end_time)} · ${typeLabel(s)}${s.is_sleepover ? '' : ` · ${Number(s.hours_worked).toFixed(2)}h`}${s.client_name && !recipient ? ` · ${s.client_name}` : ''}`;
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

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Weekly Hours · ${escape(fmtRange(weekStart, weekEnd))}</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  :root {
    --ink: #111;
    --muted: #555;
    --line: #111;
    --paper: #fafafa;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    background: #d9d9d9;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    color: var(--ink);
  }
  .stage {
    min-height: 100vh;
    display: flex; align-items: flex-start; justify-content: center;
    padding: 28px 16px 80px;
  }
  .receipt {
    width: 360px;
    background: var(--paper);
    color: var(--ink);
    padding: 28px 26px 32px;
    box-shadow: 0 14px 40px rgba(0,0,0,0.22);
    position: relative;
    font-feature-settings: "tnum" 1, "ss01" 1;
    /* Torn edge top + bottom */
    --tear: radial-gradient(circle at 6px 0, transparent 5px, var(--paper) 5.5px) 0 0 / 12px 12px repeat-x;
  }
  .receipt::before, .receipt::after {
    content: ""; position: absolute; left: 0; right: 0; height: 12px;
    background: var(--tear);
  }
  .receipt::before { top: -11px; transform: rotate(180deg); }
  .receipt::after  { bottom: -11px; }

  h1.title {
    text-align: center;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.18em;
    margin: 0 0 4px;
  }
  .biz {
    text-align: center;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.02em;
    margin: 0 0 2px;
  }
  .biz-meta {
    text-align: center;
    font-size: 11px;
    color: var(--muted);
    line-height: 1.45;
    margin: 0 0 12px;
  }
  .dashed {
    border: none;
    border-top: 1.2px dashed var(--ink);
    margin: 10px 0;
  }
  .kv {
    display: flex; justify-content: space-between; align-items: baseline;
    font-size: 12px;
    margin: 2px 0;
  }
  .kv .k { color: var(--ink); }
  .kv .v { color: var(--ink); font-variant-numeric: tabular-nums; }

  .recipient {
    font-size: 12px;
    margin: 4px 0 2px;
  }
  .recipient .lbl { color: var(--muted); }

  .items { margin: 6px 0 4px; }
  .row {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 12px;
    padding: 7px 0;
    border-bottom: 1px dotted rgba(0,0,0,0.18);
  }
  .row:last-child { border-bottom: none; }
  .row-main { min-width: 0; flex: 1; }
  .row-label { font-size: 13px; font-weight: 600; line-height: 1.2; }
  .row-meta  { font-size: 10.5px; color: var(--muted); margin-top: 2px; line-height: 1.35; }
  .row-amt   { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }

  .totals { margin-top: 4px; }
  .total-row {
    display: flex; justify-content: space-between; align-items: baseline;
    font-size: 18px; font-weight: 700;
    padding: 6px 0 8px;
  }
  .sub { font-size: 12px; color: var(--ink); }

  .thanks {
    text-align: center;
    margin-top: 18px;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.22em;
  }
  .stamp {
    text-align: center;
    margin-top: 6px;
    font-size: 10px;
    color: var(--muted);
    letter-spacing: 0.08em;
  }

  /* Floating action bar (screen only) */
  .toolbar {
    position: fixed; left: 0; right: 0; bottom: 0;
    padding: 12px;
    display: flex; gap: 10px; justify-content: center;
    background: linear-gradient(to top, rgba(0,0,0,0.35), transparent);
    z-index: 10;
  }
  .btn {
    appearance: none; border: none; cursor: pointer;
    background: #111; color: #fff;
    font: 600 14px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
    padding: 12px 18px; border-radius: 999px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.25);
    -webkit-tap-highlight-color: transparent;
  }
  .btn.secondary { background: #fff; color: #111; }

  @media print {
    @page { margin: 12mm; size: auto; }
    html, body { background: #fff; }
    .stage { padding: 0; min-height: 0; }
    .receipt { box-shadow: none; width: 100%; max-width: 360px; }
    .receipt::before, .receipt::after { display: none; }
    .toolbar { display: none !important; }
  }
</style>
</head>
<body>
  <div class="stage">
    <article class="receipt" role="document" aria-label="Weekly Hours Receipt">
      <h1 class="title">WEEKLY HOURS</h1>
      <p class="biz">${escape(business)}</p>
      <p class="biz-meta">
        ${[settings?.email, settings?.phone, settings?.abn ? `ABN ${settings.abn}` : null]
          .filter(Boolean).map(v => escape(String(v))).join(' · ') || '&nbsp;'}
      </p>

      <hr class="dashed" />

      <div class="kv"><span class="k">Period</span><span class="v">${escape(fmtRange(weekStart, weekEnd))}</span></div>
      <div class="kv"><span class="k">Issued</span><span class="v">${escape(fmtDateLong(now))}</span></div>
      ${recipient ? `<div class="recipient"><span class="lbl">Billed to:</span> <strong>${escape(recipient)}</strong></div>` : ''}

      <hr class="dashed" />

      <div class="items">
        ${lineRows || `<div class="row"><div class="row-main"><div class="row-meta">No shifts in this week.</div></div></div>`}
      </div>

      <hr class="dashed" />

      <div class="totals">
        <div class="kv sub"><span class="k">Hours worked</span><span class="v">${totalHours.toFixed(2)} h</span></div>
        <div class="kv sub"><span class="k">Shifts</span><span class="v">${sorted.length}</span></div>
        ${sleepovers > 0 ? `<div class="kv sub"><span class="k">Sleepovers</span><span class="v">${sleepovers}</span></div>` : ''}
        <div class="total-row"><span>Total</span><span>${escape(formatCurrency(totalGross))}</span></div>
      </div>

      <hr class="dashed" />

      <p class="thanks">THANK YOU</p>
      <p class="stamp">Generated by Support Care · ${escape(now.toLocaleString('en-AU'))}</p>
    </article>
  </div>

  <div class="toolbar">
    <button class="btn secondary" onclick="window.close()">Close</button>
    <button class="btn" onclick="window.print()">Print / Save PDF</button>
  </div>

  <script>
    // Auto-open print dialog shortly after load on desktop browsers
    window.addEventListener('load', function () {
      setTimeout(function () { try { window.focus(); } catch(e){} }, 100);
    });
  </script>
</body>
</html>`;

  const w = window.open('', '_blank', 'noopener,noreferrer,width=480,height=820');
  if (!w) {
    alert('Please allow pop-ups to print the weekly receipt.');
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
