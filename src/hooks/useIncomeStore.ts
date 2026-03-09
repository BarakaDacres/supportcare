import { useState, useEffect, useCallback } from 'react';
import { safeNum } from '@/lib/formatUtils';
import { getWeekRangesForMonth } from '@/lib/dateUtils';

export type EntryMode = 'weekly' | 'fortnightly';

interface StoreState {
  year: number;
  month: number;
  mode: EntryMode;
  taxRate: number;
  weeklyEntries: Record<string, Record<string, number[]>>; // \"2026\" -> \"3\" -> [w1, w2, ...]
  fortnightlyEntries: Record<string, Record<string, number[]>>;
  lockedMonths: Record<string, string[]>; // \"2026\" -> ["0","3",...]
  theme: 'light' | 'dark';
}

const STORAGE_KEY = 'income-ledger-data';

function loadState(): StoreState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Determine default mode: if weekly data exists for current month, default to weekly
      return { ...defaultState(), ...parsed };
    }
  } catch { /* ignore */ }
  return defaultState();
}

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
    theme: 'light',
  };
}

export function useIncomeStore() {
  const [state, setState] = useState<StoreState>(loadState);

  // Persist on every change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Apply theme class
  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.theme === 'dark');
  }, [state.theme]);

  // Determine mode on year/month change
  useEffect(() => {
    const weeklyData = state.weeklyEntries[state.year]?.[state.month];
    if (weeklyData && weeklyData.some(v => v > 0)) {
      // Keep whatever mode user has selected - don't force
    }
  }, [state.year, state.month]);

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
          [yearKey]: {
            ...prev.weeklyEntries[yearKey],
            [monthKey]: updated,
          },
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
          [yearKey]: {
            ...prev.fortnightlyEntries[yearKey],
            [monthKey]: updated,
          },
        },
      };
    });
  }, []);

  const getMonthGross = useCallback((year: number, month: number): number => {
    const yearKey = String(year);
    const monthKey = String(month);
    const weekly = state.weeklyEntries[yearKey]?.[monthKey] || [];
    const fortnightly = state.fortnightlyEntries[yearKey]?.[monthKey] || [];
    
    // If in fortnightly mode and fortnightly entries exist, use those
    // Otherwise sum weekly
    if (fortnightly.some(v => v > 0)) {
      // Use fortnightly where explicitly set, else derive from weekly
      const weeks = getWeekRangesForMonth(year, month);
      let total = 0;
      for (let fi = 0; fi < Math.ceil(weeks.length / 2); fi++) {
        const fnVal = fortnightly[fi];
        if (fnVal && fnVal > 0) {
          total += fnVal;
        } else {
          const w1 = safeNum(weekly[fi * 2]);
          const w2 = safeNum(weekly[fi * 2 + 1]);
          total += w1 + w2;
        }
      }
      return total;
    }

    return weekly.reduce((s, v) => s + safeNum(v), 0);
  }, [state.weeklyEntries, state.fortnightlyEntries]);

  const getYearGross = useCallback((year: number): number => {
    let total = 0;
    for (let m = 0; m < 12; m++) {
      total += getMonthGross(year, m);
    }
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

  const toggleTheme = useCallback(() => {
    setState(prev => ({ ...prev, theme: prev.theme === 'light' ? 'dark' : 'light' }));
  }, []);

  return {
    ...state,
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
