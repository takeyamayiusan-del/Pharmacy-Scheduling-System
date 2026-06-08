-- ============================================================
-- Add holidays calendar table for dynamic yearly holiday updates
-- ============================================================

CREATE TABLE IF NOT EXISTS public.holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL,
  name text NOT NULL,
  year int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_holidays_date ON public.holidays(holiday_date);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holidays_select_authenticated" ON public.holidays
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "holidays_insert_manager" ON public.holidays
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'manager')
    )
  );

CREATE POLICY "holidays_update_manager" ON public.holidays
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'manager')
    )
  );

CREATE POLICY "holidays_delete_manager" ON public.holidays
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'manager')
    )
  );
