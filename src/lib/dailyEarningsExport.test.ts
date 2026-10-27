import { describe, expect, it } from 'vitest';
import { buildDailyEarnings, serializeDailyEarnings } from './dailyEarningsExport';
import type { Shift } from '@/hooks/useShifts';

const shift = (patch: Partial<Shift> = {}): Shift => ({ id: '1', user_id: 'u', client_id: 'tom', client_name: 'Tom', date: '2026-10-28', start_time: '09:00', end_time: '12:00', is_sleepover: false, is_public_holiday: false, is_overtime: false, notes: null, hours_worked: 3, gross_pay: 342.02, fee_override: null, created_at: '', updated_at: '', ...patch });

describe('daily earnings exports', () => {
  it('matches the requested schema and Support Work stream', () => {
    expect(buildDailyEarnings([shift()], '2026-10-28', '2026-10-28')).toEqual([{ date: '2026-10-28', stream: 'Support Work', source: 'Tom', start: '', end: '', amount: 342.02, note: '' }]);
  });
  it('sums saved daily client earnings including overrides and sleepovers', () => {
    const rows = buildDailyEarnings([shift(), shift({ id: '2', gross_pay: 900, fee_override: 100.10 }), shift({ id: '3', is_sleepover: true, gross_pay: 200 })], '2026-10-28', '2026-10-28');
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(642.12);
  });
  it('includes both date boundaries and separates clients and days', () => {
    const rows = buildDailyEarnings([shift(), shift({ date: '2026-10-29' }), shift({ client_id: 'bob', client_name: 'Bob' }), shift({ date: '2026-10-27' }), shift({ date: '2026-10-30' })], '2026-10-28', '2026-10-29');
    expect(rows.map(r => [r.date, r.source, r.amount])).toEqual([['2026-10-28', 'Bob', 342.02], ['2026-10-28', 'Tom', 342.02], ['2026-10-29', 'Tom', 342.02]]);
  });
  it('handles unassigned shifts and invalid ranges', () => {
    expect(buildDailyEarnings([shift({ client_id: null, client_name: null })], '2026-10-28', '2026-10-28')[0].source).toBe('Unassigned');
    expect(buildDailyEarnings([shift()], '2026-10-29', '2026-10-28')).toEqual([]);
  });
  it('exports numeric JSON amounts and CSV with safe escaped notes', () => {
    const rows = buildDailyEarnings([shift({ client_name: '=SUM(A1)', notes: 'Care, "home"\nDone' })], '2026-10-28', '2026-10-28');
    expect(JSON.parse(serializeDailyEarnings(rows, 'json'))[0].amount).toBe(342.02);
    const csv = serializeDailyEarnings(rows, 'csv');
    expect(csv).toContain('date,stream,source,start,end,amount,note');
    expect(csv).toContain('"\'=SUM(A1)"');
    expect(csv).toContain('342.02,"Care, ""home""\nDone"');
  });
});