-- 可賣版店規：副店角色、個人變形工時、薪資月快照、遞延申請、審核關卡

-- 1) users.role 加入 deputy；個人變形工時／基準班
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('boss', 'manager', 'deputy', 'employee'));

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS work_hours_regime VARCHAR(20);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS baseline_shift VARCHAR(24);

COMMENT ON COLUMN public.users.work_hours_regime IS '個人變形工時：standard／two_week／four_week／eight_week；空=跟店';
COMMENT ON COLUMN public.users.baseline_shift IS '本月基準班（播假／超時計算用），如白班5';

-- 2) 薪資按月快照（改這個月不回溯上個月）
CREATE TABLE IF NOT EXISTS public.employee_salary_monthly (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  year                SMALLINT NOT NULL,
  month               SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  base_salary         NUMERIC(10,0) NOT NULL DEFAULT 0,
  labor_insurance     NUMERIC(8,0) NOT NULL DEFAULT 0,
  health_insurance    NUMERIC(8,0) NOT NULL DEFAULT 0,
  pension_deduction   NUMERIC(8,0) NOT NULL DEFAULT 0,
  position            TEXT DEFAULT '',
  bank_account        TEXT DEFAULT '',
  hourly_rate         NUMERIC(10,2) DEFAULT 0,
  company_pension_rate NUMERIC(6,2) DEFAULT 6,
  company_pension_base NUMERIC(10,0) DEFAULT 0,
  pay_date            TEXT DEFAULT '',
  union_fee           NUMERIC(8,0) DEFAULT 0,
  updated_by          UUID REFERENCES public.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_salary_monthly_user_ym
  ON public.employee_salary_monthly (user_id, year, month);

ALTER TABLE public.employee_salary_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salary_monthly_select_auth" ON public.employee_salary_monthly
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager', 'deputy'))
  );
CREATE POLICY "salary_monthly_write_mgr" ON public.employee_salary_monthly
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager', 'deputy'))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_salary_monthly TO authenticated;

-- 3) 特休／補休遞延申請
CREATE TABLE IF NOT EXISTS public.leave_deferral_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  site_id         TEXT,
  leave_kind      VARCHAR(20) NOT NULL CHECK (leave_kind IN ('annual', 'comp')),
  hours           NUMERIC(6,2) NOT NULL DEFAULT 0,
  original_expire DATE,
  new_expire      DATE NOT NULL,
  reason          TEXT DEFAULT '',
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by     UUID REFERENCES public.users(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.leave_deferral_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leave_deferral_select" ON public.leave_deferral_requests
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager', 'deputy'))
  );
CREATE POLICY "leave_deferral_insert" ON public.leave_deferral_requests
  FOR INSERT WITH CHECK (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager', 'deputy')
  ));
CREATE POLICY "leave_deferral_update" ON public.leave_deferral_requests
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager', 'deputy'))
    OR user_id = auth.uid()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_deferral_requests TO authenticated;

-- 4) 申請審核關卡（請假／加班／換班）
ALTER TABLE public.leave_applications
  ADD COLUMN IF NOT EXISTS approval_step SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE public.overtime_applications
  ADD COLUMN IF NOT EXISTS approval_step SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE public.shift_swap_applications
  ADD COLUMN IF NOT EXISTS approval_step SMALLINT NOT NULL DEFAULT 0;

-- 5) 新假別薪資公式（金額 0 由店長在結算頁設定）
INSERT INTO public.payroll_rate_config (item_key, label, amount, unit, is_deduction, sort_order) VALUES
  ('leave_personal',     '事假扣薪（每小時）', 0, '元/小時', TRUE, 10),
  ('leave_sick',         '病假扣薪（每小時）', 0, '元/小時', TRUE, 11),
  ('leave_bereavement',  '喪假（每小時）', 0, '元/小時', TRUE, 12),
  ('leave_annual',       '特休（每小時）', 0, '元/小時', TRUE, 13),
  ('leave_menstrual',    '生理假（每小時）', 0, '元/小時', TRUE, 14),
  ('leave_maternity',    '產假（每小時）', 0, '元/小時', TRUE, 15),
  ('leave_paternity',    '陪產檢及陪產假（每小時）', 0, '元/小時', TRUE, 16),
  ('leave_family_care',  '家庭照顧事假（每小時）', 0, '元/小時', TRUE, 17),
  ('leave_marriage',     '婚假（每小時）', 0, '元/小時', TRUE, 18),
  ('leave_other',        '其他假別（每小時）', 0, '元/小時', TRUE, 19)
ON CONFLICT (item_key) DO NOTHING;

COMMENT ON TABLE public.employee_salary_monthly IS '員工薪資設定月快照：該月勞健保等不因之後修改而回溯';
COMMENT ON TABLE public.leave_deferral_requests IS '特休／補休過期遞延申請';
