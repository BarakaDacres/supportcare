import { useState, useEffect, useCallback } from 'react';
import { safeNum } from '@/lib/formatUtils';
import { getWeekRangesForMonth } from '@/lib/dateUtils';
import { loadCloudData, debouncedSave } from '@/lib/supabaseStore';
import { supabase } from '@/integrations/supabase/client';

export type EntryMode = 'weekly' | 'fortnightly';

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
    mode: 'weekly',
    taxRate: 30,
    weeklyEntries: {},
    fortnightlyEntries: {},
    lockedMonths: {},
    themeOverride: 'system',
  };
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
    // Migrate legacy 'theme' key → themeOverride (only if no themeOverride exists yet)
    if (base.themeOverride === 'system' && parsed.theme && !parsed.themeOverride) {
      base.themeOverride = parsed.theme as 'light' | 'dark';
    }
    return base;
  } catch { /* ignore */ }
  return defaultState();
}

export function useIncomeStore() {
  const [state, setState] = useState<StoreState>(loadLocalState);
  const [cloudSynced, setCloudSynced] = useState(false);

  // On mount: if user is signed in, load cloud data (migrate local if cloud empty)
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session || cancelled) return;

      const cloud = await loadCloudData();
      if (cancelled) return;

      if (cloud && Object.keys(cloud).length > 0) {
        setState(prev => ({ ...prev, ...(cloud as Partial<StoreState>) }));
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

  // Re-sync when auth state changes (login/logout)
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

  // Apply theme class whenever themeOverride changes or system preference fires
  useEffect(() => {
    const applyTheme = () => {
      const isDark = state.themeOverride === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : state.themeOverride === 'dark';
      document.documentElement.classList.toggle('dark', isDark);
      window.dispatchEvent(new CustomEvent('theme-sync'));
    };

    applyTheme();

    // Also respond to OS-level changes when override is 'system'
    if (state.themeOverride === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', applyTheme);
      return () => mq.removeEventListener('change', applyTheme);
    }
  }, [state.themeOverride]);

  const update = useCallback((partial: Partial<StoreState>) => {
    setState(prev => ({ ...prev, ...partial }));
  }, []);

  const setWeeklyValue = useCallback((weekIndex: number, value: number) => {
    setState(prev => {
      const yearKey = String(prev.year);
      const monthKey = String(prev.month);
      const weeks = getWeekRangesForMonth(prev.year, prev.month);
      const current = prev.weeklyEntries[yearKey]?.[monthKey] || new Array(weeks.length).fill(0);
      const updated = [...current];
      updated[weekIndex] = safeNum(value);
      return {
        ...prev,
        weeklyEntries: {
          ...prev.weeklyEntries,
          [yearKey]: { ...prev.weeklyEntries[yearKey], [monthKey]: updated },
        },
      };
    });
  }, []);

  const setFortnightlyValue = useCallback((fnIndex: number, value: number) => {
    setState(prev => {
      const yearKey = String(prev.year);
      const monthKey = String(prev.month);
      const current = prev.fortnightlyEntries[yearKey]?.[monthKey] || [];
      const updated = [...current];
      while (updated.length <= fnIndex) updated.push(0);
      updated[fnIndex] = safeNum(value);
      return {
        ...prev,
        fortnightlyEntries: {
          ...prev.fortnightlyEntries,
          [yearKey]: { ...prev.fortnightlyEntries[yearKey], [monthKey]: updated },
        },
      };
    });
  }, []);

  const getMonthGross = useCallback((year: number, month: number): number => {
    const yearKey = String(year);
    const monthKey = String(month);
    const weekly = state.weeklyEntries[yearKey]?.[monthKey] || [];
    const fortnightly = state.fortnightlyEntries[yearKey]?.[monthKey] || [];

    if (fortnightly.some(v => v > 0)) {
      const weeks = getWeekRangesForMonth(year, month);
      let total = 0;
      for (let fi = 0; fi < Math.ceil(weeks.length / 2); fi++) {
        const fnVal = fortnightly[fi];
        if (fnVal && fnVal > 0) {
          total += fnVal;
        } else {
          total += safeNum(weekly[fi * 2]) + safeNum(weekly[fi * 2 + 1]);
        }
      }
      return total;
    }
    return weekly.reduce((s, v) => s + safeNum(v), 0);
  }, [state.weeklyEntries, state.fortnightlyEntries]);

  const getYearGross = useCallback((year: number): number => {
    let total = 0;
    for (let m = 0; m < 12; m++) total += getMonthGross(year, m);
    return total;
  }, [getMonthGross]);

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
   * This lets users override, or reset back to system-follow.
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

  // Derived theme for consumers that need 'light' | 'dark' (e.g. MobileHeader icon)
  const theme: 'light' | 'dark' = resolveTheme(state.themeOverride);

  return {
    ...state,
    theme,
    cloudSynced,
    update,
    setWeeklyValue,
    setFortnightlyValue,
    getMonthGross,
    getYearGross,
    isMonthLocked,
    toggleMonthLock,
    toggleTheme,
  };
}
