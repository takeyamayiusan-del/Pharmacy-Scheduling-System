import { computeMonthlyAttendanceHours } from "@/lib/payroll/monthlyHours";
import { contractualPay, type EmployeeSalaryItem } from "@/lib/payroll/salaryItems";
import { deriveHourlyRateByLaborStandard } from "@/lib/payroll/rateFormulas";
import type { Employee, LeaveRequest, PunchRecord, ScheduleShiftCode, ShiftTimeConfig } from "@/lib/context/AppContext";
import type { StoreConfig } from "@/lib/store-config";
import {
  calcAnnualLeavePayout,
  calcCompLeavePayout,
  calcSeverancePay,
  monthsOfServiceAsOf,
  statutoryNoticeDays,
} from "@/lib/offboarding/severance";
import type { OffboardingType, PensionSystem, SettlementSnapshot } from "@/lib/offboarding/types";

export type SalaryConfigLike = {
  baseSalary: number;
  hourlyRate: number;
};

export function buildSettlementPreview(input: {
  employee: Pick<Employee, "id" | "hireDate" | "name">;
  offboardingType: OffboardingType;
  pensionSystem: PensionSystem;
  lastWorkDate: string;
  settlementYear: number;
  settlementMonth: number;
  annualLeaveBalanceDays: number;
  annualLeaveQuotaDays: number;
  compLeaveBalanceHours: number;
  salaryConfig: SalaryConfigLike;
  salaryItems: EmployeeSalaryItem[];
  averageMonthlyWageOverride?: number | null;
  manualSeverancePay?: number | null;
  manualAnnualLeavePayout?: number | null;
  manualCompLeavePayout?: number | null;
  otherPayout?: number;
  otherDeduction?: number;
  getShiftForDate: (date: string, employeeId: string) => ScheduleShiftCode;
  getHolidayInfo: (date: string) => { isHoliday: boolean };
  shiftTimeConfig: ShiftTimeConfig;
  leaveRequests: LeaveRequest[];
  overtimeRequests: Array<{
    employeeId: string;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    compensationType: "pay" | "time_off";
  }>;
  punchRecords: PunchRecord[];
  storeConfig?: StoreConfig;
}): SettlementSnapshot {
  const monthsOfService = monthsOfServiceAsOf(input.employee.hireDate, input.lastWorkDate);
  const noticeDays = statutoryNoticeDays(monthsOfService);

  const contractPay = contractualPay(input.salaryConfig.baseSalary, input.salaryItems);
  const estimatedMonthlyWage =
    input.averageMonthlyWageOverride && input.averageMonthlyWageOverride > 0
      ? input.averageMonthlyWageOverride
      : contractPay > 0
        ? contractPay
        : input.salaryConfig.baseSalary;

  const estimatedHourlyRate =
    input.salaryConfig.hourlyRate > 0
      ? input.salaryConfig.hourlyRate
      : deriveHourlyRateByLaborStandard(estimatedMonthlyWage);

  const attendance = computeMonthlyAttendanceHours({
    employeeId: input.employee.id,
    year: input.settlementYear,
    month: input.settlementMonth,
    getShiftForDate: input.getShiftForDate,
    getHolidayInfo: input.getHolidayInfo,
    shiftTimeConfig: input.shiftTimeConfig,
    leaveRequests: input.leaveRequests,
    overtimeRequests: input.overtimeRequests,
    storeConfig: input.storeConfig,
  });

  const monthPrefix = `${input.settlementYear}-${String(input.settlementMonth).padStart(2, "0")}`;
  const punchRecordCount = input.punchRecords.filter(
    (p) => p.employeeId === input.employee.id && p.date.startsWith(monthPrefix)
  ).length;

  const severancePay =
    input.manualSeverancePay != null && input.manualSeverancePay >= 0
      ? Math.round(input.manualSeverancePay)
      : calcSeverancePay({
          pensionSystem: input.pensionSystem,
          averageMonthlyWage: estimatedMonthlyWage,
          monthsOfService,
          offboardingType: input.offboardingType,
        });

  const annualLeavePayout =
    input.manualAnnualLeavePayout != null && input.manualAnnualLeavePayout >= 0
      ? Math.round(input.manualAnnualLeavePayout)
      : calcAnnualLeavePayout(input.annualLeaveBalanceDays, estimatedMonthlyWage);

  const compLeavePayout =
    input.manualCompLeavePayout != null && input.manualCompLeavePayout >= 0
      ? Math.round(input.manualCompLeavePayout)
      : calcCompLeavePayout(input.compLeaveBalanceHours, estimatedHourlyRate);

  const otherPayout = Math.max(0, Number(input.otherPayout) || 0);
  const otherDeduction = Math.max(0, Number(input.otherDeduction) || 0);

  const totalEstimatedPayout =
    severancePay + annualLeavePayout + compLeavePayout + otherPayout - otherDeduction;

  const legalNotes: string[] = [
    "本試算僅供內部參考，資遣費、平均工資、未休特休折算請依實際勞動契約與勞檢／會計確認。",
    `年資（至最後工作日）：約 ${monthsOfService} 個月。`,
  ];

  if (input.offboardingType === "layoff") {
    legalNotes.push(
      noticeDays > 0
        ? `依法預告期間建議 ${noticeDays} 日；未預告須預付預告期間工資（勞基法第 16 條）。`
        : "年資未滿 3 個月者，依法可能無預告期間義務，請再確認個案。"
    );
    legalNotes.push("資遣須符合勞基法第 11、13 條等法定事由，並給付資遣費（新制／舊制公式不同）。");
  } else if (input.offboardingType === "resignation") {
    legalNotes.push("自願離職通常無資遣費；未休特休仍應排休或折算工資。");
  } else {
    legalNotes.push("退休給與依勞基法第 53 條及勞退條例辦理，本頁資遣費欄位預設為 0。");
  }

  if (input.annualLeaveBalanceDays > 0) {
    legalNotes.push(
      `未休特休 ${input.annualLeaveBalanceDays.toFixed(1)} 天，離職時應折算工資（勞基法第 38 條）。`
    );
  }
  if (input.compLeaveBalanceHours > 0) {
    legalNotes.push(`補休餘額 ${input.compLeaveBalanceHours} 小時，請依店規結清或折算。`);
  }

  return {
    computedAt: new Date().toISOString(),
    monthsOfService,
    noticeDays,
    annualLeaveBalanceDays: input.annualLeaveBalanceDays,
    annualLeaveQuotaDays: input.annualLeaveQuotaDays,
    compLeaveBalanceHours: input.compLeaveBalanceHours,
    estimatedMonthlyWage,
    estimatedHourlyRate,
    severancePay,
    annualLeavePayout,
    compLeavePayout,
    settlementMonthWorkHours: attendance.workHours,
    settlementMonthOvertimeHours:
      Math.round((attendance.overtimePayHours + attendance.holidayOvertimeHours) * 100) / 100,
    settlementMonthLeaveHours: attendance.leaveHoursTotal,
    punchRecordCount,
    totalEstimatedPayout,
    legalNotes,
  };
}
