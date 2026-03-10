
-- Extend clients table with shift defaults and billing info
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS default_service_note text,
  ADD COLUMN IF NOT EXISTS default_start_time time without time zone,
  ADD COLUMN IF NOT EXISTS default_end_time time without time zone,
  ADD COLUMN IF NOT EXISTS default_is_sleepover boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoice_label text,
  ADD COLUMN IF NOT EXISTS invoice_notes text,
  ADD COLUMN IF NOT EXISTS participant_number text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address text;
