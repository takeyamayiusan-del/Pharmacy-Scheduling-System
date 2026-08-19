-- 店長／副店／老闆代登請假、加班：INSERT 需允許 user_id 為本店員工（非僅 auth.uid()）

DROP POLICY IF EXISTS "leave_insert_own" ON public.leave_applications;
CREATE POLICY "leave_insert_own_or_site_manager" ON public.leave_applications
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
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

DROP POLICY IF EXISTS "overtime_insert_own" ON public.overtime_applications;
CREATE POLICY "overtime_insert_own_or_site_manager" ON public.overtime_applications
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
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
