import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface InvoiceSummary {
  id: string;
  invoice_number: string;
  status: string;
  total_amount: number;
  period_start: string;
  period_end: string;
  created_at: string;
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
      .select('id, invoice_number, status, total_amount, period_start, period_end, created_at')
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

  return { invoices, loading, fetchInvoices };
}
