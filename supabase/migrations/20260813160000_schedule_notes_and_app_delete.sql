-- 班表儲存格備註（播假原因，比照國定假日標示）
ALTER TABLE public.schedule_entries
  ADD COLUMN IF NOT EXISTS note TEXT;

ALTER TABLE public.schedule_entries
  ADD COLUMN IF NOT EXISTS note_kind VARCHAR(20);

COMMENT ON COLUMN public.schedule_entries.note IS '儲存格備註，例如變形工時超時播假原因';
COMMENT ON COLUMN public.schedule_entries.note_kind IS 'holiday / auto_rest / manual';

-- 申請刪除：副店／老闆／店長可刪；員工可刪自己的待審
DROP POLICY IF EXISTS "leave_applications_delete_manager" ON public.leave_applications;
CREATE POLICY "leave_applications_delete_manager" ON public.leave_applications
  FOR DELETE USING (
    (
      status = 'pending'
      AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  );

DROP POLICY IF EXISTS "shift_swap_delete_manager" ON public.shift_swap_applications;
CREATE POLICY "shift_swap_delete_manager" ON public.shift_swap_applications
  FOR DELETE USING (
    (
      status IN ('pending_confirm', 'pending_review')
      AND (requester_id = auth.uid() OR target_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  );

DROP POLICY IF EXISTS "overtime_applications_delete_manager" ON public.overtime_applications;
CREATE POLICY "overtime_applications_delete_manager" ON public.overtime_applications
  FOR DELETE USING (
    (
      status = 'pending'
      AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  );

DROP POLICY IF EXISTS "leave_attachments_delete_manager" ON public.leave_attachments;
CREATE POLICY "leave_attachments_delete_manager" ON public.leave_attachments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.leave_applications a
      WHERE a.id = leave_attachments.application_id
        AND a.user_id = auth.uid()
        AND a.status = 'pending'
    )
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  );

-- 遞延申請原本沒有 DELETE policy
DROP POLICY IF EXISTS "leave_deferral_delete" ON public.leave_deferral_requests;
CREATE POLICY "leave_deferral_delete" ON public.leave_deferral_requests
  FOR DELETE USING (
    (
      status = 'pending'
      AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  );

-- 副店可看／審本店申請（否則列表看不到、刪除鈕也按不到）
DROP POLICY IF EXISTS "leave_select_own_or_site_manager" ON public.leave_applications;
CREATE POLICY "leave_select_own_or_site_manager" ON public.leave_applications
  FOR SELECT USING (
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
  );

DROP POLICY IF EXISTS "overtime_select_own_or_site_manager" ON public.overtime_applications;
CREATE POLICY "overtime_select_own_or_site_manager" ON public.overtime_applications
  FOR SELECT USING (
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
  );

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
  );

DROP POLICY IF EXISTS "swap_update_site_manager" ON public.shift_swap_applications;
CREATE POLICY "swap_update_site_manager" ON public.shift_swap_applications
  FOR UPDATE USING (
    target_id = auth.uid()
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
  );
