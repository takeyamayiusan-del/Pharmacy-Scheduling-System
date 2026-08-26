-- 副店可查看／調整全員補休帳本（與前端 canManageSite 對齊）
-- 先前 RLS 僅 boss/manager，副店審核時看不到他人補休餘額，核發／扣回也會失敗

DROP POLICY IF EXISTS "comp_leave_select_own_or_manager" ON public.comp_leave_ledger;
CREATE POLICY "comp_leave_select_own_or_manager" ON public.comp_leave_ledger
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  );

DROP POLICY IF EXISTS "comp_leave_insert_system" ON public.comp_leave_ledger;
CREATE POLICY "comp_leave_insert_system" ON public.comp_leave_ledger
  FOR INSERT WITH CHECK (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  );
