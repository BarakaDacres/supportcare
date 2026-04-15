/** Smart default notes based on shift type */

export function getSmartNote(
  shiftType: 'day' | 'evening' | 'sleepover' | string,
  _date: string,
  _isPublicHoliday = false,
): string {
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
