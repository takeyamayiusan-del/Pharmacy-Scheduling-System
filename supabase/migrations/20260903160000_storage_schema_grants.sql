-- 修復：permission denied for schema storage
-- 請假附件／獎金佐證／教育訓練上傳依賴 storage schema
-- 自架／還原後 postgres 或 app role 常缺少 USAGE，導致 db push 或上傳失敗

DO $grant$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    RAISE NOTICE 'schema storage 不存在，略過授權（可能尚未啟用 Storage）';
    RETURN;
  END IF;

  BEGIN
    GRANT USAGE ON SCHEMA storage TO postgres;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'GRANT USAGE storage → postgres 略過：%', SQLERRM;
  END;

  BEGIN
    GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'GRANT USAGE storage → anon/authenticated/service_role 略過：%', SQLERRM;
  END;

  BEGIN
    GRANT ALL ON ALL TABLES IN SCHEMA storage TO postgres, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA storage TO authenticated;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO postgres, service_role, authenticated;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'GRANT tables/sequences in storage 略過：%', SQLERRM;
  END;

  BEGIN
    ALTER DEFAULT PRIVILEGES IN SCHEMA storage
      GRANT ALL ON TABLES TO postgres, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA storage
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA storage
      GRANT ALL ON SEQUENCES TO postgres, service_role, authenticated;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'ALTER DEFAULT PRIVILEGES storage 略過：%', SQLERRM;
  END;
END
$grant$;

-- 確保三個業務 bucket 存在（無權限時不讓整份 migration 失敗）
DO $buckets$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    RETURN;
  END IF;

  BEGIN
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
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '無法寫入 storage.buckets（permission denied）。請用 supabase_admin／postgres 執行 scripts/sql/fix-storage-schema-grants.sql';
  WHEN OTHERS THEN
    RAISE NOTICE '確保 storage buckets 略過：%', SQLERRM;
  END;
END
$buckets$;
