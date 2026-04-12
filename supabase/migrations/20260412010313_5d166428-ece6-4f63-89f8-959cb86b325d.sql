
ALTER TABLE public.clients
  ADD COLUMN use_custom_rates boolean NOT NULL DEFAULT false,
  ADD COLUMN rate_weekday numeric NULL,
  ADD COLUMN rate_saturday numeric NULL,
  ADD COLUMN rate_sunday numeric NULL,
  ADD COLUMN rate_evening numeric NULL,
  ADD COLUMN rate_sleepover_weekday numeric NULL,
  ADD COLUMN rate_sleepover_weekend numeric NULL,
  ADD COLUMN rate_public_holiday numeric NULL;
