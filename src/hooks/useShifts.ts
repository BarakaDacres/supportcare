import { useState, useEffect, useCallback, useRef } from 'react';
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
  is_public_holiday: boolean;
  is_overtime: boolean;
  notes: string | null;
  hours_worked: number;
  gross_pay: number;
  fee_override: number | null;
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
  is_public_holiday?: boolean;
  is_overtime?: boolean;
  notes?: string | null;
  fee_override?: number | null;
}

function mapShiftRow(row: Record<string, unknown>): Shift {
  return {
    ...(row as Omit<Shift, 'client_name'>),
    fee_override: row.fee_override != null ? Number(row.fee_override) : null,
    is_public_holiday: Boolean(row.is_public_holiday),
    is_overtime: Boolean(row.is_overtime),
    client_name: (row.clients as { name: string } | null)?.name ?? null,
  };
}

/** Returns the effective gross pay — override takes precedence over calculated */
export function effectiveGrossPay(shift: Shift): number {
  if (shift.fee_override != null && shift.fee_override > 0) return shift.fee_override;
  return Number(shift.gross_pay);
}

/** Wraps a thenable with a timeout so Supabase fetches never hang forever */
async function withTimeout<T>(thenable: PromiseLike<T>, ms = 12000): Promise<T> {
  return Promise.race([
    Promise.resolve(thenable),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Request timed out. Check your connection.')), ms)),
  ]);
}

export function useShifts(rates: PayRates = DEFAULT_RATES) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const requestVersionRef = useRef(0);

  const fetchShifts = useCallback(async (userId?: string, showLoading = false) => {
    const uid = userId ?? userIdRef.current;
    if (!uid) {
      setLoading(false);
      return;
    }
    const requestVersion = ++requestVersionRef.current;
    if (showLoading) setLoading(true);
    setError(null);

    try {
      const { data, error: err } = await withTimeout(
        supabase
          .from('shifts')
          .select(`*, clients (name)`)
          .order('date', { ascending: false })
          .order('start_time', { ascending: false })
          .then(r => r)
      );

      if (err) {
        if (requestVersion !== requestVersionRef.current) return;
        setError(err.message);
        return;
      }

      if (requestVersion !== requestVersionRef.current) return;
      setShifts((data ?? []).map(row => mapShiftRow(row as Record<string, unknown>)));
    } catch (e: unknown) {
      if (requestVersion !== requestVersionRef.current) return;
      const msg = e instanceof Error ? e.message : 'Failed to load shifts.';
      setError(msg);
      console.error('[useShifts] fetchShifts:', msg);
    } finally {
      if (requestVersion === requestVersionRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        userIdRef.current = session.user.id;
        initializedRef.current = true;
        fetchShifts(session.user.id, true);
      } else {
        userIdRef.current = null;
        setShifts([]);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        const uid = session.user.id;
        if (userIdRef.current !== uid || !initializedRef.current) {
          userIdRef.current = uid;
          initializedRef.current = true;
          fetchShifts(uid, true);
        }
      } else {
        userIdRef.current = null;
        initializedRef.current = false;
        setShifts([]);
        setLoading(false);
        if (realtimeChannel) {
          supabase.removeChannel(realtimeChannel);
          realtimeChannel = null;
        }
      }
    });

    realtimeChannel = supabase
      .channel('shifts-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts' },
        () => {
          if (userIdRef.current) fetchShifts(userIdRef.current, false);
        }
      )
      .subscribe();

    const onFocus = () => {
      if (userIdRef.current) fetchShifts(userIdRef.current, false);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && userIdRef.current) {
        fetchShifts(userIdRef.current, false);
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      subscription.unsubscribe();
      if (realtimeChannel) supabase.removeChannel(realtimeChannel);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchShifts]);

  const addShift = useCallback(async (shift: NewShift, ratesOverride?: PayRates): Promise<Shift> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not logged in. Please sign in and try again.');
    requestVersionRef.current += 1;

    const effectiveRates = ratesOverride ?? rates;
    const isPublicHoliday = shift.is_public_holiday ?? false;
    const isOvertime = shift.is_overtime ?? false;
    const calc = calculateShiftPay(shift.date, shift.start_time, shift.end_time, shift.is_sleepover, effectiveRates, isPublicHoliday, isOvertime);
    const feeOverride = shift.fee_override != null && shift.fee_override > 0 ? shift.fee_override : null;
    const grossPay = feeOverride ?? calc.grossPay;

    const { data, error: err } = await withTimeout(
      supabase
        .from('shifts')
        .insert({
          user_id: session.user.id,
          client_id: shift.client_id ?? null,
          date: shift.date,
          start_time: shift.start_time,
          end_time: shift.end_time,
          is_sleepover: shift.is_sleepover,
          is_public_holiday: isPublicHoliday,
          is_overtime: isOvertime,
          notes: shift.notes ?? null,
          hours_worked: calc.hoursWorked,
          gross_pay: grossPay,
          fee_override: feeOverride,
        })
        .select(`*, clients(name)`)
        .single()
        .then(r => r)
    );

    if (err) {
      console.error('addShift error:', err);
      throw new Error(err.message ?? 'Failed to save shift.');
    }
    const newShift = mapShiftRow(data as Record<string, unknown>);
    setShifts(prev => [newShift, ...prev]);
    return newShift;
  }, [rates]);

  const updateShift = useCallback(async (id: string, shift: Partial<NewShift>, ratesOverride?: PayRates): Promise<void> => {
    const existing = shifts.find(s => s.id === id);
    if (!existing) return;
    requestVersionRef.current += 1;

    const effectiveRates = ratesOverride ?? rates;
    const merged = {
      date: shift.date ?? existing.date,
      start_time: shift.start_time ?? existing.start_time,
      end_time: shift.end_time ?? existing.end_time,
      is_sleepover: shift.is_sleepover !== undefined ? shift.is_sleepover : existing.is_sleepover,
      is_public_holiday: shift.is_public_holiday !== undefined ? shift.is_public_holiday : existing.is_public_holiday,
      is_overtime: shift.is_overtime !== undefined ? shift.is_overtime : existing.is_overtime,
    };
    const calc = calculateShiftPay(merged.date, merged.start_time, merged.end_time, merged.is_sleepover, effectiveRates, merged.is_public_holiday, merged.is_overtime);

    const feeOverride = shift.fee_override !== undefined
      ? (shift.fee_override != null && shift.fee_override > 0 ? shift.fee_override : null)
      : existing.fee_override;

    const grossPay = feeOverride ?? calc.grossPay;

    const { data, error: err } = await withTimeout(
      supabase
        .from('shifts')
        .update({
          ...shift,
          is_public_holiday: merged.is_public_holiday,
          is_overtime: merged.is_overtime,
          hours_worked: calc.hoursWorked,
          gross_pay: grossPay,
          fee_override: feeOverride,
        })
        .eq('id', id)
        .select(`*, clients(name)`)
        .single()
        .then(r => r)
    );

    if (err) { console.error('[useShifts] updateShift:', err); throw new Error(err.message); }
    setShifts(prev => prev.map(s => s.id === id ? mapShiftRow(data as Record<string, unknown>) : s));
  }, [shifts, rates]);

  const deleteShift = useCallback(async (id: string): Promise<void> => {
    requestVersionRef.current += 1;
    // Optimistic update
    setShifts(prev => prev.filter(s => s.id !== id));

    const { error: detachError } = await withTimeout(
      supabase
        .from('invoice_items')
        .update({ shift_id: null })
        .eq('shift_id', id)
        .then(r => r)
    );

    if (detachError) {
      console.error('[useShifts] detachInvoiceItemsForShift:', detachError);
      fetchShifts(userIdRef.current ?? undefined, false);
      return;
    }

    const { error: err } = await withTimeout(supabase.from('shifts').delete().eq('id', id).then(r => r));
    if (err) {
      console.error('[useShifts] deleteShift:', err);
      // Revert on error
      fetchShifts(userIdRef.current ?? undefined, false);
    }
  }, [fetchShifts]);

  const deleteShiftsByClient = useCallback(async (clientId: string): Promise<void> => {
    const linkedShiftIds = shifts.filter(shift => shift.client_id === clientId).map(shift => shift.id);

    requestVersionRef.current += 1;
    setShifts(prev => prev.filter(shift => shift.client_id !== clientId));

    if (linkedShiftIds.length > 0) {
      const { error: detachError } = await withTimeout(
        supabase
          .from('invoice_items')
          .update({ shift_id: null })
          .in('shift_id', linkedShiftIds)
          .then(r => r)
      );

      if (detachError) {
        console.error('[useShifts] detachInvoiceItemsForClient:', detachError);
        fetchShifts(userIdRef.current ?? undefined, false);
        return;
      }
    }

    const { error: err } = await withTimeout(
      supabase
        .from('shifts')
        .delete()
        .eq('client_id', clientId)
        .then(r => r)
    );

    if (err) {
      console.error('[useShifts] deleteShiftsByClient:', err);
      fetchShifts(userIdRef.current ?? undefined, false);
    }
  }, [fetchShifts, shifts]);

  const duplicateShift = useCallback(async (id: string): Promise<void> => {
    const shift = shifts.find(s => s.id === id);
    if (!shift) return;
    await addShift({
      client_id: shift.client_id,
      date: shift.date,
      start_time: shift.start_time,
      end_time: shift.end_time,
      is_sleepover: shift.is_sleepover,
      is_public_holiday: shift.is_public_holiday,
      is_overtime: shift.is_overtime,
      notes: shift.notes,
    });
  }, [shifts, addShift]);

  return { shifts, loading, error, fetchShifts, addShift, updateShift, deleteShift, deleteShiftsByClient, duplicateShift };
}
