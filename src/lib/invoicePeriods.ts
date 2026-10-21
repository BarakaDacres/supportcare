import { MONTH_NAMES } from './dateUtils';

export type InvoiceFrequency = 'weekly' | 'fortnightly';
export interface InvoicePeriod {
  label: string;
  start: Date;
  end: Date;
  fnNumber: number;
}

export function getInvoicePeriodsForYear(year: number, frequency: InvoiceFrequency, weekStartDay = 1): InvoicePeriod[] {
  const startDay = frequency === 'fortnightly' ? 1 : weekStartDay;
  const length = frequency === 'weekly' ? 7 : 14;
  const cursor = new Date(year, 0, 1);
  cursor.setDate(cursor.getDate() - (cursor.getDay() - startDay + 7) % 7);
  const periods: InvoicePeriod[] = [];
  const fmt = (d: Date) => `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
  while (cursor.getFullYear() <= year) {
    const start = new Date(cursor);
    const end = new Date(cursor);
    end.setDate(end.getDate() + length - 1);
    const fnNumber = periods.length + 1;
    periods.push({ start, end, fnNumber, label: `${frequency === 'weekly' ? 'WK' : 'FN'}${String(fnNumber).padStart(2, '0')} · ${fmt(start)} – ${fmt(end)}` });
    cursor.setDate(cursor.getDate() + length);
  }
  return periods;
}

export function getCurrentInvoicePeriodIdx(periods: InvoicePeriod[], today = new Date()): number {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const index = periods.findIndex(p => day >= p.start && day <= p.end);
  return index >= 0 ? index : Math.max(0, periods.length - 1);
}

export function matchesInvoicePeriod(invoice: { period_start: string; period_end: string }, period: InvoicePeriod): boolean {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return invoice.period_start === iso(period.start) && invoice.period_end === iso(period.end);
}