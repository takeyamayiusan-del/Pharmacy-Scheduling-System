-- 副店設定固定班／班表覆蓋／班別時間：RLS 與店長對齊
-- fixed_shifts 等表原 policy 僅 boss/manager，副店 upsert 會觸發 RLS 錯誤

CREATE OR REPLACE FUNCTION public.is_schedule_manager_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND role IN ('boss', 'owner', 'manager', 'deputy')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_schedule_manager_user() TO authenticated;

DROP POLICY IF EXISTS "fixed_shifts_write_manager" ON public.fixed_shifts;
CREATE POLICY "fixed_shifts_write_manager" ON public.fixed_shifts
  FOR ALL
  USING (public.is_schedule_manager_user())
  WITH CHECK (public.is_schedule_manager_user());

DROP POLICY IF EXISTS "shift_time_config_write_manager" ON public.shift_time_config;
CREATE POLICY "shift_time_config_write_manager" ON public.shift_time_config
  FOR ALL
  USING (public.is_schedule_manager_user())
  WITH CHECK (public.is_schedule_manager_user());

DROP POLICY IF EXISTS "schedule_overrides_write_manager" ON public.schedule_overrides;
CREATE POLICY "schedule_overrides_write_manager" ON public.schedule_overrides
  FOR ALL
  USING (public.is_schedule_manager_user())
  WITH CHECK (public.is_schedule_manager_user());
