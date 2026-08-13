// ============================================================
// 耀聖藥局智慧排班系統 - 排班規則引擎
// ============================================================

import type { LeaveSelectionContext, ValidationResult } from '@/lib/types';

/**
 * 驗證員工的排休選擇是否符合排班規則。
 *
 * 規則摘要：
 * - 週日（dayOfWeek === 0）：固定排休，不可手動選取
 * - 平日不排休規則：僅能選取週六
 * - 週六／平日：檢查配額
 */
export function validateLeaveSelection(ctx: LeaveSelectionContext): ValidationResult {
  const dayOfWeek = ctx.targetDate.getDay(); // 0=日, 1=一, 2=二, 3=三, 4=四, 5=五, 6=六

  if (ctx.isWeekdayOffRule && dayOfWeek !== 6) {
    return { valid: false, error: "此員工套用平日不排休規則，僅能選取週六排休" };
  }

  // 週日為固定排休，不可手動選取
  if (dayOfWeek === 0) {
    return { valid: false, error: '週日為固定排休，無需選取' };
  }

  // 週六配額檢查
  if (dayOfWeek === 6) {
    if (ctx.existingSaturdayLeaves >= ctx.rules.saturday_leave_quota) {
      return {
        valid: false,
        error: `週六排休已達上限（${ctx.rules.saturday_leave_quota}天）`,
      };
    }
    return { valid: true };
  }

  // 平日配額檢查（週一至週五）
  if (dayOfWeek >= 1 && dayOfWeek <= 5) {
    if (ctx.existingWeekdayLeaves >= ctx.rules.weekday_leave_quota) {
      return {
        valid: false,
        error: `平日排休已達上限（${ctx.rules.weekday_leave_quota}天）`,
      };
    }
    return { valid: true };
  }

  // 不應到達此處，但作為防禦性回傳
  return { valid: false, error: '無效的日期' };
}
