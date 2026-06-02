// ============================================================
// 耀聖藥局智慧排班系統 - Zod 驗證 Schema
// ============================================================

import { z } from 'zod';

// ---- 輔助函式 ----

/**
 * 取得今日日期字串（YYYY-MM-DD），以本地時間計算。
 */
function getTodayString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 將 'YYYY-MM-DD' 字串轉換為可比較的數字（YYYYMMDD）。
 */
function dateStringToNumber(dateStr: string): number {
  return parseInt(dateStr.replace(/-/g, ''), 10);
}

// ============================================================
// 請假申請 Schema
// ============================================================

/**
 * 請假申請表單驗證 Schema
 *
 * - leave_date: 日期字串，不得早於今日
 * - period:     時段（全天／上午／下午）
 * - leave_type: 假別（不可為空）
 * - reason:     事由（最多 200 字）
 */
export const leaveApplicationSchema = z.object({
  leave_date: z
    .string()
    .refine(
      (val) => dateStringToNumber(val) >= dateStringToNumber(getTodayString()),
      { message: '請假日期不得早於今日' }
    ),
  period: z.enum(['full_day', 'morning', 'afternoon']),
  leave_type: z.string().min(1, { message: '請選擇假別' }),
  reason: z.string().max(200, { message: '事由最多 200 字' }),
});

export type LeaveApplicationInput = z.infer<typeof leaveApplicationSchema>;

// ============================================================
// 加班申請 Schema
// ============================================================

/**
 * 加班申請表單驗證 Schema
 *
 * - overtime_date: 日期字串，須介於過去 7 天至未來 30 天內
 * - start_time:    起始時間（HH:MM 格式）
 * - end_time:      結束時間（HH:MM 格式，須晚於起始時間）
 * - reason:        事由（最多 200 字）
 */
export const overtimeApplicationSchema = z
  .object({
    overtime_date: z
      .string()
      .refine(
        (val) => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const minDate = new Date(today);
          minDate.setDate(minDate.getDate() - 7);

          const maxDate = new Date(today);
          maxDate.setDate(maxDate.getDate() + 30);

          const target = new Date(val);
          target.setHours(0, 0, 0, 0);

          return target >= minDate && target <= maxDate;
        },
        { message: '加班日期須介於過去 7 天至未來 30 天內' }
      ),
    start_time: z
      .string()
      .regex(/^\d{2}:\d{2}$/, { message: '起始時間格式須為 HH:MM' }),
    end_time: z
      .string()
      .regex(/^\d{2}:\d{2}$/, { message: '結束時間格式須為 HH:MM' }),
    reason: z.string().max(200, { message: '事由最多 200 字' }),
  })
  .refine((data) => data.end_time > data.start_time, {
    message: '結束時間必須晚於起始時間',
    path: ['end_time'],
  });

export type OvertimeApplicationInput = z.infer<typeof overtimeApplicationSchema>;

// ============================================================
// 換班申請 Schema
// ============================================================

/**
 * 換班申請表單驗證 Schema
 *
 * - swap_date: 換班日期字串
 * - target_id: 換班對象員工 UUID
 */
export const shiftSwapApplicationSchema = z.object({
  swap_date: z.string(),
  target_id: z.string().uuid({ message: '換班對象 ID 格式不正確' }),
});

export type ShiftSwapApplicationInput = z.infer<typeof shiftSwapApplicationSchema>;

// ============================================================
// 新增員工 Schema
// ============================================================

/**
 * 新增員工表單驗證 Schema
 *
 * - name: 員工姓名，長度 1-10 字元
 */
export const createEmployeeSchema = z.object({
  name: z
    .string()
    .min(1, { message: '員工姓名不可為空' })
    .max(10, { message: '員工姓名最多 10 個字元' }),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

// ============================================================
// 遲到紀錄 Schema
// ============================================================

/**
 * 遲到紀錄表單驗證 Schema
 *
 * - record_date:   紀錄日期字串
 * - user_id:       員工 UUID
 * - minutes_late:  遲到分鐘數（整數，1-999）
 * - note:          備註（選填）
 */
export const tardinessRecordSchema = z.object({
  record_date: z.string(),
  user_id: z.string().uuid({ message: '員工 ID 格式不正確' }),
  minutes_late: z
    .number()
    .int({ message: '遲到分鐘數須為整數' })
    .min(1, { message: '遲到分鐘數最少為 1 分鐘' })
    .max(999, { message: '遲到分鐘數最多為 999 分鐘' }),
  note: z.string().optional(),
});

export type TardinessRecordInput = z.infer<typeof tardinessRecordSchema>;
