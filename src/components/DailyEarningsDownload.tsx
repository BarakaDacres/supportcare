import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import type { Shift } from '@/hooks/useShifts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { buildDailyEarnings, downloadDailyEarnings } from '@/lib/dailyEarningsExport';
import { formatCurrency } from '@/lib/formatUtils';

export default function DailyEarningsDownload({ shifts, onClose }: { shifts: Shift[]; onClose: () => void }) {
  const dates = shifts.map(s => s.date).sort();
  const [from, setFrom] = useState(dates[0] ?? '');
  const [to, setTo] = useState(dates[dates.length - 1] ?? '');
  const [error, setError] = useState('');
  const rows = useMemo(() => buildDailyEarnings(shifts, from, to), [shifts, from, to]);
  const valid = Boolean(from && to && from <= to);
  const download = async (format: 'json' | 'csv') => {
    setError('');
    try { await downloadDailyEarnings(rows, format, from, to); }
    catch { setError('Unable to download. Please try again.'); }
  };
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-3xl bg-card/95 backdrop-blur-2xl p-5 max-h-[90dvh] overflow-y-auto">
        <DialogTitle className="pr-8">Download earnings</DialogTitle>
        <DialogDescription>{rows.length} daily client {rows.length === 1 ? 'record' : 'records'} · {formatCurrency(rows.reduce((sum, row) => sum + row.amount, 0))}</DialogDescription>
        <div className="grid grid-cols-2 gap-3 min-w-0">
          <label className="min-w-0 text-xs text-muted-foreground">From
            <Input aria-label="Earnings from" type="date" value={from} max={to || undefined} className="mt-1 w-full min-w-0 h-11" onChange={e => setFrom(e.target.value)} />
          </label>
          <label className="min-w-0 text-xs text-muted-foreground">To
            <Input aria-label="Earnings to" type="date" value={to} min={from || undefined} className="mt-1 w-full min-w-0 h-11" onChange={e => setTo(e.target.value)} />
          </label>
        </div>
        {!valid ? <p role="alert" className="text-sm text-destructive">Choose a valid date range.</p> : rows.length === 0 ? <p className="text-sm text-muted-foreground">No shifts in this date range.</p> : null}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <Button className="h-11 active:scale-95" disabled={!valid || !rows.length} onClick={() => download('json')}><Download />JSON</Button>
          <Button variant="outline" className="h-11 active:scale-95" disabled={!valid || !rows.length} onClick={() => download('csv')}><Download />CSV</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}