-- 遲到紀錄：副店可讀寫本店（與打卡／工時統計對齊）
-- 先前僅 manager；副店在工時統計看全員時遲到欄會空白

DROP POLICY IF EXISTS "tardiness_select_manager_or_own" ON public.tardiness_records;
CREATE POLICY "tardiness_select_manager_or_own" ON public.tardiness_records
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
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

DROP POLICY IF EXISTS "tardiness_insert_manager" ON public.tardiness_records;
CREATE POLICY "tardiness_insert_manager" ON public.tardiness_records
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
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

DROP POLICY IF EXISTS "tardiness_update_manager" ON public.tardiness_records;
CREATE POLICY "tardiness_update_manager" ON public.tardiness_records
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
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

DROP POLICY IF EXISTS "tardiness_delete_manager" ON public.tardiness_records;
CREATE POLICY "tardiness_delete_manager" ON public.tardiness_records
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role IN ('boss', 'owner')
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
