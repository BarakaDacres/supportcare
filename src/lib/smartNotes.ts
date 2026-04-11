/** Smart default notes based on shift type and day type */

export function getSmartNote(
  shiftType: 'day' | 'evening' | 'sleepover' | string,
  date: string,
  isPublicHoliday = false,
): string {
  if (isPublicHoliday) {
    return 'Public holiday support shift. Assistance provided in line with client care needs.';
  }

  const d = new Date(date + 'T00:00:00');
  const dow = d.getDay(); // 0=Sun, 6=Sat
  const isWeekend = dow === 0 || dow === 6;

  if (isWeekend && shiftType !== 'sleepover') {
    return 'Weekend support including community access and daily living assistance.';
  }

  switch (shiftType) {
    case 'evening':
      return 'Evening support including meal preparation, personal care, and routine assistance.';
    case 'sleepover':
      return 'Overnight support (sleepover). Assistance provided as required throughout the night.';
    case 'day':
    default:
      return 'Assistance with self-care activities and daily living support.';
  }
}
