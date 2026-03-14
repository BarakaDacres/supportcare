-- Add status tracking fields to invoices table
ALTER TABLE public.invoices 
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fortnight_number INTEGER,
  ADD COLUMN IF NOT EXISTS year INTEGER;

-- Add organisation / extended billing fields to clients table
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS organisation_name TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS billing_contact TEXT;

-- Index for faster status queries
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_user_period ON public.invoices(user_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON public.invoices(client_id);