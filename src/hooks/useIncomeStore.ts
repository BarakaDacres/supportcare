import { useState, useEffect, useCallback } from 'react';
import { loadCloudData, debouncedSave } from '@/lib/supabaseStore';
import { supabase } from '@/integrations/supabase/client';

interface StoreState {
  year: number;
  month: number;
  taxRate: number;
  lockedMonths: Record<string, string[]>;
  /**
   * 'light' | 'dark'  → explicit user override
   * 'system'           → follow prefers-color-scheme (default)
   */
  themeOverride: 'light' | 'dark' | 'system';
  /** @deprecated kept for migration only */
  theme?: 'light' | 'dark';
}

const STORAGE_KEY = 'income-ledger-data';

function defaultState(): StoreState {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth(),
    taxRate: 30,
    lockedMonths: {},
    themeOverride: 'system',
  };
}

/**
 * Always reset year+month to the current calendar month on load
 * so the home page defaults to "now" regardless of what was persisted.
 */
function forceCurrentMonth(state: StoreState): StoreState {
  const now = new Date();
  return { ...state, year: now.getFullYear(), month: now.getMonth() };
}

function resolveTheme(override: 'light' | 'dark' | 'system'): 'light' | 'dark' {
  if (override === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return override;
}

function loadLocalState(): StoreState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = { ...defaultState(), ...parsed };
    // Migrate legacy 'theme' key → themeOverride
    if (base.themeOverride === 'system' && parsed.theme && !parsed.themeOverride) {
      base.themeOverride = parsed.theme as 'light' | 'dark';
    }
    return base;
  } catch { /* ignore */ }
  return defaultState();
}

export function useIncomeStore() {
  const [state, setState] = useState<StoreState>(() => forceCurrentMonth(loadLocalState()));
  const [cloudSynced, setCloudSynced] = useState(false);

  // On mount: if user is signed in, load cloud data
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session || cancelled) return;

      const cloud = await loadCloudData();
      if (cancelled) return;

      if (cloud && Object.keys(cloud).length > 0) {
        // Merge cloud data but always keep year/month at current calendar month
        const now = new Date();
        setState(prev => ({ ...prev, ...(cloud as Partial<StoreState>), year: now.getFullYear(), month: now.getMonth() }));
      } else {
        const local = loadLocalState();
        const { data: { session } } = await supabase.auth.getSession();
        if (session) debouncedSave(local as unknown as Record<string, unknown>);
      }
      setCloudSynced(true);
    };
    init();
    return () => { cancelled = true; };
  }, []);

  // Re-sync when auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        const cloud = await loadCloudData();
        if (cloud && Object.keys(cloud).length > 0) {
          setState(prev => ({ ...prev, ...(cloud as Partial<StoreState>) }));
        } else {
          const local = loadLocalState();
          debouncedSave(local as unknown as Record<string, unknown>);
        }
        setCloudSynced(true);
      } else if (event === 'SIGNED_OUT') {
        setCloudSynced(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Persist to localStorage on every change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Persist to cloud (debounced) when synced
  useEffect(() => {
    if (cloudSynced) {
      debouncedSave(state as unknown as Record<string, unknown>);
    }
  }, [state, cloudSynced]);

  // Apply theme class whenever themeOverride changes
  useEffect(() => {
    const applyTheme = () => {
      const isDark = state.themeOverride === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : state.themeOverride === 'dark';
      document.documentElement.classList.toggle('dark', isDark);
      window.dispatchEvent(new CustomEvent('theme-sync'));
    };

    applyTheme();

    if (state.themeOverride === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', applyTheme);
      return () => mq.removeEventListener('change', applyTheme);
    }
  }, [state.themeOverride]);

  const update = useCallback((partial: Partial<StoreState>) => {
    setState(prev => ({ ...prev, ...partial }));
  }, []);

  const isMonthLocked = useCallback((year: number, month: number): boolean => {
    return state.lockedMonths[String(year)]?.includes(String(month)) || false;
  }, [state.lockedMonths]);

  const toggleMonthLock = useCallback(() => {
    setState(prev => {
      const yearKey = String(prev.year);
      const monthKey = String(prev.month);
      const current = prev.lockedMonths[yearKey] || [];
      const isLocked = current.includes(monthKey);
      return {
        ...prev,
        lockedMonths: {
          ...prev.lockedMonths,
          [yearKey]: isLocked
            ? current.filter(m => m !== monthKey)
            : [...current, monthKey],
        },
      };
    });
  }, []);

  /**
   * Cycles: system → light → dark → system
   */
  const toggleTheme = useCallback(() => {
    setState(prev => {
      const next: Record<string, 'light' | 'dark' | 'system'> = {
        system: 'light',
        light: 'dark',
        dark: 'system',
      };
      return { ...prev, themeOverride: next[prev.themeOverride] ?? 'system' };
    });
  }, []);

  const theme: 'light' | 'dark' = resolveTheme(state.themeOverride);

  return {
    ...state,
    theme,
    cloudSynced,
    update,
    isMonthLocked,
    toggleMonthLock,
    toggleTheme,
  };
}
