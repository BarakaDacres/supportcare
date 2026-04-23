import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type InvoiceStatus = 'draft' | 'generated' | 'sent' | 'paid' | 'overdue' | 'cancelled';

export interface InvoiceSummary {
  id: string;
  invoice_number: string;
  status: InvoiceStatus;
  total_amount: number;
  period_start: string;
  period_end: string;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  paid_at: string | null;
  due_date: string | null;
  client_id: string | null;
  fortnight_number: number | null;
  year: number | null;
  notes: string | null;
}

export function useInvoices() {
  const [invoices, setInvoices]     = useState<InvoiceSummary[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const userIdRef                   = useRef<string | null>(null);
  const initializedRef              = useRef(false);
  const timeoutRef                  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchInvoices = useCallback(async (showLoading = false) => {
    if (!userIdRef.current) { setLoading(false); return; }
    if (showLoading) setLoading(true);
    setError(null);

    // Safety timeout — never leave screen stuck
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setLoading(false);
      setError('Loading timed out. Tap refresh to try again.');
    }, 10_000);

    try {
      const { data, error: err } = await supabase
        .from('invoices')
        .select('id, invoice_number, status, total_amount, period_start, period_end, created_at, updated_at, sent_at, paid_at, due_date, client_id, fortnight_number, year, notes')
        .eq('user_id', userIdRef.current)
        .order('created_at', { ascending: false });

      if (err) {
        setError(err.message);
        return;
      }
      setInvoices((data ?? []) as InvoiceSummary[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invoices.');
    } finally {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        userIdRef.current     = session.user.id;
        initializedRef.current = true;
        fetchInvoices(true);
      } else {
        userIdRef.current = null;
        setInvoices([]);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        const uid = session.user.id;
        if (userIdRef.current !== uid || !initializedRef.current) {
          userIdRef.current      = uid;
          initializedRef.current = true;
          fetchInvoices(true);
        }
      } else {
        userIdRef.current      = null;
        initializedRef.current = false;
        setInvoices([]);
        setLoading(false);
        if (realtimeChannel) {
          supabase.removeChannel(realtimeChannel);
          realtimeChannel = null;
        }
      }
    });

    realtimeChannel = supabase
      .channel('invoices-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoices' },
        () => { if (userIdRef.current) fetchInvoices(false); }
      )
      .subscribe();

    const onFocus = () => { if (userIdRef.current) fetchInvoices(false); };
    window.addEventListener('focus', onFocus);

    return () => {
      subscription.unsubscribe();
      if (realtimeChannel) supabase.removeChannel(realtimeChannel);
      window.removeEventListener('focus', onFocus);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [fetchInvoices]);

  const updateInvoiceStatus = useCallback(async (
    id: string,
    status: InvoiceStatus,
    extra?: { sent_at?: string; paid_at?: string },
  ): Promise<void> => {
    const updates: Record<string, unknown> = { status, ...extra };
    const { error: err } = await supabase.from('invoices').update(updates).eq('id', id);
    if (err) { console.error('updateInvoiceStatus error:', err); throw err; }
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status, ...extra } : inv));
  }, []);

  const deleteInvoice = useCallback(async (id: string): Promise<void> => {
    const { error: err } = await supabase.from('invoices').delete().eq('id', id);
    if (err) { console.error('deleteInvoice error:', err); throw err; }
    setInvoices(prev => prev.filter(inv => inv.id !== id));
  }, []);

  return { invoices, loading, error, fetchInvoices: () => fetchInvoices(false), updateInvoiceStatus, deleteInvoice };
}
