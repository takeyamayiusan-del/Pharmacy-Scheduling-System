-- 本機匯入後 authenticated 角色缺少資料表 GRANT，導致登入後讀取 users 失敗。
-- RLS 仍控制實際可存取的列；此處僅恢復 Supabase 預期的 schema 權限。

GRANT USAGE ON SCHEMA public TO authenticated, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
