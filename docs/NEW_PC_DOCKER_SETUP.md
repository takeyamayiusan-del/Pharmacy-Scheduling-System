# 新電腦從零安裝（Docker Desktop + 本機 Supabase）

> 適用：把目前 Hyper-V 虛擬機架構，搬到 **Win11 Pro**，改為 **本機 Docker**（不要搬 20GB 虛擬碟）。  
> 程式碼：GitHub　｜　資料：USB 上的 SQL（幾 MB）

---

## 目錄

1. [舊機：要拷到 USB 的東西](#一舊機要拷到-usb-的東西)
2. [新機：從零安裝步驟](#二新機從零安裝步驟)
3. [開機自動啟動](#三開機自動啟動)
4. [驗收清單](#四驗收清單)
5. [舊機下線](#五舊機下線)
6. [常見問題](#六常見問題)

---

## 一、舊機：要拷到 USB 的東西

### ✅ 一定要帶

| 檔案 | 哪裡來 | 說明 |
|------|--------|------|
| `yaosheng-migrate-YYYY-MM-DD.sql`（或 `.sql.gz`） | 見下方「匯出 SQL」 | **全部業務資料**（員工、班表、打卡等） |
| `.env.local` | `C:\Pharmacy-Scheduling-System\.env.local` | 僅作參考；新機金鑰以新機 `supabase status` 為準 |

建議 USB 資料夾結構：

```
USB:\yaosheng-migrate\
  yaosheng-migrate-2026-07-18.sql
  env.local.OLD.txt          ← 把舊 .env.local 改名備份，避免搞混
  本說明可印 docs\NEW_PC_DOCKER_SETUP.md
```

### ❌ 不要拷

| 項目 | 原因 |
|------|------|
| `data\hyperv\*.vhdx`（約 20GB） | 那是整顆虛擬機系統，不是業務資料 |
| `node_modules\` | 新機 `npm install` |
| `.next\` | 新機 `npm run build` |
| 整包專案硬拷 | 用 GitHub clone 比較乾淨 |

### 匯出 SQL（舊機 Hyper-V VM 內執行）

1. 開啟 **Hyper-V 管理員** → 連線 `yaosheng-supabase`
2. 登入 Ubuntu 後執行：

```bash
cd ~/Pharmacy-Scheduling-System
DB=$(docker ps --format '{{.Names}}' | grep supabase_db | head -n1)
echo "DB=$DB"
mkdir -p data/backups
docker exec "$DB" pg_dump -U postgres -d postgres --no-owner --no-acl \
  > data/backups/yaosheng-migrate-$(date +%Y-%m-%d).sql
ls -lh data/backups/yaosheng-migrate-*.sql
```

3. 把檔案從 VM 拷到 Windows（任選一種）：
   - VM 內若有共享資料夾／`scp` 到 Windows
   - 或在 Windows 用既有腳本：`scripts\copy-sql-to-vm.ps1` 的反向（從 VM 拉回）
   - 最簡單：在 VM 用 `python3 -m http.server` 暫時下載，或 U 盤掛進 VM

4. 再把 SQL + 舊 `.env.local` 拷到 USB。

> 若 VM 已有跑過 `bash ~/vm-backup-db.sh`，可用產出的 `yaosheng-backup-*.sql.gz`（記得新機還原前先 `gzip -d` 或對應解壓）。

### 程式碼不用 USB

確認 GitHub 已是最新（有改過程式就 push）：

```powershell
cd C:\Pharmacy-Scheduling-System
git status
git push origin deploy/local-production
```

---

## 二、新機：從零安裝步驟

預估：含 Docker 首次下載約 **1.5～3 小時**。

### 步驟 1：啟用虛擬化（若尚未）

- BIOS／UEFI：開啟 **VT-x / AMD-V**
- Win11：設定 → 系統 → 選擇性功能 → 確認虛擬化相關功能可用  
  （Docker Desktop 會用到；**不必**再為本方案建立 Ubuntu Hyper-V VM）

### 步驟 2：安裝 Node.js 20 LTS

1. https://nodejs.org → **20.x LTS**（勿用太新的 major）
2. 安裝並勾選 Add to PATH
3. **重開 PowerShell** 驗證：

```powershell
node -v    # v20.x
npm -v
```

### 步驟 3：安裝 Docker Desktop

1. https://www.docker.com/products/docker-desktop/
2. 安裝後**重開機**
3. 開啟 Docker Desktop，等到左下角 **Engine running**
4. Settings → General → ✅ **Start Docker Desktop when you log in**
5. 驗證：

```powershell
docker ps
```

### 步驟 4：安裝 Git、Tailscale、Supabase CLI

```powershell
# Git：https://git-scm.com/download/win
git --version

# Tailscale：https://tailscale.com/download → 用與舊機相同帳號登入

# Supabase CLI
npm install -g supabase
supabase --version
```

### 步驟 5：下載程式碼

```powershell
cd C:\
git clone -b deploy/local-production https://github.com/takeyamayiusan-del/Pharmacy-Scheduling-System.git
cd C:\Pharmacy-Scheduling-System
npm install
```

### 步驟 6：啟動本機 Supabase（第一次最久）

```powershell
cd C:\Pharmacy-Scheduling-System
supabase start
```

成功後**整段輸出存成記事本**，重點：

```
API URL: http://127.0.0.1:54321
anon key: eyJ...
service_role key: eyJ...
```

確認容器名稱：

```powershell
docker ps --format "{{.Names}}" | findstr supabase_db
```

之後還原指令裡的 `supabase_db_XXXX` 請改成實際名稱。

### 步驟 7：從 USB 還原資料

```powershell
# 假設 USB 在 E:，SQL 未壓縮
$Db = (docker ps --format "{{.Names}}" | Select-String "supabase_db").ToString().Trim()
Get-Content "E:\yaosheng-migrate\yaosheng-migrate-YYYY-MM-DD.sql" -Raw -Encoding UTF8 |
  docker exec -i $Db psql -U postgres -d postgres
```

若是 `.gz`：

```powershell
# 先解壓到同一資料夾再還原，或在 Git Bash / WSL 使用 gunzip -c ...
```

> **有還原 SQL 就不要再執行** `supabase db push`（避免結構衝突）。

### 步驟 8：設定 `.env.local`

```powershell
copy .env.local.example .env.local
notepad .env.local
```

先填本機（驗收用）：

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=貼上_supabase_status_的_anon_key
SUPABASE_SERVICE_ROLE_KEY=貼上_supabase_status_的_service_role_key
```

⚠️ **請用新機 `supabase status` 的金鑰**，不要直接沿用舊機 `.env.local` 裡的 key（通常不同）。

### 步驟 9：建置並啟動網站

```powershell
npm run build
npm start
```

瀏覽器開：http://localhost:3000 → 登入 → 確認班表／打卡資料都在。

### 步驟 10：外網 Tailscale Funnel（排班 + 金流）

```powershell
# 排班：HTTPS 443 → 本機 3000
# 金流：HTTPS 8443 → 本機 5000
# （不要用 path 掛載 /site-5000，金流前端資源會壞；也不要用 serve 疊在 funnel 上）
powershell -ExecutionPolicy Bypass -File scripts\windows-tailscale-funnel-setup.ps1

# 或只補開金流（不動排班）
powershell -ExecutionPolicy Bypass -File scripts\windows-enable-cashflow-funnel.ps1

tailscale funnel status
```

第一次請在 Tailscale 後台**允許 Funnel**。

外網網址會類似：

| 服務 | 網址 |
|------|------|
| 排班 | `https://新電腦名稱.tailxxxx.ts.net` |
| 金流 | `https://新電腦名稱.tailxxxx.ts.net:8443` |

手機改 **4G** 分別測試兩個網址。

若排班前端／API 要走同一網域（與舊機作法相同），再把：

```env
NEXT_PUBLIC_SUPABASE_URL=https://新電腦名稱.tailxxxx.ts.net
```

然後：

```powershell
npm run build
# 再重啟 npm start（或 pm2 restart）
```

並通知員工改收藏新網址。

---

## 三、開機自動啟動

### 1. Docker Desktop

Settings → ✅ Start when you log in

### 2. 網站（pm2）

```powershell
npm install -g pm2 pm2-windows-startup
cd C:\Pharmacy-Scheduling-System
pm2 start npm --name "pharmacy-web" -- start
pm2 save
pm2-startup install
```

### 3. 登入後自動 `supabase start` + Funnel

可用工作排程器，登入時執行例如：

```powershell
# 存成 C:\Pharmacy-Scheduling-System\scripts\windows-docker-boot.ps1 後給排程呼叫
Set-Location C:\Pharmacy-Scheduling-System
Start-Sleep -Seconds 40
supabase start
Start-Sleep -Seconds 15
pm2 resurrect
tailscale funnel --bg 3000
```

> 舊機的 `windows-start-all.ps1` 是給 **Hyper-V VM** 用的，新機 Docker 方案不要當主流程。

---

## 四、驗收清單

| # | 項目 | ☐ |
|---|------|---|
| 1 | `node -v` 為 20.x | |
| 2 | `docker ps` 正常、有 supabase 容器 | |
| 3 | `supabase status` running | |
| 4 | http://localhost:3000 可登入 | |
| 5 | 班表／打卡／員工資料正確 | |
| 6 | 排班 Funnel（443）外網可開 | |
| 7 | 金流 Funnel（`:8443`）外網可開 | |
| 8 | 重開機後約數分鐘內兩站都會自動起來 | |

---

## 五、舊機下線

新機驗收通過後：

1. 關掉舊機 Funnel／網站  
2. 關掉 Hyper-V VM `yaosheng-supabase`  
3. **不要兩邊同時給員工使用**（避免資料各寫各的）

USB 上的 SQL 建議再留一份副本存檔。

---

## 六、常見問題

### `supabase start` 失敗

- Docker Desktop 是否綠燈  
- BIOS 虛擬化是否開啟  
- 重開 Docker 再試

### 還原 SQL 找不到容器

```powershell
docker ps --format "{{.Names}}"
```

把指令裡的容器名改成有 `supabase_db` 的那一個。

### 登入失敗／空白

- `.env.local` 金鑰是否來自**本機** `supabase status`  
- 改完需重新 `npm run build` 再啟動

### 外網打不開

- `tailscale funnel status` 是否指向 `127.0.0.1:3000`  
- 網站是否在聽 3000：`netstat -ano | findstr :3000`

---

*文件版本：2026-07-18｜目標架構：Win11 Pro + Docker Desktop + 本機 Supabase + Tailscale Funnel*
