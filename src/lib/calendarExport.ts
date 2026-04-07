/**
 * Calendar export utilities — generates .ics (Apple/Outlook) or Google Calendar URLs.
 * Uses UID based on shift ID to prevent duplicate events.
 */

export interface CalendarEvent {
  uid: string;          // unique id (shift id)
  title: string;        // client name or "Shift"
  startDate: string;    // YYYY-MM-DD
  startTime: string;    // HH:mm
  endDate: string;      // YYYY-MM-DD (may differ for overnights)
  endTime: string;      // HH:mm
  location?: string;    // client address
  description?: string;
}

function pad(n: number) { return n.toString().padStart(2, '0'); }

/** Convert date + time to iCal DTSTART/DTEND format (local time) */
function toICSDateTime(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return `${y}${pad(m)}${pad(d)}T${pad(h)}${pad(min)}00`;
}

/** Determine end date — if end < start, it's overnight */
function resolveEndDate(startDate: string, startTime: string, endTime: string): string {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if (eh < sh || (eh === sh && em < sm)) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return startDate;
}

function escapeICS(text: string): string {
  return text.replace(/[\\;,]/g, c => '\\' + c).replace(/\n/g, '\\n');
}

/** Generate a downloadable .ics file content */
export function generateICS(event: CalendarEvent): string {
  const endDate = resolveEndDate(event.startDate, event.startTime, event.endTime);
  const dtStart = toICSDateTime(event.startDate, event.startTime);
  const dtEnd = toICSDateTime(endDate, event.endTime);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SupportCare//Shift//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:shift-${event.uid}@supportcare.app`,
    `DTSTAMP:${toICSDateTime(new Date().toISOString().slice(0, 10), new Date().toTimeString().slice(0, 5))}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeICS(event.title)}`,
  ];

  if (event.location) lines.push(`LOCATION:${escapeICS(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeICS(event.description)}`);

  lines.push('STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

/** Generate a single .ics file with multiple events */
export function generateBulkICS(events: CalendarEvent[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SupportCare//Shift//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const event of events) {
    const endDate = resolveEndDate(event.startDate, event.startTime, event.endTime);
    const dtStart = toICSDateTime(event.startDate, event.startTime);
    const dtEnd = toICSDateTime(endDate, event.endTime);

    lines.push(
      'BEGIN:VEVENT',
      `UID:shift-${event.uid}@supportcare.app`,
      `DTSTAMP:${toICSDateTime(new Date().toISOString().slice(0, 10), new Date().toTimeString().slice(0, 5))}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${escapeICS(event.title)}`,
    );
    if (event.location) lines.push(`LOCATION:${escapeICS(event.location)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeICS(event.description)}`);
    lines.push('STATUS:CONFIRMED', 'END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/** Download a bulk .ics file */
export function downloadBulkICS(events: CalendarEvent[]) {
  const icsContent = generateBulkICS(events);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `upcoming-shifts.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Trigger download of an .ics file */
export function downloadICS(event: CalendarEvent) {
  const icsContent = generateICS(event);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shift-${event.uid.slice(0, 8)}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Generate a Google Calendar add-event URL */
export function googleCalendarURL(event: CalendarEvent): string {
  const endDate = resolveEndDate(event.startDate, event.startTime, event.endTime);
  const dtStart = toICSDateTime(event.startDate, event.startTime);
  const dtEnd = toICSDateTime(endDate, event.endTime);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${dtStart}/${dtEnd}`,
    ...(event.location ? { location: event.location } : {}),
    ...(event.description ? { details: event.description } : {}),
  });

  return `https://www.google.com/calendar/render?${params.toString()}`;
}
