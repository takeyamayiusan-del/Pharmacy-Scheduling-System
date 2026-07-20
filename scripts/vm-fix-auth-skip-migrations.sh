#!/bin/bash
# Restored Supabase DB: skip GoTrue re-migrations and fix auth ownership.
set -euo pipefail

cd ~/Pharmacy-Scheduling-System || exit 1

DB=$(docker ps --format '{{.Names}}' | grep supabase_db | head -n 1)
AUTH=$(docker ps -a --format '{{.Names}}' | grep supabase_auth | head -n 1)

if [[ -z "$DB" || -z "$AUTH" ]]; then
  echo "ERROR: supabase_db or supabase_auth container not found."
  exit 1
fi

PGPASS=$(docker exec "$DB" printenv POSTGRES_PASSWORD)

echo "=== Skip GoTrue migrations on restored DB ==="
echo "DB: $DB"
echo "Auth: $AUTH"
echo ""

echo "--- Fix auth schema ownership (tables, types, functions) ---"
docker exec -e PGPASSWORD="$PGPASS" -i "$DB" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'SQL'
ALTER SCHEMA auth OWNER TO supabase_auth_admin;

DO $$
DECLARE obj record;
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
DECLARE t record;
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

DO $$
DECLARE f record;
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

GRANT USAGE, CREATE ON SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA auth TO supabase_auth_admin;

-- Old backup may have oauth_clients without client_id; blocks migration.
DROP TABLE IF EXISTS auth.oauth_clients CASCADE;
DROP TYPE IF EXISTS auth.oauth_registration_type CASCADE;
SQL

echo ""
echo "--- Mark all GoTrue migrations as applied ---"
IMAGE=$(docker inspect "$AUTH" --format '{{.Config.Image}}')
CID=$(docker create "$IMAGE")
docker cp "$CID:/usr/local/etc/auth/migrations" /tmp/gotrue-migrations
docker rm "$CID" >/dev/null

FILE_COUNT=$(ls /tmp/gotrue-migrations/*.up.sql 2>/dev/null | wc -l)
echo "Migration files in image: $FILE_COUNT"

docker exec -e PGPASSWORD="$PGPASS" -i "$DB" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS auth.schema_migrations (
  version VARCHAR(14) NOT NULL PRIMARY KEY
);
ALTER TABLE auth.schema_migrations OWNER TO supabase_auth_admin;
SQL

{
  echo "BEGIN;"
  for f in /tmp/gotrue-migrations/*.up.sql; do
    base=$(basename "$f" .up.sql)
    ver="${base:0:14}"
    printf "INSERT INTO auth.schema_migrations (version) VALUES ('%s') ON CONFLICT DO NOTHING;\n" "$ver"
  done
  echo "COMMIT;"
} | docker exec -e PGPASSWORD="$PGPASS" -i "$DB" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1

echo "Migration rows in DB:"
docker exec -e PGPASSWORD="$PGPASS" -i "$DB" psql -U supabase_admin -d postgres -c \
  "SELECT count(*) AS migration_count FROM auth.schema_migrations;"

echo "Latest 5 versions:"
docker exec -e PGPASSWORD="$PGPASS" -i "$DB" psql -U supabase_admin -d postgres -c \
  "SELECT version FROM auth.schema_migrations ORDER BY version DESC LIMIT 5;"

echo ""
echo "--- Restart auth ---"
docker restart "$AUTH"
sleep 15
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep auth || true
echo ""
docker logs "$AUTH" --tail 20 2>&1 || true

echo ""
curl -s -o /dev/null -w "auth health: %{http_code} time:%{time_total}s\n" \
  http://127.0.0.1:54321/auth/v1/health || true

echo ""
echo "DONE. auth health should be 200."
