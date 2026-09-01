-- 會計（capabilities.payroll）僅能讀寫同店薪資；老闆／boss 仍可跨店

CREATE OR REPLACE FUNCTION public.is_payroll_owner_user()
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
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_payroll_for(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_payroll_owner_user()
    OR (
      public.user_has_capability('payroll')
      AND public.same_site_as_auth(target_user_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.can_read_payroll_attendance_for(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_manage_payroll_for(target_user_id);
$$;

GRANT EXECUTE ON FUNCTION public.is_payroll_owner_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_payroll_for(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_payroll_attendance_for(uuid) TO authenticated;

-- ─── payroll_records ───────────────────────────────────────────

DROP POLICY IF EXISTS "payroll_records_select" ON public.payroll_records;
CREATE POLICY "payroll_records_select" ON public.payroll_records
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.can_manage_payroll_for(user_id)
  );

DROP POLICY IF EXISTS "payroll_records_write_manager" ON public.payroll_records;
CREATE POLICY "payroll_records_write_manager" ON public.payroll_records
  FOR ALL USING (public.can_manage_payroll_for(user_id))
  WITH CHECK (public.can_manage_payroll_for(user_id));

-- ─── employee_salary_config / monthly / items ──────────────────

DROP POLICY IF EXISTS "employee_salary_config_select" ON public.employee_salary_config;
CREATE POLICY "employee_salary_config_select" ON public.employee_salary_config
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.can_manage_payroll_for(user_id)
  );

DROP POLICY IF EXISTS "employee_salary_config_write_manager" ON public.employee_salary_config;
CREATE POLICY "employee_salary_config_write_manager" ON public.employee_salary_config
  FOR ALL USING (public.can_manage_payroll_for(user_id))
  WITH CHECK (public.can_manage_payroll_for(user_id));

DROP POLICY IF EXISTS "employee_salary_monthly_select" ON public.employee_salary_monthly;
CREATE POLICY "employee_salary_monthly_select" ON public.employee_salary_monthly
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.can_manage_payroll_for(user_id)
  );

DROP POLICY IF EXISTS "employee_salary_monthly_write_manager" ON public.employee_salary_monthly;
CREATE POLICY "employee_salary_monthly_write_manager" ON public.employee_salary_monthly
  FOR ALL USING (public.can_manage_payroll_for(user_id))
  WITH CHECK (public.can_manage_payroll_for(user_id));

DROP POLICY IF EXISTS "employee_salary_items_select" ON public.employee_salary_items;
CREATE POLICY "employee_salary_items_select" ON public.employee_salary_items
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.can_manage_payroll_for(user_id)
  );

DROP POLICY IF EXISTS "employee_salary_items_write_manager" ON public.employee_salary_items;
CREATE POLICY "employee_salary_items_write_manager" ON public.employee_salary_items
  FOR ALL USING (public.can_manage_payroll_for(user_id))
  WITH CHECK (public.can_manage_payroll_for(user_id));

-- payroll_rate_config 為全店共用費率公式，結算人員仍可讀寫
DROP POLICY IF EXISTS "payroll_rate_write_manager" ON public.payroll_rate_config;
CREATE POLICY "payroll_rate_write_manager" ON public.payroll_rate_config
  FOR ALL USING (public.is_payroll_settlement_user())
  WITH CHECK (public.is_payroll_settlement_user());

-- ─── payroll_adjustments ───────────────────────────────────────

DROP POLICY IF EXISTS "payroll_adj_select" ON public.payroll_adjustments;
CREATE POLICY "payroll_adj_select" ON public.payroll_adjustments
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.can_manage_payroll_for(user_id)
    OR (public.is_bonus_submit_user() AND public.same_site_as_auth(user_id))
  );

DROP POLICY IF EXISTS "payroll_adj_write_manager" ON public.payroll_adjustments;
CREATE POLICY "payroll_adj_write_manager" ON public.payroll_adjustments
  FOR ALL USING (
    public.can_manage_payroll_for(user_id)
    OR (public.is_bonus_submit_user() AND public.same_site_as_auth(user_id))
  )
  WITH CHECK (
    public.can_manage_payroll_for(user_id)
    OR (public.is_bonus_submit_user() AND public.same_site_as_auth(user_id))
  );

-- ─── payroll_adjustment_attachments ────────────────────────────

DROP POLICY IF EXISTS "payroll_adj_attach_select" ON public.payroll_adjustment_attachments;
CREATE POLICY "payroll_adj_attach_select" ON public.payroll_adjustment_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.payroll_adjustments a
      WHERE a.id = adjustment_id
        AND public.can_manage_payroll_for(a.user_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.payroll_adjustments a
      WHERE a.id = adjustment_id
        AND public.same_site_as_auth(a.user_id)
        AND public.is_bonus_submit_user()
    )
  );

DROP POLICY IF EXISTS "payroll_adj_attach_write" ON public.payroll_adjustment_attachments;
CREATE POLICY "payroll_adj_attach_write" ON public.payroll_adjustment_attachments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.payroll_adjustments a
      WHERE a.id = adjustment_id
        AND public.can_manage_payroll_for(a.user_id)
    )
    OR (
      public.is_bonus_submit_user()
      AND EXISTS (
        SELECT 1 FROM public.payroll_adjustments a
        WHERE a.id = adjustment_id
          AND public.same_site_as_auth(a.user_id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.payroll_adjustments a
      WHERE a.id = adjustment_id
        AND public.can_manage_payroll_for(a.user_id)
    )
    OR (
      public.is_bonus_submit_user()
      AND EXISTS (
        SELECT 1 FROM public.payroll_adjustments a
        WHERE a.id = adjustment_id
          AND public.same_site_as_auth(a.user_id)
      )
    )
  );

-- ─── 出勤／請假讀取（會計試算僅同店）──────────────────────────

DROP POLICY IF EXISTS "punch_select_own_or_manager" ON public.punch_records;
CREATE POLICY "punch_select_own_or_manager" ON public.punch_records
  FOR SELECT USING (
    employee_id = auth.uid()
    OR public.can_read_payroll_attendance_for(employee_id)
    OR EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = punch_records.employee_id
      WHERE me.id = auth.uid()
        AND me.role IN ('manager', 'deputy')
        AND me.site_id = emp.site_id
    )
  );

DROP POLICY IF EXISTS "tardiness_select_manager_or_own" ON public.tardiness_records;
CREATE POLICY "tardiness_select_manager_or_own" ON public.tardiness_records
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.can_read_payroll_attendance_for(user_id)
    OR EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid()
        AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = tardiness_records.user_id
      WHERE me.id = auth.uid()
        AND me.role IN ('manager', 'deputy')
        AND me.site_id = emp.site_id
    )
  );

DROP POLICY IF EXISTS "leave_select_own_or_site_manager" ON public.leave_applications;
CREATE POLICY "leave_select_own_or_site_manager" ON public.leave_applications
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.can_read_payroll_attendance_for(user_id)
    OR EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = leave_applications.user_id
      WHERE me.id = auth.uid()
        AND me.role IN ('manager', 'deputy')
        AND me.site_id = emp.site_id
    )
  );

DROP POLICY IF EXISTS "overtime_select_own_or_site_manager" ON public.overtime_applications;
CREATE POLICY "overtime_select_own_or_site_manager" ON public.overtime_applications
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.can_read_payroll_attendance_for(user_id)
    OR EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = overtime_applications.user_id
      WHERE me.id = auth.uid()
        AND me.role IN ('manager', 'deputy')
        AND me.site_id = emp.site_id
    )
  );

DROP POLICY IF EXISTS "comp_leave_select_own_or_manager" ON public.comp_leave_ledger;
CREATE POLICY "comp_leave_select_own_or_manager" ON public.comp_leave_ledger
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.can_read_payroll_attendance_for(user_id)
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = comp_leave_ledger.user_id
      WHERE me.id = auth.uid()
        AND me.role IN ('boss', 'owner', 'manager', 'deputy')
        AND (
          me.role IN ('boss', 'owner')
          OR me.site_id = emp.site_id
        )
    )
  );
