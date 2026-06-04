-- 為 employee_salary_config 加入職位與入帳帳號欄位
ALTER TABLE public.employee_salary_config
  ADD COLUMN IF NOT EXISTS position     VARCHAR(20) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_account VARCHAR(50) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS hourly_rate  NUMERIC(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS normal_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS company_pension_rate NUMERIC(4,2) NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS company_pension_base NUMERIC(10,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_date     VARCHAR(20) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS union_fee    NUMERIC(8,0) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.employee_salary_config.position IS '職位（如：助理）';
COMMENT ON COLUMN public.employee_salary_config.bank_account IS '入帳帳號（如：合庫 0251-9880-17402）';
COMMENT ON COLUMN public.employee_salary_config.hourly_rate IS '時薪';
COMMENT ON COLUMN public.employee_salary_config.normal_hours IS '本月正常時數';
COMMENT ON COLUMN public.employee_salary_config.company_pension_rate IS '公司提撥退休金比例（%）';
COMMENT ON COLUMN public.employee_salary_config.company_pension_base IS '提撥工資級距（部分工時）';
COMMENT ON COLUMN public.employee_salary_config.pay_date IS '發薪日期（如：115/05/05）';
COMMENT ON COLUMN public.employee_salary_config.union_fee IS '補助職業工會會費';
