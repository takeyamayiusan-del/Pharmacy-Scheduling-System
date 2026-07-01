-- 允許店長/老闆代員工維護排休選擇（班表手動調整時同步）

CREATE POLICY "leave_selections_insert_manager" ON public.leave_selections
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'manager')
    )
    OR user_id = auth.uid()
  );

CREATE POLICY "leave_selections_delete_manager" ON public.leave_selections
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'manager')
    )
    OR user_id = auth.uid()
  );
