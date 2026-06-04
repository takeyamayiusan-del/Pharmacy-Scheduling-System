-- ============================================================
-- 班表、系統設定、薪資相關資料表
-- ============================================================

-- ============================================================
-- 1. app_settings 表（系統設定：班別時間、固定班等）
-- ============================================================
CREATE TABLE public.app_settings (
  id            TEXT PRIMARY KEY,  -- e.g. 'shift_time_config', 'fixed_shifts'
  value         JSONB NOT NULL,
  updated_by    UUID REFERENCES public.users(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings_select_all" ON public.app_settings
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "app_settings_upsert_manager" ON public.app_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

-- ============================================================
-- 2. leave_selections 表（排休選擇）
-- ============================================================
CREATE TABLE public.leave_selections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id),
  date          DATE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE INDEX idx_leave_selections_user_id ON public.leave_selections(user_id);
CREATE INDEX idx_leave_selections_date ON public.leave_selections(date);

ALTER TABLE public.leave_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leave_selections_select_all" ON public.leave_selections
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "leave_selections_insert_own" ON public.leave_selections
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "leave_selections_delete_own" ON public.leave_selections
  FOR DELETE USING (user_id = auth.uid());

-- ============================================================
-- 3. wednesday_off_selections 表（禮三晚班排休）
-- ============================================================
CREATE TABLE public.wednesday_off_selections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id),
  date          DATE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE INDEX idx_wed_off_user_id ON public.wednesday_off_selections(user_id);

ALTER TABLE public.wednesday_off_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wed_off_select_all" ON public.wednesday_off_selections
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "wed_off_insert_own" ON public.wednesday_off_selections
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "wed_off_delete_own" ON public.wednesday_off_selections
  FOR DELETE USING (user_id = auth.uid());

-- ============================================================
-- 4. leave_month_locks 表（排休月份鎖定）
-- ============================================================
CREATE TABLE public.leave_month_locks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year          SMALLINT NOT NULL,
  month         SMALLINT NOT NULL,
  locked_by     UUID NOT NULL REFERENCES public.users(id),
  locked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(year, month)
);

ALTER TABLE public.leave_month_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leave_month_locks_select_all" ON public.leave_month_locks
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "leave_month_locks_manager" ON public.leave_month_locks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

-- ============================================================
-- 5. employee_payroll_settings 表（員工薪資設定）
-- ============================================================
CREATE TABLE public.employee_payroll_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.users(id) UNIQUE,
  name                  VARCHAR(10) NOT NULL,
  title                 VARCHAR(20),          -- 職稱
  bank_account          VARCHAR(50),          -- 入帳帳號
  base_salary           INTEGER NOT NULL DEFAULT 0,   -- 底薪
  labor_insurance       INTEGER NOT NULL DEFAULT 0,   -- 勞保費（員工負擔）
  health_insurance      INTEGER NOT NULL DEFAULT 0,   -- 健保費（員工負擔）
  retirement_rate       NUMERIC(4,2) NOT NULL DEFAULT 6, -- 退休金提撥比例(%)
  hourly_rate           NUMERIC(8,2) NOT NULL DEFAULT 0,  -- 時薪（底薪/月工時）
  overtime_rate         NUMERIC(4,2) NOT NULL DEFAULT 1.33, -- 加班費率
  late_deduct_per_min   NUMERIC(8,2) NOT NULL DEFAULT 0, -- 每分鐘遲到扣薪
  leave_deduct_per_hour NUMERIC(8,2) NOT NULL DEFAULT 0, -- 每小時請假扣薪
  pay_day               SMALLINT,             -- 發薪日
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.employee_payroll_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_settings_select_manager" ON public.employee_payroll_settings
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

CREATE POLICY "payroll_settings_manager_write" ON public.employee_payroll_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

-- ============================================================
-- 6. monthly_payroll_adjustments 表（每月異動項目：獎金、扣款等）
-- ============================================================
CREATE TABLE public.monthly_payroll_adjustments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id),
  year          SMALLINT NOT NULL,
  month         SMALLINT NOT NULL,
  label         VARCHAR(50) NOT NULL,  -- 項目名稱（業績獎金、團體獎金...）
  amount        INTEGER NOT NULL,       -- 金額（正數=加、負數=扣）
  type          VARCHAR(10) NOT NULL CHECK (type IN ('bonus', 'deduct')),
  created_by    UUID REFERENCES public.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payroll_adj_user_year_month ON public.monthly_payroll_adjustments(user_id, year, month);

ALTER TABLE public.monthly_payroll_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_adj_select_manager" ON public.monthly_payroll_adjustments
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );

CREATE POLICY "payroll_adj_manager_write" ON public.monthly_payroll_adjustments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager'))
  );
