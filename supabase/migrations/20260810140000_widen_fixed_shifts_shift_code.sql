-- 集集固定班可寫入目錄短碼（如「白班1」）
-- 竹山仍由 App 層 assertWritableShiftCode 限制為 A–E／X
-- shift_time_config 維持 A–X，不在此 migration 放寬

ALTER TABLE public.fixed_shifts
  ALTER COLUMN shift_code TYPE VARCHAR(24);

ALTER TABLE public.fixed_shifts
  DROP CONSTRAINT IF EXISTS fixed_shifts_shift_code_check;

COMMENT ON COLUMN public.fixed_shifts.shift_code IS
  '固定班碼：竹山 A–E／X；集集可為店家班別目錄短碼（≤24字）';
