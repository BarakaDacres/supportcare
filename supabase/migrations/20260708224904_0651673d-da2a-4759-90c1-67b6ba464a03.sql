ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS rate_overtime numeric NOT NULL DEFAULT 90;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS rate_overtime numeric;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS is_overtime boolean NOT NULL DEFAULT false;