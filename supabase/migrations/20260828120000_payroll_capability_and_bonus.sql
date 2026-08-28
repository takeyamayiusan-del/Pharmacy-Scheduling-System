-- 薪資結算改由老闆／會計（capabilities.payroll）負責；店長保留獎金加扣項登錄

CREATE OR REPLACE FUNCTION public.user_has_capability(cap text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (u.capabilities ->> cap)::boolean FROM public.users u WHERE u.id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_payroll_settlement_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('boss', 'owner')
  )
  OR public.user_has_capability('payroll');
$$;

CREATE OR REPLACE FUNCTION public.is_bonus_submit_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_payroll_settlement_user()
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('boss', 'owner', 'manager', 'deputy')
  );
$$;

CREATE OR REPLACE FUNCTION public.same_site_as_auth(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users me
    JOIN public.users them ON them.id = target_user_id
    WHERE me.id = auth.uid()
      AND me.site_id = them.site_id
  );
$$;

-- payroll_records：僅結算人員可讀寫全員
DROP POLICY IF EXISTS "payroll_records_select" ON public.payroll_records;
CREATE POLICY "payroll_records_select" ON public.payroll_records
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_payroll_settlement_user()
  );

DROP POLICY IF EXISTS "payroll_records_write_manager" ON public.payroll_records;
CREATE POLICY "payroll_records_write_manager" ON public.payroll_records
  FOR ALL USING (public.is_payroll_settlement_user())
  WITH CHECK (public.is_payroll_settlement_user());

-- employee_salary_config / monthly / items / rate_config：同上
DROP POLICY IF EXISTS "employee_salary_config_select" ON public.employee_salary_config;
CREATE POLICY "employee_salary_config_select" ON public.employee_salary_config
  FOR SELECT USING (
    user_id = auth.uid() OR public.is_payroll_settlement_user()
  );

DROP POLICY IF EXISTS "employee_salary_config_write_manager" ON public.employee_salary_config;
CREATE POLICY "employee_salary_config_write_manager" ON public.employee_salary_config
  FOR ALL USING (public.is_payroll_settlement_user())
  WITH CHECK (public.is_payroll_settlement_user());

DROP POLICY IF EXISTS "employee_salary_monthly_select" ON public.employee_salary_monthly;
CREATE POLICY "employee_salary_monthly_select" ON public.employee_salary_monthly
  FOR SELECT USING (
    user_id = auth.uid() OR public.is_payroll_settlement_user()
  );

DROP POLICY IF EXISTS "employee_salary_monthly_write_manager" ON public.employee_salary_monthly;
CREATE POLICY "employee_salary_monthly_write_manager" ON public.employee_salary_monthly
  FOR ALL USING (public.is_payroll_settlement_user())
  WITH CHECK (public.is_payroll_settlement_user());

DROP POLICY IF EXISTS "employee_salary_items_select" ON public.employee_salary_items;
CREATE POLICY "employee_salary_items_select" ON public.employee_salary_items
  FOR SELECT USING (
    user_id = auth.uid() OR public.is_payroll_settlement_user()
  );

DROP POLICY IF EXISTS "employee_salary_items_write_manager" ON public.employee_salary_items;
CREATE POLICY "employee_salary_items_write_manager" ON public.employee_salary_items
  FOR ALL USING (public.is_payroll_settlement_user())
  WITH CHECK (public.is_payroll_settlement_user());

DROP POLICY IF EXISTS "payroll_rate_write_manager" ON public.payroll_rate_config;
CREATE POLICY "payroll_rate_write_manager" ON public.payroll_rate_config
  FOR ALL USING (public.is_payroll_settlement_user())
  WITH CHECK (public.is_payroll_settlement_user());

-- payroll_adjustments：結算人員全權；店長／副店／老闆可登錄同店獎金
DROP POLICY IF EXISTS "payroll_adj_select" ON public.payroll_adjustments;
CREATE POLICY "payroll_adj_select" ON public.payroll_adjustments
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_payroll_settlement_user()
    OR (public.is_bonus_submit_user() AND public.same_site_as_auth(user_id))
  );

DROP POLICY IF EXISTS "payroll_adj_write_manager" ON public.payroll_adjustments;
CREATE POLICY "payroll_adj_write_manager" ON public.payroll_adjustments
  FOR ALL USING (
    public.is_payroll_settlement_user()
    OR (public.is_bonus_submit_user() AND public.same_site_as_auth(user_id))
  )
  WITH CHECK (
    public.is_payroll_settlement_user()
    OR (public.is_bonus_submit_user() AND public.same_site_as_auth(user_id))
  );

-- 獎金附件（店長上傳；一個月後自動刪除）
ALTER TABLE public.payroll_adjustments
  ADD COLUMN IF NOT EXISTS bonus_category VARCHAR(40);

CREATE TABLE IF NOT EXISTS public.payroll_adjustment_attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id   UUID NOT NULL REFERENCES public.payroll_adjustments(id) ON DELETE CASCADE,
  storage_path    TEXT NOT NULL,
  file_name       VARCHAR(255) NOT NULL,
  mime_type       VARCHAR(120),
  file_size       INTEGER,
  uploaded_by     UUID REFERENCES public.users(id),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_adj_attach_adj
  ON public.payroll_adjustment_attachments(adjustment_id);
CREATE INDEX IF NOT EXISTS idx_payroll_adj_attach_expires
  ON public.payroll_adjustment_attachments(expires_at);

ALTER TABLE public.payroll_adjustment_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_adj_attach_select" ON public.payroll_adjustment_attachments
  FOR SELECT USING (
    public.is_payroll_settlement_user()
    OR EXISTS (
      SELECT 1 FROM public.payroll_adjustments a
      WHERE a.id = adjustment_id
        AND (
          public.same_site_as_auth(a.user_id)
          AND public.is_bonus_submit_user()
        )
    )
  );

CREATE POLICY "payroll_adj_attach_write" ON public.payroll_adjustment_attachments
  FOR ALL USING (
    public.is_payroll_settlement_user()
    OR public.is_bonus_submit_user()
  )
  WITH CHECK (
    public.is_payroll_settlement_user()
    OR public.is_bonus_submit_user()
  );

-- Storage bucket：獎金佐證附件（一個月後由 cleanup job 刪除）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payroll-bonus-attachments',
  'payroll-bonus-attachments',
  FALSE,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "payroll_bonus_attach_storage_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'payroll-bonus-attachments' AND
    auth.role() = 'authenticated'
  );

CREATE POLICY "payroll_bonus_attach_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'payroll-bonus-attachments' AND
    auth.role() = 'authenticated'
  );

CREATE POLICY "payroll_bonus_attach_storage_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'payroll-bonus-attachments' AND
    auth.role() = 'authenticated'
  );
