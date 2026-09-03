-- 立即修復／診斷：permission denied for schema storage
--
-- 重要：storage schema 由 supabase_storage_admin 擁有。
-- 以 postgres 執行 GRANT 常會出現：
--   WARNING (01007): no privileges were granted for "storage"
-- 這表示「沒授出新權限」（已有、或無權授出），db push 仍算成功，可忽略。
-- 附件上傳走 Storage API + service_role；請確認 bucket 存在。
--
-- Windows PowerShell：
--   $db = docker ps -qf "name=supabase_db"
--   Get-Content .\scripts\sql\ensure-storage-buckets.sql | docker exec -i $db psql -U postgres
--
-- 或 Studio → Storage 手動建立（Private）：
--   leave-attachments / payroll-bonus-attachments / training-materials

\echo '=== storage schema owner / usage ==='
SELECT current_user AS whoami,
       has_schema_privilege(current_user, 'storage', 'USAGE') AS has_storage_usage;

SELECT n.nspname AS schema, r.rolname AS owner
FROM pg_namespace n
JOIN pg_roles r ON r.oid = n.nspowner
WHERE n.nspname = 'storage';

DO $grant$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    RAISE EXCEPTION 'schema storage 不存在：請先 supabase start';
  END IF;

  BEGIN
    GRANT USAGE ON SCHEMA storage TO postgres, anon, authenticated, service_role;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'GRANT USAGE 略過：%', SQLERRM;
  END;

  RAISE NOTICE '若出現 01007 no privileges were granted，多半可忽略；請確認 buckets';
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

SELECT id, name, public
FROM storage.buckets
WHERE id IN ('leave-attachments', 'payroll-bonus-attachments', 'training-materials')
ORDER BY id;
