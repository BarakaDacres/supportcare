import { useMemo, useState } from 'react';
import { Download, Loader2, FileArchive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { groupWeeklyInvoiceBatches, type WeeklyInvoiceBatch } from '@/lib/weeklyInvoiceBatch';
import { buildWeeklyReceiptPDF, type PrintWeeklyReceiptOptions } from '@/lib/printWeeklyReceipt';
import type { Shift } from '@/hooks/useShifts';

interface Props {
  shifts: Shift[];
  initialFrom: string;
  initialTo: string;
  weekStartDay: number;
  buildInvoice: (batch: WeeklyInvoiceBatch) => PrintWeeklyReceiptOptions;
  onClose: () => void;
}

export default function WeeklyInvoiceDownload({ shifts, initialFrom, initialTo, weekStartDay, buildInvoice, onClose }: Props) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState<{ blob: Blob; filename: string } | null>(null);
  const batches = useMemo(() => groupWeeklyInvoiceBatches(shifts, from, to, weekStartDay), [shifts, from, to, weekStartDay]);
  const valid = Boolean(from && to && from <= to);

  const prepare = async () => {
    setBusy(true);
    setError('');
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      for (const [index, batch] of batches.entries()) {
        const name = batch.clientName.replace(/[^\p{L}\p{N}-]+/gu, '-').slice(0, 60) || 'client';
        zip.file(`${String(index + 1).padStart(3, '0')}-${name}-${batch.startISO}-${batch.endISO}.pdf`, await buildWeeklyReceiptPDF(buildInvoice(batch)));
      }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      setReady({ blob, filename: `weekly-invoices-${from}-${to}.zip` });
    } catch {
      setError('Unable to prepare invoices. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!ready) return;
    const file = new File([ready.blob], ready.filename, { type: 'application/zip' });
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: ready.filename }); return; }
      catch (e) { if ((e as DOMException).name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(ready.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = ready.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md rounded-3xl bg-card p-5 max-h-[90dvh] overflow-y-auto" aria-describedby="weekly-download-summary">
        <DialogTitle className="pr-8">Weekly invoices</DialogTitle>
        <DialogDescription id="weekly-download-summary">{batches.length} {batches.length === 1 ? 'invoice' : 'invoices'} · {new Set(batches.map(b => b.clientId ?? b.clientName)).size} {new Set(batches.map(b => b.clientId ?? b.clientName)).size === 1 ? 'client' : 'clients'}</DialogDescription>
        <div className="grid grid-cols-2 gap-3 min-w-0">
          <label className="min-w-0 text-xs text-muted-foreground">From
            <Input aria-label="Weekly invoices from" type="date" value={from} max={to || undefined} disabled={busy} className="mt-1 min-w-0 h-11" onChange={e => { setFrom(e.target.value); setReady(null); setError(''); }} />
          </label>
          <label className="min-w-0 text-xs text-muted-foreground">To
            <Input aria-label="Weekly invoices to" type="date" value={to} min={from || undefined} disabled={busy} className="mt-1 min-w-0 h-11" onChange={e => { setTo(e.target.value); setReady(null); setError(''); }} />
          </label>
        </div>
        {!valid ? <p role="alert" className="text-sm text-destructive">Choose a valid date range.</p> : batches.length === 0 ? <p className="text-sm text-muted-foreground">No shifts in this date range.</p> : (
          <div className="max-h-48 overflow-y-auto divide-y divide-border">
            {batches.map((b, i) => <div key={i} className="py-2 flex items-center justify-between gap-3 text-xs"><span className="font-medium truncate">{b.clientName}</span><span className="text-muted-foreground shrink-0">{b.startISO.slice(8)}/{b.startISO.slice(5, 7)} – {b.endISO.slice(8)}/{b.endISO.slice(5, 7)}</span></div>)}
          </div>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button className="h-11 w-full active:scale-95" disabled={busy || !valid || batches.length === 0} onClick={ready ? download : prepare}>
          {busy ? <Loader2 className="animate-spin" /> : ready ? <Download /> : <FileArchive />}
          {busy ? 'Preparing invoices…' : ready ? 'Download ZIP' : 'Prepare all invoices'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}