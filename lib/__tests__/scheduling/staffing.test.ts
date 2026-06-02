// ============================================================
// 耀聖藥局智慧排班系統 - 人力缺口計算測試
// Property 8: 晚班人力警示狀態
// ============================================================

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateEveningStaffingStatus, isEveningShift } from '@/lib/scheduling/staffing';

// ============================================================
// Property 8: 晚班人力警示狀態
// Validates: Requirements 4.5
// ============================================================

describe('Feature: yaosheng-pharmacy-scheduling, Property 8: 晚班人力警示狀態', () => {
  it('eveningStaffCount = 0 應回傳 critical', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }), // minRequired 至少 1
        (minRequired) => {
          const result = calculateEveningStaffingStatus(0, minRequired);
          expect(result).toBe('critical');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('0 < eveningStaffCount < minRequired 應回傳 warning', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }), // minRequired 至少 2
        (minRequired) => {
          const eveningStaffCount = fc.integer({ min: 1, max: minRequired - 1 }).generate(new fc.Random());
          const result = calculateEveningStaffingStatus(eveningStaffCount, minRequired);
          expect(result).toBe('warning');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('eveningStaffCount === minRequired 應回傳 normal', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (minRequired) => {
          const result = calculateEveningStaffingStatus(minRequired, minRequired);
          expect(result).toBe('normal');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('eveningStaffCount > minRequired 應回傳 excess', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (minRequired) => {
          const eveningStaffCount = fc.integer({ min: minRequired + 1, max: 20 }).generate(new fc.Random());
          const result = calculateEveningStaffingStatus(eveningStaffCount, minRequired);
          expect(result).toBe('excess');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('完整屬性測試：所有邊界情況', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }), // eveningStaffCount
        fc.integer({ min: 1, max: 10 }), // minRequired
        (eveningStaffCount, minRequired) => {
          const result = calculateEveningStaffingStatus(eveningStaffCount, minRequired);

          if (eveningStaffCount === 0) {
            expect(result).toBe('critical');
          } else if (eveningStaffCount < minRequired) {
            expect(result).toBe('warning');
          } else if (eveningStaffCount === minRequired) {
            expect(result).toBe('normal');
          } else {
            expect(result).toBe('excess');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('isEveningShift 函式測試', () => {
  it('D 和 E 應判斷為晚班', () => {
    expect(isEveningShift('D')).toBe(true);
    expect(isEveningShift('E')).toBe(true);
  });

  it('其他班別不應判斷為晚班', () => {
    expect(isEveningShift('A')).toBe(false);
    expect(isEveningShift('B')).toBe(false);
    expect(isEveningShift('C')).toBe(false);
    expect(isEveningShift('X')).toBe(false);
  });

  it('非預期的班別不應判斷為晚班', () => {
    expect(isEveningShift('')).toBe(false);
    expect(isEveningShift('F')).toBe(false);
    expect(isEveningShift('123')).toBe(false);
  });
});
