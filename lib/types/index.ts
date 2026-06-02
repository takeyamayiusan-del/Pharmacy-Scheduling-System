// ============================================================
// 耀聖藥局智慧排班系統 - TypeScript 型別定義
// ============================================================

// Re-export all types from the Supabase-generated types file
export * from '@/lib/supabase/types';

// ============================================================
// 業務邏輯輔助型別（不在 supabase/types.ts 中）
// ============================================================

/** 驗證結果 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/** 月度工時統計（計算結果，不含 DB 欄位） */
export interface MonthlyStats {
  userId: string;
  year: number;
  month: number;
  workDays: number;
  workHours: number;
  overtimeHours: number;
  compLeaveHours: number;
  leaveHours: number;
}

/** generateMonthlyEntries 輸入參數 */
export interface GenerateMonthlyEntriesInput {
  employeeId: string;
  employeeName: string;
  year: number;
  month: number;
}

/** 排休選擇驗證上下文 */
export interface LeaveSelectionContext {
  employeeId: string;
  employeeName: string;
  year: number;
  month: number;
  existingSaturdayLeaves: number;
  existingWeekdayLeaves: number;
  targetDate: Date;
  rules: import('@/lib/supabase/types').SchedulingRules;
}

/** generateMonthlyEntries 回傳的班表條目（不含 DB 自動產生欄位） */
export interface NewScheduleEntry {
  user_id: string;
  date: string; // 'YYYY-MM-DD'
  shift_code: import('@/lib/supabase/types').ShiftCode;
  is_fixed: boolean;
}
