耀聖藥局 — 本機資料目錄（與專案同一資料夾）
==========================================

此 data/ 目錄與程式碼放在一起，整包專案複製或壓縮後
即可搬到另一台電腦，不需另外設定硬碟路徑。

目錄說明
--------
  postgres/     PostgreSQL 資料庫檔案（supabase start 寫入）
  storage/      請假附件等 Supabase Storage 檔案
  backups/      從雲端匯出的備份（npm run data:export）
  app-logs/     應用程式日誌（可選）

首次設定
--------
  1. npm run data:setup-dirs
  2. supabase start
  3. supabase db push
  4. npm run data:seed-users
  5. npm run dev

搬移到新電腦
------------
  1. 複製整個專案資料夾（含 data/、node_modules 可到新電腦再 npm install）
  2. 安裝 Docker Desktop、Node.js、Supabase CLI
  3. npm install
  4. supabase start
  5. npm run dev

注意：請勿將 data/postgres 與 data/storage 提交到 Git（已在 .gitignore 排除）。
