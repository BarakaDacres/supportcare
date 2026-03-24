/**
 * Invoice grouping logic — classifies shifts into NDIS support categories
 * and calculates per-category totals for grouped invoice output.
 */

import type { Shift } from '@/hooks/useShifts';
import { effectiveGrossPay } from '@/hooks/useShifts';
import { getDayOfWeek, isWeekendSleeperNight, shiftHasEveningHours } from '@/lib/shiftCalculator';
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
  | 'public_holiday_sleepover';

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

function getShiftCategory(shift: Shift): InvoiceCategory {
  const dow = getDayOfWeek(shift.date);

  // Public holiday sleepover — highest priority, own line
  if (shift.is_sleepover && shift.is_public_holiday) return 'public_holiday_sleepover';

  // Regular sleepovers: classify by day
  if (shift.is_sleepover) {
    if (dow === 6) return 'saturday_sleepover';
    if (dow === 0) return 'sunday_sleepover';
    return 'weekday_sleepover';
  }

  // Public holiday (non-sleepover)
  if (shift.is_public_holiday) return 'public_holiday';

  if (dow === 6) return 'saturday';
  if (dow === 0) return 'sunday';

  // Weekday — check for evening (purely evening window shifts)
  const hasEvening = shiftHasEveningHours(shift.start_time, shift.end_time);
  const [startH] = shift.start_time.split(':').map(Number);
  const [endH] = shift.end_time.split(':').map(Number);
  const purelyEvening = startH >= 18 && (endH <= 22 || endH <= startH);
  if (hasEvening && purelyEvening) return 'evening';

  return 'daily';
}

function getEffectiveRate(shift: Shift, category: InvoiceCategory, rates: PayRates): number {
  if (shift.fee_override != null && shift.fee_override > 0) {
    return shift.fee_override;
  }
  switch (category) {
    case 'public_holiday_sleepover': return (rates as PayRates & { rate_ph_sleepover?: number }).rate_ph_sleepover ?? 400;
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

export function groupShiftsForInvoice(
  shifts: Shift[],
  rates: PayRates,
  codes: Partial<NdisItemCodes> = {},
): InvoiceLineGroup[] {
  const merged: NdisItemCodes = { ...DEFAULT_NDIS_CODES, ...codes };

  const buckets = new Map<InvoiceCategory, Shift[]>();

  for (const shift of shifts) {
    const cat = getShiftCategory(shift);
    if (!buckets.has(cat)) buckets.set(cat, []);
    buckets.get(cat)!.push(shift);
  }

  const ORDER: InvoiceCategory[] = [
    'daily', 'evening', 'saturday', 'sunday',
    'weekday_sleepover', 'saturday_sleepover', 'sunday_sleepover',
    'public_holiday', 'public_holiday_sleepover',
  ];

  const groups: InvoiceLineGroup[] = [];

  for (const cat of ORDER) {
    const catShifts = buckets.get(cat);
    if (!catShifts || catShifts.length === 0) continue;

    const isSleepover = cat.includes('sleepover');

    let totalHours = 0;
    let subtotal = 0;

    for (const s of catShifts) {
      if (isSleepover) {
        subtotal += effectiveGrossPay(s);
      } else {
        totalHours += Number(s.hours_worked);
        subtotal += effectiveGrossPay(s);
      }
    }

    const rate = getEffectiveRate(catShifts[0], cat, rates);
    const quantity = isSleepover ? catShifts.length : +totalHours.toFixed(2);

    groups.push({
      category: cat,
      label: CATEGORY_LABELS[cat],
      ndisCode: merged[cat],
      shifts: catShifts,
      totalHours: isSleepover ? 0 : +totalHours.toFixed(2),
      quantity,
      rate,
      subtotal: +subtotal.toFixed(2),
      isSleepover,
    });
  }

  return groups;
}
