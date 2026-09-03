-- 立即修復：permission denied for schema storage
-- 適用時機：上傳請假／獎金／訓練附件失敗，或 db push 寫入 storage.buckets 失敗
--
-- 本機 Supabase：
--   cd ~/Pharmacy-Scheduling-System
--   supabase db execute -f scripts/sql/fix-storage-schema-grants.sql
-- 或：
--   docker exec -i $(docker ps -qf name=supabase_db) psql -U postgres < scripts/sql/fix-storage-schema-grants.sql
--
-- 之後再執行：supabase db push --local

DO $grant$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    RAISE EXCEPTION 'schema storage 不存在：請先 supabase start 並確認 Storage 服務正常';
  END IF;

  GRANT USAGE ON SCHEMA storage TO postgres;
  GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;

  GRANT ALL ON ALL TABLES IN SCHEMA storage TO postgres, service_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA storage TO authenticated;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO postgres, service_role, authenticated;

  ALTER DEFAULT PRIVILEGES IN SCHEMA storage
    GRANT ALL ON TABLES TO postgres, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA storage
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA storage
    GRANT ALL ON SEQUENCES TO postgres, service_role, authenticated;

  RAISE NOTICE 'storage schema grants OK';
END
$grant$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'leave-attachments',
  'leave-attachments',
  FALSE,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payroll-bonus-attachments',
  'payroll-bonus-attachments',
  FALSE,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'training-materials',
  'training-materials',
  FALSE,
  52428800,
  ARRAY[
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 驗證
SELECT
  has_schema_privilege('postgres', 'storage', 'USAGE') AS postgres_usage,
  has_schema_privilege('authenticated', 'storage', 'USAGE') AS authenticated_usage,
  has_schema_privilege('service_role', 'storage', 'USAGE') AS service_role_usage;

SELECT id, name, public FROM storage.buckets
WHERE id IN ('leave-attachments', 'payroll-bonus-attachments', 'training-materials')
ORDER BY id;
