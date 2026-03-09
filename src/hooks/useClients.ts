import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Client {
  id: string;
  user_id: string;
  name: string;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  const fetchClients = useCallback(async (userId?: string) => {
    const uid = userId ?? userIdRef.current;
    if (!uid) { setLoading(false); return; }

    setLoading(true);
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('name');

    if (error) { console.error('fetchClients error:', error); }
    setClients((data ?? []) as Client[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    // 1. Restore session from storage first
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        userIdRef.current = session.user.id;
        fetchClients(session.user.id);
      } else {
        userIdRef.current = null;
        setClients([]);
        setLoading(false);
      }
    });

    // 2. Listen for subsequent auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        if (userIdRef.current !== session.user.id) {
          userIdRef.current = session.user.id;
          fetchClients(session.user.id);
        }
      } else {
        userIdRef.current = null;
        setClients([]);
        setLoading(false);
        if (realtimeChannel) {
          supabase.removeChannel(realtimeChannel);
          realtimeChannel = null;
        }
      }
    });

    // 3. Realtime for cross-tab sync
    realtimeChannel = supabase
      .channel('clients-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clients' },
        () => { if (userIdRef.current) fetchClients(userIdRef.current); }
      )
      .subscribe();

    // 4. Refetch on window focus
    const onFocus = () => { if (userIdRef.current) fetchClients(userIdRef.current); };
    window.addEventListener('focus', onFocus);

    return () => {
      subscription.unsubscribe();
      if (realtimeChannel) supabase.removeChannel(realtimeChannel);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchClients]);

  const addClient = useCallback(async (name: string, notes?: string): Promise<Client | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const { data, error } = await supabase
      .from('clients')
      .insert({ user_id: session.user.id, name: name.trim(), notes: notes?.trim() || null })
      .select()
      .single();
    if (error) { console.error(error); return null; }
    const client = data as Client;
    setClients(prev => [...prev, client].sort((a, b) => a.name.localeCompare(b.name)));
    return client;
  }, []);

  const updateClient = useCallback(async (id: string, updates: { name?: string; notes?: string; active?: boolean }): Promise<void> => {
    const { data, error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) { console.error(error); return; }
    const updated = data as Client;
    setClients(prev => prev.map(c => c.id === id ? updated : c));
  }, []);

  const deleteClient = useCallback(async (id: string): Promise<void> => {
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) { console.error(error); return; }
    setClients(prev => prev.filter(c => c.id !== id));
  }, []);

  return { clients, loading, fetchClients, addClient, updateClient, deleteClient };
}
