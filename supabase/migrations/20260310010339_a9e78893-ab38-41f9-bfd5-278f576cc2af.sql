-- Add fee_override column to shifts table for manual flat-fee overrides
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS fee_override numeric NULL DEFAULT NULL;

COMMENT ON COLUMN public.shifts.fee_override IS 'Optional manual override for flat-fee (sleepover) shifts. When set, this value replaces the calculated gross_pay for that shift only.';