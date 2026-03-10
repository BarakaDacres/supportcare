
-- Add extra fields to user_settings for full account profile
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS account_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address text;
