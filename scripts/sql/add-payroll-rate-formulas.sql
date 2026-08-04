-- 本機／Studio 可手動執行：薪資費率自訂公式欄位
ALTER TABLE public.payroll_rate_config
  ADD COLUMN IF NOT EXISTS formula_type VARCHAR(32) NOT NULL DEFAULT 'fixed_amount',
  ADD COLUMN IF NOT EXISTS percentage NUMERIC(10,4) NOT NULL DEFAULT 0;
