import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  displayName: string | null;
  avatarUrl: string | null;
}

async function fetchProfile(user: User): Promise<{ displayName: string | null; avatarUrl: string | null }> {
  const { data } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('user_id', user.id)
    .maybeSingle();

  // Fallback chain for display name: profile row → auth metadata full_name → auth metadata name → email prefix
  const displayName =
    data?.display_name ||
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    user.email?.split('@')[0] ||
    null;

  // Fallback chain for avatar: profile row → auth metadata avatar_url → auth metadata picture
  const avatarUrl =
    data?.avatar_url ||
    (user.user_metadata?.avatar_url as string | undefined) ||
    (user.user_metadata?.picture as string | undefined) ||
    null;

  return { displayName, avatarUrl };
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    displayName: null,
    avatarUrl: null,
  });

  const hydrateUser = useCallback(async (session: Session | null) => {
    if (!session?.user) {
      setState({ user: null, session: null, loading: false, displayName: null, avatarUrl: null });
      return;
    }
    // Set user immediately so UI unblocks, then hydrate profile
    setState(prev => ({ ...prev, user: session.user, session, loading: false }));
    const profile = await fetchProfile(session.user);
    setState(prev => ({ ...prev, ...profile }));
  }, []);

  useEffect(() => {
    let cancelled = false;

    // 1. Restore session from storage immediately
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) hydrateUser(data.session);
    });

    // 2. Subscribe to all subsequent auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) hydrateUser(session);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [hydrateUser]);

  return state;
}
