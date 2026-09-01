-- 副店／授權員工：RLS 與前端 roleCapabilities + capabilities 對齊
-- 老闆於「權限設定」調整的 schedule / store_settings / punch_admin 等員工授權，須能寫入 DB

-- ─── 共用判斷函式 ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_store_manage_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('boss', 'owner', 'manager', 'deputy')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_schedule_rls()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_store_manage_role()
    OR public.user_has_capability('schedule');
$$;

CREATE OR REPLACE FUNCTION public.is_schedule_manager_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_edit_schedule_rls();
$$;

CREATE OR REPLACE FUNCTION public.can_edit_store_settings_rls()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_store_manage_role()
    OR public.user_has_capability('store_settings');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_employees_rls()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_store_manage_role()
    OR public.user_has_capability('employees');
$$;

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
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_store_manage_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_schedule_rls() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_store_settings_rls() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_employees_rls() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_site_punch_admin_for(uuid) TO authenticated;

-- ─── 移除 orphan 薪資 policy（會讓副店繞過 canManagePayroll）────

DROP POLICY IF EXISTS "salary_config_select_manager" ON public.employee_salary_config;
DROP POLICY IF EXISTS "salary_config_write_manager" ON public.employee_salary_config;
DROP POLICY IF EXISTS "salary_items_select_manager" ON public.employee_salary_items;
DROP POLICY IF EXISTS "salary_items_write_manager" ON public.employee_salary_items;
DROP POLICY IF EXISTS "salary_monthly_select_auth" ON public.employee_salary_monthly;
DROP POLICY IF EXISTS "salary_monthly_write_mgr" ON public.employee_salary_monthly;

-- ─── 排班核心 ───────────────────────────────────────────────

DROP POLICY IF EXISTS "schedule_insert_manager" ON public.schedule_entries;
CREATE POLICY "schedule_insert_manager" ON public.schedule_entries
  FOR INSERT WITH CHECK (
    public.can_edit_schedule_rls()
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "schedule_update_manager" ON public.schedule_entries;
CREATE POLICY "schedule_update_manager" ON public.schedule_entries
  FOR UPDATE USING (public.can_edit_schedule_rls());

DROP POLICY IF EXISTS "schedule_locks_insert_manager" ON public.schedule_locks;
CREATE POLICY "schedule_locks_insert_manager" ON public.schedule_locks
  FOR INSERT WITH CHECK (public.can_edit_schedule_rls());

DROP POLICY IF EXISTS "schedule_locks_delete_manager" ON public.schedule_locks;
CREATE POLICY "schedule_locks_delete_manager" ON public.schedule_locks
  FOR DELETE USING (public.can_edit_schedule_rls());

DROP POLICY IF EXISTS "scheduling_rules_update_manager" ON public.scheduling_rules;
CREATE POLICY "scheduling_rules_update_manager" ON public.scheduling_rules
  FOR UPDATE USING (public.can_edit_schedule_rls());

DROP POLICY IF EXISTS "scheduling_rules_insert_manager" ON public.scheduling_rules;
CREATE POLICY "scheduling_rules_insert_manager" ON public.scheduling_rules
  FOR INSERT WITH CHECK (public.can_edit_schedule_rls());

DROP POLICY IF EXISTS "scheduling_rules_delete_manager" ON public.scheduling_rules;
CREATE POLICY "scheduling_rules_delete_manager" ON public.scheduling_rules
  FOR DELETE USING (public.can_edit_schedule_rls());

DROP POLICY IF EXISTS "scheduling_notes_write_manager" ON public.scheduling_notes;
CREATE POLICY "scheduling_notes_write_manager" ON public.scheduling_notes
  FOR ALL
  USING (public.can_edit_schedule_rls())
  WITH CHECK (public.can_edit_schedule_rls());

DROP POLICY IF EXISTS "fixed_shifts_write_manager" ON public.fixed_shifts;
CREATE POLICY "fixed_shifts_write_manager" ON public.fixed_shifts
  FOR ALL
  USING (public.can_edit_schedule_rls())
  WITH CHECK (public.can_edit_schedule_rls());

DROP POLICY IF EXISTS "shift_time_config_write_manager" ON public.shift_time_config;
CREATE POLICY "shift_time_config_write_manager" ON public.shift_time_config
  FOR ALL
  USING (public.can_edit_schedule_rls())
  WITH CHECK (public.can_edit_schedule_rls());

DROP POLICY IF EXISTS "schedule_overrides_write_manager" ON public.schedule_overrides;
CREATE POLICY "schedule_overrides_write_manager" ON public.schedule_overrides
  FOR ALL
  USING (public.can_edit_schedule_rls())
  WITH CHECK (public.can_edit_schedule_rls());

DROP POLICY IF EXISTS "leave_selections_insert_manager" ON public.leave_selections;
CREATE POLICY "leave_selections_insert_manager" ON public.leave_selections
  FOR INSERT WITH CHECK (
    public.can_edit_schedule_rls()
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "leave_selections_delete_manager" ON public.leave_selections;
CREATE POLICY "leave_selections_delete_manager" ON public.leave_selections
  FOR DELETE USING (
    public.can_edit_schedule_rls()
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "leave_month_locks_manager" ON public.leave_month_locks;
CREATE POLICY "leave_month_locks_manager" ON public.leave_month_locks
  FOR ALL
  USING (public.can_edit_schedule_rls())
  WITH CHECK (public.can_edit_schedule_rls());

-- ─── 店家設定 ───────────────────────────────────────────────

DROP POLICY IF EXISTS "app_settings_upsert_manager" ON public.app_settings;
CREATE POLICY "app_settings_upsert_manager" ON public.app_settings
  FOR ALL
  USING (public.can_edit_store_settings_rls())
  WITH CHECK (public.can_edit_store_settings_rls());

DROP POLICY IF EXISTS "annual_leave_config_manage" ON public.annual_leave_config;
CREATE POLICY "annual_leave_config_manage" ON public.annual_leave_config
  FOR ALL
  USING (public.can_edit_store_settings_rls())
  WITH CHECK (public.can_edit_store_settings_rls());

DROP POLICY IF EXISTS "annual_leave_adjustments_manage" ON public.annual_leave_adjustments;
CREATE POLICY "annual_leave_adjustments_manage" ON public.annual_leave_adjustments
  FOR ALL
  USING (public.can_edit_store_settings_rls())
  WITH CHECK (public.can_edit_store_settings_rls());

-- ─── 國定假日／變形工時 ─────────────────────────────────────

DROP POLICY IF EXISTS "holidays_insert_manager" ON public.holidays;
CREATE POLICY "holidays_insert_manager" ON public.holidays
  FOR INSERT WITH CHECK (public.can_edit_schedule_rls());

DROP POLICY IF EXISTS "holidays_update_manager" ON public.holidays;
CREATE POLICY "holidays_update_manager" ON public.holidays
  FOR UPDATE USING (public.can_edit_schedule_rls());

DROP POLICY IF EXISTS "holidays_delete_manager" ON public.holidays;
CREATE POLICY "holidays_delete_manager" ON public.holidays
  FOR DELETE USING (public.can_edit_schedule_rls());

DROP POLICY IF EXISTS "flexible_days_manage" ON public.flexible_attendance_days;
CREATE POLICY "flexible_days_manage" ON public.flexible_attendance_days
  FOR ALL
  USING (public.can_edit_schedule_rls())
  WITH CHECK (public.can_edit_schedule_rls());

DROP POLICY IF EXISTS "flexible_results_manage" ON public.flexible_attendance_results;
CREATE POLICY "flexible_results_manage" ON public.flexible_attendance_results
  FOR ALL
  USING (public.can_edit_schedule_rls())
  WITH CHECK (public.can_edit_schedule_rls());

DROP POLICY IF EXISTS "pending_makeup_manage" ON public.pending_makeup_hours;
CREATE POLICY "pending_makeup_manage" ON public.pending_makeup_hours
  FOR ALL
  USING (public.can_edit_schedule_rls())
  WITH CHECK (public.can_edit_schedule_rls());

-- ─── 員工帳號（直接 client 寫入時）──────────────────────────

DROP POLICY IF EXISTS "users_insert_manager" ON public.users;
CREATE POLICY "users_insert_manager" ON public.users
  FOR INSERT WITH CHECK (public.can_manage_employees_rls());

DROP POLICY IF EXISTS "users_update_manager" ON public.users;
CREATE POLICY "users_update_manager" ON public.users
  FOR UPDATE USING (public.can_manage_employees_rls());

DROP POLICY IF EXISTS "users_delete_manager" ON public.users;
CREATE POLICY "users_delete_manager" ON public.users
  FOR DELETE USING (public.can_manage_employees_rls());

-- ─── 打卡／遲到（同店 + punch_admin 授權）────────────────────

DROP POLICY IF EXISTS "punch_insert_manager" ON public.punch_records;
CREATE POLICY "punch_insert_manager" ON public.punch_records
  FOR INSERT WITH CHECK (public.is_site_punch_admin_for(employee_id));

DROP POLICY IF EXISTS "punch_update_manager" ON public.punch_records;
CREATE POLICY "punch_update_manager" ON public.punch_records
  FOR UPDATE USING (public.is_site_punch_admin_for(employee_id));

DROP POLICY IF EXISTS "punch_delete_manager" ON public.punch_records;
CREATE POLICY "punch_delete_manager" ON public.punch_records
  FOR DELETE USING (public.is_site_punch_admin_for(employee_id));

DROP POLICY IF EXISTS "tardiness_insert_manager" ON public.tardiness_records;
CREATE POLICY "tardiness_insert_manager" ON public.tardiness_records
  FOR INSERT WITH CHECK (public.is_site_punch_admin_for(employee_id));

DROP POLICY IF EXISTS "tardiness_update_manager" ON public.tardiness_records;
CREATE POLICY "tardiness_update_manager" ON public.tardiness_records
  FOR UPDATE USING (public.is_site_punch_admin_for(employee_id));

DROP POLICY IF EXISTS "tardiness_delete_manager" ON public.tardiness_records;
CREATE POLICY "tardiness_delete_manager" ON public.tardiness_records
  FOR DELETE USING (public.is_site_punch_admin_for(employee_id));

-- ─── 請假附件（副店可更新）──────────────────────────────────

DROP POLICY IF EXISTS "leave_attachments_update_manager" ON public.leave_attachments;
CREATE POLICY "leave_attachments_update_manager" ON public.leave_attachments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  );
