/**
 * Shift pay calculator for independent disability support workers.
 *
 * Default rates (AUD):
 *  Mon–Fri daytime  $60/hr
 *  Saturday         $75/hr
 *  Sunday           $90/hr
 *  Weekday sleepover flat $300
 *  Weekend sleepover flat $350  (Fri/Sat/Sun nights)
 *
 * Shifts that cross midnight are split across days automatically.
 */

export interface PayRates {
  rate_weekday: number;           // Mon–Fri hourly
  rate_saturday: number;          // Saturday hourly
  rate_sunday: number;            // Sunday hourly
  rate_sleepover_weekday: number; // flat per night Mon–Thu
  rate_sleepover_weekend: number; // flat per night Fri–Sun
}

export const DEFAULT_RATES: PayRates = {
  rate_weekday: 60,
  rate_saturday: 75,
  rate_sunday: 90,
  rate_sleepover_weekday: 300,
  rate_sleepover_weekend: 350,
};

/**
 * Returns the day-of-week integer (0=Sun,1=Mon...6=Sat) for a given date string (YYYY-MM-DD).
 */
export function getDayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/**
 * Hourly rate for a given day of week (0=Sun ... 6=Sat).
 */
export function hourlyRate(dayOfWeek: number, rates: PayRates): number {
  if (dayOfWeek === 0) return rates.rate_sunday;
  if (dayOfWeek === 6) return rates.rate_saturday;
  return rates.rate_weekday;
}

/**
 * Is a night a "weekend sleepover" night?
 * Weekend sleepover = the night of Friday, Saturday, or Sunday (i.e., you sleep through into Sat, Sun, Mon morning).
 * dayOfWeek is the day the shift STARTS (the "night" day).
 */
export function isWeekendSleeperNight(dayOfWeek: number): boolean {
  // Fri=5, Sat=6, Sun=0
  return dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0;
}

interface DaySegment {
  date: string;
  dayOfWeek: number;
  hours: number;
}

/**
 * Split a shift into per-day segments (handles midnight crossing).
 * dateStr: YYYY-MM-DD (shift start date)
 * startMinutes: minutes since midnight for start
 * endMinutes: minutes since midnight for end (may be > 1440 for overnight)
 */
function splitAcrossDays(dateStr: string, startMinutes: number, endMinutes: number): DaySegment[] {
  const segments: DaySegment[] = [];
  const [y, m, d] = dateStr.split('-').map(Number);
  let current = new Date(y, m - 1, d);
  let remaining = endMinutes - startMinutes;
  let offset = startMinutes;

  while (remaining > 0) {
    const minutesToMidnight = 1440 - offset;
    const hoursInDay = Math.min(remaining, minutesToMidnight) / 60;
    segments.push({
      date: formatDate(current),
      dayOfWeek: current.getDay(),
      hours: hoursInDay,
    });
    remaining -= minutesToMidnight;
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
 * @param dateStr    YYYY-MM-DD (shift start date)
 * @param startTime  HH:MM (24h)
 * @param endTime    HH:MM (24h, may equal start or be earlier = next day)
 * @param isSleepover whether this is a sleepover shift
 * @param rates      pay rates (uses DEFAULT_RATES if omitted)
 */
export function calculateShiftPay(
  dateStr: string,
  startTime: string,
  endTime: string,
  isSleepover: boolean,
  rates: PayRates = DEFAULT_RATES
): ShiftCalculation {
  let startMinutes = timeToMinutes(startTime);
  let endMinutes = timeToMinutes(endTime);

  // If end <= start, it crosses midnight
  if (endMinutes <= startMinutes) {
    endMinutes += 1440;
  }

  const totalHours = (endMinutes - startMinutes) / 60;

  if (isSleepover) {
    // Sleepover: flat rate based on the day the shift starts (the "night")
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

  // Regular shift — split across days and apply day-specific rates
  const segments = splitAcrossDays(dateStr, startMinutes, endMinutes);
  let grossPay = 0;
  const breakdown: ShiftCalculation['breakdown'] = [];

  for (const seg of segments) {
    const rate = hourlyRate(seg.dayOfWeek, rates);
    const amount = seg.hours * rate;
    grossPay += amount;
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][seg.dayOfWeek];
    breakdown.push({
      label: `${dayName} ${seg.date}`,
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
