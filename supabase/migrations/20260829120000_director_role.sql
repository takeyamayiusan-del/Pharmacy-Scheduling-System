-- 新增「主任」職位：權限同員工，登入走店長／老闆端

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('boss', 'manager', 'deputy', 'employee', 'director'));

COMMENT ON COLUMN public.users.role IS
  'boss=老闆, manager=店長, deputy=副店, employee=員工, director=主任（同員工權限、管理端登入）';
