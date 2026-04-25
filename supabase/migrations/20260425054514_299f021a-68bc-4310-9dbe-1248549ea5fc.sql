ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS rate_sleepover_public_holiday numeric NOT NULL DEFAULT 400;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS rate_sleepover_public_holiday numeric;