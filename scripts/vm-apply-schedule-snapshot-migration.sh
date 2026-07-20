#!/bin/bash
# 補上 shift_swap_applications / leave_applications 的 schedule_snapshot 欄位
# 在 Ubuntu VM 執行：
#   cd ~/Pharmacy-Scheduling-System
#   bash scripts/vm-apply-schedule-snapshot-migration.sh
set -euo pipefail

cd ~/Pharmacy-Scheduling-System || exit 1

echo "=== schedule_snapshot migration ==="

if ! supabase status >/dev/null 2>&1; then
  echo "Starting Supabase..."
  supabase start --ignore-health-check || supabase start
fi

DB=$(docker ps --format '{{.Names}}' | grep supabase_db | head -n 1)
if [[ -z "$DB" ]]; then
  echo "ERROR: supabase_db container not found"
  exit 1
fi

PGPASS=$(docker exec "$DB" printenv POSTGRES_PASSWORD)

echo "DB container: $DB"
echo ""
echo "--- Applying SQL ---"

docker exec -e PGPASSWORD="$PGPASS" -i "$DB" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE public.shift_swap_applications
  ADD COLUMN IF NOT EXISTS schedule_snapshot JSONB;

ALTER TABLE public.leave_applications
  ADD COLUMN IF NOT EXISTS schedule_snapshot JSONB;

NOTIFY pgrst, 'reload schema';
SQL

echo ""
echo "--- Verify columns ---"
docker exec -e PGPASSWORD="$PGPASS" -i "$DB" psql -U supabase_admin -d postgres -c \
  "SELECT table_name, column_name, data_type
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name IN ('shift_swap_applications', 'leave_applications')
     AND column_name = 'schedule_snapshot'
   ORDER BY table_name;"

echo ""
echo "DONE. If the app still shows schema cache errors, restart Supabase:"
echo "  supabase stop && supabase start"
