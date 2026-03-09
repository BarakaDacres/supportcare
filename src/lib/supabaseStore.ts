/**
 * Syncs income store data to Supabase `income_data` table.
 * Falls back gracefully when not authenticated.
 */
import { supabase } from '@/integrations/supabase/client';

const DEBOUNCE_MS = 1200;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export async function loadCloudData(): Promise<Record<string, unknown> | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;

  const userId = sessionData.session.user.id;
  const { data, error } = await supabase
    .from('income_data')
    .select('data')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) { console.error('[supabaseStore] load error', error); return null; }
  return (data?.data as Record<string, unknown>) ?? null;
}

export async function saveCloudData(state: Record<string, unknown>): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;

  const userId = sessionData.session.user.id;
  const { error } = await supabase
    .from('income_data')
    .upsert({ user_id: userId, data: state }, { onConflict: 'user_id' });

  if (error) console.error('[supabaseStore] save error', error);
}

export function debouncedSave(state: Record<string, unknown>): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveCloudData(state), DEBOUNCE_MS);
}
