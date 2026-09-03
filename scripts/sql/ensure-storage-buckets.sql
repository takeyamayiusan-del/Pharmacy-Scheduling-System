-- 診斷／補建 Storage buckets（GRANT 常因非 storage 擁有者而無效，屬預期）
--
-- db push 出現：
--   WARNING (01007): no privileges were granted for "storage"
-- 表示目前角色無法對 storage schema 授權（由 supabase_storage_admin 擁有）。
-- 附件上傳走 Storage API + service_role，通常仍可用；重點是 bucket 要存在。
--
-- Windows PowerShell（本機 Supabase）：
--   $db = docker ps -qf "name=supabase_db"
--   Get-Content .\scripts\sql\ensure-storage-buckets.sql | docker exec -i $db psql -U postgres
--
-- 或到 Studio → Storage 手動建立：
--   leave-attachments / payroll-bonus-attachments / training-materials（皆設 Private）

SELECT current_user AS whoami,
       has_schema_privilege(current_user, 'storage', 'USAGE') AS has_storage_usage;

SELECT n.nspname AS schema,
       r.rolname AS owner
FROM pg_namespace n
JOIN pg_roles r ON r.oid = n.nspowner
WHERE n.nspname = 'storage';

-- 以 postgres 嘗試建 bucket（多數本機環境可寫入 storage.buckets）
DO $buckets$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    RAISE NOTICE 'schema storage 不存在';
    RETURN;
  END IF;

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

  RAISE NOTICE 'buckets ensure OK';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE '無法寫入 storage.buckets，請改用 Studio → Storage 手動建立三個 Private bucket';
WHEN OTHERS THEN
  RAISE NOTICE 'ensure buckets: %', SQLERRM;
END
$buckets$;

SELECT id, name, public
FROM storage.buckets
WHERE id IN ('leave-attachments', 'payroll-bonus-attachments', 'training-materials')
ORDER BY id;
