// ============================================================
// Property 6: 排休配額上限 - Property-Based Test
// ============================================================

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateLeaveSelection } from './rules';
import type { LeaveSelectionContext } from '@/lib/types';

describe('Property 6: 排休配額上限', () => {
  /**
   * **Validates: Requirements 3.3, 3.4, 3.5, 3.6**
   * 
   * Property: 對於任意員工和任意月份，週六排休選取次數不得超過 2 天，
   * 平日排休選取次數不得超過 2 天；嘗試超過配額的選取操作應被拒絕，
   * 且已選取的排休狀態保持不變。
   */
  
  it('should reject Saturday leave selection when quota is exceeded (≥100 iterations)', () => {
    fc.assert(
      fc.property(
        fc.record({
          year: fc.integer({ min: 2024, max: 2030 }),
          month: fc.integer({ min: 1, max: 12 }),
          day: fc.integer({ min: 1, max: 31 }),
          existingSaturdayLeaves: fc.integer({ min: 2, max: 10 }),
        }).chain(({ year, month, day, existingSaturdayLeaves }) => {
          // Ensure the date is valid and is a Saturday
          const date = new Date(year, month - 1, day);
          if (date.getMonth() !== month - 1 || date.getDay() !== 6) {
            return fc.constant(null); // Skip invalid dates or non-Saturdays
          }
          return fc.constant({ year, month, day, existingSaturdayLeaves, date });
        }).filter(val => val !== null) as fc.Arbitrary<{
          year: number;
          month: number;
          day: number;
          existingSaturdayLeaves: number;
          date: Date;
        }>,
        (data) => {
          const { date, existingSaturdayLeaves } = data;
          
          const ctx: LeaveSelectionContext = {
            employeeId: 'test-employee-id',
            employeeName: '宜孝', // Not 聖文
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            existingSaturdayLeaves,
            existingWeekdayLeaves: 0,
            targetDate: date,
            rules: {
              id: 'test-rule-id',
              monthly_leave_quota: 8,
              saturday_leave_quota: 2,
              weekday_leave_quota: 2,
              min_evening_staff: 2,
              updated_at: new Date().toISOString(),
              updated_by: null,
            },
          };

          const result = validateLeaveSelection(ctx);
          
          // When existingSaturdayLeaves >= 2, selection should be rejected
          expect(result.valid).toBe(false);
          expect(result.error).toContain('週六排休已達上限');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject weekday leave selection when quota is exceeded (≥100 iterations)', () => {
    fc.assert(
      fc.property(
        fc.record({
          year: fc.integer({ min: 2024, max: 2030 }),
          month: fc.integer({ min: 1, max: 12 }),
          day: fc.integer({ min: 1, max: 31 }),
          existingWeekdayLeaves: fc.integer({ min: 2, max: 10 }),
        }).chain(({ year, month, day, existingWeekdayLeaves }) => {
          // Ensure the date is valid and is a weekday (Monday-Friday)
          const date = new Date(year, month - 1, day);
          const dayOfWeek = date.getDay();
          if (date.getMonth() !== month - 1 || dayOfWeek === 0 || dayOfWeek === 6) {
            return fc.constant(null); // Skip invalid dates, Sundays, or Saturdays
          }
          return fc.constant({ year, month, day, existingWeekdayLeaves, date });
        }).filter(val => val !== null) as fc.Arbitrary<{
          year: number;
          month: number;
          day: number;
          existingWeekdayLeaves: number;
          date: Date;
        }>,
        (data) => {
          const { date, existingWeekdayLeaves } = data;
          
          const ctx: LeaveSelectionContext = {
            employeeId: 'test-employee-id',
            employeeName: '宜孝', // Not 聖文
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            existingSaturdayLeaves: 0,
            existingWeekdayLeaves,
            targetDate: date,
            rules: {
              id: 'test-rule-id',
              monthly_leave_quota: 8,
              saturday_leave_quota: 2,
              weekday_leave_quota: 2,
              min_evening_staff: 2,
              updated_at: new Date().toISOString(),
              updated_by: null,
            },
          };

          const result = validateLeaveSelection(ctx);
          
          // When existingWeekdayLeaves >= 2, selection should be rejected
          expect(result.valid).toBe(false);
          expect(result.error).toContain('平日排休已達上限');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept Saturday leave selection when quota is not exceeded (≥100 iterations)', () => {
    fc.assert(
      fc.property(
        fc.record({
          year: fc.integer({ min: 2024, max: 2030 }),
          month: fc.integer({ min: 1, max: 12 }),
          day: fc.integer({ min: 1, max: 31 }),
          existingSaturdayLeaves: fc.integer({ min: 0, max: 1 }),
        }).chain(({ year, month, day, existingSaturdayLeaves }) => {
          const date = new Date(year, month - 1, day);
          if (date.getMonth() !== month - 1 || date.getDay() !== 6) {
            return fc.constant(null);
          }
          return fc.constant({ year, month, day, existingSaturdayLeaves, date });
        }).filter(val => val !== null) as fc.Arbitrary<{
          year: number;
          month: number;
          day: number;
          existingSaturdayLeaves: number;
          date: Date;
        }>,
        (data) => {
          const { date, existingSaturdayLeaves } = data;
          
          const ctx: LeaveSelectionContext = {
            employeeId: 'test-employee-id',
            employeeName: '宜孝',
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            existingSaturdayLeaves,
            existingWeekdayLeaves: 0,
            targetDate: date,
            rules: {
              id: 'test-rule-id',
              monthly_leave_quota: 8,
              saturday_leave_quota: 2,
              weekday_leave_quota: 2,
              min_evening_staff: 2,
              updated_at: new Date().toISOString(),
              updated_by: null,
            },
          };

          const result = validateLeaveSelection(ctx);
          
          // When existingSaturdayLeaves < 2, selection should be accepted
          expect(result.valid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept weekday leave selection when quota is not exceeded (≥100 iterations)', () => {
    fc.assert(
      fc.property(
        fc.record({
          year: fc.integer({ min: 2024, max: 2030 }),
          month: fc.integer({ min: 1, max: 12 }),
          day: fc.integer({ min: 1, max: 31 }),
          existingWeekdayLeaves: fc.integer({ min: 0, max: 1 }),
        }).chain(({ year, month, day, existingWeekdayLeaves }) => {
          const date = new Date(year, month - 1, day);
          const dayOfWeek = date.getDay();
          if (date.getMonth() !== month - 1 || dayOfWeek === 0 || dayOfWeek === 6) {
            return fc.constant(null);
          }
          return fc.constant({ year, month, day, existingWeekdayLeaves, date });
        }).filter(val => val !== null) as fc.Arbitrary<{
          year: number;
          month: number;
          day: number;
          existingWeekdayLeaves: number;
          date: Date;
        }>,
        (data) => {
          const { date, existingWeekdayLeaves } = data;
          
          const ctx: LeaveSelectionContext = {
            employeeId: 'test-employee-id',
            employeeName: '宜孝',
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            existingSaturdayLeaves: 0,
            existingWeekdayLeaves,
            targetDate: date,
            rules: {
              id: 'test-rule-id',
              monthly_leave_quota: 8,
              saturday_leave_quota: 2,
              weekday_leave_quota: 2,
              min_evening_staff: 2,
              updated_at: new Date().toISOString(),
              updated_by: null,
            },
          };

          const result = validateLeaveSelection(ctx);
          
          // When existingWeekdayLeaves < 2, selection should be accepted
          expect(result.valid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
