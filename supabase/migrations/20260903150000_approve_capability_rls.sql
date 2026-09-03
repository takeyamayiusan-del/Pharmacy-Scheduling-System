-- 審核授權（capabilities.approve）：可讀寫同店申請，供老闆贈與「審核申請」後實際可用

CREATE OR REPLACE FUNCTION public.is_site_approver_for(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.user_has_capability('approve')
    AND (
      public.same_site_as_auth(target_user_id)
      OR EXISTS (
        SELECT 1 FROM public.users me
        WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_site_approver_for(uuid) TO authenticated;

-- 請假
DROP POLICY IF EXISTS "leave_select_own_or_site_manager" ON public.leave_applications;
CREATE POLICY "leave_select_own_or_site_manager" ON public.leave_applications
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_payroll_settlement_user()
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
    OR public.is_site_approver_for(user_id)
  );

DROP POLICY IF EXISTS "leave_update_site_manager" ON public.leave_applications;
CREATE POLICY "leave_update_site_manager" ON public.leave_applications
  FOR UPDATE USING (
    EXISTS (
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
    OR public.is_site_approver_for(user_id)
  );

-- 加班
DROP POLICY IF EXISTS "overtime_select_own_or_site_manager" ON public.overtime_applications;
CREATE POLICY "overtime_select_own_or_site_manager" ON public.overtime_applications
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_payroll_settlement_user()
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
    OR public.is_site_approver_for(user_id)
  );

DROP POLICY IF EXISTS "overtime_update_site_manager" ON public.overtime_applications;
CREATE POLICY "overtime_update_site_manager" ON public.overtime_applications
  FOR UPDATE USING (
    EXISTS (
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
    OR public.is_site_approver_for(user_id)
  );

-- 換班
DROP POLICY IF EXISTS "swap_select_own_or_site_manager" ON public.shift_swap_applications;
CREATE POLICY "swap_select_own_or_site_manager" ON public.shift_swap_applications
  FOR SELECT USING (
    requester_id = auth.uid()
    OR target_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = shift_swap_applications.requester_id
      WHERE me.id = auth.uid()
        AND me.role IN ('manager', 'deputy')
        AND me.site_id = emp.site_id
    )
    OR public.is_site_approver_for(requester_id)
  );

DROP POLICY IF EXISTS "swap_update_site_manager" ON public.shift_swap_applications;
CREATE POLICY "swap_update_site_manager" ON public.shift_swap_applications
  FOR UPDATE USING (
    requester_id = auth.uid()
    OR target_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = shift_swap_applications.requester_id
      WHERE me.id = auth.uid()
        AND me.role IN ('manager', 'deputy')
        AND me.site_id = emp.site_id
    )
    OR public.is_site_approver_for(requester_id)
  );

-- 打卡補登
DROP POLICY IF EXISTS "punch_correction_select" ON public.punch_correction_requests;
CREATE POLICY "punch_correction_select" ON public.punch_correction_requests
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = punch_correction_requests.user_id
      WHERE me.id = auth.uid()
        AND me.role IN ('manager', 'deputy')
        AND me.site_id = emp.site_id
    )
    OR public.is_site_approver_for(user_id)
  );

DROP POLICY IF EXISTS "punch_correction_update" ON public.punch_correction_requests;
CREATE POLICY "punch_correction_update" ON public.punch_correction_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = punch_correction_requests.user_id
      WHERE me.id = auth.uid()
        AND me.role IN ('manager', 'deputy')
        AND me.site_id = emp.site_id
    )
    OR public.is_site_approver_for(user_id)
  );

-- 特休／補休遞延
DROP POLICY IF EXISTS "leave_deferral_select" ON public.leave_deferral_requests;
CREATE POLICY "leave_deferral_select" ON public.leave_deferral_requests
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
    OR public.is_site_approver_for(user_id)
  );

DROP POLICY IF EXISTS "leave_deferral_update" ON public.leave_deferral_requests;
CREATE POLICY "leave_deferral_update" ON public.leave_deferral_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
    OR public.is_site_approver_for(user_id)
  );

-- 審核請假／換班時需寫入班表（僅 RLS；前端排班頁仍依 schedule 授權）
CREATE OR REPLACE FUNCTION public.can_edit_schedule_rls()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_store_manage_role()
    OR public.user_has_capability('schedule')
    OR public.user_has_capability('approve');
$$;

-- 請假核准清除遲到時需改打卡／遲到紀錄
CREATE OR REPLACE FUNCTION public.is_site_punch_admin_for(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users me
    WHERE me.id = auth.uid()
      AND me.role IN ('boss', 'owner')
  )
  OR EXISTS (
    SELECT 1
    FROM public.users me
    JOIN public.users them ON them.id = target_user_id
    WHERE me.id = auth.uid()
      AND me.role IN ('manager', 'deputy')
      AND me.site_id = them.site_id
  )
  OR (
    public.user_has_capability('punch_admin')
    AND public.same_site_as_auth(target_user_id)
  )
  OR public.is_site_approver_for(target_user_id);
$$;
