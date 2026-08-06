-- 補齊 employee_salary_items 權限（permission denied for table）
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_salary_items TO authenticated;
GRANT ALL ON public.employee_salary_items TO service_role;

-- 寫入政策補 WITH CHECK（INSERT 需要）
DROP POLICY IF EXISTS "salary_items_write_manager" ON public.employee_salary_items;
CREATE POLICY "salary_items_write_manager" ON public.employee_salary_items
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager', 'owner'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('boss', 'manager', 'owner'))
  );
