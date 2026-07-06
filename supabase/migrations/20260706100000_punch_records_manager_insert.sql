-- ============================================================
-- 店長／老闆可代員工新增、編輯、刪除打卡紀錄（打卡管理）
-- ============================================================

CREATE POLICY "punch_insert_manager" ON public.punch_records
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'manager', 'owner')
    )
  );

DROP POLICY IF EXISTS "punch_select_own_or_manager" ON public.punch_records;
CREATE POLICY "punch_select_own_or_manager" ON public.punch_records
  FOR SELECT USING (
    employee_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'manager', 'owner')
    )
  );

DROP POLICY IF EXISTS "punch_update_manager" ON public.punch_records;
CREATE POLICY "punch_update_manager" ON public.punch_records
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'manager', 'owner')
    )
  );

DROP POLICY IF EXISTS "punch_delete_manager" ON public.punch_records;
CREATE POLICY "punch_delete_manager" ON public.punch_records
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'manager', 'owner')
    )
  );
