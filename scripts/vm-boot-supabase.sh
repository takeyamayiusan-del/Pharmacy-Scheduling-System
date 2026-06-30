#!/bin/bash
# Ubuntu VM 開機自動啟動 Supabase
# 安裝：在 VM 執行一次
#   bash ~/vm-boot-supabase.sh --install
# 手動測試：
#   bash ~/vm-boot-supabase.sh

set -euo pipefail
cd ~/Pharmacy-Scheduling-System || exit 1

run_start() {
  echo "[$(date)] starting supabase..."
  if supabase start --ignore-health-check 2>/dev/null; then
    echo "[$(date)] supabase started"
  else
    supabase start || true
  fi
  curl -s -o /dev/null -w "auth:%{http_code} rest:%{http_code}\n" \
    http://127.0.0.1:54321/auth/v1/health \
    http://127.0.0.1:54321/rest/v1/ || true
}

install_cron() {
  SCRIPT="$HOME/vm-boot-supabase.sh"
  cp -f "$HOME/Pharmacy-Scheduling-System/scripts/vm-boot-supabase.sh" "$SCRIPT" 2>/dev/null || true
  chmod +x "$SCRIPT"
  CRON_LINE="@reboot sleep 45 && $SCRIPT >> $HOME/supabase-boot.log 2>&1"
  (crontab -l 2>/dev/null | grep -v vm-boot-supabase.sh; echo "$CRON_LINE") | crontab -
  echo "已安裝 crontab 開機啟動"
  crontab -l | grep vm-boot-supabase || true
}

case "${1:-}" in
  --install) install_cron ;;
  *) run_start ;;
esac
