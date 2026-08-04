#!/usr/bin/env bash
# 耀聖藥局 — 在 Ubuntu VM 內安裝 Docker + Supabase，並啟動本機資料庫
# 用法（在 Ubuntu VM 內）：
#   curl -fsSL ...  或從 Windows 複製此檔後：
#   chmod +x ubuntu-vm-setup-supabase.sh
#   ./ubuntu-vm-setup-supabase.sh

set -euo pipefail

REPO_URL="https://github.com/takeyamayiusan-del/Pharmacy-Scheduling-System.git"
REPO_BRANCH="deploy/local-production"
PROJECT_DIR="$HOME/Pharmacy-Scheduling-System"
SQL_BACKUP="$PROJECT_DIR/data/backups/yaosheng-local-2026-06-29.sql"

echo "=== 耀聖藥局 Ubuntu VM — Supabase 安裝 ==="

if [[ $EUID -ne 0 ]]; then
  echo "請用 sudo 執行，或執行後輸入密碼："
  exec sudo bash "$0" "$@"
fi

export DEBIAN_FRONTEND=noninteractive

echo "[1/7] 更新系統..."
apt-get update -qq
apt-get install -y -qq ca-certificates curl git gnupg lsb-release

if ! command -v docker >/dev/null 2>&1; then
  echo "[2/7] 安裝 Docker..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
else
  echo "[2/7] Docker 已安裝，略過"
fi

SUDO_USER_NAME="${SUDO_USER:-$USER}"
if id "$SUDO_USER_NAME" &>/dev/null; then
  usermod -aG docker "$SUDO_USER_NAME" || true
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[3/7] 安裝 Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
else
  echo "[3/7] Node.js 已安裝：$(node -v)"
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "[4/7] 安裝 Supabase CLI..."
  npm install -g supabase
else
  echo "[4/7] Supabase CLI 已安裝"
fi

echo "[5/7] 下載專案..."
if [[ ! -d "$PROJECT_DIR/.git" ]]; then
  sudo -u "$SUDO_USER_NAME" git clone -b "$REPO_BRANCH" "$REPO_URL" "$PROJECT_DIR"
else
  sudo -u "$SUDO_USER_NAME" git -C "$PROJECT_DIR" fetch origin "$REPO_BRANCH"
  sudo -u "$SUDO_USER_NAME" git -C "$PROJECT_DIR" checkout "$REPO_BRANCH"
  sudo -u "$SUDO_USER_NAME" git -C "$PROJECT_DIR" pull --ff-only || true
fi

echo "[6/7] 啟動 Supabase（首次會下載映像，約 10～30 分鐘）..."
cd "$PROJECT_DIR"
sudo -u "$SUDO_USER_NAME" supabase start

if [[ -f "$SQL_BACKUP" ]]; then
  echo "[7/7] 還原 USB 資料庫備份..."
  DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep 'supabase_db' | head -n 1)
  if [[ -z "$DB_CONTAINER" ]]; then
    echo "找不到 supabase_db 容器，略過 SQL 還原"
  else
    cat "$SQL_BACKUP" | docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres
    echo "SQL 還原完成"
  fi
else
  echo "[7/7] 找不到 $SQL_BACKUP"
  echo "請從 Windows 複製 SQL 到 VM，或略過（全新架設則執行 supabase db push）"
fi

VM_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "=== 完成 ==="
echo "VM IP       : $VM_IP"
echo "Supabase API: http://${VM_IP}:54321"
echo ""
echo "在 Windows 主機執行（系統管理員 PowerShell）："
echo "  cd C:\\Pharmacy-Scheduling-System"
echo "  （本機 Docker 方案請用 Windows：supabase start + pm2 + Tailscale Funnel）"
echo "  powershell -ExecutionPolicy Bypass -File scripts\\windows-docker-boot.ps1"
echo ""
echo "請把 supabase status 的 anon / service_role key 複製到 Windows 的 .env.local"
sudo -u "$SUDO_USER_NAME" supabase status || true
