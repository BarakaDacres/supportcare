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
  notes?: string | null;
  fee_override?: number | null;
}

function mapShiftRow(row: Record<string, unknown>): Shift {
  return {
    ...(row as Omit<Shift, 'client_name'>),
    fee_override: row.fee_override != null ? Number(row.fee_override) : null,
    is_public_holiday: Boolean(row.is_public_holiday),
    client_name: (row.clients as { name: string } | null)?.name ?? null,
  };
}

/** Returns the effective gross pay — override takes precedence over calculated */
export function effectiveGrossPay(shift: Shift): number {
  if (shift.fee_override != null && shift.fee_override > 0) return shift.fee_override;
  return Number(shift.gross_pay);
}

/** Wraps a promise with an explicit timeout so loading never hangs forever */
function withTimeout<T>(promise: Promise<T>, ms = 12000): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('Request timed out. Check your connection.')), ms);
    promise.then(v => { clearTimeout(id); resolve(v); }, e => { clearTimeout(id); reject(e); });
  });
}

export function useShifts(rates: PayRates = DEFAULT_RATES) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);

  const fetchShifts = useCallback(async (userId?: string, showLoading = false) => {
    const uid = userId ?? userIdRef.current;
    if (!uid) {
      setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    setError(null);

    try {
      const { data, error: err } = await withTimeout(
        supabase
          .from('shifts')
          .select(`*, clients (name)`)
          .order('date', { ascending: false })
          .order('start_time', { ascending: false })
      );

      if (err) {
        setError(err.message);
        return;
      }

      setShifts((data ?? []).map(row => mapShiftRow(row as Record<string, unknown>)));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load shifts.';
      setError(msg);
      console.error('[useShifts] fetchShifts:', msg);
    } finally {
      setLoading(false);
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

  const addShift = useCallback(async (shift: NewShift): Promise<Shift> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not logged in. Please sign in and try again.');

    const isPublicHoliday = shift.is_public_holiday ?? false;
    const calc = calculateShiftPay(shift.date, shift.start_time, shift.end_time, shift.is_sleepover, rates, isPublicHoliday);
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
          notes: shift.notes ?? null,
          hours_worked: calc.hoursWorked,
          gross_pay: grossPay,
          fee_override: feeOverride,
        })
        .select(`*, clients(name)`)
        .single()
    );

    if (err) {
      console.error('addShift error:', err);
      throw new Error(err.message ?? 'Failed to save shift.');
    }
    const newShift = mapShiftRow(data as Record<string, unknown>);
    setShifts(prev => [newShift, ...prev]);
    return newShift;
  }, [rates]);

  const updateShift = useCallback(async (id: string, shift: Partial<NewShift>): Promise<void> => {
    const existing = shifts.find(s => s.id === id);
    if (!existing) return;

    const merged = {
      date: shift.date ?? existing.date,
      start_time: shift.start_time ?? existing.start_time,
      end_time: shift.end_time ?? existing.end_time,
      is_sleepover: shift.is_sleepover !== undefined ? shift.is_sleepover : existing.is_sleepover,
      is_public_holiday: shift.is_public_holiday !== undefined ? shift.is_public_holiday : existing.is_public_holiday,
    };
    const calc = calculateShiftPay(merged.date, merged.start_time, merged.end_time, merged.is_sleepover, rates, merged.is_public_holiday);

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
          hours_worked: calc.hoursWorked,
          gross_pay: grossPay,
          fee_override: feeOverride,
        })
        .eq('id', id)
        .select(`*, clients(name)`)
        .single()
    );

    if (err) { console.error('[useShifts] updateShift:', err); throw new Error(err.message); }
    setShifts(prev => prev.map(s => s.id === id ? mapShiftRow(data as Record<string, unknown>) : s));
  }, [shifts, rates]);

  const deleteShift = useCallback(async (id: string): Promise<void> => {
    // Optimistic update
    setShifts(prev => prev.filter(s => s.id !== id));
    const { error: err } = await withTimeout(supabase.from('shifts').delete().eq('id', id));
    if (err) {
      console.error('[useShifts] deleteShift:', err);
      // Revert on error
      fetchShifts(userIdRef.current ?? undefined, false);
    }
  }, [fetchShifts]);

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
      notes: shift.notes,
    });
  }, [shifts, addShift]);

  return { shifts, loading, error, fetchShifts, addShift, updateShift, deleteShift, duplicateShift };
}
