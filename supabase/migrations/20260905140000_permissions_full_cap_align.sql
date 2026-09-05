-- Align RLS with granted capabilities so authorized staff don't hit permission
-- errors after the UI already shows the action (which caused repeated alert popups).

-- 1) Allow duplicate display names; login uniqueness remains on username.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_name_key;
ALTER TABLE public.users
  ALTER COLUMN name TYPE VARCHAR(50);

-- 2) Leave / overtime INSERT: site approvers (capabilities.approve) may proxy-create.
DROP POLICY IF EXISTS "leave_insert_own" ON public.leave_applications;
DROP POLICY IF EXISTS "leave_insert_own_or_site_manager" ON public.leave_applications;
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
    OR public.is_site_approver_for(user_id)
  );

DROP POLICY IF EXISTS "overtime_insert_own" ON public.overtime_applications;
DROP POLICY IF EXISTS "overtime_insert_own_or_site_manager" ON public.overtime_applications;
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
    OR public.is_site_approver_for(user_id)
  );

-- 3) Comp-leave ledger: approvers can adjust / view same-site balances.
DROP POLICY IF EXISTS "comp_leave_select_own_or_manager" ON public.comp_leave_ledger;
CREATE POLICY "comp_leave_select_own_or_manager" ON public.comp_leave_ledger
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
    OR public.is_site_approver_for(user_id)
  );

DROP POLICY IF EXISTS "comp_leave_insert_system" ON public.comp_leave_ledger;
CREATE POLICY "comp_leave_insert_system" ON public.comp_leave_ledger
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
    OR public.is_site_approver_for(user_id)
  );

-- 4) Leave attachments: approvers can read/update/delete same-site rows.
DROP POLICY IF EXISTS "leave_attachments_select" ON public.leave_attachments;
CREATE POLICY "leave_attachments_select" ON public.leave_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.leave_applications a
      WHERE a.id = leave_attachments.application_id
        AND (
          a.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.users me
            WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
          )
          OR EXISTS (
            SELECT 1
            FROM public.users me
            JOIN public.users emp ON emp.id = a.user_id
            WHERE me.id = auth.uid()
              AND me.role IN ('manager', 'deputy')
              AND me.site_id = emp.site_id
          )
          OR public.is_site_approver_for(a.user_id)
        )
    )
  );

DROP POLICY IF EXISTS "leave_attachments_update_manager" ON public.leave_attachments;
CREATE POLICY "leave_attachments_update_manager" ON public.leave_attachments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.leave_applications a
      WHERE a.id = leave_attachments.application_id
        AND (
          EXISTS (
            SELECT 1 FROM public.users me
            WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
          )
          OR EXISTS (
            SELECT 1
            FROM public.users me
            JOIN public.users emp ON emp.id = a.user_id
            WHERE me.id = auth.uid()
              AND me.role IN ('manager', 'deputy')
              AND me.site_id = emp.site_id
          )
          OR public.is_site_approver_for(a.user_id)
        )
    )
  );

DROP POLICY IF EXISTS "leave_attachments_delete_manager" ON public.leave_attachments;
CREATE POLICY "leave_attachments_delete_manager" ON public.leave_attachments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.leave_applications a
      WHERE a.id = leave_attachments.application_id
        AND (
          EXISTS (
            SELECT 1 FROM public.users me
            WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
          )
          OR EXISTS (
            SELECT 1
            FROM public.users me
            JOIN public.users emp ON emp.id = a.user_id
            WHERE me.id = auth.uid()
              AND me.role IN ('manager', 'deputy')
              AND me.site_id = emp.site_id
          )
          OR public.is_site_approver_for(a.user_id)
        )
    )
  );

-- 5) Geofence app_settings: punch_admin may upsert geofence keys without store_settings.
DROP POLICY IF EXISTS "app_settings_geofence_punch_admin" ON public.app_settings;
CREATE POLICY "app_settings_geofence_punch_admin" ON public.app_settings
  FOR ALL
  USING (
    (id = 'geofence' OR id LIKE 'geofence:%')
    AND (
      public.can_edit_store_settings_rls()
      OR public.user_has_capability('punch_admin')
    )
  )
  WITH CHECK (
    (id = 'geofence' OR id LIKE 'geofence:%')
    AND (
      public.can_edit_store_settings_rls()
      OR public.user_has_capability('punch_admin')
    )
  );
