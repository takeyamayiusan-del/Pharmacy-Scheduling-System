-- 換班／請假核准前班表快照，供取消核准時還原
ALTER TABLE public.shift_swap_applications
  ADD COLUMN IF NOT EXISTS schedule_snapshot JSONB;

ALTER TABLE public.leave_applications
  ADD COLUMN IF NOT EXISTS schedule_snapshot JSONB;
