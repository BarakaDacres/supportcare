import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  displayName: string | null;
  avatarUrl: string | null;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    displayName: null,
    avatarUrl: null,
  });

  useEffect(() => {
    // Subscribe first to avoid missing events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setState(prev => ({ ...prev, session, user: session?.user ?? null, loading: false }));
      if (session?.user) {
        // fetch profile asynchronously
        const { data } = await supabase
          .from('profiles')
          .select('display_name, avatar_url')
          .eq('user_id', session.user.id)
          .maybeSingle();
        setState(prev => ({
          ...prev,
          displayName: data?.display_name ?? null,
          avatarUrl: data?.avatar_url ?? null,
        }));
      } else {
        setState(prev => ({ ...prev, displayName: null, avatarUrl: null }));
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setState(prev => ({
        ...prev,
        session: data.session,
        user: data.session?.user ?? null,
        loading: false,
      }));
    });

    return () => subscription.unsubscribe();
  }, []);

  return state;
}
