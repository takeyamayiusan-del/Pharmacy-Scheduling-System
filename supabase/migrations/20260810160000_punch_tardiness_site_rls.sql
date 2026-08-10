-- 打卡／遲到：店長僅能存取本店員工；老闆（owner／boss）可跨店
-- punch_records／tardiness_records 本身無 site_id，透過 users.site_id 關聯

-- ─── punch_records ────────────────────────────────────────────

DROP POLICY IF EXISTS "punch_select_own_or_manager" ON public.punch_records;
CREATE POLICY "punch_select_own_or_manager" ON public.punch_records
  FOR SELECT USING (
    employee_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid()
        AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = punch_records.employee_id
      WHERE me.id = auth.uid()
        AND me.role = 'manager'
        AND me.site_id = emp.site_id
    )
  );

DROP POLICY IF EXISTS "punch_insert_manager" ON public.punch_records;
CREATE POLICY "punch_insert_manager" ON public.punch_records
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid()
        AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = punch_records.employee_id
      WHERE me.id = auth.uid()
        AND me.role = 'manager'
        AND me.site_id = emp.site_id
    )
  );

DROP POLICY IF EXISTS "punch_update_manager" ON public.punch_records;
CREATE POLICY "punch_update_manager" ON public.punch_records
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid()
        AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = punch_records.employee_id
      WHERE me.id = auth.uid()
        AND me.role = 'manager'
        AND me.site_id = emp.site_id
    )
  );

DROP POLICY IF EXISTS "punch_delete_manager" ON public.punch_records;
CREATE POLICY "punch_delete_manager" ON public.punch_records
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid()
        AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = punch_records.employee_id
      WHERE me.id = auth.uid()
        AND me.role = 'manager'
        AND me.site_id = emp.site_id
    )
  );

-- ─── tardiness_records ────────────────────────────────────────

DROP POLICY IF EXISTS "tardiness_select_manager_or_own" ON public.tardiness_records;
CREATE POLICY "tardiness_select_manager_or_own" ON public.tardiness_records
  FOR SELECT USING (
    user_id = auth.uid()
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
        AND me.role = 'manager'
        AND me.site_id = emp.site_id
    )
  );

DROP POLICY IF EXISTS "tardiness_insert_manager" ON public.tardiness_records;
DROP POLICY IF EXISTS "tardiness_insert_boss" ON public.tardiness_records;
CREATE POLICY "tardiness_insert_manager" ON public.tardiness_records
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid()
        AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = tardiness_records.user_id
      WHERE me.id = auth.uid()
        AND me.role = 'manager'
        AND me.site_id = emp.site_id
    )
  );

DROP POLICY IF EXISTS "tardiness_update_manager" ON public.tardiness_records;
CREATE POLICY "tardiness_update_manager" ON public.tardiness_records
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid()
        AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = tardiness_records.user_id
      WHERE me.id = auth.uid()
        AND me.role = 'manager'
        AND me.site_id = emp.site_id
    )
  );

DROP POLICY IF EXISTS "tardiness_delete_manager" ON public.tardiness_records;
CREATE POLICY "tardiness_delete_manager" ON public.tardiness_records
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid()
        AND me.role IN ('boss', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM public.users me
      JOIN public.users emp ON emp.id = tardiness_records.user_id
      WHERE me.id = auth.uid()
        AND me.role = 'manager'
        AND me.site_id = emp.site_id
    )
  );
