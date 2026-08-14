# 耀聖藥局智慧排班管理系統

一個功能完整的排班管理平台，支援員工排休、換班、請假、加班、工時計算及管理者審核功能。

## 📋 功能特色

### 👥 使用者角色
- **老闆** - 最高權限，員工管理、工時統計、所有申請審核
- **店長** - 管理者權限，班表編輯、申請審核、遲到管理

### 📅 排班功能
- 月曆模式班表查看
- 員工直式排休選擇介面
- 自動配額檢查（每月2天週六、2天平日）
- 週二固定白班、週三固定休假規則
- 晚班人力缺口警示
- 班表鎖定功能

### 📝 申請功能
- **請假申請** - 事假、病假、特休，支援附件上傳
- **換班申請** - 雙方確認 → 主管審核流程
- **加班申請** - 加班費或補休選擇

### 📊 統計功能
- 月度工時自動計算
- 遲到紀錄管理
- 請假/加班/補休時數統計

### 🔔 通知系統
- 申請提交通知
- 審核結果通知
- 班表變動通知
- 即時未讀通知數顯示

## 🛠️ 技術棧

- **前端** - Next.js 14 + React 18 + TypeScript
- **後端** - Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **樣式** - Tailwind CSS
- **UI 元件** - 自訂元件 (基於 shadcn/ui 概念)
- **表單驗證** - Zod + React Hook Form
- **測試** - Vitest + Fast-check (Property-based testing)

## 🚀 開始使用

### 前置需求
- Node.js 18+
- npm 或 yarn
- Supabase 帳戶

### 安裝步驟

1. **安裝相依套件**
   ```bash
   npm install
   ```

2. **設定 Supabase**
   - 至 [Supabase](https://supabase.com) 建立新專案
   - 複製 `.env.local.example` 為 `.env.local`
   - 填入您的 Supabase 資訊：
     ```bash
     NEXT_PUBLIC_SUPABASE_URL=your-project-url
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
     SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
     ```

3. **執行資料庫遷移**
   - 在 Supabase SQL Editor 中執行 `supabase/migrations/` 目錄下的所有 SQL 檔案
   - 或使用 Supabase CLI：
     ```bash
     supabase db push
     ```

4. **佈署 Edge Functions**
   ```bash
   supabase functions deploy employee-login
   supabase functions deploy cleanup-expired-attachments
   supabase functions deploy calculate-monthly-stats
   ```

5. **啟動開發伺服器**
   ```bash
   npm run dev
   ```

6. **打開瀏覽器**
   - 訪問 `http://localhost:3000`

## 📁 專案結構

```
Pharmacy Scheduling System/
├── app/                          # Next.js App Router
│   ├── (auth)/login/             # 登入頁面
│   ├── (dashboard)/              # 主要功能頁面
│   │   ├── page.tsx              # 班表頁面
│   │   ├── leave-selection/      # 排休選擇
│   │   ├── applications/         # 各種申請
│   │   ├── attendance/           # 工時統計
│   │   ├── employees/            # 員工管理
│   │   └── notifications/        # 通知列表
│   └── layout.tsx
├── components/                   # React 元件
│   ├── schedule/                 # 班表相關元件
│   ├── attendance/               # 工時相關元件
│   ├── notifications/            # 通知元件
│   ├── applications/             # 申請元件
│   └── ui/                       # 基礎 UI 元件
├── lib/                          # 業務邏輯
│   ├── scheduling/               # 排班規則
│   ├── attendance/               # 工時計算
│   ├── validation/               # 表單驗證
│   ├── supabase/                 # Supabase 設定
│   └── __tests__/                # 測試檔案
└── supabase/                     # Supabase 設定
    ├── migrations/               # 資料庫遷移
    ├── functions/                # Edge Functions
    └── seed.sql                  # 初始資料
```

## 🧪 執行測試

```bash
npm run test          # 執行所有測試
npm run test:watch    # 監聽模式
```

## 🏗️ 建構正式版

```bash
npm run build
npm start
```

## 📝 開發日誌

### ✅ 已完成
- [x] 資料庫 Schema 與 RLS 原則
- [x] 通知系統 Database Triggers
- [x] 業務邏輯函式庫（排班、工時）
- [x] Property-based 測試與單元測試
- [x] Supabase Edge Functions
- [x] 登入頁面（管理員密碼/員工無密碼）
- [x] 主版面與導航（側邊欄、通知鈴鐺）
- [x] 班表查看頁面（月曆模式）
- [x] 員工排休選擇頁面（直式介面）
- [x] 請假申請功能
- [x] 換班申請功能
- [x] 加班申請功能
- [x] 工時統計頁面
- [x] 遲到管理頁面
- [x] 員工管理頁面

### 🔄 待完善
- [ ] 班表編輯器（管理者）
- [ ] 鎖定控制介面
- [ ] 排班規則設定頁面
- [ ] 附件上傳功能
- [ ] E2E 測試

## 👨‍💻 作者

耀聖藥局開發團隊

## 📄 授權

MIT License
