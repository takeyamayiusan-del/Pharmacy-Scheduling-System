-- 本機可手動套用：員工到期日
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS end_date DATE;
