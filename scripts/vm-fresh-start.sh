#!/bin/bash
# 全新 Supabase：刪除舊資料庫 volume，套用 migrations，建立可登入環境。
# 會清除：舊班表、打卡、請假等所有歷史資料。
set -euo pipefail

cd ~/Pharmacy-Scheduling-System || exit 1

echo "=========================================="
echo "  耀聖藥局 - Supabase 全新安裝"
echo "  警告：將刪除本機所有資料庫資料"
echo "=========================================="
echo ""
read -r -p "確定要繼續？輸入 YES 才會執行: " CONFIRM
if [[ "$CONFIRM" != "YES" ]]; then
  echo "已取消。"
  exit 0
fi

echo ""
echo "[1/5] 停止 Supabase..."
supabase stop --no-backup 2>/dev/null || supabase stop 2>/dev/null || true
docker rm -f $(docker ps -aq --filter name=supabase) 2>/dev/null || true

echo ""
echo "[2/5] 刪除資料庫 volume..."
VOL=$(docker volume ls --format '{{.Name}}' | grep supabase_db_yaosheng-pharmacy || true)
if [[ -n "$VOL" ]]; then
  docker volume rm "$VOL"
  echo "已刪除 volume: $VOL"
else
  echo "找不到 volume，略過。"
fi

echo ""
echo "[3/5] 啟動 Supabase（低記憶體 VM 可略過 health check）..."
if supabase start --ignore-health-check; then
  echo "supabase start 完成"
else
  supabase start
fi

echo ""
echo "[4/5] 套用資料庫結構（migrations）..."
supabase db push --local

echo ""
echo "[5/5] 健康檢查..."
curl -s -o /dev/null -w "rest:  %{http_code}\n" http://127.0.0.1:54321/rest/v1/ || true
curl -s -o /dev/null -w "auth:  %{http_code}\n" http://127.0.0.1:54321/auth/v1/health || true

echo ""
echo "=========================================="
echo "  完成。請執行 supabase status"
echo "  把金鑰更新到："
echo "    - Windows .env.local"
echo "    - scripts/.env.local-db"
echo "  然後執行：npm run data:seed-users"
echo "=========================================="
supabase status || true
