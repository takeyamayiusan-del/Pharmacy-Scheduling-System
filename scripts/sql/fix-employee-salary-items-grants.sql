-- 立即修復：employee_salary_items permission denied
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_salary_items TO authenticated;
GRANT ALL ON public.employee_salary_items TO service_role;

DROP POLICY IF EXISTS "salary_items_write_manager" ON public.employee_salary_items;
CREATE POLICY "salary_items_write_manager" ON public.employee_salary_items
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager', 'owner'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager', 'owner'))
  );
