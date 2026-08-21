-- 打卡補登申請保存「修改前時間」，列表才看得懂原時間 → 改後時間
ALTER TABLE public.punch_correction_requests
  ADD COLUMN IF NOT EXISTS original_time TIME;

COMMENT ON COLUMN public.punch_correction_requests.original_time IS
  '申請當下既有打卡時間；無對應紀錄時為 NULL（表示核准後新增）';
