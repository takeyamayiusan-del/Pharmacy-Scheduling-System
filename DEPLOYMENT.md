# 部署到 Railway

這份文件會教您如何將耀聖藥局智慧排班系統部署到 Railway。

## 📋 部署前準備

### 1. 建立 Supabase 專案

1. 前往 [https://supabase.com](https://supabase.com)
2. 註冊/登入帳號
3. 點擊「New Project」建立新專案
4. 填寫專案資訊：
   - Name: `yaosheng-pharmacy-scheduling`
   - Database Password: 設定一個安全密碼（請記住！）
   - Region: 選擇離您最近的區域（例如 `Singapore`）
5. 等待專案建立完成（約 2 分鐘）

### 2. 取得 Supabase 連線資訊

在 Supabase 專案頁面中：
1. 點擊左側選單的「Project Settings」→「API」
2. 複製以下資訊：
   - **Project URL**（例如：`https://xxxxx.supabase.co`）
   - **anon public** key

### 3. 設定 Supabase 資料庫

1. 在 Supabase 專案中，點擊左側選單的「SQL Editor」
2. 點擊「New Query」
3. 打開本專案資料夾中的 `supabase/migrations/` 目錄
4. 按順序複製每個 SQL 檔案的內容，貼到 SQL Editor 中並執行
5. 或者也可以執行 `supabase/seed.sql` 載入初始資料

---

## 🚀 部署到 Railway

### 方式一：使用 GitHub 部署（推薦）

#### 1. 準備 Git 倉庫

```bash
# 在專案目錄中初始化 Git
git init
git add .
git commit -m "Initial commit: 耀聖藥局智慧排班系統"

# 建立 GitHub 倉庫並推送
# 先在 GitHub 上建立新倉庫，然後：
git remote add origin https://github.com/你的帳號/倉庫名稱.git
git branch -M main
git push -u origin main
```

#### 2. 在 Railway 建立專案

1. 前往 [https://railway.app](https://railway.app)
2. 登入帳號
3. 點擊「New Project」
4. 選擇「Deploy from GitHub repo」
5. 選擇您的倉庫

#### 3. 設定環境變數

在 Railway 專案設定中：
1. 點擊「Variables」
2. 新增以下環境變數：

```
NEXT_PUBLIC_SUPABASE_URL=https://您的專案.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=您的anon_key
SUPABASE_SERVICE_ROLE_KEY=您的service_role_key
```

#### 4. 部署

1. Railway 會自動開始部署
2. 等待部署完成（約 3-5 分鐘）
3. 部署完成後，點擊「Generate Domain」設定網址
4. 完成！

---

### 方式二：使用 Railway CLI

#### 1. 安裝 Railway CLI

```bash
npm install -g @railway/cli
```

#### 2. 登入 Railway

```bash
railway login
```

#### 3. 建立專案並部署

```bash
# 在專案目錄中
railway init

# 設定環境變數
railway variables set NEXT_PUBLIC_SUPABASE_URL=https://您的專案.supabase.co
railway variables set NEXT_PUBLIC_SUPABASE_ANON_KEY=您的anon_key
railway variables set SUPABASE_SERVICE_ROLE_KEY=您的service_role_key

# 部署
railway up
```

---

## 🔧 部署設定說明

### 已建立的設定檔案

- `railway.json` - Railway 專案設定
- `nixpacks.toml` - Nixpacks 建構設定（Railway 使用的建構系統）

### 環境變數

| 變數名稱 | 說明 | 必填 |
|---------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 專案 URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 公開金鑰 | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 管理金鑰 | ✅ |

---

## 📊 資料庫遷移

部署完成後，確保 Supabase 資料庫已經執行所有遷移：

1. 到 Supabase SQL Editor
2. 按順序執行 `supabase/migrations/` 中的 SQL 檔案
3. 建議先在測試環境驗證後再套用

---

## 🔍 部署後檢查清單

- [ ] 網站可以正常訪問
- [ ] 登入功能正常
- [ ] Supabase 連線正常
- [ ] 可以查看班表
- [ ] 可以提交申請
- [ ] 通知功能正常
- [ ] HTTPS 正常運作（Railway 預設提供）

---

## 💡 進階設定

### 自訂網域名稱

1. 在 Railway 專案中點擊「Settings」→「Domains」
2. 點擊「Custom Domain」
3. 輸入您的網域名稱
4. 按照提示設定 DNS 記錄

### 環境分離

建議建立單獨的 Railway 專案用於：
- Production（生產環境）
- Staging（測試環境）

每個環境使用獨立的 Supabase 專案。

### 日誌監控

在 Railway 專案頁面中：
- 點擊「Deployments」查看部署記錄
- 點擊「Logs」查看應用程式日誌

---

## 🚨 常見問題

### Q: 部署失敗怎麼辦？
A: 檢查 Railway 的日誌（Logs）頁面，查看錯誤訊息。確保所有環境變數都已正確設定。

### Q: Supabase 連線錯誤？
A: 確認環境變數中的 URL 和 Key 是否正確，並且 Supabase 專案已經完全建立完成。

### Q: 如何更新部署？
A: 推送新的 commit 到 GitHub，Railway 會自動重新部署。

---

## 📞 取得說明

如有問題，可以：
1. 查看 [Railway 文件](https://docs.railway.app)
2. 查看 [Supabase 文件](https://supabase.com/docs)
3. 檢查應用程式日誌
