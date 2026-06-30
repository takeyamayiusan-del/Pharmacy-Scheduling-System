#!/bin/bash
# Install monthly auto-backup on Ubuntu VM (cron: 1st day of each month, 03:00)
# Run once on VM:
#   bash ~/vm-setup-monthly-backup.sh

set -euo pipefail

SRC="$HOME/Pharmacy-Scheduling-System/scripts/vm-backup-db.sh"
DEST="$HOME/vm-backup-db.sh"

if [[ -f "$SRC" ]]; then
  cp -f "$SRC" "$DEST"
elif [[ -f "$HOME/vm-backup-db.sh" ]]; then
  DEST="$HOME/vm-backup-db.sh"
else
  echo "ERROR: vm-backup-db.sh not found"
  exit 1
fi

chmod +x "$DEST"
sed -i 's/\r$//' "$DEST" 2>/dev/null || true

CRON_LINE="0 3 1 * * KEEP_MONTHS=12 bash $DEST >> $HOME/backup.log 2>&1"
(crontab -l 2>/dev/null | grep -v vm-backup-db.sh; echo "$CRON_LINE") | crontab -

echo "Monthly backup installed."
echo "Schedule: every month on day 1 at 03:00"
echo "Script: $DEST"
echo "Log: $HOME/backup.log"
echo "Keep: 12 months"
echo ""
crontab -l | grep vm-backup-db || true
echo ""
echo "Test now: bash $DEST"
