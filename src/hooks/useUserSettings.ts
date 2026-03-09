import { useState, useEffect, useCallback } from 'react';
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
  monthly_goal: number | null;
  yearly_goal: number | null;
  rate_weekday: number;
  rate_saturday: number;
  rate_sunday: number;
  rate_sleepover_weekday: number;
  rate_sleepover_weekend: number;
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
  monthly_goal: null,
  yearly_goal: null,
  rate_weekday: 60,
  rate_saturday: 75,
  rate_sunday: 90,
  rate_sleepover_weekday: 300,
  rate_sleepover_weekend: 350,
  invoice_counter: 0,
};

export function useUserSettings() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  // Gate fetching until auth session is confirmed (prevents RLS returning 0 rows on reload)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setAuthReady(true);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setAuthReady(true);
      } else {
        setAuthReady(false);
        setSettings(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (error) {
        console.error('fetchSettings select error:', error);
        setLoading(false);
        return;
      }

      if (!data) {
        const { data: created, error: insertErr } = await supabase
          .from('user_settings')
          .insert({ user_id: session.user.id })
          .select()
          .single();

        if (insertErr) {
          const { data: retry } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', session.user.id)
            .maybeSingle();
          setSettings((retry ?? null) as UserSettings | null);
        } else {
          setSettings(created as UserSettings | null);
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
    if (authReady) {
      fetchSettings();
    }
  }, [authReady, fetchSettings]);

  const updateSettings = useCallback(async (updates: Partial<Omit<UserSettings, 'id' | 'user_id'>>): Promise<void> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !settings) return;

    const { data, error } = await supabase
      .from('user_settings')
      .update(updates)
      .eq('user_id', session.user.id)
      .select()
      .single();

    if (error) { console.error(error); return; }
    setSettings(data as UserSettings);
  }, [settings]);

  const incrementInvoiceCounter = useCallback(async (): Promise<number> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !settings) return 1;
    const next = (settings.invoice_counter ?? 0) + 1;
    await updateSettings({ invoice_counter: next });
    return next;
  }, [settings, updateSettings]);

  const getRates = useCallback((): PayRates => {
    return {
      rate_weekday: settings?.rate_weekday ?? 60,
      rate_saturday: settings?.rate_saturday ?? 75,
      rate_sunday: settings?.rate_sunday ?? 90,
      rate_sleepover_weekday: settings?.rate_sleepover_weekday ?? 300,
      rate_sleepover_weekend: settings?.rate_sleepover_weekend ?? 350,
    };
  }, [settings]);

  return { settings, loading, fetchSettings, updateSettings, incrementInvoiceCounter, getRates };
}
