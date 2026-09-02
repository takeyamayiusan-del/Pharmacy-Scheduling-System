export type OffboardingType = "layoff" | "resignation" | "retirement";
export type PensionSystem = "new" | "old";
export type OffboardingStatus = "draft" | "completed";

export type OffboardingRecord = {
  id: string;
  siteId: string;
  userId: string;
  employeeName?: string;
  offboardingType: OffboardingType;
  pensionSystem: PensionSystem;
  noticeStartDate: string | null;
  noticeEndDate: string | null;
  lastWorkDate: string;
  settlementYear: number;
  settlementMonth: number;
  averageMonthlyWage: number | null;
  manualSeverancePay: number | null;
  manualAnnualLeavePayout: number | null;
  manualCompLeavePayout: number | null;
  otherPayout: number;
  otherDeduction: number;
  deactivateOnComplete: boolean;
  notes: string;
  status: OffboardingStatus;
  snapshot: SettlementSnapshot | null;
  createdBy: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SettlementSnapshot = {
  computedAt: string;
  monthsOfService: number;
  noticeDays: number;
  annualLeaveBalanceDays: number;
  annualLeaveQuotaDays: number;
  compLeaveBalanceHours: number;
  estimatedMonthlyWage: number;
  estimatedHourlyRate: number;
  severancePay: number;
  annualLeavePayout: number;
  compLeavePayout: number;
  settlementMonthWorkHours: number;
  settlementMonthOvertimeHours: number;
  settlementMonthLeaveHours: number;
  punchRecordCount: number;
  totalEstimatedPayout: number;
  legalNotes: string[];
};

export const OFFBOARDING_TYPE_LABELS: Record<OffboardingType, string> = {
  layoff: "資遣（非自願離職）",
  resignation: "自願離職",
  retirement: "退休",
};

export const PENSION_SYSTEM_LABELS: Record<PensionSystem, string> = {
  new: "勞退新制",
  old: "勞基法舊制",
};
