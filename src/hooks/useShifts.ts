import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { calculateShiftPay, DEFAULT_RATES, type PayRates } from '@/lib/shiftCalculator';

export interface Shift {
  id: string;
  user_id: string;
  client_id: string | null;
  date: string;
  start_time: string;
  end_time: string;
  is_sleepover: boolean;
  notes: string | null;
  hours_worked: number;
  gross_pay: number;
  created_at: string;
  updated_at: string;
  // joined
  client_name?: string | null;
}

export interface NewShift {
  client_id?: string | null;
  date: string;
  start_time: string;
  end_time: string;
  is_sleepover: boolean;
  notes?: string | null;
}

export function useShifts(rates: PayRates = DEFAULT_RATES) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track whether the auth session has been resolved so we don't
  // fire the initial fetch before auth.uid() is available (which
  // would cause RLS to return 0 rows on page reload).
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    // Resolve the session once, then mark auth as ready
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setAuthReady(true);
      } else {
        // Not logged in — nothing to load
        setLoading(false);
      }
    });

    // Also respond to sign-in events (e.g. user logs in after mount)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setAuthReady(true);
      } else {
        setAuthReady(false);
        setShifts([]);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchShifts = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('shifts')
      .select(`
        *,
        clients (name)
      `)
      .order('date', { ascending: false })
      .order('start_time', { ascending: false });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    const mapped: Shift[] = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as Omit<Shift, 'client_name'>),
      client_name: (row.clients as { name: string } | null)?.name ?? null,
    }));
    setShifts(mapped);
    setLoading(false);
  }, []);

  // Only fetch once auth session is confirmed
  useEffect(() => {
    if (authReady) {
      fetchShifts();
    }
  }, [authReady, fetchShifts]);

  const addShift = useCallback(async (shift: NewShift): Promise<Shift> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not logged in. Please sign in and try again.');

    const calc = calculateShiftPay(shift.date, shift.start_time, shift.end_time, shift.is_sleepover, rates);

    const { data, error: err } = await supabase
      .from('shifts')
      .insert({
        user_id: session.user.id,
        client_id: shift.client_id ?? null,
        date: shift.date,
        start_time: shift.start_time,
        end_time: shift.end_time,
        is_sleepover: shift.is_sleepover,
        notes: shift.notes ?? null,
        hours_worked: calc.hoursWorked,
        gross_pay: calc.grossPay,
      })
      .select(`*, clients(name)`)
      .single();

    if (err) {
      console.error('addShift error:', err);
      throw new Error(err.message ?? 'Failed to save shift.');
    }
    const row = data as Record<string, unknown>;
    const newShift: Shift = {
      ...(row as Omit<Shift, 'client_name'>),
      client_name: (row.clients as { name: string } | null)?.name ?? null,
    };
    setShifts(prev => [newShift, ...prev]);
    return newShift;
  }, [rates]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateShift = useCallback(async (id: string, shift: Partial<NewShift>): Promise<void> => {
    const existing = shifts.find(s => s.id === id);
    if (!existing) return;

    const merged = {
      date: shift.date ?? existing.date,
      start_time: shift.start_time ?? existing.start_time,
      end_time: shift.end_time ?? existing.end_time,
      is_sleepover: shift.is_sleepover !== undefined ? shift.is_sleepover : existing.is_sleepover,
    };
    const calc = calculateShiftPay(merged.date, merged.start_time, merged.end_time, merged.is_sleepover, rates);

    const { data, error: err } = await supabase
      .from('shifts')
      .update({
        ...shift,
        hours_worked: calc.hoursWorked,
        gross_pay: calc.grossPay,
      })
      .eq('id', id)
      .select(`*, clients(name)`)
      .single();

    if (err) { console.error(err); return; }
    const row = data as Record<string, unknown>;
    const updated: Shift = {
      ...(row as Omit<Shift, 'client_name'>),
      client_name: (row.clients as { name: string } | null)?.name ?? null,
    };
    setShifts(prev => prev.map(s => s.id === id ? updated : s));
  }, [shifts, rates]);

  const deleteShift = useCallback(async (id: string): Promise<void> => {
    const { error: err } = await supabase.from('shifts').delete().eq('id', id);
    if (err) { console.error(err); return; }
    setShifts(prev => prev.filter(s => s.id !== id));
  }, []);

  const duplicateShift = useCallback(async (id: string): Promise<void> => {
    const shift = shifts.find(s => s.id === id);
    if (!shift) return;
    await addShift({
      client_id: shift.client_id,
      date: shift.date,
      start_time: shift.start_time,
      end_time: shift.end_time,
      is_sleepover: shift.is_sleepover,
      notes: shift.notes,
    });
  }, [shifts, addShift]);

  return {
    shifts,
    loading,
    error,
    fetchShifts,
    addShift,
    updateShift,
    deleteShift,
    duplicateShift,
  };
}
