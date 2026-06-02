// ============================================================
// 耀聖藥局智慧排班系統 - 月份班表初始化
// ============================================================

import type { ShiftCode } from '@/lib/types';

/**
 * generateMonthlyEntries 回傳的班表條目（不含 DB 自動產生欄位）
 */
export interface MonthlyEntryInput {
  user_id: string;
  date: string;       // 'YYYY-MM-DD'
  shift_code: ShiftCode;
  is_fixed: boolean;
}

/**
 * 為指定員工產生某月份的初始班表條目。
 *
 * 規則：
 * 1. 週日（dayOfWeek === 0）：shift_code='X', is_fixed=true（固定排休）
 * 2. 聖文特殊規則：
 *    - 週三（dayOfWeek === 3）：shift_code='X', is_fixed=true（固定排休）
 *    - 週二（dayOfWeek === 2）：shift_code='B', is_fixed=true（固定白班）
 *    - 其他：shift_code='A', is_fixed=false（預設上班日）
 * 3. 其他員工：shift_code='A', is_fixed=false（預設上班日）
 *
 * @param employeeId   - 員工 UUID
 * @param employeeName - 員工姓名（用於判斷聖文特殊規則）
 * @param year         - 年份（e.g. 2025）
 * @param month        - 月份（1-12）
 * @returns MonthlyEntryInput[]
 */
export function generateMonthlyEntries(
  employeeId: string,
  employeeName: string,
  year: number,
  month: number
): MonthlyEntryInput[] {
  const entries: MonthlyEntryInput[] = [];

  // 取得該月份的天數
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay(); // 0=日, 1=一, 2=二, 3=三, 4=四, 5=五, 6=六

    // 格式化日期為 'YYYY-MM-DD'
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    let shiftCode: ShiftCode;
    let isFixed: boolean;

    if (dayOfWeek === 0) {
      // 週日：固定排休
      shiftCode = 'X';
      isFixed = true;
    } else if (employeeName === '聖文') {
      if (dayOfWeek === 3) {
        // 聖文週三：固定排休
        shiftCode = 'X';
        isFixed = true;
      } else if (dayOfWeek === 2) {
        // 聖文週二：固定白班
        shiftCode = 'B';
        isFixed = true;
      } else {
        // 聖文其他工作日：預設全天班
        shiftCode = 'A';
        isFixed = false;
      }
    } else {
      // 其他員工：預設全天班
      shiftCode = 'A';
      isFixed = false;
    }

    entries.push({
      user_id: employeeId,
      date: dateStr,
      shift_code: shiftCode,
      is_fixed: isFixed,
    });
  }

  return entries;
}
