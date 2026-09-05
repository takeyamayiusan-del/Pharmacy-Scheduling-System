-- 診斷／補建 Storage buckets
-- 注意：PowerShell 會把 $xxx$ 當變數，本檔改用 $$ 避免被吃掉。
--
-- Windows PowerShell（先設 $db 再執行）：
--   $db = docker ps -qf "name=supabase_db"
--   Get-Content .\scripts\sql\ensure-storage-buckets.sql -Raw | docker exec -i $db psql -U postgres
--
-- 你目前三個 bucket 多半已存在；若上傳仍失敗，請改用本機附件（程式已預設 data/storage）。

SELECT current_user AS whoami,
       has_schema_privilege(current_user, 'storage', 'USAGE') AS has_storage_usage;

SELECT n.nspname AS schema,
       r.rolname AS owner
FROM pg_namespace n
JOIN pg_roles r ON r.oid = n.nspowner
WHERE n.nspname = 'storage';

DO $$
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
  RAISE NOTICE '無法寫入 storage.buckets，請改用 Studio → Storage 手動建立';
WHEN OTHERS THEN
  RAISE NOTICE 'ensure buckets: %', SQLERRM;
END
$$;

SELECT id, name, public
FROM storage.buckets
WHERE id IN ('leave-attachments', 'payroll-bonus-attachments', 'training-materials')
ORDER BY id;
