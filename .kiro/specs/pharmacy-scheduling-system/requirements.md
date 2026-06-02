# 需求文件

## Introduction

耀聖藥局智慧排班管理系統是一套專為社區藥局設計的網頁應用程式，支援多角色使用者（老闆、店長、員工）進行排休申請、換班、請假、加班、工時計算及管理者審核等功能。系統採用 Next.js + Tailwind CSS + Shadcn UI 作為前端框架，以 Supabase（PostgreSQL）作為後端資料庫與儲存服務，並實作角色權限管理機制。

---

## Glossary

- **系統（System）**：耀聖藥局智慧排班管理系統整體
- **老闆（Boss）**：擁有最高權限的系統管理者，不顯示於班表
- **店長（Manager）**：具管理者權限的員工代表（佾珊），需密碼登入
- **員工（Employee）**：一般藥局工作人員，免密碼登入，透過下拉選單選擇姓名
- **排休申請（ScheduleRequest）**：員工提交下個月休假日期的申請
- **換班申請（ShiftSwapRequest）**：員工之間互換班次的申請
- **請假申請（LeaveRequest）**：員工申請事假、病假、特休或其他假別的申請
- **加班申請（OvertimeRequest）**：員工申請加班時數的申請
- **班別（ShiftType）**：預定義的工作時段代碼（A、B、C、D、E、X）
- **班表（Schedule）**：每月每位員工每日的班別安排
- **工時（WorkHours）**：依班別自動計算的工作時數
- **補休（CompensatoryLeave）**：加班後可轉換的休假時數
- **遲到記錄（LatenessRecord）**：店長登記員工遲到的紀錄
- **通知（Notification）**：系統發送給使用者的訊息
- **附件（Attachment）**：請假申請時上傳的佐證文件
- **班表鎖定（ScheduleLock）**：店長對特定日期、週或月份設定的編輯限制
- **晚班（EveningShift）**：包含 19:00–21:00 時段的班別（A 班、E 班）
- **人力缺口（StaffingGap）**：當日晚班人數不足或無人排班的狀態

---

## Requirements

### Requirement 1：使用者身份驗證與角色管理

**User Story:** 身為系統使用者，我希望能依照自己的角色登入系統，以便存取對應的功能與資料。

#### Acceptance Criteria

1. THE System SHALL 提供三種角色：老闆（Boss）、店長（Manager）、員工（Employee）。
2. WHEN 老闆嘗試登入，THE System SHALL 要求輸入帳號與密碼進行身份驗證。
3. WHEN 店長嘗試登入，THE System SHALL 要求輸入密碼進行身份驗證。
4. WHEN 員工嘗試登入，THE System SHALL 提供下拉選單供員工選擇姓名，無需輸入密碼。
5. IF 老闆或店長輸入錯誤密碼，THEN THE System SHALL 顯示錯誤訊息並拒絕登入。
6. WHEN 使用者成功登入，THE System SHALL 依照角色顯示對應的功能選單與頁面。
7. WHEN 使用者登出，THE System SHALL 清除工作階段並導向登入頁面。
8. THE System SHALL 確保員工無法存取老闆或店長專屬的管理功能。

---

### Requirement 2：員工名單管理

**User Story:** 身為老闆，我希望能新增與刪除員工，以便維護最新的人員名單。

#### Acceptance Criteria

1. THE System SHALL 維護員工名單，預設包含：佾珊（店長）、貞葶、宜孝、聖文、桂香。
2. WHEN 老闆新增員工，THE System SHALL 將新員工加入員工名單並使其可於班表中顯示。
3. WHEN 老闆刪除員工，THE System SHALL 將該員工從員工名單中移除，並保留其歷史班表記錄。
4. THE System SHALL 確保老闆（Boss）不顯示於班表中。
5. THE System SHALL 確保只有老闆可執行新增與刪除員工的操作。

---

### Requirement 3：班別定義與工時計算

**User Story:** 身為系統使用者，我希望系統能依照預定義的班別自動計算工時，以便準確統計每位員工的月工時。

#### Acceptance Criteria

1. THE System SHALL 支援以下六種班別定義：A 班（08:30–12:00、13:30–17:00、19:00–21:00，工時 7.5 小時）、B 班（08:30–12:00、13:30–18:00，工時 6.5 小時）、C 班（14:30–21:00，工時 5.5 小時）、D 班（14:30–18:00，工時 3.5 小時）、E 班（14:30–17:00、19:00–21:00，工時 4 小時）、X 班（休假，工時 0 小時）。
2. WHEN 員工的班別被指定，THE System SHALL 依照班別定義自動計算當日工時。
3. THE System SHALL 每月自動加總每位員工的月工時、加班工時、補休時數及請假時數。
4. WHEN 班別定義被更新，THE System SHALL 重新計算受影響員工的工時統計。

---

### Requirement 4：排休申請

**User Story:** 身為員工，我希望能在每月截止日前選擇下個月的休假日期，以便安排個人行程。

#### Acceptance Criteria

1. THE System SHALL 允許員工在排休申請期間選擇下個月的休假日期。
2. THE System SHALL 為每位員工每月提供 8 天休假配額，其中星期日全部自動設為休假（約 4 天，不可取消）。
3. THE System SHALL 允許一般員工（非聖文）從以下選項中選擇剩餘 4 天休假：平日（週一至週五）2 天 + 星期六 2 天。
4. WHERE 員工為聖文，THE System SHALL 套用特殊規則：星期三固定休假（不可取消）、星期二上午固定上班、不可選擇平日休假、僅可選擇 2 天星期六休假。
5. WHEN 員工選擇休假日期，THE System SHALL 顯示該日期已選擇休假的其他員工姓名及當日晚班員工姓名。
6. WHEN 當日晚班人數少於 2 人，THE System SHALL 顯示警告訊息「⚠️ 晚班人數不足」。
7. WHEN 當日無任何員工排班，THE System SHALL 顯示警告訊息「⚠️ 當日無人排班」。
8. THE System SHALL 允許員工在顯示警告的情況下仍可送出排休申請，不強制限制。
9. WHEN 員工送出排休申請，THE System SHALL 記錄申請並通知店長。

---

### Requirement 5：換班申請

**User Story:** 身為員工，我希望能向其他員工提出換班申請，以便在特殊情況下調整班次。

#### Acceptance Criteria

1. WHEN 員工（申請人）提出換班申請，THE System SHALL 要求申請人指定換班日期並選擇換班對象（員工 B）。
2. WHEN 換班申請送出，THE System SHALL 將申請狀態設為「待確認」並通知員工 B。
3. WHEN 員工 B 同意換班申請，THE System SHALL 將申請狀態更新為「待審核」並通知店長。
4. WHEN 員工 B 拒絕換班申請，THE System SHALL 將申請狀態更新為「已拒絕」並通知申請人。
5. WHEN 店長審核換班申請並通過，THE System SHALL 將申請狀態更新為「已通過」、更新班表，並通知申請人與員工 B。
6. WHEN 店長審核換班申請並拒絕，THE System SHALL 將申請狀態更新為「已拒絕」並通知申請人與員工 B。
7. THE System SHALL 維護換班申請的四種狀態：待確認、待審核、已通過、已拒絕。
8. IF 班表已被鎖定，THEN THE System SHALL 拒絕對鎖定日期的換班申請並顯示提示訊息。

---

### Requirement 6：請假申請

**User Story:** 身為員工，我希望能提交請假申請並上傳相關附件，以便正式記錄我的缺勤原因。

#### Acceptance Criteria

1. WHEN 員工提交請假申請，THE System SHALL 要求填寫：假別（事假、病假、特休、其他）、請假日期、請假時段及事由。
2. THE System SHALL 允許員工上傳附件，支援格式為 jpg、png、pdf。
3. THE System SHALL 在附件上傳後保留 7 天，7 天後自動刪除附件。
4. WHEN 請假申請送出，THE System SHALL 通知店長有新的請假申請待審核。
5. WHEN 店長審核請假申請並通過，THE System SHALL 更新員工請假時數並通知員工審核結果。
6. WHEN 店長審核請假申請並拒絕，THE System SHALL 通知員工審核結果並說明原因。
7. THE System SHALL 將已核准的請假時數納入員工月工時統計。
8. IF 上傳的附件格式不符（非 jpg、png、pdf），THEN THE System SHALL 顯示錯誤訊息並拒絕上傳。

---

### Requirement 7：加班申請

**User Story:** 身為員工，我希望能提交加班申請，以便正式記錄加班時數並申請補休。

#### Acceptance Criteria

1. WHEN 員工提交加班申請，THE System SHALL 要求填寫：加班日期、開始時間、結束時間及加班原因。
2. WHEN 加班申請送出，THE System SHALL 通知店長有新的加班申請待審核。
3. WHEN 店長審核加班申請並通過，THE System SHALL 計算加班時數並記錄至員工工時統計。
4. WHEN 加班時數被記錄，THE System SHALL 允許員工將加班時數轉換為補休時數。
5. WHEN 店長審核加班申請並拒絕，THE System SHALL 通知員工審核結果。
6. THE System SHALL 將已核准的加班時數納入員工月工時統計。

---

### Requirement 8：工時統計

**User Story:** 身為老闆與店長，我希望能查看每位員工的工時統計，以便掌握人力成本與出勤狀況。

#### Acceptance Criteria

1. THE System SHALL 為每位員工每月自動計算並顯示：月工時、加班工時、補休時數、請假時數。
2. WHEN 老闆查看工時統計，THE System SHALL 顯示所有員工的工時資料。
3. WHEN 店長查看工時統計，THE System SHALL 顯示所有員工的工時資料。
4. WHEN 員工查看個人工時，THE System SHALL 僅顯示該員工自己的工時資料。
5. THE System SHALL 依班別定義自動計算每日工時，並累加為月工時。
6. WHEN 請假或加班申請被核准，THE System SHALL 即時更新受影響員工的工時統計。

---

### Requirement 9：遲到管理

**User Story:** 身為店長，我希望能登記員工的遲到記錄，以便追蹤出勤紀律。

#### Acceptance Criteria

1. WHEN 店長登記遲到記錄，THE System SHALL 要求填寫：日期、員工姓名、遲到分鐘數及備註。
2. THE System SHALL 自動統計每位員工本月遲到次數及累積遲到分鐘數。
3. WHEN 遲到記錄被新增，THE System SHALL 即時更新該員工的遲到統計。
4. THE System SHALL 確保只有店長與老闆可新增或修改遲到記錄。

---

### Requirement 10：班表管理與鎖定

**User Story:** 身為店長與老闆，我希望能編輯班表並鎖定特定日期，以便防止員工在確認後修改排班。

#### Acceptance Criteria

1. WHEN 老闆編輯班表，THE System SHALL 允許修改所有員工的任意日期班別。
2. WHEN 店長編輯班表，THE System SHALL 允許修改所有員工的班別。
3. THE System SHALL 允許店長鎖定單日、整週或整月的班表。
4. WHILE 班表處於鎖定狀態，THE System SHALL 禁止員工修改該日期的排班。
5. WHILE 班表處於鎖定狀態，THE System SHALL 仍允許店長與老闆修改班表。
6. WHEN 班表被鎖定，THE System SHALL 在班表介面顯示鎖定狀態標示。
7. THE System SHALL 確保只有店長與老闆可執行班表鎖定與解鎖操作。

---

### Requirement 11：班表查詢介面

**User Story:** 身為所有使用者，我希望能以直覺的介面查看班表，以便快速了解排班狀況。

#### Acceptance Criteria

1. THE System SHALL 提供月曆模式的班表查詢介面，以橫式排列顯示（日期在上方，員工姓名在左側）。
2. THE System SHALL 提供排休申請介面，以直式排列顯示，模擬藥局紙本班表風格。
3. WHEN 使用者查看班表，THE System SHALL 顯示每位員工每日的班別代碼（A、B、C、D、E、X）。
4. WHEN 使用者切換月份，THE System SHALL 顯示對應月份的完整班表。
5. THE System SHALL 在班表中標示已鎖定的日期。
6. THE System SHALL 在班表中標示人力缺口（晚班不足或無人排班）的日期。

---

### Requirement 12：通知系統

**User Story:** 身為系統使用者，我希望能即時收到與我相關的申請審核結果與班表異動通知，以便掌握最新狀態。

#### Acceptance Criteria

1. WHEN 請假申請審核完成，THE System SHALL 通知申請員工審核結果（通過或拒絕）。
2. WHEN 換班申請狀態變更，THE System SHALL 通知相關員工（申請人與換班對象）最新狀態。
3. WHEN 加班申請審核完成，THE System SHALL 通知申請員工審核結果（通過或拒絕）。
4. WHEN 班表發生異動，THE System SHALL 通知受影響的員工。
5. WHEN 員工提交請假申請，THE System SHALL 通知店長有新的請假申請待審核。
6. WHEN 員工提交換班申請且員工 B 已同意，THE System SHALL 通知店長有新的換班申請待審核。
7. WHEN 員工提交加班申請，THE System SHALL 通知店長有新的加班申請待審核。
8. THE System SHALL 在使用者介面中顯示未讀通知數量。
9. WHEN 使用者查看通知，THE System SHALL 將通知標記為已讀。

---

### Requirement 13：人力缺口提醒

**User Story:** 身為店長，我希望能即時看到人力缺口提醒，以便在排班確認前及時調整。

#### Acceptance Criteria

1. WHEN 某日晚班人數少於 2 人，THE System SHALL 在班表介面顯示「⚠️ 晚班人數不足」提醒。
2. WHEN 某日無任何員工排班，THE System SHALL 在班表介面顯示「⚠️ 當日無人排班」提醒。
3. THE System SHALL 在店長的管理介面中彙整顯示所有人力缺口日期清單。
4. THE System SHALL 確保人力缺口提醒為警示性質，不強制阻擋排班操作。

---

### Requirement 14：附件管理

**User Story:** 身為系統，我希望能自動管理請假附件的生命週期，以便節省儲存空間並保護隱私。

#### Acceptance Criteria

1. THE System SHALL 將請假申請的附件儲存於 Supabase Storage。
2. THE System SHALL 在附件上傳後第 7 天自動刪除該附件。
3. WHEN 附件被刪除，THE System SHALL 保留請假申請記錄，僅移除附件連結。
4. THE System SHALL 確保只有申請人、店長與老闆可存取請假附件。
5. IF 附件上傳失敗，THEN THE System SHALL 顯示錯誤訊息並允許員工重新上傳。

---

### Requirement 15：資料安全與權限控制

**User Story:** 身為老闆，我希望系統能嚴格控管各角色的資料存取權限，以便保護員工隱私與系統安全。

#### Acceptance Criteria

1. THE System SHALL 實作角色型存取控制（RBAC），確保每個角色只能存取其授權的功能與資料。
2. THE System SHALL 確保員工只能查看自己的請假、加班及工時資料，無法查看其他員工的詳細記錄。
3. THE System SHALL 確保所有 API 請求均經過身份驗證與授權驗證。
4. IF 未授權的使用者嘗試存取受保護資源，THEN THE System SHALL 回傳 403 錯誤並記錄存取嘗試。
5. THE System SHALL 使用 Supabase 的 Row Level Security（RLS）機制保護資料庫層級的資料存取。
