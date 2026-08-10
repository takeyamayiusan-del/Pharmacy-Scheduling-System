-- 集集進階班別：schedule／punch 班碼可為自訂短碼（如「白班1」）
-- 竹山既有 A–E／X 資料不變；fixed_shifts／shift_time_config 仍限 A–X

-- schedule_entries
ALTER TABLE public.schedule_entries
  ALTER COLUMN shift_code TYPE VARCHAR(24);

ALTER TABLE public.schedule_entries
  DROP CONSTRAINT IF EXISTS schedule_entries_shift_code_check;

-- punch_records.shift（打卡當日班別）
ALTER TABLE public.punch_records
  ALTER COLUMN shift TYPE VARCHAR(24);

COMMENT ON COLUMN public.schedule_entries.shift_code IS
  '班別碼：竹山 A–E／X；集集可為店家班別目錄短碼（≤24字）';
