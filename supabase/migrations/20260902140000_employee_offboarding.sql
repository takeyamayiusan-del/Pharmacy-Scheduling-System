-- 員工離職結清紀錄（資遣／自離／退休試算與結案）

CREATE TABLE IF NOT EXISTS public.employee_offboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  offboarding_type text NOT NULL CHECK (offboarding_type IN ('layoff', 'resignation', 'retirement')),
  pension_system text NOT NULL DEFAULT 'new' CHECK (pension_system IN ('new', 'old')),
  notice_start_date date,
  notice_end_date date,
  last_work_date date NOT NULL,
  settlement_year int NOT NULL,
  settlement_month int NOT NULL CHECK (settlement_month BETWEEN 1 AND 12),
  average_monthly_wage numeric(12, 2),
  manual_severance_pay numeric(12, 2),
  manual_annual_leave_payout numeric(12, 2),
  manual_comp_leave_payout numeric(12, 2),
  other_payout numeric(12, 2) NOT NULL DEFAULT 0,
  other_deduction numeric(12, 2) NOT NULL DEFAULT 0,
  deactivate_on_complete boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
  snapshot jsonb,
  created_by uuid REFERENCES public.users(id),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_offboarding_site
  ON public.employee_offboarding (site_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_offboarding_user
  ON public.employee_offboarding (user_id, updated_at DESC);

COMMENT ON TABLE public.employee_offboarding IS '員工離職結清：類型、預告、最後工作日、試算快照';

ALTER TABLE public.employee_offboarding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_offboarding_select ON public.employee_offboarding;
CREATE POLICY employee_offboarding_select ON public.employee_offboarding
  FOR SELECT TO authenticated
  USING (
    public.can_manage_employees_rls()
    AND (
      EXISTS (SELECT 1 FROM public.users me WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner'))
      OR site_id = (SELECT me.site_id FROM public.users me WHERE me.id = auth.uid())
    )
  );

DROP POLICY IF EXISTS employee_offboarding_insert ON public.employee_offboarding;
CREATE POLICY employee_offboarding_insert ON public.employee_offboarding
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_employees_rls()
    AND (
      EXISTS (SELECT 1 FROM public.users me WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner'))
      OR site_id = (SELECT me.site_id FROM public.users me WHERE me.id = auth.uid())
    )
  );

DROP POLICY IF EXISTS employee_offboarding_update ON public.employee_offboarding;
CREATE POLICY employee_offboarding_update ON public.employee_offboarding
  FOR UPDATE TO authenticated
  USING (
    public.can_manage_employees_rls()
    AND (
      EXISTS (SELECT 1 FROM public.users me WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner'))
      OR site_id = (SELECT me.site_id FROM public.users me WHERE me.id = auth.uid())
    )
  )
  WITH CHECK (
    public.can_manage_employees_rls()
    AND (
      EXISTS (SELECT 1 FROM public.users me WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner'))
      OR site_id = (SELECT me.site_id FROM public.users me WHERE me.id = auth.uid())
    )
  );

DROP POLICY IF EXISTS employee_offboarding_delete ON public.employee_offboarding;
CREATE POLICY employee_offboarding_delete ON public.employee_offboarding
  FOR DELETE TO authenticated
  USING (
    public.can_manage_employees_rls()
    AND status = 'draft'
    AND (
      EXISTS (SELECT 1 FROM public.users me WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner'))
      OR site_id = (SELECT me.site_id FROM public.users me WHERE me.id = auth.uid())
    )
  );
