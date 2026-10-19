import type { Shift } from '@/hooks/useShifts';

export interface WeeklyInvoiceBatch {
  clientId: string | null;
  clientName: string;
  startISO: string;
  endISO: string;
  shifts: Shift[];
}

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function groupWeeklyInvoiceBatches(shifts: Shift[], from: string, to: string, weekStartDay: number): WeeklyInvoiceBatch[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return [];
  const groups = new Map<string, WeeklyInvoiceBatch>();
  for (const shift of shifts) {
    if (shift.date < from || shift.date > to) continue;
    const [y, m, d] = shift.date.split('-').map(Number);
    const start = new Date(y, m - 1, d);
    start.setDate(start.getDate() - (start.getDay() - weekStartDay + 7) % 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const startISO = iso(start) < from ? from : iso(start);
    const endISO = iso(end) > to ? to : iso(end);
    const clientName = shift.client_name?.trim() || 'Unassigned';
    const key = JSON.stringify([startISO, shift.client_id ?? clientName]);
    let group = groups.get(key);
    if (!group) {
      group = { clientId: shift.client_id, clientName, startISO, endISO, shifts: [] };
      groups.set(key, group);
    }
    group.shifts.push(shift);
  }
  return [...groups.values()].sort((a, b) => a.startISO.localeCompare(b.startISO) || a.clientName.localeCompare(b.clientName));
}