-- ============================================================
-- Allow owner role to manage tardiness records in addition to boss and manager
-- ============================================================

DROP POLICY IF EXISTS "tardiness_insert_manager" ON public.tardiness_records;
CREATE POLICY "tardiness_insert_manager" ON public.tardiness_records
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'manager')
    )
  );

DROP POLICY IF EXISTS "tardiness_update_manager" ON public.tardiness_records;
CREATE POLICY "tardiness_update_manager" ON public.tardiness_records
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'manager')
    )
  );

DROP POLICY IF EXISTS "tardiness_delete_manager" ON public.tardiness_records;
CREATE POLICY "tardiness_delete_manager" ON public.tardiness_records
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'manager')
    )
  );
