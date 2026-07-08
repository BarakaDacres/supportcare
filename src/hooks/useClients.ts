import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Client {
  id: string;
  user_id: string;
  name: string;
  display_name: string | null;
  notes: string | null;
  active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  // Shift defaults
  default_service_note: string | null;
  default_start_time: string | null;
  default_end_time: string | null;
  default_is_sleepover: boolean;
  // Addresses
  service_address: string | null;
  billing_address: string | null;
  use_plan_manager: boolean;
  // Billing / participant details
  invoice_label: string | null;
  invoice_notes: string | null;
  participant_number: string | null;
  phone: string | null;
  organisation_name: string | null;
  billing_contact: string | null;
  email: string | null;
  // Custom rates
  use_custom_rates: boolean;
  rate_weekday: number | null;
  rate_saturday: number | null;
  rate_sunday: number | null;
  rate_evening: number | null;
  rate_sleepover_weekday: number | null;
  rate_sleepover_weekend: number | null;
  rate_public_holiday: number | null;
  rate_overtime: number | null;
}

/** Whether the client is archived */
export function isClientArchived(client: Client): boolean {
  return client.archived_at != null;
}

/** Get only active (non-archived) clients */
export function getActiveClients(clients: Client[]): Client[] {
  return clients.filter(c => !isClientArchived(c));
}

/** Get the effective billing address — falls back to service_address */
export function getEffectiveBillingAddress(client: Client): string {
  return client.billing_address || client.service_address || '';
}

export function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);
  const requestVersionRef = useRef(0);

  const fetchClients = useCallback(async (userId?: string, showLoading = false) => {
    const uid = userId ?? userIdRef.current;
    if (!uid) { setLoading(false); return; }
    const requestVersion = ++requestVersionRef.current;

    if (showLoading) setLoading(true);
    try {
      const { data, error } = await Promise.race([
        supabase.from('clients').select('*').order('name').then(r => r),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Clients request timed out')), 12000)),
      ]);

      if (requestVersion !== requestVersionRef.current) return;
      if (error) { console.error('fetchClients error:', error); }
      setClients((data ?? []) as Client[]);
    } catch (e) {
      if (requestVersion !== requestVersionRef.current) return;
      console.error('fetchClients timeout:', e);
    } finally {
      if (requestVersion === requestVersionRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        userIdRef.current = session.user.id;
        fetchClients(session.user.id, true);
      } else {
        userIdRef.current = null;
        setClients([]);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        if (userIdRef.current !== session.user.id) {
          userIdRef.current = session.user.id;
          fetchClients(session.user.id, true);
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

    realtimeChannel = supabase
      .channel('clients-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clients' },
        () => { if (userIdRef.current) fetchClients(userIdRef.current, false); }
      )
      .subscribe();

    const onFocus = () => { if (userIdRef.current) fetchClients(userIdRef.current, false); };
    window.addEventListener('focus', onFocus);

    return () => {
      subscription.unsubscribe();
      if (realtimeChannel) supabase.removeChannel(realtimeChannel);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchClients]);

  const addClient = useCallback(async (fields: Partial<Omit<Client, 'id' | 'user_id' | 'created_at' | 'updated_at'>> & { name: string }): Promise<Client | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated. Please sign in and try again.');
    requestVersionRef.current += 1;
    const { data, error } = await supabase
      .from('clients')
      .insert({ user_id: session.user.id, ...fields })
      .select()
      .single();
    if (error) { console.error(error); throw new Error(error.message ?? 'Failed to save client.'); }
    const client = data as Client;
    setClients(prev => [...prev, client].sort((a, b) => a.name.localeCompare(b.name)));
    return client;
  }, []);

  const updateClient = useCallback(async (id: string, updates: Partial<Omit<Client, 'id' | 'user_id' | 'created_at' | 'updated_at'>>): Promise<void> => {
    requestVersionRef.current += 1;
    const { data, error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) { console.error(error); throw new Error(error.message ?? 'Failed to update client.'); }
    const updated = data as Client;
    setClients(prev => prev.map(c => c.id === id ? updated : c));
  }, []);

  const archiveClient = useCallback(async (id: string): Promise<void> => {
    const archivedAt = new Date().toISOString();
    requestVersionRef.current += 1;
    const { error } = await supabase
      .from('clients')
      .update({ archived_at: archivedAt, active: false })
      .eq('id', id);
    if (error) { console.error(error); throw new Error(error.message); }
    setClients(prev => prev.map(c => c.id === id ? { ...c, archived_at: archivedAt, active: false } : c));
  }, []);

  const restoreClient = useCallback(async (id: string): Promise<void> => {
    requestVersionRef.current += 1;
    const { error } = await supabase
      .from('clients')
      .update({ archived_at: null, active: true })
      .eq('id', id);
    if (error) { console.error(error); throw new Error(error.message); }
    setClients(prev => prev.map(c => c.id === id ? { ...c, archived_at: null, active: true } : c));
  }, []);

  const deleteClient = useCallback(async (id: string): Promise<void> => {
    requestVersionRef.current += 1;
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) { console.error(error); return; }
    setClients(prev => prev.filter(c => c.id !== id));
  }, []);

  return { clients, loading, fetchClients, addClient, updateClient, deleteClient, archiveClient, restoreClient };
}
