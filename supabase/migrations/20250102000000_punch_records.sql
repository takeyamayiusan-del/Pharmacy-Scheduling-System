-- ============================================================
-- 耀聖藥局智慧排班系統 - Punch Records Table
-- ============================================================

CREATE TABLE public.punch_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES public.users(id),
  employee_name   VARCHAR(10) NOT NULL,
  date            DATE NOT NULL,
  action          VARCHAR(10) NOT NULL CHECK (action IN ('work_in', 'work_out')),
  segment_index   SMALLINT NOT NULL DEFAULT 0,
  time            TIME NOT NULL,
  shift           VARCHAR(1) NOT NULL,
  late_minutes    SMALLINT NOT NULL DEFAULT 0,
  reason          TEXT,
  latitude        NUMERIC(10,7),
  longitude       NUMERIC(10,7),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_punch_records_employee_date ON public.punch_records(employee_id, date);

ALTER TABLE public.punch_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "punch_select_own_or_manager" ON public.punch_records
  FOR SELECT USING (
    employee_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

CREATE POLICY "punch_insert_own" ON public.punch_records
  FOR INSERT WITH CHECK (employee_id = auth.uid());

CREATE POLICY "punch_update_manager" ON public.punch_records
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

CREATE POLICY "punch_delete_manager" ON public.punch_records
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );
