import { describe, expect, it } from 'vitest';
import { getInvoicePeriodsForYear, getCurrentInvoicePeriodIdx, matchesInvoicePeriod } from './invoicePeriods';

describe('invoice period options', () => {
  it('offers seven-day weekly periods', () => {
    const periods = getInvoicePeriodsForYear(2026, 'weekly', 1);
    const period = periods[getCurrentInvoicePeriodIdx(periods, new Date(2026, 9, 21))];
    expect([period.start.getDate(), period.end.getDate()]).toEqual([19, 25]);
    expect(period.start.getDay()).toBe(1);
  });
  it('keeps existing fourteen-day Monday fortnight periods', () => {
    const first = getInvoicePeriodsForYear(2026, 'fortnightly', 6)[0];
    expect([first.start.getFullYear(), first.start.getMonth(), first.start.getDate()]).toEqual([2025, 11, 29]);
    expect([first.end.getFullYear(), first.end.getMonth(), first.end.getDate()]).toEqual([2026, 0, 11]);
  });
  it('uses the preferred Saturday–Friday weekly boundaries across years', () => {
    const first = getInvoicePeriodsForYear(2027, 'weekly', 6)[0];
    expect([first.start.getMonth(), first.start.getDate(), first.end.getMonth(), first.end.getDate()]).toEqual([11, 26, 0, 1]);
  });
  it('does not reuse a fortnight invoice for a week with the same start', () => {
    const week = getInvoicePeriodsForYear(2026, 'weekly')[0];
    expect(matchesInvoicePeriod({ period_start: '2025-12-29', period_end: '2026-01-11' }, week)).toBe(false);
    expect(matchesInvoicePeriod({ period_start: '2025-12-29', period_end: '2026-01-04' }, week)).toBe(true);
  });
});