import type { Shift } from '@/hooks/useShifts';
import { effectiveGrossPay } from '@/hooks/useShifts';
import { safeNum } from '@/lib/formatUtils';

export interface DailyEarningsRow {
  date: string;
  stream: 'Support Work';
  source: string;
  start: string;
  end: string;
  amount: number;
  note: string;
}

export function buildDailyEarnings(shifts: Shift[], from: string, to: string): DailyEarningsRow[] {
  if (!from || !to || from > to) return [];
  const groups = new Map<string, { row: DailyEarningsRow; cents: number; notes: Set<string> }>();
  for (const shift of shifts) {
    if (shift.date < from || shift.date > to) continue;
    const source = shift.client_name?.trim() || 'Unassigned';
    const key = JSON.stringify([shift.date, shift.client_id ?? source]);
    let group = groups.get(key);
    if (!group) {
      group = { row: { date: shift.date, stream: 'Support Work', source, start: '', end: '', amount: 0, note: '' }, cents: 0, notes: new Set() };
      groups.set(key, group);
    }
    group.cents += Math.round(safeNum(effectiveGrossPay(shift)) * 100);
    if (shift.notes?.trim()) group.notes.add(shift.notes.trim());
  }
  return [...groups.values()].map(({ row, cents, notes }) => ({ ...row, amount: cents / 100, note: [...notes].sort().join('\n') }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source));
}

const columns: (keyof DailyEarningsRow)[] = ['date', 'stream', 'source', 'start', 'end', 'amount', 'note'];

export function serializeDailyEarnings(rows: DailyEarningsRow[], format: 'json' | 'csv'): string {
  if (format === 'json') return JSON.stringify(rows, null, 2);
  const cell = (value: string | number) => {
    if (typeof value === 'number') return value.toFixed(2);
    // Prevent client names and notes from executing spreadsheet formulas.
    const text = /^[\s]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return '\uFEFF' + [columns.join(','), ...rows.map(row => columns.map(key => cell(row[key])).join(','))].join('\r\n');
}

export async function downloadDailyEarnings(rows: DailyEarningsRow[], format: 'json' | 'csv', from: string, to: string) {
  const type = format === 'json' ? 'application/json' : 'text/csv;charset=utf-8';
  const filename = `support-work-${from}-${to}.${format}`;
  const file = new File([serializeDailyEarnings(rows, format)], filename, { type });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; }
    catch (error) { if ((error as DOMException).name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}