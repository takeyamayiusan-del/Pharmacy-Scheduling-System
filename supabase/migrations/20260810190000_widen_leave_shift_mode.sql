-- 請假「指定班」可寫入集集目錄碼（與班表／固定班 VARCHAR(24) 對齊）
ALTER TABLE public.leave_applications
  ALTER COLUMN shift_mode TYPE VARCHAR(24);
