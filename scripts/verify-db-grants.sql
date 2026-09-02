-- 本機／Supabase SQL Editor 執行：檢查 public 表是否缺少 authenticated 或 service_role 權限
-- 預期：下方兩段查詢皆 0 列；最後 summary 顯示 ok
-- 部署後：supabase db push --local  →  psql -f scripts/verify-db-grants.sql

WITH tables AS (
  SELECT c.oid, c.relname AS table_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname NOT LIKE 'pg_%'
    AND c.relname NOT LIKE 'sql_%'
)
SELECT
  t.table_name,
  'authenticated' AS role,
  CASE WHEN has_table_privilege('authenticated', t.oid, 'SELECT') THEN 'ok' ELSE 'MISSING' END AS select_priv,
  CASE WHEN has_table_privilege('authenticated', t.oid, 'INSERT') THEN 'ok' ELSE 'MISSING' END AS insert_priv
FROM tables t
WHERE NOT has_table_privilege('authenticated', t.oid, 'SELECT')
   OR NOT has_table_privilege('authenticated', t.oid, 'INSERT')
ORDER BY t.table_name;

-- service_role（API 後台）
WITH tables AS (
  SELECT c.oid, c.relname AS table_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname NOT LIKE 'pg_%'
)
SELECT
  t.table_name,
  'service_role' AS role,
  CASE WHEN has_table_privilege('service_role', t.oid, 'SELECT') THEN 'ok' ELSE 'MISSING' END AS select_priv
FROM tables t
WHERE NOT has_table_privilege('service_role', t.oid, 'SELECT')
ORDER BY t.table_name;

-- 摘要（應顯示 missing_count = 0）
WITH tables AS (
  SELECT c.oid
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relname NOT LIKE 'pg_%'
)
SELECT
  COUNT(*) FILTER (WHERE NOT has_table_privilege('authenticated', oid, 'SELECT')) AS auth_missing,
  COUNT(*) FILTER (WHERE NOT has_table_privilege('service_role', oid, 'SELECT')) AS service_missing
FROM tables;
