-- 副店／老闆與店長對齊：公告可改刪、薪資可看全員
-- 先前 RLS 僅 boss/manager，前端已把 deputy 當管理者，導致：
-- 1) 副店只能看到自己的薪資設定
-- 2) 副店刪不掉別人發的公告
-- 3) 訂餐結束時封存公告失敗，公告仍顯示

-- ─── 公告欄 ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "bulletin_board_update_owner_manager" ON public.bulletin_board;
CREATE POLICY "bulletin_board_update_owner_manager" ON public.bulletin_board
  FOR UPDATE USING (
    author_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  );

DROP POLICY IF EXISTS "bulletin_board_delete_owner_manager" ON public.bulletin_board;
CREATE POLICY "bulletin_board_delete_owner_manager" ON public.bulletin_board
  FOR DELETE USING (
    author_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  );

-- 已結束的訂餐活動：補封存仍卡在 active 的公告
UPDATE public.bulletin_board b
SET status = 'archived',
    updated_at = NOW()
WHERE b.type = 'meal_order'
  AND b.status = 'active'
  AND EXISTS (
    SELECT 1
    FROM public.meal_orders m
    WHERE m.status IN ('ordered', 'closed')
      AND (
        m.bulletin_id = b.id
        OR m.id = b.related_id
      )
  );

-- ─── 員工薪資設定 ───────────────────────────────────────────
DROP POLICY IF EXISTS "salary_config_select_manager" ON public.employee_salary_config;
CREATE POLICY "salary_config_select_manager" ON public.employee_salary_config
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  );

DROP POLICY IF EXISTS "salary_config_write_manager" ON public.employee_salary_config;
CREATE POLICY "salary_config_write_manager" ON public.employee_salary_config
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  );

-- ─── 薪資項目（職位加級／固定津貼）─────────────────────────
DROP POLICY IF EXISTS "salary_items_select_manager" ON public.employee_salary_items;
CREATE POLICY "salary_items_select_manager" ON public.employee_salary_items
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  );

DROP POLICY IF EXISTS "salary_items_write_manager" ON public.employee_salary_items;
CREATE POLICY "salary_items_write_manager" ON public.employee_salary_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  );

-- ─── 月結紀錄 ───────────────────────────────────────────────
DROP POLICY IF EXISTS "payroll_records_select" ON public.payroll_records;
CREATE POLICY "payroll_records_select" ON public.payroll_records
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  );

DROP POLICY IF EXISTS "payroll_records_write_manager" ON public.payroll_records;
CREATE POLICY "payroll_records_write_manager" ON public.payroll_records
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  );

-- ─── 異動項目 ───────────────────────────────────────────────
DROP POLICY IF EXISTS "payroll_adj_select" ON public.payroll_adjustments;
CREATE POLICY "payroll_adj_select" ON public.payroll_adjustments
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  );

DROP POLICY IF EXISTS "payroll_adj_write_manager" ON public.payroll_adjustments;
CREATE POLICY "payroll_adj_write_manager" ON public.payroll_adjustments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  );

-- ─── 費率設定 ───────────────────────────────────────────────
DROP POLICY IF EXISTS "payroll_rate_write_manager" ON public.payroll_rate_config;
CREATE POLICY "payroll_rate_write_manager" ON public.payroll_rate_config
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'owner', 'manager', 'deputy')
    )
  );
