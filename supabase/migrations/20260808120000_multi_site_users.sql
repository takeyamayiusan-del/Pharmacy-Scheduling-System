-- 多分店：使用者綁定店別（竹山／集集）
-- 既有使用者一律歸竹山，排班資料與行為不受影響

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS site_id TEXT NOT NULL DEFAULT 'zhushan';

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_site_id_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_site_id_check
  CHECK (site_id IN ('zhushan', 'jiji'));

CREATE INDEX IF NOT EXISTS idx_users_site_id ON public.users(site_id);

COMMENT ON COLUMN public.users.site_id IS
  '所屬店：zhushan=耀聖竹山（預設）、jiji=家禾集集；老闆可跨店切換檢視';

-- 保險：把任何空值補成竹山
UPDATE public.users SET site_id = 'zhushan' WHERE site_id IS NULL OR site_id = '';
