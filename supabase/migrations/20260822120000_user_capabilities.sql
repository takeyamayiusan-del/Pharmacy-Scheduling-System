-- 員工額外能力授權（排班／薪資等），供非店長職位使用
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS capabilities JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.users.capabilities IS
  '員工額外授權 JSON，例如 {"schedule":true,"payroll":true}；店長／副店／老闆仍以店規角色權限為主';
