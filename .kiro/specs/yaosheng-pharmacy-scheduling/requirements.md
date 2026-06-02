# Requirements Document

## Introduction

耀聖藥局智慧排班系統是一套專為藥局設計的網頁排班管理平台。系統支援三種使用者角色（老闆、店長、員工），提供排休選擇、班表管理、換班申請、請假申請、加班申請、工時統計、遲到管理及通知功能。系統採用 Next.js + Supabase 技術棧，以月曆介面呈現班表，並依照藥局特定排班規則自動驗證排休合規性。

## Glossary

- **System**：耀聖藥局智慧排班系統整體
- **Scheduler**：排班模組，負責班表的建立、顯示與鎖定
- **LeaveManager**：請假管理模組
- **ShiftSwapManager**：換班管理模組
- **OvertimeManager**：加班管理模組
- **AttendanceTracker**：工時與遲到統計模組
- **NotificationService**：通知服務模組
- **FileStorage**：附件儲存模組（Supabase Storage）
- **老闆（Boss）**：系統最高權限管理者，不出現在班表中，以帳號密碼登入
- **店長（Manager）**：佾珊，需帳號密碼登入，可編輯班表與審核申請
- **員工（Employee）**：宜孝、貞葶、聖文、桂香，以下拉選單選取姓名登入，無需密碼
- **班別代碼**：A（全天班）、B（白班）、C（下午班）、D（晚班）、E（下午+晚班）、X（排休）
- **排休**：員工選擇的休假日，以班別代碼 X 表示
- **月休配額**：每位員工每月固定 8 天休假（4 天固定週日 + 2 天週六 + 2 天平日）
- **聖文特殊規則**：聖文週二上午固定班、週三固定休息，不可額外選平日休假，僅能選 2 天週六排休
- **班表鎖定**：店長或老闆對特定日、週或月份設定的不可修改狀態
- **人力缺口**：某時段上班人數不足的警示狀態
- **站內通知**：系統介面內的通知列表，不依賴外部推播服務

## Requirements

### Requirement 1: 使用者身份識別與存取控制

**User Story:** 身為系統使用者，我希望依照角色以不同方式登入，以便系統能正確授予對應的操作權限。

#### Acceptance Criteria

1. THE System SHALL 提供老闆以帳號密碼登入的入口，並於驗證成功後授予最高管理權限。
2. IF 老闆輸入錯誤的帳號或密碼，THEN THE System SHALL 拒絕登入並顯示「帳號或密碼錯誤」的提示訊息。
3. THE System SHALL 提供店長（羿珊）以帳號密碼登入的入口，並於驗證成功後授予店長權限。
4. IF 店長輸入錯誤的帳號或密碼，THEN THE System SHALL 拒絕登入並顯示「帳號或密碼錯誤」的提示訊息。
5. THE System SHALL 提供員工以下拉選單選取姓名（佾珊、宜孝、貞葶、聖文、桂香）的方式進入系統，無需輸入密碼。
6. IF 員工下拉選單中無可選取的員工姓名，THEN THE System SHALL 顯示「目前無可用帳號，請聯絡管理員」的提示訊息。
7. WHEN 使用者嘗試存取超出其角色權限的功能，THE System SHALL 拒絕該操作並顯示「權限不足」的提示訊息。
8. WHEN 員工登入後，THE System SHALL 僅顯示該員工本人的個人資料與申請紀錄，不顯示其他員工的個人資料。

---

### Requirement 2: 員工管理

**User Story:** 身為老闆，我希望能新增與刪除員工帳號，以便維護最新的人員名單。

#### Acceptance Criteria

1. THE System SHALL 允許老闆新增員工，並要求輸入員工姓名，姓名長度須介於 1 至 10 個字元。
2. IF 老闆輸入的員工姓名已存在於系統中，THEN THE System SHALL 拒絕新增並顯示「員工姓名已存在」的提示訊息。
3. THE System SHALL 允許老闆刪除員工，並於刪除前顯示確認提示，要求老闆確認後方可執行刪除。
4. WHEN 老闆刪除員工，THE System SHALL 保留該員工的歷史班表與申請紀錄，不予刪除。
5. THE System SHALL 僅允許老闆執行員工的新增與刪除操作。

---

### Requirement 3: 排休選擇

**User Story:** 身為員工，我希望能在系統規則內自行選擇排休日期，以便安排個人休假。

#### Acceptance Criteria

1. THE Scheduler SHALL 以直式介面呈現排休選擇畫面，橫列為員工姓名，直列為日期。
2. THE Scheduler SHALL 自動將每月所有週日標記為固定排休（X），員工不可修改。
3. THE Scheduler SHALL 允許員工每月選擇最多 2 天週六作為排休日。
4. THE Scheduler SHALL 允許員工每月選擇最多 2 天平日（週一至週五）作為排休日。
5. WHEN 員工已選滿 2 天週六排休，THE Scheduler SHALL 禁止員工再選取額外的週六排休，並顯示「週六排休已達上限（2天）」的提示訊息。
6. WHEN 員工已選滿 2 天平日排休，THE Scheduler SHALL 禁止員工再選取額外的平日排休，並顯示「平日排休已達上限（2天）」的提示訊息。
7. WHILE 聖文的排班資料被處理，THE Scheduler SHALL 自動將聖文每週三標記為固定排休（X），不可修改。
8. WHILE 聖文的排班資料被處理，THE Scheduler SHALL 自動將聖文每週二標記為上午班，不可修改。
9. WHILE 聖文的排班資料被處理，THE Scheduler SHALL 禁止聖文選取任何平日排休，並僅允許選取最多 2 天週六排休。
10. IF 員工嘗試選取已被班表鎖定的日期，THEN THE Scheduler SHALL 拒絕該操作並顯示「此日期已鎖定，無法修改」的提示訊息。

---

### Requirement 4: 班表管理與顯示

**User Story:** 身為店長或老闆，我希望能編輯並查看完整班表，以便掌握每日人力配置。

#### Acceptance Criteria

1. THE Scheduler SHALL 以橫式月曆介面呈現班表查看畫面，橫列為日期，直列為員工姓名。
2. THE Scheduler SHALL 允許店長與老闆為任一員工的任一日期指定班別代碼（A、B、C、D、E、X）。
3. THE Scheduler SHALL 允許所有登入使用者查看完整月份班表。
4. WHEN 某日晚班人數少於 2 人，THE Scheduler SHALL 在該日顯示黃色警告符號（⚠）。
5. WHEN 某日晚班人數超過 2 人，THE Scheduler SHALL 在該日顯示藍色提示符號（ℹ）。
6. WHEN 某時段無任何員工上班，THE Scheduler SHALL 顯示紅色人力缺口警示（🔴）。
7. WHEN 某時段僅有 1 名員工上班，THE Scheduler SHALL 顯示黃色人力缺口警示（🟡）。
8. THE Scheduler SHALL 允許店長與老闆修改排班規則參數（例如月休天數、晚班最低人數）。

---

### Requirement 5: 班表鎖定

**User Story:** 身為店長，我希望能鎖定特定日期、週次或月份的班表，以便防止員工在確認後修改排班。

#### Acceptance Criteria

1. THE Scheduler SHALL 允許店長與老闆鎖定單一日期的班表。
2. THE Scheduler SHALL 允許店長與老闆鎖定整週的班表。
3. THE Scheduler SHALL 允許店長與老闆鎖定整個月份的班表。
4. WHEN 班表被鎖定，THE Scheduler SHALL 在鎖定範圍內顯示鎖定狀態標示，員工不可修改該範圍內的排班。
5. IF 員工嘗試修改已鎖定範圍內的排班，THEN THE Scheduler SHALL 拒絕該操作並顯示「此班表已鎖定，無法修改」的提示訊息。
6. THE Scheduler SHALL 允許店長與老闆解除班表鎖定。

---

### Requirement 6: 換班申請

**User Story:** 身為員工，我希望能向其他員工提出換班申請，以便在特殊情況下調整班次。

#### Acceptance Criteria

1. THE ShiftSwapManager SHALL 允許員工選擇欲換班的日期，並指定換班對象（另一名員工）。
2. WHEN 員工A提出換班申請，THE ShiftSwapManager SHALL 通知員工B進行確認，申請狀態設為「待確認」。
3. WHEN 員工B確認換班申請，THE ShiftSwapManager SHALL 將申請狀態更新為「待審核」，並通知店長進行審核。
4. WHEN 員工B拒絕換班申請，THE ShiftSwapManager SHALL 將申請狀態更新為「已拒絕」，並通知員工A。
5. WHEN 店長核准換班申請，THE ShiftSwapManager SHALL 將申請狀態更新為「已通過」，自動更新班表，並通知雙方員工。
6. WHEN 店長拒絕換班申請，THE ShiftSwapManager SHALL 將申請狀態更新為「已拒絕」，並通知雙方員工。
7. THE ShiftSwapManager SHALL 顯示換班申請的當前狀態，狀態值為：待確認、待審核、已通過、已拒絕。

---

### Requirement 7: 請假申請

**User Story:** 身為員工，我希望能提出請假申請並上傳相關附件，以便正式記錄我的缺勤原因。

#### Acceptance Criteria

1. THE LeaveManager SHALL 允許員工填寫請假申請，必填欄位包含：日期、時段（全天／上午／下午）、假別、事由（最多 200 字）。
2. IF 員工填寫的請假日期早於申請當日，THEN THE LeaveManager SHALL 拒絕提交並顯示「請假日期不得早於今日」的提示訊息。
3. THE LeaveManager SHALL 允許員工上傳附件，支援 JPEG、PNG、PDF 格式，單檔大小上限為 10 MB，每筆申請最多上傳 5 個附件。
4. WHEN 請假申請提交後，THE NotificationService SHALL 於 5 分鐘內傳送站內通知給店長進行審核。
5. WHEN 店長核准請假申請，THE LeaveManager SHALL 將申請狀態更新為「已通過」，並通知員工。
6. WHEN 店長拒絕請假申請，THE LeaveManager SHALL 要求店長填寫拒絕原因（最多 200 字），並將申請狀態更新為「已拒絕」後通知員工。
7. THE LeaveManager SHALL 允許員工查看本人的歷史請假紀錄及各申請的審核狀態。

---

### Requirement 8: 加班申請

**User Story:** 身為員工，我希望能提出加班申請，以便正式記錄額外工時並換算補休或加班費。

#### Acceptance Criteria

1. THE OvertimeManager SHALL 允許員工填寫加班申請，必填欄位包含：日期、起始時間、結束時間、事由（最多 200 字）。
2. IF 員工填寫的加班結束時間不晚於起始時間，THEN THE OvertimeManager SHALL 拒絕提交並顯示「結束時間必須晚於起始時間」的提示訊息。
3. IF 員工填寫的加班日期早於申請當日 7 天以前或晚於申請當日 30 天以後，THEN THE OvertimeManager SHALL 拒絕提交並顯示「加班日期須介於過去 7 天至未來 30 天內」的提示訊息。
4. IF 員工針對同一日期提交重複或時段重疊的加班申請，THEN THE OvertimeManager SHALL 拒絕提交並顯示「該日期已存在重疊的加班申請」的提示訊息。
5. WHEN 加班申請提交後，THE OvertimeManager SHALL 通知店長進行審核。
6. WHEN 店長核准加班申請，THE OvertimeManager SHALL 要求店長選擇將加班時數轉換為加班費或補休時數，並將核准結果記錄至該員工的工時統計後通知員工。
7. WHEN 店長拒絕加班申請，THE OvertimeManager SHALL 將申請狀態更新為「已拒絕」，並通知員工。

---

### Requirement 9: 工時統計

**User Story:** 身為店長或老闆，我希望能查看每位員工的月度工時統計，以便掌握人力成本與出勤狀況。

#### Acceptance Criteria

1. THE AttendanceTracker SHALL 每月自動統計每位員工的上班天數、上班時數（精確至小數點後兩位）、加班時數、補休時數、請假時數。
2. WHEN 某月最後一日 23:59 到達，THE AttendanceTracker SHALL 依據已核准的班表、加班申請與請假申請自動計算並儲存當月統計數據。
3. THE AttendanceTracker SHALL 以超出當日排定班表時數的部分計算加班時數。
4. THE AttendanceTracker SHALL 允許店長與老闆查看所有員工的月度工時統計報表。
5. THE AttendanceTracker SHALL 允許員工查看本人的月度工時統計。
6. IF 計算工時統計所需的來源資料不完整，THEN THE AttendanceTracker SHALL 顯示「資料不完整，無法計算工時，請確認班表與申請紀錄」的錯誤提示。

---

### Requirement 10: 遲到管理

**User Story:** 身為店長，我希望能記錄員工遲到情形，以便追蹤出勤紀律。

#### Acceptance Criteria

1. THE AttendanceTracker SHALL 允許店長新增遲到紀錄，必填欄位包含：日期、員工姓名、遲到分鐘數（1 至 999 分鐘整數）；備註為選填欄位。
2. IF 店長嘗試為同一員工在同一日期新增重複的遲到紀錄，THEN THE AttendanceTracker SHALL 拒絕新增並顯示「該員工於此日期已有遲到紀錄」的提示訊息。
3. THE AttendanceTracker SHALL 統計每位員工當月（日曆月）的遲到次數與累積遲到分鐘數。
4. THE AttendanceTracker SHALL 允許店長與老闆查看所有員工的遲到統計報表。
5. THE AttendanceTracker SHALL 允許老闆查看過去 12 個月的歷史遲到紀錄。

---

### Requirement 11: 通知系統

**User Story:** 身為系統使用者，我希望能即時收到與我相關的申請與審核通知，以便及時處理待辦事項。

#### Acceptance Criteria

1. WHEN 員工提交請假申請，THE NotificationService SHALL 於 5 分鐘內傳送站內通知給店長。
2. WHEN 員工提交換班申請，THE NotificationService SHALL 傳送站內通知給被指定的換班對象員工。
3. WHEN 員工提交加班申請，THE NotificationService SHALL 傳送站內通知給店長。
4. WHEN 店長或老闆完成審核，THE NotificationService SHALL 傳送審核結果站內通知給申請員工。
5. WHEN 班表內容異動，THE NotificationService SHALL 傳送班表異動站內通知給受影響的員工。
6. THE NotificationService SHALL 在系統介面內以通知列表的方式呈現未讀通知，並顯示未讀數量。

---

### Requirement 12: 附件儲存管理

**User Story:** 身為系統管理者，我希望系統能自動管理請假附件的生命週期，以便節省儲存空間並符合資料保留政策。

#### Acceptance Criteria

1. THE FileStorage SHALL 接受員工上傳的請假附件，支援 JPEG、PNG、PDF 格式，單檔大小上限為 10 MB。
2. THE FileStorage SHALL 記錄每個附件的上傳時間戳記（UTC）。
3. WHEN 附件上傳時間超過 168 小時（7 天），THE FileStorage SHALL 透過每日排程自動刪除該附件，並更新對應請假紀錄的附件狀態為「已過期」，同時保留請假紀錄本身。
4. IF 附件上傳失敗，THEN THE FileStorage SHALL 顯示具體失敗原因（格式不符／超過 10 MB／其他錯誤），並提示員工重新上傳。
5. IF 排程刪除附件失敗，THEN THE FileStorage SHALL 保留該附件並記錄失敗事件，於下次排程執行時重試刪除。
