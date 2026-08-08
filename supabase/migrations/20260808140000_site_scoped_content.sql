-- 公告／排班說明／颱風彈性出勤日依店隔離
-- 既有資料一律歸竹山（zhushan），集集看不到竹山公告等內容

-- ─── bulletin_board ───────────────────────────────────────────
ALTER TABLE public.bulletin_board
  ADD COLUMN IF NOT EXISTS site_id TEXT NOT NULL DEFAULT 'zhushan';

ALTER TABLE public.bulletin_board
  DROP CONSTRAINT IF EXISTS bulletin_board_site_id_check;

ALTER TABLE public.bulletin_board
  ADD CONSTRAINT bulletin_board_site_id_check
  CHECK (site_id IN ('zhushan', 'jiji'));

UPDATE public.bulletin_board
SET site_id = 'zhushan'
WHERE site_id IS NULL OR site_id = '';

CREATE INDEX IF NOT EXISTS idx_bulletin_board_site_created
  ON public.bulletin_board (site_id, created_at DESC);

COMMENT ON COLUMN public.bulletin_board.site_id IS
  '公告所屬店；各店佈告欄／登入彈窗互不顯示';

-- ─── scheduling_notes ─────────────────────────────────────────
ALTER TABLE public.scheduling_notes
  ADD COLUMN IF NOT EXISTS site_id TEXT NOT NULL DEFAULT 'zhushan';

ALTER TABLE public.scheduling_notes
  DROP CONSTRAINT IF EXISTS scheduling_notes_site_id_check;

ALTER TABLE public.scheduling_notes
  ADD CONSTRAINT scheduling_notes_site_id_check
  CHECK (site_id IN ('zhushan', 'jiji'));

UPDATE public.scheduling_notes
SET site_id = 'zhushan'
WHERE site_id IS NULL OR site_id = '';

-- 每店一筆說明
ALTER TABLE public.scheduling_notes
  DROP CONSTRAINT IF EXISTS scheduling_notes_site_id_key;

ALTER TABLE public.scheduling_notes
  ADD CONSTRAINT scheduling_notes_site_id_key UNIQUE (site_id);

INSERT INTO public.scheduling_notes (content, site_id)
VALUES (
  '家禾藥局（集集）排班說明可在此編輯。
請依本店班別目錄與店家設定維護。',
  'jiji'
)
ON CONFLICT (site_id) DO NOTHING;

COMMENT ON COLUMN public.scheduling_notes.site_id IS
  '排班規則說明所屬店';

-- ─── flexible_attendance_days（颱風／彈性出勤） ───────────────
ALTER TABLE public.flexible_attendance_days
  ADD COLUMN IF NOT EXISTS site_id TEXT NOT NULL DEFAULT 'zhushan';

ALTER TABLE public.flexible_attendance_days
  DROP CONSTRAINT IF EXISTS flexible_attendance_days_site_id_check;

ALTER TABLE public.flexible_attendance_days
  ADD CONSTRAINT flexible_attendance_days_site_id_check
  CHECK (site_id IN ('zhushan', 'jiji'));

UPDATE public.flexible_attendance_days
SET site_id = 'zhushan'
WHERE site_id IS NULL OR site_id = '';

-- 同日可各店各一筆
ALTER TABLE public.flexible_attendance_days
  DROP CONSTRAINT IF EXISTS flexible_attendance_days_day_date_key;

ALTER TABLE public.flexible_attendance_days
  DROP CONSTRAINT IF EXISTS flexible_attendance_days_day_date_site_id_key;

ALTER TABLE public.flexible_attendance_days
  ADD CONSTRAINT flexible_attendance_days_day_date_site_id_key
  UNIQUE (day_date, site_id);

CREATE INDEX IF NOT EXISTS idx_flexible_days_site_date
  ON public.flexible_attendance_days (site_id, day_date);

COMMENT ON COLUMN public.flexible_attendance_days.site_id IS
  '颱風／彈性出勤日所屬店；公告與班表標記互不影響';
