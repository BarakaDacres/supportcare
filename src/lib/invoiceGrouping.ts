/**
 * Invoice grouping logic — classifies shift segments into NDIS support
 * categories and produces line items where QTY × RATE = SUBTOTAL exactly.
 *
 * Each shift is decomposed into time segments (handles midnight crossings
 * and evening windows) and each segment is bucketed independently so that a
 * weekday shift spanning 14:00–22:00 produces both a "Daily Support" line
 * AND an "Evening Support" line — totals add up cleanly on the invoice.
 *
 * Sleepovers are flat-rate per night and bucketed whole.
 * Fee-overrides bypass segment splitting and become a single override line.
 */

import type { Shift } from '@/hooks/useShifts';
import { effectiveGrossPay } from '@/hooks/useShifts';
import { getDayOfWeek } from '@/lib/shiftCalculator';
import type { PayRates } from '@/lib/shiftCalculator';

export interface NdisItemCodes {
  daily: string;
  evening: string;
  saturday: string;
  sunday: string;
  weekday_sleepover: string;
  saturday_sleepover: string;
  sunday_sleepover: string;
  public_holiday: string;
  public_holiday_sleepover: string;
  overtime: string;
  overtime_sleepover: string;
}

export const DEFAULT_NDIS_CODES: NdisItemCodes = {
  daily:                    '01_011_0107_1_1',
  evening:                  '01_015_0107_1_1',
  saturday:                 '01_013_0107_1_1',
  sunday:                   '01_014_0107_1_1',
  weekday_sleepover:        '01_019_0107_1_1',
  saturday_sleepover:       '01_019_0107_1_1',
  sunday_sleepover:         '01_019_0107_1_1',
  public_holiday:           '01_012_0107_1_1',
  public_holiday_sleepover: '01_019_0107_1_1',
  overtime:                 '01_011_0107_1_1',
  overtime_sleepover:       '01_019_0107_1_1',
};

export type InvoiceCategory =
  | 'daily'
  | 'evening'
  | 'saturday'
  | 'sunday'
  | 'weekday_sleepover'
  | 'saturday_sleepover'
  | 'sunday_sleepover'
  | 'public_holiday'
  | 'public_holiday_sleepover'
  | 'overtime'
  | 'overtime_sleepover';

export const CATEGORY_LABELS: Record<InvoiceCategory, string> = {
  daily:                    'Daily Support',
  evening:                  'Evening Support (Mon–Fri)',
  saturday:                 'Saturday Support',
  sunday:                   'Sunday Support',
  weekday_sleepover:        'Weekday Sleepover',
  saturday_sleepover:       'Saturday Sleepover',
  sunday_sleepover:         'Sunday Sleepover',
  public_holiday:           'Public Holiday Support',
  public_holiday_sleepover: 'Public Holiday Sleepover',
  overtime:                 'Overtime Support',
  overtime_sleepover:       'Overtime Sleepover',
};

export interface InvoiceLineGroup {
  category: InvoiceCategory;
  label: string;
  ndisCode: string;
  shifts: Shift[];
  totalHours: number;
  quantity: number;
  rate: number;
  subtotal: number;
  isSleepover: boolean;
}

// ─── Evening window (mirrors shiftCalculator) ──────────────────────────────
function getEveningStartMin(): number {
  const stored = typeof window !== 'undefined' ? localStorage.getItem('pref_evening_start') : null;
  if (stored) { const [h, m] = stored.split(':').map(Number); return h * 60 + (m || 0); }
  return 18 * 60;
}
function getEveningEndMin(): number {
  const stored = typeof window !== 'undefined' ? localStorage.getItem('pref_evening_end') : null;
  if (stored) { const [h, m] = stored.split(':').map(Number); return (h === 0 && (m || 0) === 0) ? 1440 : h * 60 + (m || 0); }
  return 24 * 60;
}

function timeToMinutes(time: string): number {
  const [h, mi] = time.split(':').map(Number);
  return h * 60 + mi;
}

interface ShiftSegment {
  category: InvoiceCategory;
  hours: number;
}

/** Decompose one non-sleepover shift into per-category time segments. */
function segmentShift(shift: Shift): ShiftSegment[] {
  const evStart = getEveningStartMin();
  const evEnd   = getEveningEndMin();

  const startMin = timeToMinutes(shift.start_time);
  let endMin   = timeToMinutes(shift.end_time);
  if (endMin <= startMin) endMin += 1440; // crosses midnight

  const out: ShiftSegment[] = [];
  const baseDow = getDayOfWeek(shift.date);

  let cursor = startMin;
  while (cursor < endMin) {
    const dayOffset = Math.floor(cursor / 1440);
    const dow = (baseDow + dayOffset) % 7;
    const dayStart = dayOffset * 1440;
    const dayEnd   = dayStart + 1440;
    const segEnd   = Math.min(endMin, dayEnd);

    const localStart = cursor - dayStart;
    const localEnd   = segEnd  - dayStart;

    const cuts = [localStart, evStart, evEnd, localEnd]
      .filter(v => v >= localStart && v <= localEnd);
    const points = Array.from(new Set(cuts)).sort((a, b) => a - b);

    for (let i = 0; i < points.length - 1; i++) {
      const s = points[i];
      const e = points[i + 1];
      if (e <= s) continue;
      const hours = (e - s) / 60;
      const isEvening = s >= evStart && e <= evEnd;
      const isWeekday = dow >= 1 && dow <= 5;

      let category: InvoiceCategory;
      if (shift.is_overtime) {
        category = 'overtime';
      } else if (shift.is_public_holiday) {
        category = 'public_holiday';
      } else if (isEvening && isWeekday) {
        category = 'evening';
      } else if (dow === 6) {
        category = 'saturday';
      } else if (dow === 0) {
        category = 'sunday';
      } else {
        category = 'daily';
      }
      out.push({ category, hours });
    }

    cursor = segEnd;
  }

  return out;
}

function getSleepoverCategory(shift: Shift): InvoiceCategory {
  if (shift.is_overtime) return 'overtime_sleepover';
  if (shift.is_public_holiday) return 'public_holiday_sleepover';
  const dow = getDayOfWeek(shift.date);
  if (dow === 6) return 'saturday_sleepover';
  if (dow === 0) return 'sunday_sleepover';
  return 'weekday_sleepover';
}

function getCategoryRate(category: InvoiceCategory, rates: PayRates): number {
  switch (category) {
    case 'overtime_sleepover':       return rates.rate_overtime ?? 90;
    case 'overtime':                 return rates.rate_overtime ?? 90;
    case 'public_holiday_sleepover': return rates.rate_sleepover_public_holiday ?? 400;
    case 'public_holiday':           return rates.rate_public_holiday ?? 150;
    case 'saturday':                 return rates.rate_saturday;
    case 'sunday':                   return rates.rate_sunday;
    case 'evening':                  return rates.rate_evening ?? 75;
    case 'weekday_sleepover':        return rates.rate_sleepover_weekday;
    case 'saturday_sleepover':       return rates.rate_sleepover_weekend;
    case 'sunday_sleepover':         return rates.rate_sleepover_weekend;
    case 'daily':
    default:                         return rates.rate_weekday;
  }
}

interface Bucket {
  shifts: Set<Shift>;
  hours: number;
  count: number;
  rate: number; // effective rate for every shift in this bucket
}

/**
 * Effective per-segment rates for a shift, derived from the pay stored on the
 * shift at save time (gross_pay / fee_override) rather than today's settings
 * rates. A uniform scale factor vs the current-rate standard preserves the
 * category split while honouring the originally assigned rates.
 */
function shiftRateScale(standard: number, shift: Shift): number {
  if (standard <= 0) return 1;
  const scale = effectiveGrossPay(shift) / standard;
  return Math.abs(scale - 1) < 1e-6 ? 1 : scale;
}

export function groupShiftsForInvoice(
  shifts: Shift[],
  rates: PayRates,
  codes: Partial<NdisItemCodes> = {},
): InvoiceLineGroup[] {
  const merged: NdisItemCodes = { ...DEFAULT_NDIS_CODES, ...codes };

  // Keyed by category + effective rate so QTY × RATE = SUBTOTAL stays exact
  // even when shifts carry different historically-assigned rates.
  const buckets = new Map<string, Bucket>();
  const ensure = (c: InvoiceCategory, rate: number): Bucket => {
    const key = `${c}|${rate}`;
    let b = buckets.get(key);
    if (!b) { b = { shifts: new Set(), hours: 0, count: 0, rate }; buckets.set(key, b); }
    return b;
  };

  for (const shift of shifts) {
    if (shift.is_sleepover) {
      const cat = getSleepoverCategory(shift);
      const catRate = getCategoryRate(cat, rates);
      const scale = shiftRateScale(catRate, shift);
      const rate = scale === 1 ? catRate : +(catRate * scale).toFixed(2);
      const b = ensure(cat, rate);
      b.shifts.add(shift);
      b.count += 1;
      continue;
    }

    const segs = segmentShift(shift);
    const standard = segs.reduce((s, x) => s + x.hours * getCategoryRate(x.category, rates), 0);
    const scale = shiftRateScale(standard, shift);

    for (const seg of segs) {
      const catRate = getCategoryRate(seg.category, rates);
      const rate = scale === 1 ? catRate : +(catRate * scale).toFixed(2);
      const b = ensure(seg.category, rate);
      b.shifts.add(shift);
      b.hours += seg.hours;
    }
  }

  const ORDER: InvoiceCategory[] = [
    'daily', 'evening', 'saturday', 'sunday',
    'weekday_sleepover', 'saturday_sleepover', 'sunday_sleepover',
    'public_holiday', 'public_holiday_sleepover',
    'overtime', 'overtime_sleepover',
  ];

  const groups: InvoiceLineGroup[] = [];

  for (const cat of ORDER) {
    const isSleepover = cat.includes('sleepover');
    const catBuckets = Array.from(buckets.entries())
      .filter(([key]) => key.startsWith(`${cat}|`))
      .map(([, b]) => b)
      .sort((a, b) => a.rate - b.rate);

    for (const b of catBuckets) {
      if (isSleepover) {
        if (b.count === 0) continue;
        const subtotal = +(b.count * b.rate).toFixed(2);
        groups.push({
          category: cat,
          label: CATEGORY_LABELS[cat],
          ndisCode: merged[cat],
          shifts: Array.from(b.shifts),
          totalHours: 0,
          quantity: b.count,
          rate: b.rate,
          subtotal,
          isSleepover: true,
        });
      } else {
        if (b.hours === 0) continue;
        const qty = +b.hours.toFixed(2);
        const subtotal = +(qty * b.rate).toFixed(2);
        groups.push({
          category: cat,
          label: CATEGORY_LABELS[cat],
          ndisCode: merged[cat],
          shifts: Array.from(b.shifts),
          totalHours: qty,
          quantity: qty,
          rate: b.rate,
          subtotal,
          isSleepover: false,
        });
      }
    }
  }

  return groups;
}
