-- 薪資費率可自訂公式：固定金額 / 底薪百分比 / 員工時薪倍數
ALTER TABLE public.payroll_rate_config
  ADD COLUMN IF NOT EXISTS formula_type VARCHAR(32) NOT NULL DEFAULT 'fixed_amount',
  ADD COLUMN IF NOT EXISTS percentage NUMERIC(10,4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.payroll_rate_config.formula_type IS
  'fixed_amount | base_salary_percent | hourly_rate';
COMMENT ON COLUMN public.payroll_rate_config.percentage IS
  '當 formula_type=base_salary_percent 時，單位金額 = 底薪 × percentage/100';
