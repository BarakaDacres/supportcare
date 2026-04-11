import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ShiftTemplate {
  id: string;
  user_id: string;
  name: string;
  shift_type: string;
  start_time: string;
  end_time: string;
  client_id: string | null;
  notes: string | null;
  is_sleepover: boolean;
  created_at: string;
  updated_at: string;
}

export interface NewShiftTemplate {
  name: string;
  shift_type: string;
  start_time: string;
  end_time: string;
  client_id?: string | null;
  notes?: string | null;
  is_sleepover: boolean;
}

export function useShiftTemplates() {
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('shift_templates')
      .select('*')
      .order('name');

    if (!error && data) setTemplates(data as unknown as ShiftTemplate[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const addTemplate = useCallback(async (t: NewShiftTemplate) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not logged in');

    const { data, error } = await supabase
      .from('shift_templates')
      .insert({ ...t, user_id: session.user.id })
      .select()
      .single();

    if (error) throw new Error(error.message);
    setTemplates(prev => [...prev, data as unknown as ShiftTemplate]);
    return data as unknown as ShiftTemplate;
  }, []);

  const updateTemplate = useCallback(async (id: string, updates: Partial<NewShiftTemplate>) => {
    const { error } = await supabase
      .from('shift_templates')
      .update(updates)
      .eq('id', id);

    if (error) throw new Error(error.message);
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, ...updates } as ShiftTemplate : t));
  }, []);

  const deleteTemplate = useCallback(async (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
    const { error } = await supabase.from('shift_templates').delete().eq('id', id);
    if (error) fetchTemplates();
  }, [fetchTemplates]);

  return { templates, loading, addTemplate, updateTemplate, deleteTemplate, fetchTemplates };
}
