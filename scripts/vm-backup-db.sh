#!/bin/bash
# Backup Supabase DB to data/backups/ and prune old files.
# Run on Ubuntu VM: bash ~/vm-backup-db.sh
# Install monthly cron: bash ~/vm-setup-monthly-backup.sh

set -euo pipefail
cd ~/Pharmacy-Scheduling-System || exit 1

KEEP_MONTHS="${KEEP_MONTHS:-12}"
OUT_DIR="$HOME/Pharmacy-Scheduling-System/data/backups"
LOG_FILE="$HOME/backup.log"

mkdir -p "$OUT_DIR"
echo "[$(date -Iseconds)] backup start" >> "$LOG_FILE"

DB=$(docker ps --format '{{.Names}}' | grep supabase_db | head -n 1)
if [[ -z "$DB" ]]; then
  echo "[$(date -Iseconds)] ERROR: supabase_db not running" >> "$LOG_FILE"
  exit 1
fi

STAMP=$(date +%Y-%m-%d_%H%M)
OUT_FILE="$OUT_DIR/yaosheng-backup-$STAMP.sql"

echo "Backing up to $OUT_FILE ..."
docker exec "$DB" pg_dump -U postgres -d postgres --no-owner --no-acl > "$OUT_FILE"
gzip -f "$OUT_FILE"
SIZE=$(du -h "${OUT_FILE}.gz" | awk '{print $1}')
echo "[$(date -Iseconds)] done ${OUT_FILE}.gz ($SIZE)" >> "$LOG_FILE"
echo "Done: ${OUT_FILE}.gz ($SIZE)"

# Delete backups older than KEEP_MONTHS
find "$OUT_DIR" -name 'yaosheng-backup-*.sql.gz' -type f -mtime +$((KEEP_MONTHS * 30)) -delete 2>/dev/null || true
echo "[$(date -Iseconds)] pruned backups older than ${KEEP_MONTHS} months" >> "$LOG_FILE"
ls -lt "$OUT_DIR"/*.gz 2>/dev/null | head -5 || true
