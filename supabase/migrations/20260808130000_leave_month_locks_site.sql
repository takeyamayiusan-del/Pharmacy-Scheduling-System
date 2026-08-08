-- 排休月份鎖定依店隔離：竹山鎖月不影響集集，反之亦然

ALTER TABLE public.leave_month_locks
  ADD COLUMN IF NOT EXISTS site_id TEXT NOT NULL DEFAULT 'zhushan';

ALTER TABLE public.leave_month_locks
  DROP CONSTRAINT IF EXISTS leave_month_locks_site_id_check;

ALTER TABLE public.leave_month_locks
  ADD CONSTRAINT leave_month_locks_site_id_check
  CHECK (site_id IN ('zhushan', 'jiji'));

-- 舊資料一律視為竹山
UPDATE public.leave_month_locks
SET site_id = 'zhushan'
WHERE site_id IS NULL OR site_id = '';

-- 原本 UNIQUE(year, month) → 改為每店獨立
ALTER TABLE public.leave_month_locks
  DROP CONSTRAINT IF EXISTS leave_month_locks_year_month_key;

ALTER TABLE public.leave_month_locks
  DROP CONSTRAINT IF EXISTS leave_month_locks_year_month_site_id_key;

ALTER TABLE public.leave_month_locks
  ADD CONSTRAINT leave_month_locks_year_month_site_id_key
  UNIQUE (year, month, site_id);

CREATE INDEX IF NOT EXISTS idx_leave_month_locks_site
  ON public.leave_month_locks (site_id, year, month);

COMMENT ON COLUMN public.leave_month_locks.site_id IS
  '鎖定所屬店：zhushan／jiji；各店排休鎖定互不影響';
