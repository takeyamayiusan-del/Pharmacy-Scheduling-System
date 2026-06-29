-- ============================================================
-- 本機認證：users 表新增 username，店長可管理員工
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE;

COMMENT ON COLUMN public.users.username IS '登入帳號（不含 @網域）';

-- 放寬 RLS：店長與老闆皆可管理員工
DROP POLICY IF EXISTS "users_insert_boss_only" ON public.users;
DROP POLICY IF EXISTS "users_update_boss_only" ON public.users;
DROP POLICY IF EXISTS "users_delete_boss_only" ON public.users;

CREATE POLICY "users_insert_manager" ON public.users
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'manager')
    )
  );

CREATE POLICY "users_update_manager" ON public.users
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'manager')
    )
  );

CREATE POLICY "users_delete_manager" ON public.users
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'manager')
    )
  );
