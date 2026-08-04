#!/bin/bash
set -e
cd ~/Pharmacy-Scheduling-System || exit 1

SQL=~/Pharmacy-Scheduling-System/data/backups/yaosheng-local-2026-06-29.sql

echo "Step 1: make sure supabase is running..."
supabase start

DB=$(docker ps --format '{{.Names}}' | grep supabase_db | head -n 1)
if [ -z "$DB" ]; then
  echo "ERROR: no supabase_db container found"
  exit 1
fi

PGPASS=$(docker exec "$DB" printenv POSTGRES_PASSWORD 2>/dev/null || echo postgres)
echo "DB=$DB"

echo "Step 2: stop all supabase containers (keep them, do not remove)..."
docker stop $(docker ps -q --filter name=supabase) 2>/dev/null || true
sleep 2

echo "Step 3: start database container only..."
docker start "$DB"
sleep 3

echo "Step 4: drop and recreate database..."
docker exec -e PGPASSWORD="$PGPASS" -i "$DB" psql -U supabase_admin -d template1 -c "DROP DATABASE IF EXISTS postgres WITH (FORCE);" \
  || docker exec -e PGPASSWORD="$PGPASS" -i "$DB" psql -U postgres -d template1 -c "DROP DATABASE IF EXISTS postgres WITH (FORCE);"

docker exec -e PGPASSWORD="$PGPASS" -i "$DB" psql -U supabase_admin -d template1 -c "CREATE DATABASE postgres OWNER postgres;" \
  || docker exec -e PGPASSWORD="$PGPASS" -i "$DB" psql -U postgres -d template1 -c "CREATE DATABASE postgres OWNER postgres;"

echo "Step 5: restore SQL..."
cat "$SQL" | docker exec -e PGPASSWORD="$PGPASS" -i "$DB" psql -U postgres -d postgres

echo "Step 6: start all supabase services..."
supabase start

supabase status
echo "DONE"
