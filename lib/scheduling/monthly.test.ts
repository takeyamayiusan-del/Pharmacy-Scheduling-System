// ============================================================
// Property 7: 聖文特殊規則 - Unit Tests
// ============================================================

import { describe, it, expect } from 'vitest';
import { generateMonthlyEntries } from './monthly';
import { validateLeaveSelection } from './rules';

describe('Property 7: 聖文固定班規則', () => {
  /**
   * **Validates: Requirements 3.7, 3.8, 3.9**
   * 
   * Property: 對於任意包含週二或週三的月份，聖文的週三班別代碼應為 X（排休）
   * 且標記為 is_fixed=true，週二班別代碼應為 B（白班）且標記為 is_fixed=true；
   * 任何嘗試修改這些固定班別的操作應被拒絕。
   */

  it('should mark all Wednesdays as fixed leave (X) for 聖文', () => {
    const entries = generateMonthlyEntries('test-id-shengwen', '聖文', 2025, 1);
    
    const wednesdays = entries.filter(e => {
      const date = new Date(e.date);
      return date.getDay() === 3; // Wednesday
    });

    // Verify all Wednesdays exist in January 2025
    expect(wednesdays.length).toBeGreaterThan(0);
    
    wednesdays.forEach(entry => {
      expect(entry.shift_code).toBe('X');
      expect(entry.is_fixed).toBe(true);
    });
  });

  it('should mark all Tuesdays as fixed white shift (B) for 聖文', () => {
    const entries = generateMonthlyEntries('test-id-shengwen', '聖文', 2025, 1);
    
    const tuesdays = entries.filter(e => {
      const date = new Date(e.date);
      return date.getDay() === 2; // Tuesday
    });

    // Verify all Tuesdays exist in January 2025
    expect(tuesdays.length).toBeGreaterThan(0);
    
    tuesdays.forEach(entry => {
      expect(entry.shift_code).toBe('B');
      expect(entry.is_fixed).toBe(true);
    });
  });

  it('should mark Sundays as fixed leave (X) for 聖文', () => {
    const entries = generateMonthlyEntries('test-id-shengwen', '聖文', 2025, 1);
    
    const sundays = entries.filter(e => {
      const date = new Date(e.date);
      return date.getDay() === 0; // Sunday
    });

    // Verify all Sundays exist in January 2025
    expect(sundays.length).toBeGreaterThan(0);
    
    sundays.forEach(entry => {
      expect(entry.shift_code).toBe('X');
      expect(entry.is_fixed).toBe(true);
    });
  });

  it('should set other weekdays (Mon, Thu, Fri, Sat) as default shift (A) for 聖文', () => {
    const entries = generateMonthlyEntries('test-id-shengwen', '聖文', 2025, 1);
    
    const otherWeekdays = entries.filter(e => {
      const date = new Date(e.date);
      const day = date.getDay();
      // Monday (1), Thursday (4), Friday (5), Saturday (6)
      return day === 1 || day === 4 || day === 5 || day === 6;
    });

    expect(otherWeekdays.length).toBeGreaterThan(0);
    
    otherWeekdays.forEach(entry => {
      expect(entry.shift_code).toBe('A');
      expect(entry.is_fixed).toBe(false);
    });
  });

  it('should enforce 聖文 can only select Saturday leave, not weekdays', () => {
    // Test weekday rejection for 聖文
    const mondayDate = new Date(2025, 0, 6); // Monday, Jan 6, 2025
    
    const ctx = {
      employeeId: 'test-id-shengwen',
      employeeName: '聖文',
      year: 2025,
      month: 1,
      existingSaturdayLeaves: 0,
      existingWeekdayLeaves: 0,
      targetDate: mondayDate,
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
    
    expect(result.valid).toBe(false);
    expect(result.error).toBe('聖文僅能選取週六排休');
  });

  it('should allow 聖文 to select Saturday leave within quota', () => {
    // Test Saturday acceptance for 聖文
    const saturdayDate = new Date(2025, 0, 11); // Saturday, Jan 11, 2025
    
    const ctx = {
      employeeId: 'test-id-shengwen',
      employeeName: '聖文',
      year: 2025,
      month: 1,
      existingSaturdayLeaves: 1, // Only 1 Saturday selected
      existingWeekdayLeaves: 0,
      targetDate: saturdayDate,
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
    
    expect(result.valid).toBe(true);
  });

  it('should reject 聖文 Saturday leave when quota is exceeded', () => {
    const saturdayDate = new Date(2025, 0, 11); // Saturday, Jan 11, 2025
    
    const ctx = {
      employeeId: 'test-id-shengwen',
      employeeName: '聖文',
      year: 2025,
      month: 1,
      existingSaturdayLeaves: 2, // Quota already used
      existingWeekdayLeaves: 0,
      targetDate: saturdayDate,
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
    
    expect(result.valid).toBe(false);
    expect(result.error).toContain('週六排休已達上限');
  });

  it('should generate correct number of days for different months', () => {
    // Test February (28 days in non-leap year)
    const feb2025 = generateMonthlyEntries('test-id', '聖文', 2025, 2);
    expect(feb2025.length).toBe(28);

    // Test March (31 days)
    const mar2025 = generateMonthlyEntries('test-id', '聖文', 2025, 3);
    expect(mar2025.length).toBe(31);

    // Test April (30 days)
    const apr2025 = generateMonthlyEntries('test-id', '聖文', 2025, 4);
    expect(apr2025.length).toBe(30);
  });

  it('should format dates correctly as YYYY-MM-DD', () => {
    const entries = generateMonthlyEntries('test-id', '聖文', 2025, 1);
    
    entries.forEach(entry => {
      // Check format
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      
      // Verify it's a valid date
      const date = new Date(entry.date);
      expect(date.getFullYear()).toBe(2025);
      expect(date.getMonth()).toBe(0); // January (0-indexed)
    });
  });

  it('should mark Sundays as fixed leave for all employees, not just 聖文', () => {
    const employees = ['宜孝', '貞葶', '桂香', '佾珊'];
    
    employees.forEach(name => {
      const entries = generateMonthlyEntries('test-id', name, 2025, 1);
      const sundays = entries.filter(e => new Date(e.date).getDay() === 0);
      
      expect(sundays.length).toBeGreaterThan(0);
      sundays.forEach(entry => {
        expect(entry.shift_code).toBe('X');
        expect(entry.is_fixed).toBe(true);
      });
    });
  });

  it('should not mark Tuesday/Wednesday as fixed for other employees', () => {
    const employees = ['宜孝', '貞葶', '桂香', '佾珊'];
    
    employees.forEach(name => {
      const entries = generateMonthlyEntries('test-id', name, 2025, 1);
      const tuesdays = entries.filter(e => new Date(e.date).getDay() === 2);
      const wednesdays = entries.filter(e => new Date(e.date).getDay() === 3);
      
      tuesdays.forEach(entry => {
        expect(entry.shift_code).toBe('A'); // Default shift, not B
        expect(entry.is_fixed).toBe(false);
      });
      
      wednesdays.forEach(entry => {
        expect(entry.shift_code).toBe('A'); // Default shift, not X
        expect(entry.is_fixed).toBe(false);
      });
    });
  });
});
