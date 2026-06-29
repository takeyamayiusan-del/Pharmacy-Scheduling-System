# 耀聖藥局排班系統 — 分店主機架設 SOP（最終版）

> **已定案架構**
> - 資料庫：本機 Supabase（Docker，資料在 `data/`）— **不需註冊 supabase.com**
> - 網站：本機 Next.js（`npm start`）
> - 外網：**Tailscale Funnel** — **免費、網址固定**（`https://電腦名.帳號.ts.net`）
> - 程式碼搬移：**GitHub 下載** + USB 只帶 **資料**（若有現有班表／帳號）

---

## 目錄

- [A. 出發前在家（今晚完成）](#a-出發前在家今晚完成)
- [B. 帶什麼去分店？GitHub 還是 USB？](#b-帶什麼去分店github-還是-usb)
- [C. 分店現場：逐步安裝](#c-分店現場逐步安裝)
- [D. 啟動資料庫與網站](#d-啟動資料庫與網站)
- [E. 外網 Tailscale Funnel（固定免費網址）](#e-外網-tailscale-funnel固定免費網址)
- [F. 開機自動啟動](#f-開機自動啟動)
- [G. 當日驗收清單（逐項打勾）](#g-當日驗收清單逐項打勾)
- [H. 常見問題](#h-常見問題)
- [I. 日常維護](#i-日常維護)

---

## A. 出發前在家（今晚完成）

### A-1. 確認程式可建置

在家電腦專案目錄執行：

```powershell
cd D:\pharmacy-system\Pharmacy-Scheduling-System
npm run build
```

看到 `Compiled successfully` 即可。

### A-2. 推送程式碼到 GitHub

```powershell
git add .
git status          # 確認沒有 .env.local、data/postgres 被加入
git commit -m "分店部署前最終版本"
git push origin main
```

記下倉庫網址，例如：`https://github.com/你的帳號/Pharmacy-Scheduling-System`

> ⚠️ **絕對不要** commit：`.env.local`、`data/postgres/` 內容、`node_modules`、`.next`

### A-3. 打包資料（若要把現有班表／員工帶過去）

若家裡已經有跑過的資料（員工帳號、班表、請假紀錄）：

```powershell
# 先停止服務
supabase stop

# 打包 data/（只打包資料，比整包專案小很多）
npm run data:pack-usb
```

會產生 `yaosheng-data-日期.zip`，拷到 USB。

若分店是**全新開始**、不要舊資料 → **略過 A-3**。

### A-4. 準備攜帶物品

| 物品 | 必要？ |
|------|--------|
| USB（內含 `yaosheng-data-*.zip`，若有舊資料） | 有舊資料才要 |
| 手機（Tailscale 登入、收驗證信） | ✅ |
| 本文件（或 GitHub 上可看） | ✅ |
| 整包專案 USB | ❌ **不需要**（改用 GitHub） |

---

## B. 帶什麼去分店？GitHub 還是 USB？

### 結論（推薦）

| 內容 | 方式 | 原因 |
|------|------|------|
| **程式碼** | **GitHub `git clone`** | 快、小、不會漏檔；`node_modules` 到現場再裝 |
| **資料庫資料** `data/postgres` | **USB ZIP**（僅當要搬舊資料） | Git 不能存資料庫檔 |
| **附件** `data/storage` | 同上，在 ZIP 裡 | 同上 |
| `node_modules` | ❌ 不帶 | 幾萬個檔案，USB 複製極慢 |
| `.next` | ❌ 不帶 | 到現場 `npm run build` 重建 |
| `.env.local` | ❌ 不帶 | 到現場用 `supabase status` 重新產生 |

### 為什麼不要整包專案拷 USB？

- `node_modules` + `.next` 常常 **>500MB～數 GB**，拷貝可能要 30～60 分鐘以上
- GitHub 只下載程式碼約 **幾 MB**，分店 `npm install` 約 5～15 分鐘（需網路）

### 兩種情境

**情境 1：分店全新架設（無舊資料）**

```
GitHub clone → 安裝軟體 → supabase start → seed 帳號 → 完成
（USB 可完全不帶）
```

**情境 2：要把家裡現有資料搬過去**

```
GitHub clone → USB 解壓 data/ → supabase start → 完成
（不用 db push、不用 seed，資料已在 postgres 裡）
```

---

## C. 分店現場：逐步安裝

> 環境：Windows 10/11，需**系統管理員** PowerShell。  
> 全程約 **2～4 小時**（含 Docker 首次下載）。

---

### 步驟 1／10：安裝 Node.js 20 LTS

1. 開啟 https://nodejs.org
2. 下載 **20.x LTS** Windows 安裝檔（`.msi`）
3. 安裝，勾選 **Add to PATH**
4. **關閉再開** PowerShell，驗證：

```powershell
node -v    # 預期 v20.x.x（勿用 v24）
npm -v     # 預期 10.x
```

---

### 步驟 2／10：安裝 Docker Desktop

1. https://www.docker.com/products/docker-desktop/
2. 安裝後**重開機**
3. 開啟 Docker Desktop，等到 **Engine running**（左下角綠燈）
4. 驗證：

```powershell
docker ps
```

若失敗：進 BIOS 開啟 **Intel VT-x / AMD-V** 虛擬化。

---

### 步驟 3／10：安裝 Supabase CLI

```powershell
npm install -g supabase
supabase --version
```

---

### 步驟 4／10：安裝 Git

https://git-scm.com/download/win  
（若分店已有 Git 可略過）

```powershell
git --version
```

---

### 步驟 5／10：下載程式碼（GitHub）

```powershell
cd C:\
git clone https://github.com/你的帳號/Pharmacy-Scheduling-System.git
cd C:\Pharmacy-Scheduling-System
```

---

### 步驟 6／10：還原資料（僅情境 2）

若有 USB 上的 `yaosheng-data-日期.zip`：

```powershell
cd C:\Pharmacy-Scheduling-System
npm run data:setup-dirs

# 解壓到 data（會覆蓋 postgres、storage）
Expand-Archive -Path "E:\yaosheng-data-2026-06-30.zip" -DestinationPath "C:\Pharmacy-Scheduling-System\data" -Force
```

若全新架設：

```powershell
npm run data:setup-dirs
```

---

### 步驟 7／10：安裝 npm 套件

```powershell
cd C:\Pharmacy-Scheduling-System
npm install
```

需網路，約 5～15 分鐘。

---

### 步驟 8／10：啟動本機 Supabase

```powershell
supabase start
```

**第一次會下載 Docker 映像（10～30 分鐘）**，請耐心等候。

成功後**整段輸出複製到記事本**，重點是：

```
API URL: http://127.0.0.1:54321
anon key: eyJ...
service_role key: eyJ...
```

全新架設還需套用資料表結構：

```powershell
supabase db push
```

若已從 USB 還原 `data/postgres`（情境 2）→ **不要** 執行 `db push`。

---

### 步驟 9／10：設定環境變數

```powershell
copy .env.local.example .env.local
notepad .env.local
```

填入（金鑰來自 `supabase status`）：

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=貼上_anon_key
SUPABASE_SERVICE_ROLE_KEY=貼上_service_role_key
```

種子腳本用（全新架設才需要）：

```powershell
copy scripts\.env.local-db.example scripts\.env.local-db
notepad scripts\.env.local-db
```

```env
LOCAL_SUPABASE_URL=http://127.0.0.1:54321
LOCAL_SUPABASE_SERVICE_ROLE_KEY=同上_service_role_key
```

---

### 步驟 10／10：建置網站

```powershell
npm run build
```

成功後試跑：

```powershell
npm start
```

瀏覽器開 http://localhost:3000 → 應看到登入頁。  
`Ctrl+C` 停止（稍後改常駐）。

---

## D. 啟動資料庫與網站

### D-1. 建立管理者帳號（僅全新架設）

```powershell
npm run data:seed-users
```

| 角色 | 帳號 | 密碼 | 登入分頁 |
|------|------|------|----------|
| 店長 | admin | admin123 | 店長/老闆登入 |
| 老闆 | boss | boss123 | 店長/老闆登入 |

登入後 → **員工管理 → 變更我的密碼**（必做）。

### D-2. 登入後導向規則（已內建）

| 角色 | 首頁 |
|------|------|
| 員工 | 上下班打卡 |
| 店長／老闆 | 班表 |

### D-3. 本機服務對照

| 服務 | 指令 | 網址 |
|------|------|------|
| Supabase API | `supabase start` | http://127.0.0.1:54321 |
| 資料庫管理 Studio | 瀏覽器 | http://127.0.0.1:54323 |
| 網站 | `npm start` | http://localhost:3000 |

---

## E. 外網 Tailscale Funnel（固定免費網址）

> **這是已定案的外網方案**：免費、網址固定、不需買網域、不需改路由器。  
> 網址格式：`https://你的電腦名稱.你的tailnet.ts.net`（設定後不變）。

### E-1. 安裝 Tailscale

1. https://tailscale.com/download/windows
2. 安裝並用 Google / Microsoft 帳號登入
3. 確認工作列 Tailscale 圖示為**已連線**

### E-2. 設定電腦名稱（建議做一次）

Tailscale 後台或 Windows 設定 → 將電腦名稱改為好記的，例如 `yaosheng-pc`。  
**之後不要亂改**，改了外網網址會變。

### E-3. 確認本機服務已啟動

```powershell
supabase status          # 必須 Running
cd C:\Pharmacy-Scheduling-System
npm start                # 或之後用 pm2
```

### E-4. 開啟 Funnel

```powershell
tailscale funnel 3000
```

第一次會開瀏覽器，請在 Tailscale 後台**允許 Funnel**。

成功後顯示（範例）：

```
Available on the internet:
https://yaosheng-pc.tail12345.ts.net
```

**這就是給全體員工的固定網址。請複製存檔、做 QR Code。**

背景常駐（關掉視窗也繼續）：

```powershell
tailscale funnel --bg 3000
```

查看狀態：

```powershell
tailscale funnel status
```

### E-5. 設定 Supabase 允許外網登入（必做）

用記事本開啟 `C:\Pharmacy-Scheduling-System\supabase\config.toml`，修改：

```toml
[auth]
site_url = "https://yaosheng-pc.tail12345.ts.net"
additional_redirect_urls = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://yaosheng-pc.tail12345.ts.net"
]
```

將網址換成 E-4 顯示的**你的** `https://....ts.net`。

重啟 Supabase：

```powershell
cd C:\Pharmacy-Scheduling-System
supabase stop
supabase start
```

### E-6. 外網測試

1. 手機關 Wi‑Fi，改用 **4G**
2. 開啟 `https://....ts.net`
3. 測試登入、班表、打卡（GPS 需允許定位）

### E-7. 開機後要跑的四件事

```
① Docker Desktop（自動）
② supabase start
③ pm2 網站（見 F 章）
④ tailscale funnel --bg 3000
```

---

## F. 開機自動啟動

### F-1. Docker Desktop

Settings → General → ✅ Start Docker Desktop when you log in

### F-2. 網站用 pm2

```powershell
npm install -g pm2 pm2-windows-startup
cd C:\Pharmacy-Scheduling-System
pm2 start npm --name "pharmacy-web" -- start
pm2 save
pm2-startup install
```

### F-3. Supabase 開機腳本

建立 `C:\Pharmacy-Scheduling-System\scripts\start-all.ps1`：

```powershell
Set-Location C:\Pharmacy-Scheduling-System
Start-Sleep -Seconds 30   # 等 Docker 起來
supabase start
Start-Sleep -Seconds 10
pm2 resurrect
tailscale funnel --bg 3000
```

「工作排程器」→ 登入時執行上述腳本（或用 pm2 + 手動 supabase start 亦可）。

### F-4. 檢查指令速查

```powershell
docker ps
supabase status
pm2 status
tailscale funnel status
```

---

## G. 當日驗收清單（逐項打勾）

### 本機

| # | 項目 | ☐ |
|---|------|---|
| 1 | `node -v` 為 20.x | |
| 2 | `docker ps` 無錯誤 | |
| 3 | `supabase status` 為 running | |
| 4 | http://localhost:3000 登入頁正常 | |
| 5 | 店長登入 → 班表頁 | |
| 6 | 員工登入 → 打卡頁 | |
| 7 | 排休點選即儲存 | |
| 8 | 請假／換班／加班可送出 | |
| 9 | 店長可審核 | |
| 10 | 已改掉 admin123／boss123 | |

### 外網（手機 4G）

| # | 項目 | ☐ |
|---|------|---|
| 11 | `https://....ts.net` 可開登入頁 | |
| 12 | 外網可登入 | |
| 13 | 外網 GPS 打卡成功 | |
| 14 | 外網可看班表 | |

### 穩定性

| # | 項目 | ☐ |
|---|------|---|
| 15 | 重開機後服務恢復（或知道要跑哪些指令） | |
| 16 | 員工網址 QR Code 已貼櫃台 | |

---

## H. 常見問題

### H-1. `supabase start` 失敗

- Docker Desktop 是否 **Engine running**
- 硬碟空間是否 >20GB
- 關 VPN 再試

### H-2. 外網能開頁面但登入失敗

- `supabase/config.toml` 的 `site_url` 是否為目前的 `https://....ts.net`
- 改完必須 `supabase stop` → `supabase start`

### H-3. 打卡 GPS 失敗

- 必須用 `https://` 開頭（Tailscale 已提供）
- 手機允許瀏覽器「位置」權限
- 人在藥局約 150 公尺內

### H-4. 員工說突然連不上

```powershell
docker ps
supabase status
pm2 status
tailscale funnel status
```

主機關機、斷電、Docker 未開 → 全店無法使用（全本機架構特性）。

### H-5. `npm run build` 失敗

```powershell
node -v
Remove-Item -Recurse -Force node_modules, .next
npm install
npm run build
```

### H-6. Git clone 後沒有 `.env.local`

正常。複製 `.env.local.example` 後用 `supabase status` 填金鑰。

---

## I. 日常維護

### 備份（每週建議）

```powershell
supabase stop
xcopy "C:\Pharmacy-Scheduling-System\data" "E:\備份\藥局-data-日期" /E /I /H
supabase start
```

或：`npm run data:pack-usb` 產生 ZIP 存外接碟。

### 更新程式

```powershell
cd C:\Pharmacy-Scheduling-System
git pull
npm install
supabase db push      # 若有新 migration
npm run build
pm2 restart pharmacy-web
```

### 技術規格備忘

| 項目 | 值 |
|------|-----|
| Node | 20 LTS（18～22 可） |
| 套件管理 | 僅 `npm` |
| Supabase API | http://127.0.0.1:54321 |
| 網站埠 | 3000 |
| 外網 | Tailscale Funnel `*.ts.net` |
| 登入 email 格式 | `帳號@yaosheng.app` |

---

## 附錄：已通過的發行前檢查（2026-06-30）

- `npm run build` ✅
- `npm run lint` ✅
- 全本機 Supabase，無需雲端帳號 ✅
- 外網 Tailscale Funnel（免費固定網址）✅
- 員工刪除改為軟刪除 ✅
- 遲到 API 已加權限驗證 ✅
- `/test` 測試頁已移除 ✅
- 排休頁預設當月、移除誤導提交鈕 ✅
- 聖文硬編碼規則已移除（改固定班表規則）✅
- 班表／薪資／換班／請假邏輯已於前次迭代修正 ✅

---

*文件版本：2026-06-30 最終版 | 外網方案：Tailscale Funnel only*
