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
// State is keyed per-shift: { fingerprint, sequence }. When a shift's
// fingerprint changes we bump SEQUENCE so calendar apps treat the re-imported
// event as an UPDATE to the existing event (matched by UID), not a duplicate.

const SYNC_STATE_KEY = 'cal_sync_state_v2';
const LEGACY_SYNC_KEY = 'cal_synced_shift_ids';
const SYNC_ENABLED_KEY = 'cal_auto_sync';

interface SyncEntry { fp: string; seq: number }
type SyncState = Record<string, SyncEntry>;

/** Check if auto-sync is enabled */
export function isAutoSyncEnabled(): boolean {
  return localStorage.getItem(SYNC_ENABLED_KEY) === 'true';
}

/** Toggle auto-sync */
export function setAutoSyncEnabled(enabled: boolean): void {
  localStorage.setItem(SYNC_ENABLED_KEY, enabled ? 'true' : 'false');
}

function readState(): SyncState {
  try {
    const raw = localStorage.getItem(SYNC_STATE_KEY);
    if (raw) return JSON.parse(raw) as SyncState;
    const legacy = localStorage.getItem(LEGACY_SYNC_KEY);
    if (legacy) {
      const ids = JSON.parse(legacy) as string[];
      const migrated: SyncState = {};
      for (const id of ids) migrated[id] = { fp: '', seq: 0 };
      localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch { /* ignore */ }
  return {};
}

function writeState(state: SyncState): void {
  localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(state));
}

/** Clean up synced entries for shifts that no longer exist */
export function cleanSyncedIds(currentShiftIds: string[]): void {
  const valid = new Set(currentShiftIds);
  const state = readState();
  let changed = false;
  for (const id of Object.keys(state)) {
    if (!valid.has(id)) { delete state[id]; changed = true; }
  }
  if (changed) writeState(state);
}

/**
 * Decide which events need to be (re-)exported.
 * Returns the events plus a sequence map so the writer bumps SEQUENCE for
 * updates. Returns null if auto-sync is off or nothing has changed.
 */
export function checkAutoSync(
  upcomingEvents: CalendarEvent[],
): { events: CalendarEvent[]; sequences: Map<string, number> } | null {
  if (!isAutoSyncEnabled()) return null;
  if (upcomingEvents.length === 0) return null;

  const state = readState();
  const changed: CalendarEvent[] = [];
  const sequences = new Map<string, number>();

  for (const e of upcomingEvents) {
    const fp = eventFingerprint(e);
    const prev = state[e.uid];
    if (!prev) {
      changed.push(e);
      sequences.set(e.uid, 0);
    } else if (prev.fp !== fp) {
      changed.push(e);
      sequences.set(e.uid, prev.seq + 1);
    }
  }

  if (changed.length === 0) return null;
  return { events: changed, sequences };
}

/** Perform auto-sync: download changed events and update sync state */
export function performAutoSync(payload: { events: CalendarEvent[]; sequences: Map<string, number> }): void {
  const { events, sequences } = payload;
  if (events.length === 0) return;
  downloadBulkICS(events, sequences);
  const state = readState();
  for (const e of events) {
    state[e.uid] = { fp: eventFingerprint(e), seq: sequences.get(e.uid) ?? 0 };
  }
  writeState(state);
}

/** Mark all upcoming events as synced at their current state (initial export) */
export function markAllSynced(events: CalendarEvent[]): void {
  const state = readState();
  for (const e of events) {
    const prev = state[e.uid];
    state[e.uid] = { fp: eventFingerprint(e), seq: prev?.seq ?? 0 };
  }
  writeState(state);
}

/** Build a sequence map for a manual bulk export so updated shifts bump SEQUENCE */
export function buildSequenceMap(events: CalendarEvent[]): Map<string, number> {
  const state = readState();
  const map = new Map<string, number>();
  for (const e of events) {
    const prev = state[e.uid];
    if (!prev) map.set(e.uid, 0);
    else if (prev.fp !== eventFingerprint(e)) map.set(e.uid, prev.seq + 1);
    else map.set(e.uid, prev.seq);
  }
  return map;
}
