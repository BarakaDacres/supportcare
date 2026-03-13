
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS rate_evening numeric NOT NULL DEFAULT 75,
  ADD COLUMN IF NOT EXISTS show_tax_estimate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weekly_goal numeric NULL;
