ALTER TABLE public.clients
  ADD COLUMN archived_at timestamptz NULL DEFAULT NULL;