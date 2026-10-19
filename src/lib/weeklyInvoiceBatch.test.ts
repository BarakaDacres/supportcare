import { describe, expect, it } from 'vitest';
import { groupWeeklyInvoiceBatches } from './weeklyInvoiceBatch';
import type { Shift } from '@/hooks/useShifts';

const shift = (id: string, date: string, client_id: string | null = 'a', client_name = 'Alice'): Shift => ({ id, date, client_id, client_name, user_id: 'u', start_time: '09:00', end_time: '10:00', is_sleepover: false, is_public_holiday: false, is_overtime: false, notes: null, hours_worked: 1, gross_pay: 50, fee_override: null, created_at: '', updated_at: '' });

describe('weekly invoice batches', () => {
  it('creates one invoice per client per week, including both selected dates', () => {
    const batches = groupWeeklyInvoiceBatches([shift('1', '2026-10-19'), shift('2', '2026-10-25'), shift('3', '2026-10-19', 'b', 'Bob'), shift('4', '2026-10-26'), shift('5', '2026-10-18')], '2026-10-19', '2026-10-26', 1);
    expect(batches.map(b => b.shifts.map(s => s.id))).toEqual([['1', '2'], ['3'], ['4']]);
    expect(batches[2].endISO).toBe('2026-10-26');
  });
  it('respects Saturday–Friday weeks across the year boundary', () => {
    const batches = groupWeeklyInvoiceBatches([shift('1', '2026-12-31'), shift('2', '2027-01-01'), shift('3', '2027-01-02')], '2026-12-26', '2027-01-08', 6);
    expect(batches.map(b => [b.startISO, b.endISO, b.shifts.length])).toEqual([['2026-12-26', '2027-01-01', 2], ['2027-01-02', '2027-01-08', 1]]);
  });
  it('keeps different clients with the same name separate', () => {
    expect(groupWeeklyInvoiceBatches([shift('1', '2026-10-19'), shift('2', '2026-10-19', 'b')], '2026-10-19', '2026-10-25', 1)).toHaveLength(2);
  });
  it('includes unassigned shifts without assigning them to another client', () => {
    const batches = groupWeeklyInvoiceBatches([shift('1', '2026-10-19', null, '')], '2026-10-19', '2026-10-25', 1);
    expect(batches[0].clientName).toBe('Unassigned');
    expect(batches[0].clientId).toBeNull();
  });
  it('returns no invoices for empty or reversed date ranges', () => {
    expect(groupWeeklyInvoiceBatches([shift('1', '2026-10-19')], '2026-10-25', '2026-10-19', 1)).toEqual([]);
    expect(groupWeeklyInvoiceBatches([], '2026-10-19', '2026-10-25', 1)).toEqual([]);
  });
});