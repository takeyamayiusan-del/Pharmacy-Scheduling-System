-- ============================================================
-- 耀聖藥局智慧排班系統 - Payroll Tables
-- 月底薪資結算相關資料表
-- ============================================================

-- ============================================================
-- 1. employee_salary_config 表（員工固定薪資設定）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.employee_salary_config (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  base_salary         NUMERIC(10,0) NOT NULL DEFAULT 0,       -- 月薪底薪
  labor_insurance     NUMERIC(8,0) NOT NULL DEFAULT 0,        -- 勞保（員工負擔）
  health_insurance    NUMERIC(8,0) NOT NULL DEFAULT 0,        -- 健保（員工負擔）
  pension_deduction   NUMERIC(8,0) NOT NULL DEFAULT 0,        -- 退休金提撥（員工負擔6%）
  updated_by          UUID REFERENCES public.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.employee_salary_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salary_config_select_manager" ON public.employee_salary_config
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

CREATE POLICY "salary_config_write_manager" ON public.employee_salary_config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

CREATE TRIGGER trg_salary_config_updated_at
  BEFORE UPDATE ON public.employee_salary_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 2. payroll_rate_config 表（計算費率設定，全店共用）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payroll_rate_config (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key            VARCHAR(50) NOT NULL UNIQUE,  -- 例如 'overtime_hourly', 'tardiness_per_min', 'leave_hourly'
  label               VARCHAR(100) NOT NULL,         -- 顯示名稱
  amount              NUMERIC(10,2) NOT NULL DEFAULT 0,
  unit                VARCHAR(20) NOT NULL DEFAULT '元/小時',  -- 顯示單位
  is_deduction        BOOLEAN NOT NULL DEFAULT TRUE,  -- TRUE=扣款, FALSE=加項
  sort_order          SMALLINT NOT NULL DEFAULT 0,
  updated_by          UUID REFERENCES public.users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.payroll_rate_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_rate_select_all" ON public.payroll_rate_config
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "payroll_rate_write_manager" ON public.payroll_rate_config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

-- 預設費率
INSERT INTO public.payroll_rate_config (item_key, label, amount, unit, is_deduction, sort_order) VALUES
  ('leave_hourly',       '請假扣薪（每小時）', 0, '元/小時', TRUE,  1),
  ('overtime_hourly',    '加班費（每小時）',   0, '元/小時', FALSE, 2),
  ('tardiness_per_min',  '遲到扣薪（每分鐘）', 0, '元/分鐘', TRUE,  3)
ON CONFLICT (item_key) DO NOTHING;

-- ============================================================
-- 3. payroll_records 表（每月結算記錄）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payroll_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  year                SMALLINT NOT NULL,
  month               SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  base_salary         NUMERIC(10,0) NOT NULL DEFAULT 0,
  labor_insurance     NUMERIC(8,0) NOT NULL DEFAULT 0,
  health_insurance    NUMERIC(8,0) NOT NULL DEFAULT 0,
  pension_deduction   NUMERIC(8,0) NOT NULL DEFAULT 0,
  leave_deduction     NUMERIC(10,2) NOT NULL DEFAULT 0,    -- 請假扣款
  overtime_pay        NUMERIC(10,2) NOT NULL DEFAULT 0,    -- 加班費
  tardiness_deduction NUMERIC(10,2) NOT NULL DEFAULT 0,   -- 遲到扣款
  bonus_total         NUMERIC(10,2) NOT NULL DEFAULT 0,    -- 獎金合計
  final_pay           NUMERIC(10,2) NOT NULL DEFAULT 0,    -- 實領薪資
  note                TEXT,
  created_by          UUID REFERENCES public.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_payroll_user_id ON public.payroll_records(user_id);
CREATE INDEX IF NOT EXISTS idx_payroll_year_month ON public.payroll_records(year, month);

ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_records_select" ON public.payroll_records
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

CREATE POLICY "payroll_records_write_manager" ON public.payroll_records
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

CREATE TRIGGER trg_payroll_records_updated_at
  BEFORE UPDATE ON public.payroll_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 4. payroll_adjustments 表（異動項目：獎金/額外扣款）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payroll_adjustments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  year        SMALLINT NOT NULL,
  month       SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  label       VARCHAR(100) NOT NULL,               -- 例如「業績獎金」「團體獎金」
  amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_deduction BOOLEAN NOT NULL DEFAULT FALSE,     -- FALSE=加項, TRUE=扣款
  created_by  UUID REFERENCES public.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_adj_user_year_month ON public.payroll_adjustments(user_id, year, month);

ALTER TABLE public.payroll_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_adj_select" ON public.payroll_adjustments
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

CREATE POLICY "payroll_adj_write_manager" ON public.payroll_adjustments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );
