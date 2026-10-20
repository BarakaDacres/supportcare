import { describe, expect, it } from 'vitest';
import { groupShiftsForInvoice } from './invoiceGrouping';
import { DEFAULT_RATES } from './shiftCalculator';
import type { Shift } from '@/hooks/useShifts';

const base: Shift = {
  id: '1', user_id: 'u', client_id: 'a', client_name: 'Alice',
  date: '2026-10-19', // Monday
  start_time: '09:00', end_time: '12:00',
  is_sleepover: false, is_public_holiday: false, is_overtime: false,
  notes: null, hours_worked: 3, gross_pay: 180, fee_override: null,
  created_at: '', updated_at: '',
};

describe('groupShiftsForInvoice pricing', () => {
  it('uses the current settings rate when the shift was saved at that rate', () => {
    const [line] = groupShiftsForInvoice([base], DEFAULT_RATES);
    expect(line.category).toBe('daily');
    expect(line.rate).toBe(60);
    expect(line.quantity).toBe(3);
    expect(line.subtotal).toBe(180);
  });

  it('reflects the rate originally assigned on the shift, not a later settings change', () => {
    // Shift was saved when the weekday rate was $50 (gross 3h × $50 = $150),
    // but settings now say $60.
    const saved = { ...base, gross_pay: 150 };
    const [line] = groupShiftsForInvoice([saved], DEFAULT_RATES);
    expect(line.rate).toBe(50);
    expect(line.subtotal).toBe(150);
    expect(line.subtotal).toBe(+(line.quantity * line.rate).toFixed(2));
  });

  it('reflects an hourly override fee stored on the shift', () => {
    const overridden = { ...base, gross_pay: 210, fee_override: 210 };
    const [line] = groupShiftsForInvoice([overridden], DEFAULT_RATES);
    expect(line.rate).toBe(70);
    expect(line.subtotal).toBe(210);
  });

  it('reflects a flat fee override on a sleepover', () => {
    const sleepover: Shift = {
      ...base, start_time: '22:00', end_time: '06:00',
      is_sleepover: true, hours_worked: 8, gross_pay: 280, fee_override: 280,
    };
    const [line] = groupShiftsForInvoice([sleepover], DEFAULT_RATES);
    expect(line.category).toBe('weekday_sleepover');
    expect(line.rate).toBe(280);
    expect(line.quantity).toBe(1);
    expect(line.subtotal).toBe(280);
  });

  it('splits mixed-rate shifts in the same category into separate exact lines', () => {
    const oldRate = { ...base, id: '1', gross_pay: 150 }; // $50/hr
    const newRate = { ...base, id: '2', gross_pay: 180 }; // $60/hr
    const lines = groupShiftsForInvoice([oldRate, newRate], DEFAULT_RATES);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line.subtotal).toBe(+(line.quantity * line.rate).toFixed(2));
    }
    expect(lines.reduce((s, l) => s + l.subtotal, 0)).toBe(330);
  });
});
