// ============================================================
// 耀聖藥局智慧排班系統 - 工時計算測試
// ============================================================

import { describe, it, expect } from 'vitest';
import { calculateMonthlyStats, calculateDuration, SHIFT_HOURS } from '@/lib/attendance/calculator';
import type { ShiftCode } from '@/lib/types';

describe('工時計算模組測試', () => {
  describe('calculateDuration 函式', () => {
    it('應正確計算小時數差', () => {
      expect(calculateDuration('09:00', '12:00')).toBe(3);
      expect(calculateDuration('13:30', '17:00')).toBe(3.5);
      expect(calculateDuration('19:00', '21:00')).toBe(2);
      expect(calculateDuration('08:30', '18:00')).toBe(9.5);
    });

    it('應處理不同的時間格式', () => {
      expect(calculateDuration('09:00:00', '12:00:00')).toBe(3);
      expect(calculateDuration('13:30:00', '17:00:00')).toBe(3.5);
    });
  });

  describe('SHIFT_HOURS 常數', () => {
    it('各班別時數應正確（與預設時段加總對齊）', () => {
      expect(SHIFT_HOURS.A).toBe(9);
      expect(SHIFT_HOURS.B).toBe(8);
      expect(SHIFT_HOURS.C).toBe(3.5);
      expect(SHIFT_HOURS.D).toBe(4.5);
      expect(SHIFT_HOURS.E).toBe(5.5);
      expect(SHIFT_HOURS.X).toBe(0);
    });
  });

  describe('calculateMonthlyStats 函式', () => {
    it('應正確計算空資料的工時', () => {
      const result = calculateMonthlyStats({
        userId: 'test-id',
        year: 2025,
        month: 1,
        scheduleEntries: [],
        approvedOvertimes: [],
        approvedLeaves: [],
      });

      expect(result.userId).toBe('test-id');
      expect(result.year).toBe(2025);
      expect(result.month).toBe(1);
      expect(result.workDays).toBe(0);
      expect(result.workHours).toBe(0);
      expect(result.overtimeHours).toBe(0);
      expect(result.compLeaveHours).toBe(0);
      expect(result.leaveHours).toBe(0);
    });

    it('應正確計算班表工時', () => {
      const entries = [
        { shift_code: 'A' as ShiftCode, date: '2025-01-01' },
        { shift_code: 'B' as ShiftCode, date: '2025-01-02' },
        { shift_code: 'C' as ShiftCode, date: '2025-01-03' },
        { shift_code: 'D' as ShiftCode, date: '2025-01-04' },
        { shift_code: 'E' as ShiftCode, date: '2025-01-05' },
        { shift_code: 'X' as ShiftCode, date: '2025-01-06' },
      ];

      const result = calculateMonthlyStats({
        userId: 'test-id',
        year: 2025,
        month: 1,
        scheduleEntries: entries,
        approvedOvertimes: [],
        approvedLeaves: [],
      });

      expect(result.workDays).toBe(5); // X 不算
      expect(result.workHours).toBe(9 + 8 + 3.5 + 4.5 + 5.5);
    });

    it('應正確計算加班工時（轉換為加班費）', () => {
      const result = calculateMonthlyStats({
        userId: 'test-id',
        year: 2025,
        month: 1,
        scheduleEntries: [],
        approvedOvertimes: [
          { start_time: '18:00', end_time: '20:00', compensation: 'pay' },
          { start_time: '19:00', end_time: '21:30', compensation: 'pay' },
        ],
        approvedLeaves: [],
      });

      expect(result.overtimeHours).toBe(2 + 2.5);
      expect(result.compLeaveHours).toBe(0);
    });

    it('應正確計算加班工時（轉換為補休）', () => {
      const result = calculateMonthlyStats({
        userId: 'test-id',
        year: 2025,
        month: 1,
        scheduleEntries: [],
        approvedOvertimes: [
          { start_time: '18:00', end_time: '20:00', compensation: 'comp_leave' },
          { start_time: '19:00', end_time: '21:30', compensation: 'comp_leave' },
        ],
        approvedLeaves: [],
      });

      expect(result.overtimeHours).toBe(0);
      expect(result.compLeaveHours).toBe(2 + 2.5);
    });

    it('應正確計算混合加班（加班費 + 補休）', () => {
      const result = calculateMonthlyStats({
        userId: 'test-id',
        year: 2025,
        month: 1,
        scheduleEntries: [],
        approvedOvertimes: [
          { start_time: '18:00', end_time: '20:00', compensation: 'pay' },
          { start_time: '19:00', end_time: '21:30', compensation: 'comp_leave' },
        ],
        approvedLeaves: [],
      });

      expect(result.overtimeHours).toBe(2);
      expect(result.compLeaveHours).toBe(2.5);
    });

    it('應正確計算請假時數', () => {
      const result = calculateMonthlyStats({
        userId: 'test-id',
        year: 2025,
        month: 1,
        scheduleEntries: [],
        approvedOvertimes: [],
        approvedLeaves: [
          { period: 'full_day' },
          { period: 'full_day' },
          { period: 'morning' },
          { period: 'afternoon' },
        ],
      });

      expect(result.leaveHours).toBe(8 + 8 + 4 + 4);
    });

    it('應正確計算完整工時統計（班表 + 加班 + 請假）', () => {
      const result = calculateMonthlyStats({
        userId: 'test-id',
        year: 2025,
        month: 1,
        scheduleEntries: [
          { shift_code: 'A' as ShiftCode, date: '2025-01-01' },
          { shift_code: 'A' as ShiftCode, date: '2025-01-02' },
          { shift_code: 'B' as ShiftCode, date: '2025-01-03' },
          { shift_code: 'X' as ShiftCode, date: '2025-01-04' },
          { shift_code: 'E' as ShiftCode, date: '2025-01-05' },
        ],
        approvedOvertimes: [
          { start_time: '18:00', end_time: '20:00', compensation: 'pay' },
          { start_time: '19:00', end_time: '21:00', compensation: 'comp_leave' },
        ],
        approvedLeaves: [
          { period: 'full_day' },
          { period: 'afternoon' },
        ],
      });

      expect(result.workDays).toBe(4);
      expect(result.workHours).toBe(9 + 9 + 8 + 5.5);
      expect(result.overtimeHours).toBe(2);
      expect(result.compLeaveHours).toBe(2);
      expect(result.leaveHours).toBe(8 + 4);
    });

    it('時數應精確到小數點後兩位', () => {
      const result = calculateMonthlyStats({
        userId: 'test-id',
        year: 2025,
        month: 1,
        scheduleEntries: [],
        approvedOvertimes: [
          { start_time: '09:00', end_time: '09:15', compensation: 'pay' },
        ],
        approvedLeaves: [],
      });

      expect(result.overtimeHours).toBe(0.25);
    });

    it('國定假日有排班時，應直接計入加班費時數', () => {
      const result = calculateMonthlyStats({
        userId: 'test-id',
        year: 2026,
        month: 6,
        scheduleEntries: [
          { shift_code: 'A' as ShiftCode, date: '2026-06-19' }, // 端午節
          { shift_code: 'B' as ShiftCode, date: '2026-06-20' },
        ],
        approvedOvertimes: [],
        approvedLeaves: [],
        holidayDates: ['2026-06-19'],
      });

      expect(result.workHours).toBe(9 + 8);
      expect(result.overtimeHours).toBe(9);
    });

    it('未列入 holidayDates 的日期不計國定假加班', () => {
      const result = calculateMonthlyStats({
        userId: 'test-id',
        year: 2026,
        month: 10,
        scheduleEntries: [
          { shift_code: 'A' as ShiftCode, date: '2026-10-31' },
        ],
        approvedOvertimes: [],
        approvedLeaves: [],
        holidayDates: ['2026-10-10'],
      });

      expect(result.overtimeHours).toBe(0);
    });
  });
});
