-- 年度特休設定管理
-- 管理者可設定每年的特休規則

-- 1. 年度特休規則設定表
CREATE TABLE IF NOT EXISTS public.annual_leave_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year            INTEGER NOT NULL,                    -- 年度（西元年）
  seniority_months INTEGER NOT NULL,                    -- 年資（月份），如 0=入職、6=半年、12=一年
  days            DECIMAL(4,1) NOT NULL,                -- 給予天數
  description     VARCHAR(255),                         -- 說明（如「滿半年」、「滿一年」）
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(year, seniority_months)
);

-- 2. 員工特休調整記錄表（管理者手動調整）
CREATE TABLE IF NOT EXISTS public.annual_leave_adjustments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  year            INTEGER NOT NULL,
  adjustment_days  DECIMAL(4,1) NOT NULL,               -- 調整天數（正數為增加，負數為減少）
  reason          VARCHAR(255),                         -- 調整原因
  created_by      UUID NOT NULL REFERENCES public.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 設置 RLS
ALTER TABLE public.annual_leave_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.annual_leave_adjustments ENABLE ROW LEVEL SECURITY;

-- annual_leave_config 讀取：所有已認證用戶可讀
CREATE POLICY "annual_leave_config_select_all" ON public.annual_leave_config
  FOR SELECT USING (auth.role() = 'authenticated');

-- annual_leave_config 寫入：只有 owner 和 manager 可寫入
CREATE POLICY "annual_leave_config_manage" ON public.annual_leave_config
  FOR ALL USING (
    auth.role() = 'authenticated' AND
    auth.uid() IN (
      SELECT id FROM public.users WHERE role IN ('owner', 'manager')
    )
  );

-- annual_leave_adjustments 讀取：所有已認證用戶可讀
CREATE POLICY "annual_leave_adjustments_select_all" ON public.annual_leave_adjustments
  FOR SELECT USING (auth.role() = 'authenticated');

-- annual_leave_adjustments 寫入：只有 owner 和 manager 可寫入
CREATE POLICY "annual_leave_adjustments_manage" ON public.annual_leave_adjustments
  FOR ALL USING (
    auth.role() = 'authenticated' AND
    auth.uid() IN (
      SELECT id FROM public.users WHERE role IN ('owner', 'manager')
    )
  );

-- 4. 插入預設規則（可由管理者修改）
INSERT INTO public.annual_leave_config (year, seniority_months, days, description)
VALUES 
  (2025, 0, 0, '入職未滿半年'),
  (2025, 6, 3, '滿半年'),
  (2025, 12, 7, '滿一年'),
  (2026, 0, 0, '入職未滿半年'),
  (2026, 6, 3, '滿半年'),
  (2026, 12, 7, '滿一年'),
  (2027, 0, 0, '入職未滿半年'),
  (2027, 6, 3, '滿半年'),
  (2027, 12, 7, '滿一年')
ON CONFLICT (year, seniority_months) DO NOTHING;