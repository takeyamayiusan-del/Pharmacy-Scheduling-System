#!/bin/bash
# Fix GoTrue auth crash: "no schema has been selected to create in"
# Run on Ubuntu VM after SQL restore broke auth search_path.
set -euo pipefail

cd ~/Pharmacy-Scheduling-System || exit 1

DB=$(docker ps --format '{{.Names}}' | grep supabase_db | head -n 1)
AUTH=$(docker ps -a --format '{{.Names}}' | grep supabase_auth | head -n 1)

if [[ -z "$DB" ]]; then
  echo "ERROR: supabase_db container not found. Run: supabase start --ignore-health-check"
  exit 1
fi

PGPASS=$(docker exec "$DB" printenv POSTGRES_PASSWORD)

echo "=== Auth schema repair ==="
echo "DB container: $DB"
echo "Auth container: ${AUTH:-not found}"
echo ""

echo "--- Before ---"
docker exec -e PGPASSWORD="$PGPASS" -i "$DB" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'auth_schema_exists' AS check,
       EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') AS value;
SELECT rolname, rolconfig
FROM pg_roles
WHERE rolname IN ('supabase_auth_admin', 'authenticator', 'postgres');
SELECT count(*) AS auth_users_count FROM auth.users;
SQL

echo ""
echo "--- schema_migrations locations ---"
docker exec -e PGPASSWORD="$PGPASS" -i "$DB" psql -U supabase_admin -d postgres -c \
  "SELECT schemaname, tablename FROM pg_tables WHERE tablename = 'schema_migrations' ORDER BY 1;"

echo ""
echo "--- Applying fix ---"
docker exec -e PGPASSWORD="$PGPASS" -i "$DB" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
GRANT USAGE, CREATE ON SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON SCHEMA auth TO supabase_auth_admin;

ALTER ROLE supabase_auth_admin SET search_path TO auth, public, extensions;
ALTER ROLE supabase_auth_admin IN DATABASE postgres SET search_path TO auth, public, extensions;

-- GoTrue must own auth.schema_migrations. Remove duplicates in wrong schemas.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'schema_migrations'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'auth' AND tablename = 'schema_migrations'
  ) THEN
    ALTER TABLE public.schema_migrations SET SCHEMA auth;
  ELSIF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'schema_migrations'
  ) AND EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'auth' AND tablename = 'schema_migrations'
  ) THEN
    DROP TABLE public.schema_migrations;
  END IF;
END $$;

-- Drop empty manual table so GoTrue can create it on startup.
DO $$
DECLARE
  row_count bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'auth' AND tablename = 'schema_migrations'
  ) THEN
    EXECUTE 'SELECT count(*) FROM auth.schema_migrations' INTO row_count;
    IF row_count = 0 THEN
      DROP TABLE auth.schema_migrations;
    END IF;
  END IF;
END $$;

-- Restored SQL often leaves auth.* owned by postgres/supabase_admin.
-- GoTrue connects as supabase_auth_admin and must own these objects.
ALTER SCHEMA auth OWNER TO supabase_auth_admin;

DO $$
DECLARE
  obj record;
BEGIN
  FOR obj IN
    SELECT c.oid::regclass AS fqname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth'
      AND c.relkind IN ('r', 'S', 'v', 'm')
  LOOP
    EXECUTE format(
      'ALTER %s %s OWNER TO supabase_auth_admin',
      CASE obj.relkind
        WHEN 'r' THEN 'TABLE'
        WHEN 'S' THEN 'SEQUENCE'
        WHEN 'v' THEN 'VIEW'
        WHEN 'm' THEN 'MATERIALIZED VIEW'
      END,
      obj.fqname
    );
  END LOOP;
END $$;

DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth'
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO supabase_auth_admin', f.sig);
  END LOOP;
END $$;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT format('%I.%I', n.nspname, typ.typname) AS fqname
    FROM pg_type typ
    JOIN pg_namespace n ON n.oid = typ.typnamespace
    WHERE n.nspname = 'auth'
      AND typ.typtype IN ('e', 'd')
  LOOP
    EXECUTE format('ALTER TYPE %s OWNER TO supabase_auth_admin', t.fqname);
  END LOOP;
END $$;

GRANT USAGE, CREATE ON SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA auth TO supabase_auth_admin;
SQL

if [[ -n "$AUTH" ]]; then
  echo ""
  echo "--- Restart auth container ---"
  docker restart "$AUTH"
  echo "Waiting 15s for auth to start..."
  sleep 15
  docker ps --format 'table {{.Names}}\t{{.Status}}' | grep auth || true
  echo ""
  echo "--- Auth logs (last 15 lines) ---"
  docker logs "$AUTH" --tail 15 2>&1 || true
fi

echo ""
echo "--- Health check ---"
curl -s -o /dev/null -w "auth health: %{http_code} time:%{time_total}s\n" \
  http://127.0.0.1:54321/auth/v1/health || true
curl -s -o /dev/null -w "rest health: %{http_code} time:%{time_total}s\n" \
  http://127.0.0.1:54321/rest/v1/ || true

echo ""
echo "DONE. auth health should be 200 in under 2 seconds."
