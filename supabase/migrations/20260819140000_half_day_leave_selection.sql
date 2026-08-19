-- 集集店長「只能休半天」：個人規則 + 排休選擇可記上午／下午與剩下半天班別

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_half_day_leave_rule BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS half_day_work_shift VARCHAR(32);

COMMENT ON COLUMN public.users.is_half_day_leave_rule IS '只能休半天：排休選擇不可選全日，需指定休上午或下午，剩下半天上自選班別';
COMMENT ON COLUMN public.users.half_day_work_shift IS '半天規則預設剩下半天要上的班碼（可於每次排休再改）';

ALTER TABLE public.leave_selections
  ADD COLUMN IF NOT EXISTS period VARCHAR(16) NOT NULL DEFAULT 'full_day',
  ADD COLUMN IF NOT EXISTS work_shift VARCHAR(32);

COMMENT ON COLUMN public.leave_selections.period IS 'full_day | morning | afternoon';
COMMENT ON COLUMN public.leave_selections.work_shift IS '半天排休：剩下半天要上的班碼';

ALTER TABLE public.leave_selections
  DROP CONSTRAINT IF EXISTS leave_selections_period_check;

ALTER TABLE public.leave_selections
  ADD CONSTRAINT leave_selections_period_check
  CHECK (period IN ('full_day', 'morning', 'afternoon'));

DROP POLICY IF EXISTS "leave_selections_update_own" ON public.leave_selections;
CREATE POLICY "leave_selections_update_own" ON public.leave_selections
  FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'manager')
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('boss', 'manager')
    )
  );

