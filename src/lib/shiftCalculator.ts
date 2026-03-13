/**
 * Shift pay calculator for independent disability support workers.
 *
 * Rates (AUD):
 *  Mon–Fri daytime   $60/hr  (unless evening window)
 *  Evening (18–22h)  $75/hr  (any day, weekday or weekend)
 *  Saturday          $75/hr  (non-evening hours)
 *  Sunday            $90/hr  (non-evening hours)
 *  Public Holiday    $150/hr (overrides all day/evening rates for hourly shifts)
 *  Weekday sleepover flat $300  (Mon–Fri nights, start at 22:00 → next morning)
 *  Weekend sleepover flat $350  (Sat/Sun nights only)
 *
 * Shifts that cross midnight are split across days automatically.
 * Evening hours (18:00–22:00) are carved out as a separate segment within any day.
 */

export interface PayRates {
  rate_weekday: number;           // Mon–Fri hourly (daytime)
  rate_saturday: number;          // Saturday hourly (daytime)
  rate_sunday: number;            // Sunday hourly (daytime)
  rate_sleepover_weekday: number; // flat per night Mon–Fri
  rate_sleepover_weekend: number; // flat per night Sat–Sun
  rate_public_holiday?: number;   // Public holiday hourly
  rate_evening?: number;          // Evening 18:00–22:00 hourly (any day)
}

export const DEFAULT_RATES: PayRates = {
  rate_weekday: 60,
  rate_saturday: 75,
  rate_sunday: 90,
  rate_sleepover_weekday: 300,
  rate_sleepover_weekend: 350,
  rate_public_holiday: 150,
  rate_evening: 75,
};

/** Evening window in minutes since midnight */
const EVENING_START_MIN = 18 * 60; // 1080
const EVENING_END_MIN   = 22 * 60; // 1320

/**
 * Returns the day-of-week integer (0=Sun,1=Mon...6=Sat) for a given date string (YYYY-MM-DD).
 */
export function getDayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/**
 * Daytime hourly rate for a given day of week (0=Sun ... 6=Sat).
 * Evening hours are handled separately.
 */
export function hourlyRate(dayOfWeek: number, rates: PayRates): number {
  if (dayOfWeek === 0) return rates.rate_sunday;
  if (dayOfWeek === 6) return rates.rate_saturday;
  return rates.rate_weekday;
}

/**
 * Is a night a "weekend sleepover" night?
 * Weekend sleepover = ONLY Saturday night or Sunday night.
 * Friday is treated as a WEEKDAY night ($300).
 */
export function isWeekendSleeperNight(dayOfWeek: number): boolean {
  return dayOfWeek === 6 || dayOfWeek === 0;
}

/**
 * Detect whether a shift contains any hours in the evening window 18:00–22:00.
 * Works for overnight shifts too.
 */
export function shiftHasEveningHours(startTime: string, endTime: string): boolean {
  const startMin = timeToMinutes(startTime);
  let endMin = timeToMinutes(endTime);
  if (endMin <= startMin) endMin += 1440; // overnight

  // Iterate through each 24-h window covered by the shift
  let offset = startMin;
  let remaining = endMin - startMin;
  while (remaining > 0) {
    const dayStart = Math.floor(offset / 1440) * 1440;
    const relStart = offset - dayStart;
    const relEnd = Math.min(relStart + remaining, 1440);
    // Does this day's segment overlap with evening window (1080–1320)?
    const overlapStart = Math.max(relStart, EVENING_START_MIN);
    const overlapEnd   = Math.min(relEnd,   EVENING_END_MIN);
    if (overlapEnd > overlapStart) return true;
    const chunk = relEnd - relStart;
    remaining -= chunk;
    offset += chunk;
  }
  return false;
}

interface SubSegment {
  startMin: number; // within-day minutes
  endMin: number;
  isEvening: boolean;
}

/**
 * Split a single day's minutes [segStart, segEnd) into daytime and evening sub-segments.
 * segStart and segEnd are minutes within [0, 1440).
 */
function splitDaySegment(segStart: number, segEnd: number): SubSegment[] {
  const cuts = [segStart, EVENING_START_MIN, EVENING_END_MIN, segEnd]
    .filter(v => v > segStart && v < segEnd);
  const points = [segStart, ...new Set(cuts), segEnd].sort((a, b) => a - b);
  const result: SubSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const s = points[i];
    const e = points[i + 1];
    if (e <= s) continue;
    const isEvening = s >= EVENING_START_MIN && e <= EVENING_END_MIN;
    result.push({ startMin: s, endMin: e, isEvening });
  }
  return result;
}

interface DaySegment {
  date: string;
  dayOfWeek: number;
  hours: number;
  isEvening: boolean;
}

/**
 * Split a shift into per-day, per-rate-zone segments (handles midnight crossing + evening split).
 */
function splitAcrossDays(dateStr: string, startMinutes: number, endMinutes: number): DaySegment[] {
  const segments: DaySegment[] = [];
  const [y, m, d] = dateStr.split('-').map(Number);
  let current = new Date(y, m - 1, d);
  let remaining = endMinutes - startMinutes;
  let offset = startMinutes;

  while (remaining > 0) {
    const minutesToMidnight = 1440 - offset;
    const inThisDay = Math.min(remaining, minutesToMidnight);
    const segStart = offset;
    const segEnd = offset + inThisDay;

    // Split into daytime / evening sub-segments within this day
    const sub = splitDaySegment(segStart, segEnd);
    for (const ss of sub) {
      segments.push({
        date: formatDate(current),
        dayOfWeek: current.getDay(),
        hours: (ss.endMin - ss.startMin) / 60,
        isEvening: ss.isEvening,
      });
    }

    remaining -= inThisDay;
    offset = 0;
    current = new Date(current.getTime() + 86400000);
  }

  return segments;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function timeToMinutes(time: string): number {
  const [h, mi] = time.split(':').map(Number);
  return h * 60 + mi;
}

export interface ShiftCalculation {
  hoursWorked: number;
  grossPay: number;
  breakdown: Array<{ label: string; hours?: number; rate?: number; amount: number }>;
}

/**
 * Calculate pay for a single shift.
 *
 * @param dateStr         YYYY-MM-DD (shift start date)
 * @param startTime       HH:MM (24h)
 * @param endTime         HH:MM (24h, may equal start or be earlier = next day)
 * @param isSleepover     whether this is a sleepover shift
 * @param rates           pay rates (uses DEFAULT_RATES if omitted)
 * @param isPublicHoliday when true, use public holiday rate for all hourly segments
 */
export function calculateShiftPay(
  dateStr: string,
  startTime: string,
  endTime: string,
  isSleepover: boolean,
  rates: PayRates = DEFAULT_RATES,
  isPublicHoliday = false,
): ShiftCalculation {
  let startMinutes = timeToMinutes(startTime);
  let endMinutes = timeToMinutes(endTime);

  // If end <= start, it crosses midnight
  if (endMinutes <= startMinutes) {
    endMinutes += 1440;
  }

  const totalHours = (endMinutes - startMinutes) / 60;

  if (isSleepover) {
    const dayOfWeek = getDayOfWeek(dateStr);
    const rate = isWeekendSleeperNight(dayOfWeek)
      ? rates.rate_sleepover_weekend
      : rates.rate_sleepover_weekday;
    const label = isWeekendSleeperNight(dayOfWeek) ? 'Weekend Sleepover' : 'Weekday Sleepover';
    return {
      hoursWorked: totalHours,
      grossPay: rate,
      breakdown: [{ label, amount: rate }],
    };
  }

  // Regular shift — split across days and evening zones
  const segments = splitAcrossDays(dateStr, startMinutes, endMinutes);
  let grossPay = 0;
  const breakdown: ShiftCalculation['breakdown'] = [];

  const phRate = rates.rate_public_holiday ?? 150;
  const eveningRate = rates.rate_evening ?? 75;

  for (const seg of segments) {
    let rate: number;
    let zoneLabel: string;
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][seg.dayOfWeek];
    const isWeekday = seg.dayOfWeek >= 1 && seg.dayOfWeek <= 5; // Mon–Fri only

    if (isPublicHoliday) {
      rate = phRate;
      zoneLabel = `Public Holiday ${seg.date}`;
    } else if (seg.isEvening && isWeekday) {
      // Evening rate only overrides weekday (Mon–Fri) rates.
      // Saturday ($75) and Sunday ($90) are already ≥ evening rate, so use their day rate.
      rate = eveningRate;
      zoneLabel = `${dayName} ${seg.date} (Evening)`;
    } else {
      rate = hourlyRate(seg.dayOfWeek, rates);
      zoneLabel = seg.isEvening ? `${dayName} ${seg.date} (Evening)` : `${dayName} ${seg.date}`;
    }

    const amount = seg.hours * rate;
    grossPay += amount;
    breakdown.push({
      label: zoneLabel,
      hours: +seg.hours.toFixed(2),
      rate,
      amount: +amount.toFixed(2),
    });
  }

  return {
    hoursWorked: +totalHours.toFixed(2),
    grossPay: +grossPay.toFixed(2),
    breakdown,
  };
}

/**
 * Format a time string HH:MM as 12-hour display: "9:00 AM"
 */
export function formatTime12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Return a short label for a day-of-week integer.
 */
export function dayLabel(dow: number): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow];
}
