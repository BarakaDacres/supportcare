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
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    if (!userIdRef.current) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, status, total_amount, period_start, period_end, created_at, updated_at, sent_at, paid_at, due_date, client_id, fortnight_number, year, notes')
      .order('created_at', { ascending: false });
    if (error) { console.error('fetchInvoices error:', error); }
    setInvoices((data ?? []) as InvoiceSummary[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        userIdRef.current = session.user.id;
        fetchInvoices();
      } else {
        userIdRef.current = null;
        setInvoices([]);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        userIdRef.current = session.user.id;
        fetchInvoices();
      } else {
        userIdRef.current = null;
        setInvoices([]);
        setLoading(false);
      }
    });

    const channel = supabase
      .channel('invoices-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, fetchInvoices)
      .subscribe();

    return () => {
      subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [fetchInvoices]);

  /** Update invoice status + optional timestamp fields */
  const updateInvoiceStatus = useCallback(async (
    id: string,
    status: InvoiceStatus,
    extra?: { sent_at?: string; paid_at?: string },
  ): Promise<void> => {
    const updates: Record<string, unknown> = { status, ...extra };
    const { error } = await supabase.from('invoices').update(updates).eq('id', id);
    if (error) { console.error('updateInvoiceStatus error:', error); throw error; }
    setInvoices(prev => prev.map(inv =>
      inv.id === id ? { ...inv, status, ...extra } : inv,
    ));
  }, []);

  /** Delete an invoice and its items */
  const deleteInvoice = useCallback(async (id: string): Promise<void> => {
    const { error } = await supabase.from('invoices').delete().eq('id', id);
    if (error) { console.error('deleteInvoice error:', error); throw error; }
    setInvoices(prev => prev.filter(inv => inv.id !== id));
  }, []);

  return { invoices, loading, fetchInvoices, updateInvoiceStatus, deleteInvoice };
}
