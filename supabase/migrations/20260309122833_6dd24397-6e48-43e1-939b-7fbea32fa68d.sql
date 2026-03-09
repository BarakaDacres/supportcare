
-- ============================================================
-- CLIENTS
-- ============================================================
CREATE TABLE public.clients (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL,
  name          TEXT NOT NULL,
  notes         TEXT,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own clients"
  ON public.clients FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own clients"
  ON public.clients FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own clients"
  ON public.clients FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own clients"
  ON public.clients FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- SHIFTS
-- ============================================================
CREATE TABLE public.shifts (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL,
  client_id     UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  date          DATE NOT NULL,
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  is_sleepover  BOOLEAN NOT NULL DEFAULT false,
  notes         TEXT,
  hours_worked  NUMERIC(6,2) NOT NULL DEFAULT 0,
  gross_pay     NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own shifts"
  ON public.shifts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own shifts"
  ON public.shifts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own shifts"
  ON public.shifts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own shifts"
  ON public.shifts FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_shifts_user_date ON public.shifts(user_id, date);
CREATE INDEX idx_shifts_user_client ON public.shifts(user_id, client_id);

CREATE TRIGGER update_shifts_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE public.invoices (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL,
  invoice_number  TEXT NOT NULL,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  total_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'draft',
  notes           TEXT,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own invoices"
  ON public.invoices FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own invoices"
  ON public.invoices FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own invoices"
  ON public.invoices FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own invoices"
  ON public.invoices FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- INVOICE LINE ITEMS
-- ============================================================
CREATE TABLE public.invoice_items (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id  UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  shift_id    UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  hours       NUMERIC(6,2),
  rate        NUMERIC(8,2),
  amount      NUMERIC(10,2) NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their invoice items"
  ON public.invoice_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.invoices WHERE invoices.id = invoice_id AND invoices.user_id = auth.uid()
  ));
CREATE POLICY "Users can insert invoice items"
  ON public.invoice_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.invoices WHERE invoices.id = invoice_id AND invoices.user_id = auth.uid()
  ));
CREATE POLICY "Users can update invoice items"
  ON public.invoice_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.invoices WHERE invoices.id = invoice_id AND invoices.user_id = auth.uid()
  ));
CREATE POLICY "Users can delete invoice items"
  ON public.invoice_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.invoices WHERE invoices.id = invoice_id AND invoices.user_id = auth.uid()
  ));

-- ============================================================
-- USER SETTINGS
-- ============================================================
CREATE TABLE public.user_settings (
  id                      UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                 UUID NOT NULL UNIQUE,
  business_name           TEXT,
  abn                     TEXT,
  bank_name               TEXT,
  bsb                     TEXT,
  account_number          TEXT,
  invoice_notes           TEXT,
  tax_rate                NUMERIC(5,2) NOT NULL DEFAULT 30,
  monthly_goal            NUMERIC(10,2),
  yearly_goal             NUMERIC(10,2),
  rate_weekday            NUMERIC(8,2) NOT NULL DEFAULT 60,
  rate_saturday           NUMERIC(8,2) NOT NULL DEFAULT 75,
  rate_sunday             NUMERIC(8,2) NOT NULL DEFAULT 90,
  rate_sleepover_weekday  NUMERIC(8,2) NOT NULL DEFAULT 300,
  rate_sleepover_weekend  NUMERIC(8,2) NOT NULL DEFAULT 350,
  invoice_counter         INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own settings"
  ON public.user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own settings"
  ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own settings"
  ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Update handle_new_user to also create settings row
CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;
