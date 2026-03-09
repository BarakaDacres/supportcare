/**
 * Get the real calendar week ranges for a given month (Monday start).
 * Weeks can begin in the prior month.
 */
export function getWeekRangesForMonth(year: number, month: number): { start: Date; end: Date; label: string }[] {
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);

  // Find the Monday on or before the first of the month
  let startDay = new Date(firstOfMonth);
  const dayOfWeek = startDay.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0 offset
  startDay.setDate(startDay.getDate() - diff);

  const weeks: { start: Date; end: Date; label: string }[] = [];

  while (startDay <= lastOfMonth) {
    const weekStart = new Date(startDay);
    const weekEnd = new Date(startDay);
    weekEnd.setDate(weekEnd.getDate() + 6);

    weeks.push({
      start: weekStart,
      end: weekEnd,
      label: `${formatShortDate(weekStart)} – ${formatShortDate(weekEnd)}`,
    });

    startDay.setDate(startDay.getDate() + 7);
  }

  return weeks;
}

function formatShortDate(d: Date): string {
  const day = d.getDate().toString().padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[d.getMonth()]}`;
}

export function getFortnightRanges(year: number, month: number) {
  const weeks = getWeekRangesForMonth(year, month);
  const fortnights: { weeks: number[]; label: string }[] = [];

  for (let i = 0; i < weeks.length; i += 2) {
    const endWeek = i + 1 < weeks.length ? weeks[i + 1] : weeks[i];
    fortnights.push({
      weeks: i + 1 < weeks.length ? [i, i + 1] : [i],
      label: `${formatShortDate(weeks[i].start)} – ${formatShortDate(endWeek.end)}`,
    });
  }

  return fortnights;
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
