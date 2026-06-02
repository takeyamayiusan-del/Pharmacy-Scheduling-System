// ============================================================
// 耀聖藥局智慧排班系統 - Validation Schemas 測試
// Property 3: 員工姓名驗證（長度 1-10）
// Property 13: 加班時間驗證（結束時間必須晚於起始時間）
// Property 14: 加班時段不重疊
// ============================================================

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  createEmployeeSchema,
  overtimeApplicationSchema,
} from '@/lib/validation/schemas';

// ============================================================
// Property 3: 員工姓名驗證
// Validates: Requirements 2.3
// ============================================================

describe('Feature: yaosheng-pharmacy-scheduling, Property 3: 員工姓名驗證', () => {
  it('員工姓名長度介於 1-10 字元應驗證通過', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }),
        (name) => {
          const result = createEmployeeSchema.safeParse({ name });
          expect(result.success).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('員工姓名空字串應驗證失敗', () => {
    const result = createEmployeeSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('不可為空');
    }
  });

  it('員工姓名超過 10 字元應驗證失敗', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 11, maxLength: 50 }),
        (name) => {
          const result = createEmployeeSchema.safeParse({ name });
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.errors[0].message).toContain('最多 10 個字元');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('1 字元姓名應驗證通過', () => {
    const result = createEmployeeSchema.safeParse({ name: 'A' });
    expect(result.success).toBe(true);
  });

  it('10 字元姓名應驗證通過', () => {
    const result = createEmployeeSchema.safeParse({ name: '一二三四五六七八九十' });
    expect(result.success).toBe(true);
  });
});

// ============================================================
// Property 13: 加班時間驗證（結束時間必須晚於起始時間）
// Validates: Requirements 8.3
// ============================================================

describe('Feature: yaosheng-pharmacy-scheduling, Property 13: 加班時間驗證', () => {
  it('結束時間晚於起始時間應驗證通過', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 22 }), // startHour
        fc.integer({ min: 1, max: 59 }), // startMinute
        fc.integer({ min: 1, max: 59 }), // delta (end 比 start 晚多少)
        (startHour, startMinute, delta) => {
          const startTotal = startHour * 60 + startMinute;
          const endTotal = startTotal + delta;
          const endHour = Math.floor(endTotal / 60);
          const endMinute = endTotal % 60;

          if (endHour > 23) return; // 跳過跨天的情況

          const startTime = `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`;
          const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;

          const today = new Date().toISOString().split('T')[0];
          const data = {
            overtime_date: today,
            start_time: startTime,
            end_time: endTime,
            reason: '測試',
          };

          const result = overtimeApplicationSchema.safeParse(data);
          expect(result.success).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('結束時間早於或等於起始時間應驗證失敗', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }), // hour
        fc.integer({ min: 0, max: 59 }), // minute
        fc.integer({ min: 0, max: 23 }), // endHour (早於或等於 startHour)
        fc.integer({ min: 0, max: 59 }), // endMinute
        (startHour, startMinute, endHour, endMinute) => {
          fc.precondition(
            endHour < startHour ||
            (endHour === startHour && endMinute <= startMinute)
          );

          const startTime = `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`;
          const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;

          const today = new Date().toISOString().split('T')[0];
          const data = {
            overtime_date: today,
            start_time: startTime,
            end_time: endTime,
            reason: '測試',
          };

          const result = overtimeApplicationSchema.safeParse(data);
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error.errors.some(e => e.message?.includes('結束時間必須晚於起始時間'))).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('時間格式不正確應驗證失敗', () => {
    const today = new Date().toISOString().split('T')[0];
    const invalidTimes = ['', '25:00', '12:60', '9:0', 'abc', '1234'];

    invalidTimes.forEach(invalidTime => {
      const data1 = {
        overtime_date: today,
        start_time: invalidTime,
        end_time: '18:00',
        reason: '測試',
      };
      const data2 = {
        overtime_date: today,
        start_time: '09:00',
        end_time: invalidTime,
        reason: '測試',
      };

      const result1 = overtimeApplicationSchema.safeParse(data1);
      const result2 = overtimeApplicationSchema.safeParse(data2);

      expect(result1.success).toBe(false);
      expect(result2.success).toBe(false);
    });
  });
});

// ============================================================
// Property 14: 加班時段不重疊
// Validates: Requirements 8.4
// ============================================================

describe('Feature: yaosheng-pharmacy-scheduling, Property 14: 加班時段不重疊', () => {
  /**
   * 檢查兩個時段是否重疊的輔助函式
   * 用於驗證 Property 14 的邏輯
   */
  function doTimeRangesOverlap(
    start1: string,
    end1: string,
    start2: string,
    end2: string
  ): boolean {
    const toMinutes = (time: string) => {
      const [h, m] = time.split(':').map(Number);
      return h * 60 + m;
    };

    const s1 = toMinutes(start1);
    const e1 = toMinutes(end1);
    const s2 = toMinutes(start2);
    const e2 = toMinutes(end2);

    return !(e1 <= s2 || e2 <= s1);
  }

  it('兩個不重疊的時段應返回 false', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }), // start1
        fc.integer({ min: 1, max: 2 }), // duration1
        fc.integer({ min: 1, max: 5 }), // gap
        fc.integer({ min: 1, max: 2 }), // duration2
        (start1Hour, duration1, gap, duration2) => {
          const start1 = `${String(start1Hour).padStart(2, '0')}:00`;
          const end1Hour = start1Hour + duration1;
          if (end1Hour > 23) return;
          const end1 = `${String(end1Hour).padStart(2, '0')}:00`;

          const start2Hour = end1Hour + gap;
          if (start2Hour > 23) return;
          const start2 = `${String(start2Hour).padStart(2, '0')}:00`;
          const end2Hour = start2Hour + duration2;
          if (end2Hour > 23) return;
          const end2 = `${String(end2Hour).padStart(2, '0')}:00`;

          const result = doTimeRangesOverlap(start1, end1, start2, end2);
          expect(result).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('兩個重疊的時段應返回 true', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }), // start1
        fc.integer({ min: 2, max: 4 }), // duration1
        fc.integer({ min: 0, max: 1 }), // overlap
        (start1Hour, duration1, overlap) => {
          const start1 = `${String(start1Hour).padStart(2, '0')}:00`;
          const end1Hour = start1Hour + duration1;
          if (end1Hour > 23) return;
          const end1 = `${String(end1Hour).padStart(2, '0')}:00`;

          const start2Hour = end1Hour - overlap - 1;
          if (start2Hour < start1Hour) return;
          const start2 = `${String(start2Hour).padStart(2, '0')}:00`;
          const end2Hour = start2Hour + 2;
          if (end2Hour > 23) return;
          const end2 = `${String(end2Hour).padStart(2, '0')}:00`;

          const result = doTimeRangesOverlap(start1, end1, start2, end2);
          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('完全包含的時段應返回 true', () => {
    expect(doTimeRangesOverlap('09:00', '18:00', '10:00', '16:00')).toBe(true);
  });

  it('時段首尾相接不應算重疊', () => {
    expect(doTimeRangesOverlap('09:00', '12:00', '12:00', '18:00')).toBe(false);
  });
});
