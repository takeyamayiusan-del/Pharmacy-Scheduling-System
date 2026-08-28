-- 會計（capabilities.payroll）需讀取全員打卡／請假／加班／補休，供工時統計與薪資試算

-- punch_records
DROP POLICY IF EXISTS "punch_select_own_or_manager" ON public.punch_records;
CREATE POLICY "punch_select_own_or_manager" ON public.punch_records
  FOR SELECT USING (
    employee_id = auth.uid()
    OR public.is_payroll_settlement_user()
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

-- tardiness_records
DROP POLICY IF EXISTS "tardiness_select_manager_or_own" ON public.tardiness_records;
CREATE POLICY "tardiness_select_manager_or_own" ON public.tardiness_records
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_payroll_settlement_user()
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

-- leave_applications
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
  );

-- overtime_applications
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
  );

-- comp_leave_ledger（補休餘額）
DROP POLICY IF EXISTS "comp_leave_select_own_or_manager" ON public.comp_leave_ledger;
CREATE POLICY "comp_leave_select_own_or_manager" ON public.comp_leave_ledger
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_payroll_settlement_user()
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  );
