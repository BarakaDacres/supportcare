/**
 * Calendar export utilities — generates .ics (Apple/Outlook) or Google Calendar URLs.
 * Uses UID based on shift ID to prevent duplicate events.
 * Includes auto-sync: tracks exported shift IDs in localStorage and triggers
 * re-export when new upcoming shifts are detected.
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

/** Compute a stable fingerprint for change detection */
function eventFingerprint(e: CalendarEvent): string {
  return [e.startDate, e.startTime, e.endTime, e.title, e.location ?? '', e.description ?? ''].join('|');
}

/** Generate a downloadable .ics file content */
export function generateICS(event: CalendarEvent, sequence = 0): string {
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
    `SEQUENCE:${sequence}`,
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
export function generateBulkICS(events: CalendarEvent[], sequences?: Map<string, number>): string {
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
    const seq = sequences?.get(event.uid) ?? 0;

    lines.push(
      'BEGIN:VEVENT',
      `UID:shift-${event.uid}@supportcare.app`,
      `SEQUENCE:${seq}`,
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
export function downloadBulkICS(events: CalendarEvent[], sequences?: Map<string, number>) {
  const icsContent = generateBulkICS(events, sequences);
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

// ── Auto-sync helpers ────────────────────────────────────────────────────────

const SYNC_KEY = 'cal_synced_shift_ids';
const SYNC_ENABLED_KEY = 'cal_auto_sync';

/** Check if auto-sync is enabled */
export function isAutoSyncEnabled(): boolean {
  return localStorage.getItem(SYNC_ENABLED_KEY) === 'true';
}

/** Toggle auto-sync */
export function setAutoSyncEnabled(enabled: boolean): void {
  localStorage.setItem(SYNC_ENABLED_KEY, enabled ? 'true' : 'false');
}

/** Get the set of shift IDs that have already been synced */
function getSyncedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

/** Mark shift IDs as synced */
function markSynced(ids: string[]): void {
  const existing = getSyncedIds();
  for (const id of ids) existing.add(id);
  localStorage.setItem(SYNC_KEY, JSON.stringify([...existing]));
}

/** Clean up synced IDs that no longer exist */
export function cleanSyncedIds(currentShiftIds: string[]): void {
  const existing = getSyncedIds();
  const validIds = new Set(currentShiftIds);
  const cleaned = [...existing].filter(id => validIds.has(id));
  localStorage.setItem(SYNC_KEY, JSON.stringify(cleaned));
}

/**
 * Check for new upcoming shifts that haven't been synced yet.
 * Returns the new events if auto-sync is enabled and there are unsynced shifts.
 * Returns null if no sync needed.
 */
export function checkAutoSync(
  upcomingEvents: CalendarEvent[],
): CalendarEvent[] | null {
  if (!isAutoSyncEnabled()) return null;
  if (upcomingEvents.length === 0) return null;

  const synced = getSyncedIds();
  const newEvents = upcomingEvents.filter(e => !synced.has(e.uid));

  if (newEvents.length === 0) return null;
  return newEvents;
}

/** Perform auto-sync: download new events and mark them as synced */
export function performAutoSync(events: CalendarEvent[]): void {
  if (events.length === 0) return;
  downloadBulkICS(events);
  markSynced(events.map(e => e.uid));
}

/** Mark all upcoming events as synced (for initial export) */
export function markAllSynced(events: CalendarEvent[]): void {
  markSynced(events.map(e => e.uid));
}
