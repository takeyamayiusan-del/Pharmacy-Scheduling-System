import type {
  OffboardingRecord,
  OffboardingStatus,
  OffboardingType,
  PensionSystem,
  SettlementSnapshot,
} from "@/lib/offboarding/types";

export function mapOffboardingRow(row: Record<string, unknown>): OffboardingRecord {
  const user = row.users as { name?: string } | null;
  return {
    id: String(row.id),
    siteId: String(row.site_id),
    userId: String(row.user_id),
    employeeName: user?.name,
    offboardingType: row.offboarding_type as OffboardingType,
    pensionSystem: row.pension_system as PensionSystem,
    noticeStartDate: row.notice_start_date ? String(row.notice_start_date) : null,
    noticeEndDate: row.notice_end_date ? String(row.notice_end_date) : null,
    lastWorkDate: String(row.last_work_date),
    settlementYear: Number(row.settlement_year),
    settlementMonth: Number(row.settlement_month),
    averageMonthlyWage:
      row.average_monthly_wage == null ? null : Number(row.average_monthly_wage),
    manualSeverancePay:
      row.manual_severance_pay == null ? null : Number(row.manual_severance_pay),
    manualAnnualLeavePayout:
      row.manual_annual_leave_payout == null ? null : Number(row.manual_annual_leave_payout),
    manualCompLeavePayout:
      row.manual_comp_leave_payout == null ? null : Number(row.manual_comp_leave_payout),
    otherPayout: Number(row.other_payout ?? 0),
    otherDeduction: Number(row.other_deduction ?? 0),
    deactivateOnComplete: Boolean(row.deactivate_on_complete),
    notes: String(row.notes ?? ""),
    status: row.status as OffboardingStatus,
    snapshot: (row.snapshot as SettlementSnapshot | null) ?? null,
    createdBy: row.created_by ? String(row.created_by) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** 明確指定 user_id 外鍵，避免與 created_by 混淆 */
export const OFFBOARDING_SELECT = "*, users!user_id(name)";
