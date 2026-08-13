// ============================================================
// 耀聖藥局智慧排班系統 - 排班規則測試
// Property 6: 排休配額上限
// Property 7: 聖文固定班規則
// ============================================================

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateLeaveSelection } from '@/lib/scheduling/rules';
import { generateMonthlyEntries } from '@/lib/scheduling/monthly';
import type { LeaveSelectionContext } from '@/lib/types';

// 預設排班規則
const defaultRules = {
  id: 'test-rule-id',
  monthly_leave_quota: 8,
  saturday_leave_quota: 2,
  weekday_leave_quota: 2,
  min_evening_staff: 2,
  updated_by: null,
  updated_at: '2025-01-01T00:00:00Z',
};

// 取得某月份所有特定星期幾的日期
function getDatesOfWeekday(year: number, month: number, weekday: number): Date[] {
  const dates: Date[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    if (date.getDay() === weekday) {
      dates.push(date);
    }
  }
  return dates;
}

// ============================================================
// Property 6: 排休配額上限
// Validates: Requirements 3.3, 3.4, 3.5, 3.6
// ============================================================

describe('Feature: yaosheng-pharmacy-scheduling, Property 6: 排休配額上限', () => {
  /**
   * **Validates: Requirements 3.5**
   * For any employee with existingSaturdayLeaves >= 2,
   * validateLeaveSelection on a Saturday should return valid=false
   */
  it('週六排休已達上限時應拒絕新增週六排休', () => {
    fc.assert(
      fc.property(
        fc.record({
          employeeId: fc.uuid(),
          year: fc.integer({ min: 2024, max: 2030 }),
          month: fc.integer({ min: 1, max: 12 }),
          existingSaturdayLeaves: fc.integer({ min: 2, max: 10 }),
          existingWeekdayLeaves: fc.integer({ min: 0, max: 2 }),
        }),
        ({ employeeId, year, month, existingSaturdayLeaves, existingWeekdayLeaves }) => {
          // 找到該月份的第一個週六
          const saturdays = getDatesOfWeekday(year, month, 6);
          if (saturdays.length === 0) return; // 跳過沒有週六的月份（理論上不存在）

          const ctx: LeaveSelectionContext = {
            employeeId,
            employeeName: '宜孝', // 非聖文員工
            year,
            month,
            existingSaturdayLeaves,
            existingWeekdayLeaves,
            targetDate: saturdays[0],
            rules: defaultRules,
          };

          const result = validateLeaveSelection(ctx);
          expect(result.valid).toBe(false);
          expect(result.error).toContain('週六排休已達上限');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.6**
   * For any employee with existingWeekdayLeaves >= 2,
   * validateLeaveSelection on a weekday should return valid=false
   */
  it('平日排休已達上限時應拒絕新增平日排休', () => {
    fc.assert(
      fc.property(
        fc.record({
          employeeId: fc.uuid(),
          year: fc.integer({ min: 2024, max: 2030 }),
          month: fc.integer({ min: 1, max: 12 }),
          existingSaturdayLeaves: fc.integer({ min: 0, max: 2 }),
          existingWeekdayLeaves: fc.integer({ min: 2, max: 10 }),
          weekday: fc.integer({ min: 1, max: 5 }), // 週一到週五
        }),
        ({ employeeId, year, month, existingSaturdayLeaves, existingWeekdayLeaves, weekday }) => {
          // 找到該月份的第一個指定平日
          const weekdays = getDatesOfWeekday(year, month, weekday);
          if (weekdays.length === 0) return;

          const ctx: LeaveSelectionContext = {
            employeeId,
            employeeName: '宜孝', // 非聖文員工
            year,
            month,
            existingSaturdayLeaves,
            existingWeekdayLeaves,
            targetDate: weekdays[0],
            rules: defaultRules,
          };

          const result = validateLeaveSelection(ctx);
          expect(result.valid).toBe(false);
          expect(result.error).toContain('平日排休已達上限');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.3**
   * For any employee with existingSaturdayLeaves < 2,
   * validateLeaveSelection on a Saturday should return valid=true
   */
  it('週六排休未達上限時應允許選取週六排休', () => {
    fc.assert(
      fc.property(
        fc.record({
          employeeId: fc.uuid(),
          year: fc.integer({ min: 2024, max: 2030 }),
          month: fc.integer({ min: 1, max: 12 }),
          existingSaturdayLeaves: fc.integer({ min: 0, max: 1 }),
          existingWeekdayLeaves: fc.integer({ min: 0, max: 2 }),
        }),
        ({ employeeId, year, month, existingSaturdayLeaves, existingWeekdayLeaves }) => {
          const saturdays = getDatesOfWeekday(year, month, 6);
          if (saturdays.length === 0) return;

          const ctx: LeaveSelectionContext = {
            employeeId,
            employeeName: '宜孝',
            year,
            month,
            existingSaturdayLeaves,
            existingWeekdayLeaves,
            targetDate: saturdays[0],
            rules: defaultRules,
          };

          const result = validateLeaveSelection(ctx);
          expect(result.valid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.4**
   * For any employee with existingWeekdayLeaves < 2,
   * validateLeaveSelection on a weekday should return valid=true
   */
  it('平日排休未達上限時應允許選取平日排休', () => {
    fc.assert(
      fc.property(
        fc.record({
          employeeId: fc.uuid(),
          year: fc.integer({ min: 2024, max: 2030 }),
          month: fc.integer({ min: 1, max: 12 }),
          existingSaturdayLeaves: fc.integer({ min: 0, max: 2 }),
          existingWeekdayLeaves: fc.integer({ min: 0, max: 1 }),
          weekday: fc.integer({ min: 1, max: 5 }),
        }),
        ({ employeeId, year, month, existingSaturdayLeaves, existingWeekdayLeaves, weekday }) => {
          const weekdays = getDatesOfWeekday(year, month, weekday);
          if (weekdays.length === 0) return;

          const ctx: LeaveSelectionContext = {
            employeeId,
            employeeName: '宜孝',
            year,
            month,
            existingSaturdayLeaves,
            existingWeekdayLeaves,
            targetDate: weekdays[0],
            rules: defaultRules,
          };

          const result = validateLeaveSelection(ctx);
          expect(result.valid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('週日為固定排休，不可手動選取', () => {
    const sundays = getDatesOfWeekday(2025, 1, 0);
    expect(sundays.length).toBeGreaterThan(0);

    const ctx: LeaveSelectionContext = {
      employeeId: 'test-id',
      employeeName: '宜孝',
      year: 2025,
      month: 1,
      existingSaturdayLeaves: 0,
      existingWeekdayLeaves: 0,
      targetDate: sundays[0],
      rules: defaultRules,
    };

    const result = validateLeaveSelection(ctx);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('週日為固定排休');
  });
});

// ============================================================
// Property 7: 聖文固定班規則
// Validates: Requirements 3.7, 3.8, 3.9
// ============================================================

describe('Feature: yaosheng-pharmacy-scheduling, Property 7: 聖文固定班規則', () => {
  /**
   * **Validates: Requirements 3.7**
   * 聖文週三應自動標記為固定排休（X, is_fixed=true）
   */
  it('應自動將聖文週三標記為固定排休', () => {
    const entries = generateMonthlyEntries('test-id', '聖文', 2025, 1);
    const wednesdays = entries.filter(e => new Date(e.date).getDay() === 3);

    expect(wednesdays.length).toBeGreaterThan(0);
    wednesdays.forEach(e => {
      expect(e.shift_code).toBe('X');
      expect(e.is_fixed).toBe(true);
    });
  });

  /**
   * **Validates: Requirements 3.8**
   * 聖文週二應自動標記為固定白班（B, is_fixed=true）
   */
  it('應自動將聖文週二標記為固定白班', () => {
    const entries = generateMonthlyEntries('test-id', '聖文', 2025, 1);
    const tuesdays = entries.filter(e => new Date(e.date).getDay() === 2);

    expect(tuesdays.length).toBeGreaterThan(0);
    tuesdays.forEach(e => {
      expect(e.shift_code).toBe('B');
      expect(e.is_fixed).toBe(true);
    });
  });

  /**
   * **Validates: Requirements 3.9**
   * 聖文不可選取任何平日排休（validateLeaveSelection 應拒絕）
   */
  it('聖文嘗試選取平日排休應被拒絕', () => {
    // 2025年1月6日（週一）
    const monday = new Date(2025, 0, 6);
    expect(monday.getDay()).toBe(1);

    const ctx: LeaveSelectionContext = {
      employeeId: 'test-id',
      employeeName: '員工',
      year: 2025,
      month: 1,
      existingSaturdayLeaves: 0,
      existingWeekdayLeaves: 0,
      targetDate: monday,
      rules: defaultRules,
      isWeekdayOffRule: true,
    };

    const result = validateLeaveSelection(ctx);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('平日不排休');
  });

  it('聖文嘗試選取週三排休應被拒絕（週三為固定排休，不可手動選取）', () => {
    // 2025年1月1日（週三）
    const wednesday = new Date(2025, 0, 1);
    expect(wednesday.getDay()).toBe(3);

    const ctx: LeaveSelectionContext = {
      employeeId: 'test-id',
      employeeName: '員工',
      year: 2025,
      month: 1,
      existingSaturdayLeaves: 0,
      existingWeekdayLeaves: 0,
      targetDate: wednesday,
      rules: defaultRules,
      isWeekdayOffRule: true,
    };

    const result = validateLeaveSelection(ctx);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('平日不排休');
  });

  it('聖文可以選取週六排休（未達上限）', () => {
    // 2025年1月4日（週六）
    const saturday = new Date(2025, 0, 4);
    expect(saturday.getDay()).toBe(6);

    const ctx: LeaveSelectionContext = {
      employeeId: 'test-id',
      employeeName: '聖文',
      year: 2025,
      month: 1,
      existingSaturdayLeaves: 0,
      existingWeekdayLeaves: 0,
      targetDate: saturday,
      rules: defaultRules,
    };

    const result = validateLeaveSelection(ctx);
    expect(result.valid).toBe(true);
  });

  it('聖文週六排休達上限後應被拒絕', () => {
    // 2025年1月4日（週六）
    const saturday = new Date(2025, 0, 4);

    const ctx: LeaveSelectionContext = {
      employeeId: 'test-id',
      employeeName: '聖文',
      year: 2025,
      month: 1,
      existingSaturdayLeaves: 2, // 已達上限
      existingWeekdayLeaves: 0,
      targetDate: saturday,
      rules: defaultRules,
    };

    const result = validateLeaveSelection(ctx);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('週六排休已達上限');
  });

  it('generateMonthlyEntries 對聖文以外的員工不套用特殊規則', () => {
    const entries = generateMonthlyEntries('test-id', '宜孝', 2025, 1);
    const wednesdays = entries.filter(e => new Date(e.date).getDay() === 3);
    const tuesdays = entries.filter(e => new Date(e.date).getDay() === 2);

    // 宜孝的週三和週二應為一般上班日（A班，非固定）
    wednesdays.forEach(e => {
      expect(e.shift_code).toBe('A');
      expect(e.is_fixed).toBe(false);
    });
    tuesdays.forEach(e => {
      expect(e.shift_code).toBe('A');
      expect(e.is_fixed).toBe(false);
    });
  });

  it('generateMonthlyEntries 所有員工的週日應為固定排休', () => {
    const employees = ['宜孝', '貞葶', '聖文', '桂香'];
    employees.forEach(name => {
      const entries = generateMonthlyEntries('test-id', name, 2025, 1);
      const sundays = entries.filter(e => new Date(e.date).getDay() === 0);

      expect(sundays.length).toBeGreaterThan(0);
      sundays.forEach(e => {
        expect(e.shift_code).toBe('X');
        expect(e.is_fixed).toBe(true);
      });
    });
  });
});
