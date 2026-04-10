
-- Add new columns
ALTER TABLE public.clients ADD COLUMN service_address text;
ALTER TABLE public.clients ADD COLUMN billing_address text;
ALTER TABLE public.clients ADD COLUMN use_plan_manager boolean NOT NULL DEFAULT false;

-- Migrate existing address data to service_address
UPDATE public.clients SET service_address = address WHERE address IS NOT NULL;

-- Drop old address column
ALTER TABLE public.clients DROP COLUMN address;
