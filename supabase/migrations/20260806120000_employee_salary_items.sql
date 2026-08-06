-- 員工薪資項目：職位加級、固定津貼／獎金（全勤、包班等可新增）
CREATE TABLE IF NOT EXISTS public.employee_salary_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- position_grade = 合約職位加級；fixed_allowance = 固定津貼／獎金（可手動新增）
  category        TEXT NOT NULL CHECK (category IN ('position_grade', 'fixed_allowance')),
  label           TEXT NOT NULL,
  amount          NUMERIC(10, 0) NOT NULL DEFAULT 0,
  -- 預設鍵：full_attendance / shift_package；自訂則為 null
  preset_key      TEXT NULL,
  -- 是否屬工資（計入加班費／平均工資基數）；全勤預設 true
  counts_as_wage  BOOLEAN NOT NULL DEFAULT FALSE,
  is_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      SMALLINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_salary_items_user
  ON public.employee_salary_items(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_salary_items_preset
  ON public.employee_salary_items(user_id, preset_key)
  WHERE preset_key IS NOT NULL;

ALTER TABLE public.employee_salary_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "salary_items_select_manager" ON public.employee_salary_items;
CREATE POLICY "salary_items_select_manager" ON public.employee_salary_items
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager', 'owner'))
  );

DROP POLICY IF EXISTS "salary_items_write_manager" ON public.employee_salary_items;
CREATE POLICY "salary_items_write_manager" ON public.employee_salary_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager', 'owner'))
  );

-- 薪資單明細欄位（職位加級／固定項目／全勤實發）
ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS position_grade_total NUMERIC(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS fixed_allowance_total NUMERIC(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS full_attendance_pay NUMERIC(10, 2) NOT NULL DEFAULT 0;
