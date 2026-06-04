# Implementation Plan: 耀聖藥局智慧排班系統

## Overview

依照需求文件與設計文件，將系統實作分為 19 個任務群組，涵蓋專案初始化、資料庫建立、RLS 安全設定、業務邏輯函式庫、Edge Functions、前端頁面，以及整合測試。任務依照依賴關係排序，基礎設施任務（1-7）需先完成，再進行前端頁面開發（8-18），最後執行整合測試（19）。

## Tasks

- [x] 1. 初始化專案與 Supabase 環境設定
  - 使用 `create-next-app` 建立 Next.js 14 (App Router) 專案，設定 TypeScript 與 Tailwind CSS
  - 安裝並設定 Shadcn UI（執行 `npx shadcn-ui@latest init`）
  - 安裝 Supabase 相關套件：`@supabase/supabase-js`、`@supabase/ssr`
  - 安裝開發工具套件：`vitest`、`fast-check`、`react-hook-form`、`zod`、`@hookform/resolvers`
  - 建立 `.env.local` 範本（`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`）
  - 建立 `lib/supabase/client.ts`（瀏覽器端）與 `lib/supabase/server.ts`（伺服器端）Supabase client
  - 建立 `lib/supabase/middleware.ts` 並設定 `middleware.ts` 處理 session 刷新與路由保護
  - **Requirement:** 1

- [x] 2. 資料庫 Schema 建立
  - 建立 Supabase migration 檔案，建立 `public.users` 資料表（`id`、`name`、`role`、`is_active`、`created_at`、`updated_at`）
  - 建立 `public.scheduling_rules` 資料表（月休配額、週六配額、平日配額、晚班最低人數）
  - 建立 `public.schedule_entries` 資料表（`user_id`、`date`、`shift_code`、`is_fixed`、`created_by`、`updated_by`）
  - 建立 `public.schedule_locks` 資料表（`lock_type`、`lock_date`、`lock_year`、`lock_week`、`lock_month`、`locked_by`）
  - 建立 `public.leave_applications` 資料表（`user_id`、`leave_date`、`period`、`leave_type`、`reason`、`status`、`reject_reason`、`reviewed_by`、`reviewed_at`）
  - 建立 `public.leave_attachments` 資料表（`application_id`、`storage_path`、`file_name`、`file_size`、`mime_type`、`status`、`uploaded_at`、`deleted_at`）
  - 建立 `public.shift_swap_applications` 資料表（`requester_id`、`target_id`、`swap_date`、`status`、`reject_reason`、`reviewed_by`、`reviewed_at`）
  - 建立 `public.overtime_applications` 資料表（`user_id`、`overtime_date`、`start_time`、`end_time`、`reason`、`status`、`compensation`、`reject_reason`、`reviewed_by`、`reviewed_at`）
  - 建立 `public.monthly_attendance_stats` 資料表（`user_id`、`year`、`month`、`work_days`、`work_hours`、`overtime_hours`、`comp_leave_hours`、`leave_hours`）
  - 建立 `public.tardiness_records` 資料表（`user_id`、`record_date`、`minutes_late`、`note`、`recorded_by`）
  - 建立 `public.notifications` 資料表（`recipient_id`、`type`、`title`、`body`、`related_id`、`related_type`、`is_read`）
  - 建立 `is_date_locked(check_date DATE)` PostgreSQL Function
  - 在 Supabase Storage 建立 `leave-attachments` bucket（設定為 private）
  - **Requirement:** 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12

- [x] 3. Row Level Security (RLS) 政策設定
  - 為 `users` 表啟用 RLS，建立 `users_select_all`（所有已驗證使用者可查看）、`users_insert_boss_only`、`users_delete_boss_only` 政策
  - 為 `schedule_entries` 表啟用 RLS，建立 `schedule_select_all`、`schedule_update_manager`（老闆/店長可編輯任意）、`schedule_update_employee_self`（員工只能修改自己的非固定班別）政策
  - 為 `schedule_locks` 表啟用 RLS，建立 manager/boss 可新增刪除、所有人可查看的政策
  - 為 `leave_applications` 表啟用 RLS，建立 `leave_select_own`（員工看自己、管理者看全部）、`leave_insert_own`、`leave_update_manager` 政策
  - 為 `leave_attachments` 表啟用 RLS，建立對應請假申請存取權限的政策
  - 為 `shift_swap_applications` 表啟用 RLS，建立申請人/目標員工/管理者各自的存取政策
  - 為 `overtime_applications` 表啟用 RLS，建立員工看自己、管理者看全部的政策
  - 為 `monthly_attendance_stats` 表啟用 RLS，建立員工看自己、管理者看全部的政策
  - 為 `tardiness_records` 表啟用 RLS，建立只有管理者可新增/查看的政策
  - 為 `notifications` 表啟用 RLS，建立 `notifications_select_own`、`notifications_update_own` 政策
  - 為 `leave-attachments` Storage bucket 設定 RLS 政策（員工只能存取自己申請的附件）
  - **Requirement:** 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12

- [ ] 4. 通知 Database Triggers 建立
  - 建立 `notify_leave_submitted()` trigger function，請假申請提交後通知所有 manager/boss
  - 建立 `notify_shift_swap_requested()` trigger function，換班申請提交後通知目標員工
  - 建立 `notify_shift_swap_confirmed()` trigger function，換班申請狀態變為 `pending_review` 後通知 manager/boss
  - 建立 `notify_shift_swap_responded()` trigger function，換班申請被拒絕後通知申請人
  - 建立 `notify_overtime_submitted()` trigger function，加班申請提交後通知 manager/boss
  - 建立 `notify_application_reviewed()` trigger function，任何申請狀態變為 approved/rejected 後通知申請人
  - 建立 `notify_schedule_changed()` trigger function，班表條目更新後通知受影響員工
  - 在各資料表上建立對應的 AFTER INSERT/UPDATE trigger
  - **Requirement:** 11

- [x] 5. 業務邏輯函式庫建立
  - 建立 `lib/scheduling/rules.ts`，實作 `validateLeaveSelection()` 排班規則引擎（含聖文特殊規則、週六/平日配額驗證）
  - 建立 `lib/scheduling/staffing.ts`，實作 `calculateEveningStaffingStatus()` 人力缺口計算函式
  - 建立 `lib/scheduling/monthly.ts`，實作 `generateMonthlyEntries()` 月份班表初始化函式（自動標記週日固定排休、聖文固定班）
  - 建立 `lib/attendance/calculator.ts`，實作 `calculateMonthlyStats()` 月度工時統計計算函式
  - 建立 `lib/validation/schemas.ts`，定義所有 Zod schema（請假申請、加班申請、換班申請、員工新增、遲到紀錄）
  - 建立 `lib/types/index.ts`，定義所有 TypeScript 型別（User、ScheduleEntry、LeaveApplication 等）
  - **Requirement:** 3, 4, 8, 9

- [ ] 6. 業務邏輯單元測試與屬性測試
  - 設定 Vitest 設定檔（`vitest.config.ts`）
  - 撰寫 `validateLeaveSelection()` 的屬性測試（Property 6：排休配額上限，≥100 次迭代）
  - 撰寫聖文特殊規則的單元測試（Property 7：週三固定排休、週二固定白班、不可選平日）
  - 撰寫 `calculateEveningStaffingStatus()` 的屬性測試（Property 8：晚班人力警示狀態，≥100 次迭代）
  - 撰寫加班時間驗證的屬性測試（Property 13：結束時間必須晚於起始時間，≥100 次迭代）
  - 撰寫加班時段不重疊的屬性測試（Property 14，≥100 次迭代）
  - 撰寫員工姓名驗證的屬性測試（Property 3：長度 1-10，≥100 次迭代）
  - 撰寫 `calculateMonthlyStats()` 的單元測試（各班別時數計算正確性）
  - 執行所有測試並確認通過
  - **Requirement:** 2, 3, 4, 8, 9

- [ ] 7. Supabase Edge Functions 建立
  - 建立 `supabase/functions/employee-login/index.ts`，實作員工無密碼登入（驗證姓名存在且 is_active=true，使用 Service Role 建立 session）
  - 建立 `supabase/functions/cleanup-expired-attachments/index.ts`，實作附件清理邏輯（查詢超過 168 小時的附件、刪除 Storage 物件、更新狀態、處理失敗重試）
  - 建立 `supabase/functions/calculate-monthly-stats/index.ts`，實作月度工時統計計算並寫入 `monthly_attendance_stats`
  - 使用 `pg_cron` 設定排程：`cleanup-expired-attachments` 每日 02:00 UTC、`calculate-monthly-stats` 每月最後一日 23:59
  - 撰寫 Edge Function 的測試（附件清理成功路徑、失敗重試路徑）
  - **Requirement:** 9, 12

- [ ] 8. 登入頁面
  - 建立 `app/(auth)/login/page.tsx` 登入頁面
  - 實作老闆/店長帳號密碼登入表單（使用 Supabase Auth `signInWithPassword`）
  - 實作員工下拉選單登入（從 `users` 表查詢 role='employee' 且 is_active=true 的員工列表）
  - 員工選取姓名後呼叫 `employee-login` Edge Function 取得 session
  - 登入失敗時顯示「帳號或密碼錯誤」；員工列表為空時顯示「目前無可用帳號，請聯絡管理員」
  - 登入成功後依角色導向對應的 dashboard 頁面
  - 建立 `app/(auth)/layout.tsx`，未登入時重導向至登入頁
  - **Requirement:** 1

- [ ] 9. 主版面與導航
  - 建立 `app/(dashboard)/layout.tsx`，包含側邊欄導航與通知鈴鐺
  - 建立 `components/notifications/NotificationBell.tsx`，顯示未讀通知數量（使用 Supabase Realtime 訂閱）
  - 建立 `components/notifications/NotificationList.tsx`，顯示通知列表並支援標記已讀
  - 建立 `app/(dashboard)/notifications/page.tsx`，完整通知頁面
  - 側邊欄依角色顯示對應的導航項目（員工不顯示員工管理、遲到管理等）
  - 建立登出功能
  - **Requirement:** 1, 11

- [ ] 10. 班表查看頁面（橫式月曆）
  - 建立 `components/schedule/MonthlyCalendar.tsx`，橫式月曆元件（橫列為日期，直列為員工姓名）
  - 建立 `components/schedule/ShiftCell.tsx`，單一班別格元件（顯示班別代碼、鎖定標示、警示狀態）
  - 建立 `components/schedule/StaffingAlert.tsx`，人力缺口警示元件（🔴🟡⚠ℹ）
  - 建立 `app/(dashboard)/schedule/page.tsx`，班表月曆主頁（預設顯示當月）
  - 建立 `app/(dashboard)/schedule/[year]/[month]/page.tsx`，特定月份班表頁
  - 整合 `calculateEveningStaffingStatus()` 計算每日晚班人力警示狀態
  - 支援月份切換（上個月/下個月導航）
  - 所有登入使用者皆可查看完整月份班表
  - **Requirement:** 4

- [ ] 11. 員工排休選擇頁面（直式介面）
  - 建立 `components/schedule/LeaveSelectionGrid.tsx`，直式排休選擇格元件（橫列為員工姓名，直列為日期）
  - 建立 `app/(dashboard)/leave-selection/page.tsx`，員工排休選擇頁面
  - 整合 `validateLeaveSelection()` 驗證排休選擇合規性
  - 自動標記週日為固定排休（灰色不可點擊）
  - 自動標記聖文的週三（固定排休）與週二（固定白班）
  - 顯示已選週六排休數量（x/2）與平日排休數量（x/2）
  - 達到配額上限時禁止繼續選取並顯示提示訊息
  - 鎖定日期顯示鎖定標示，點擊時顯示「此日期已鎖定，無法修改」
  - 選取/取消排休時即時更新 `schedule_entries` 資料表
  - **Requirement:** 3, 5

- [ ] 12. 店長/老闆班表編輯功能
  - 在 `MonthlyCalendar.tsx` 中為店長/老闆角色加入班別編輯功能（點擊格子可選擇班別代碼）
  - 建立 `components/schedule/LockControls.tsx`，鎖定/解鎖控制元件（支援單日/整週/整月）
  - 實作班表鎖定 API：新增/刪除 `schedule_locks` 紀錄
  - 鎖定後在對應範圍顯示鎖定標示，員工嘗試修改時顯示「此班表已鎖定，無法修改」
  - 建立 `app/(dashboard)/settings/page.tsx`，排班規則參數設定頁面（修改 `scheduling_rules`）
  - 班表修改後觸發通知給受影響員工（透過 Database Trigger）
  - **Requirement:** 4, 5

- [ ] 13. 請假申請功能
  - 建立 `components/applications/LeaveForm.tsx`，請假申請表單（日期、時段、假別、事由、附件上傳）
  - 建立 `app/(dashboard)/applications/leave/new/page.tsx`，新增請假申請頁面
  - 整合 Zod schema 驗證（日期不得早於今日、事由最多 200 字）
  - 實作附件上傳功能（上傳至 Supabase Storage，驗證格式 JPEG/PNG/PDF、大小 ≤10MB、數量 ≤5）
  - 上傳失敗時顯示具體失敗原因（格式不符/超過 10 MB/其他錯誤）
  - 建立 `app/(dashboard)/applications/leave/page.tsx`，請假申請列表頁面（員工只看自己的）
  - 建立 `components/applications/ApplicationStatusBadge.tsx`，申請狀態標籤元件
  - 店長/老闆審核頁面：顯示待審核請假申請，支援核准與拒絕（需填寫拒絕原因）
  - **Requirement:** 7, 12

- [ ] 14. 換班申請功能
  - 建立 `components/applications/ShiftSwapForm.tsx`，換班申請表單（選擇日期、指定換班對象）
  - 建立 `app/(dashboard)/applications/shift-swap/new/page.tsx`，新增換班申請頁面
  - 建立 `app/(dashboard)/applications/shift-swap/page.tsx`，換班申請列表頁面（顯示申請狀態）
  - 實作員工B確認/拒絕換班申請的功能（更新狀態為 `pending_review` 或 `rejected`）
  - 實作店長審核換班申請的功能（核准時自動交換兩人的班表條目、拒絕時更新狀態）
  - 確認換班申請狀態機正確運作（待確認→待審核→已通過/已拒絕）
  - **Requirement:** 6

- [ ] 15. 加班申請功能
  - 建立 `components/applications/OvertimeForm.tsx`，加班申請表單（日期、起始時間、結束時間、事由）
  - 建立 `app/(dashboard)/applications/overtime/new/page.tsx`，新增加班申請頁面
  - 整合 Zod schema 驗證（結束時間必須晚於起始時間、日期範圍限制、重疊申請檢查）
  - 建立 `app/(dashboard)/applications/overtime/page.tsx`，加班申請列表頁面
  - 實作店長審核加班申請的功能（核准時選擇轉換為加班費或補休時數）
  - 核准後將加班時數記錄至 `monthly_attendance_stats`
  - **Requirement:** 8

- [ ] 16. 工時統計頁面
  - 建立 `components/attendance/MonthlyStatsTable.tsx`，月度工時統計表元件
  - 建立 `app/(dashboard)/attendance/page.tsx`，工時統計報表頁面
  - 店長/老闆可查看所有員工的月度統計；員工只能查看本人統計
  - 支援月份切換查看歷史統計
  - 資料不完整時顯示「資料不完整，無法計算工時，請確認班表與申請紀錄」提示
  - **Requirement:** 9

- [ ] 17. 遲到管理頁面
  - 建立 `components/attendance/TardinessTable.tsx`，遲到紀錄表元件
  - 建立 `app/(dashboard)/attendance/tardiness/page.tsx`，遲到管理頁面
  - 實作新增遲到紀錄表單（日期、員工姓名、遲到分鐘數 1-999、備註選填）
  - 整合重複紀錄驗證（同一員工同一日期不可重複新增）
  - 顯示每位員工當月遲到次數與累積遲到分鐘數統計
  - 老闆可查看過去 12 個月的歷史遲到紀錄
  - **Requirement:** 10

- [ ] 18. 員工管理頁面
  - 建立 `app/(dashboard)/employees/page.tsx`，員工管理頁面（老闆專用）
  - 實作新增員工功能（輸入姓名、驗證長度 1-10 字元、驗證姓名唯一性）
  - 新增員工時在 Supabase Auth 建立對應帳號（使用虛擬 email）並寫入 `users` 表
  - 實作刪除員工功能（顯示確認提示、軟刪除設定 `is_active=false`、保留歷史紀錄）
  - 非老闆角色嘗試存取時顯示「權限不足」並重導向
  - **Requirement:** 2

- [ ] 19. 端對端整合測試
  - 設定 Supabase 本地開發環境（`supabase start`）
  - 撰寫 RLS 整合測試：驗證各角色對各資料表的存取權限（Property 1、2）
  - 撰寫員工姓名唯一性整合測試（Property 4）
  - 撰寫刪除員工保留歷史紀錄整合測試（Property 5）
  - 撰寫班表鎖定不可修改性整合測試（Property 9）
  - 撰寫換班申請狀態機整合測試（Property 10）
  - 撰寫請假日期驗證整合測試（Property 11）
  - 撰寫附件格式與大小驗證整合測試（Property 12）
  - 撰寫附件自動過期刪除整合測試（Property 16、17）
  - 撰寫遲到紀錄唯一性整合測試（Property 15）
  - 執行所有整合測試並確認通過
  - **Requirement:** 1, 2, 3, 5, 6, 7, 8, 10, 12

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": [1] },
    { "wave": 2, "tasks": [2, 5] },
    { "wave": 3, "tasks": [3, 6] },
    { "wave": 4, "tasks": [4, 7] },
    { "wave": 5, "tasks": [8] },
    { "wave": 6, "tasks": [9] },
    { "wave": 7, "tasks": [10, 11, 13, 14, 15, 17, 18] },
    { "wave": 8, "tasks": [12, 16] },
    { "wave": 9, "tasks": [19] }
  ],
  "dependencies": {
    "2": ["1"],
    "3": ["2"],
    "4": ["3"],
    "5": ["1"],
    "6": ["5"],
    "7": ["2"],
    "8": ["3"],
    "9": ["4", "8"],
    "10": ["9", "5"],
    "11": ["9", "5"],
    "12": ["10"],
    "13": ["9"],
    "14": ["9"],
    "15": ["9", "5"],
    "16": ["9", "7"],
    "17": ["9"],
    "18": ["9"],
    "19": ["10", "11", "12", "13", "14", "15", "16", "17", "18"]
  }
}
```

## Notes

- 員工無密碼登入透過 `employee-login` Edge Function 實作，需使用 Service Role Key，此 Key 僅存放於伺服器端，不暴露給前端
- 聖文特殊規則（週二固定白班、週三固定排休）在 `generateMonthlyEntries()` 初始化時自動套用，並以 `is_fixed=true` 標記防止修改
- 附件清理排程每日 02:00 UTC 執行，刪除失敗的附件狀態更新為 `delete_failed`，下次排程重試
- 月度工時統計排程在每月最後一日 23:59 執行，若需手動觸發可直接呼叫 Edge Function
- 所有業務規則驗證採雙層防護：前端 Zod schema 即時驗證 + 後端 RLS/Database Constraints
- 通知系統透過 Database Trigger 自動建立，前端使用 Supabase Realtime 訂閱即時更新未讀數量
