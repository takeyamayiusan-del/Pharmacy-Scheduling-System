-- 權限稽核補強：20260629 大量 GRANT 之後新建的表，以及 service_role（API 後台）
-- 若已執行過 20260902150000，下列 GRANT 可重複執行（冪等）

-- 1) 曾漏 GRANT 的表（20260828120000 獎金附件等）
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_offboarding TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_adjustment_attachments TO authenticated;
GRANT ALL ON public.payroll_adjustment_attachments TO service_role;

-- 1b) 20260629 之後新建、未個別 GRANT 的表一次補齊（冪等）
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- 2) service_role：Next.js API（createAdminClient）必須能讀寫所有業務表
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- 3) 之後 migration 新建的表（由 supabase migration 角色建立時繼承）
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;

COMMENT ON SCHEMA public IS '家禾體系排班：authenticated=登入使用者 RLS；service_role=API 後台';
