import { useState, useEffect, useCallback } from 'react';
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

  const fetchClients = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('clients')
      .select('*')
      .order('name');
    setClients((data ?? []) as Client[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchClients();
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
