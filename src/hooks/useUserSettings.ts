import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { PayRates } from '@/lib/shiftCalculator';

export interface UserSettings {
  id: string;
  user_id: string;
  business_name: string | null;
  abn: string | null;
  bank_name: string | null;
  bsb: string | null;
  account_number: string | null;
  invoice_notes: string | null;
  tax_rate: number;
  show_tax_estimate: boolean;
  weekly_goal: number | null;
  monthly_goal: number | null;
  yearly_goal: number | null;
  rate_weekday: number;
  rate_saturday: number;
  rate_sunday: number;
  rate_sleepover_weekday: number;
  rate_sleepover_weekend: number;
  rate_public_holiday: number;
  rate_evening: number;
  invoice_counter: number;
}

export const DEFAULT_SETTINGS: Omit<UserSettings, 'id' | 'user_id'> = {
  business_name: null,
  abn: null,
  bank_name: null,
  bsb: null,
  account_number: null,
  invoice_notes: null,
  tax_rate: 30,
  show_tax_estimate: false,
  weekly_goal: null,
  monthly_goal: null,
  yearly_goal: null,
  rate_weekday: 60,
  rate_saturday: 75,
  rate_sunday: 90,
  rate_sleepover_weekday: 300,
  rate_sleepover_weekend: 350,
  rate_public_holiday: 150,
  rate_evening: 75,
  invoice_counter: 0,
};

export function useUserSettings() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  const fetchSettings = useCallback(async (userId?: string) => {
    const uid = userId ?? userIdRef.current;
    if (!uid) { setLoading(false); return; }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', uid)
        .maybeSingle();

      if (error) {
        console.error('fetchSettings error:', error);
        setLoading(false);
        return;
      }

      if (!data) {
        const { data: created, error: insertErr } = await supabase
          .from('user_settings')
          .insert({ user_id: uid })
          .select()
          .single();

        if (insertErr) {
          const { data: retry } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', uid)
            .maybeSingle();
          setSettings((retry ?? null) as UserSettings | null);
        } else {
          setSettings(created as UserSettings);
        }
      } else {
        setSettings(data as UserSettings);
      }
    } catch (e) {
      console.error('fetchSettings unexpected error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        userIdRef.current = session.user.id;
        fetchSettings(session.user.id);
      } else {
        userIdRef.current = null;
        setSettings(null);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        if (userIdRef.current !== session.user.id) {
          userIdRef.current = session.user.id;
          fetchSettings(session.user.id);
        }
      } else {
        userIdRef.current = null;
        setSettings(null);
        setLoading(false);
      }
    });

    const onFocus = () => {
      if (userIdRef.current) fetchSettings(userIdRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && userIdRef.current) {
        fetchSettings(userIdRef.current);
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    const staleTimer = setTimeout(() => {
      if (userIdRef.current) fetchSettings(userIdRef.current);
    }, 10_000);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(staleTimer);
    };
  }, [fetchSettings]);

  const updateSettings = useCallback(async (updates: Partial<Omit<UserSettings, 'id' | 'user_id'>>): Promise<void> => {
    const uid = userIdRef.current;
    if (!uid || !settings) return;

    const { data, error } = await supabase
      .from('user_settings')
      .update(updates)
      .eq('user_id', uid)
      .select()
      .single();

    if (error) { console.error(error); return; }
    setSettings(data as UserSettings);
  }, [settings]);

  const incrementInvoiceCounter = useCallback(async (): Promise<number> => {
    if (!settings) return 1;
    const next = (settings.invoice_counter ?? 0) + 1;
    await updateSettings({ invoice_counter: next });
    return next;
  }, [settings, updateSettings]);

  const getRates = useCallback((): PayRates => ({
    rate_weekday: settings?.rate_weekday ?? 60,
    rate_saturday: settings?.rate_saturday ?? 75,
    rate_sunday: settings?.rate_sunday ?? 90,
    rate_sleepover_weekday: settings?.rate_sleepover_weekday ?? 300,
    rate_sleepover_weekend: settings?.rate_sleepover_weekend ?? 350,
    rate_public_holiday: settings?.rate_public_holiday ?? 150,
    rate_evening: settings?.rate_evening ?? 75,
  }), [settings]);

  return { settings, loading, fetchSettings, updateSettings, incrementInvoiceCounter, getRates };
}
