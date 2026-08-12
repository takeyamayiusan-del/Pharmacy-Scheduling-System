import XLSX from "xlsx-js-style";
import type { PayrollRecord } from "@/lib/context/AppContext";
import { buildPayslipWorksheet } from "@/lib/payroll/payslipExcelLayout";

export type PersonalPayslipExcelMeta = {
  employeeName: string;
  storeName?: string;
  position?: string;
  bankAccount?: string;
  payDate?: string;
  hourlyRate?: number;
  normalHours?: number;
  leaveHours?: number;
  leaveDeductionHours?: number;
  overtimeHours?: number;
  holidayOvertimeHours?: number;
  tardinessMinutes?: number;
  leaveTypes?: string[];
  companyPensionRate?: number;
  companyPensionBase?: number;
  unionFee?: number;
};

const toROC = (westernYear: number) => westernYear - 1911;

function pushIfNonZero(rows: [string, number][], label: string, amount: number) {
  const n = Number(amount) || 0;
  if (Math.abs(n) < 0.0001) return;
  rows.push([label, n]);
}

/**
 * 員工個人薪資明細 Excel（格式對齊結算頁個人 sheet，不含其他人）
 * - 員工自提放應代扣；金額 0 不顯示
 * - A5 列印版面
 */
export function exportPersonalPayslipExcel(
  record: PayrollRecord,
  meta: PersonalPayslipExcelMeta
): void {
  const rocYear = toROC(record.year);
  const storeName = meta.storeName?.trim() || "本店";
  const positionGrade = Number(record.positionGradeTotal ?? 0);
  const fixedAllowance = Number(record.fixedAllowanceTotal ?? 0);
  const fullAttendance = Number(record.fullAttendancePay ?? 0);
  const rawBonus = Number(record.bonusTotal ?? 0);
  const otherBonus = Math.max(0, rawBonus - fixedAllowance);
  const formulaNotes: string[] = [];

  const overtimeHours = Number(meta.overtimeHours ?? 0);
  if ((Number(record.overtimePay) || 0) > 0 && overtimeHours > 0) {
    formulaNotes.push(
      `加班費 = ${overtimeHours.toFixed(2)} 小時 × ${(Number(record.overtimePay) / overtimeHours).toFixed(
        2
      )} 元/小時 = ${Number(record.overtimePay).toFixed(0)} 元`
    );
  }
  const leaveDeductionHours = Number(meta.leaveDeductionHours ?? 0);
  if ((Number(record.leaveDeduction) || 0) > 0 && leaveDeductionHours > 0) {
    formulaNotes.push(
      `請假扣款 = ${leaveDeductionHours.toFixed(2)} 小時 × ${(
        Number(record.leaveDeduction) / leaveDeductionHours
      ).toFixed(2)} 元/小時 = ${Number(record.leaveDeduction).toFixed(0)} 元${
        meta.leaveTypes?.length ? `（假別：${meta.leaveTypes.join("、")}）` : ""
      }`
    );
  }
  const tardinessMinutes = Number(meta.tardinessMinutes ?? 0);
  if ((Number(record.tardinessDeduction) || 0) > 0 && tardinessMinutes > 0) {
    formulaNotes.push(
      `遲到扣款 = ${tardinessMinutes} 分鐘 × ${(
        Number(record.tardinessDeduction) / tardinessMinutes
      ).toFixed(2)} 元/分鐘 = ${Number(record.tardinessDeduction).toFixed(0)} 元`
    );
  }
  if (otherBonus !== 0) {
    formulaNotes.push(`其他加項／異動淨額 = ${otherBonus.toFixed(0)} 元（依本月異動項目加總）`);
  }
  const composedNote = [record.note ? String(record.note) : "", ...formulaNotes]
    .filter(Boolean)
    .join("\n");

  const colA: [string, number][] = [];
  pushIfNonZero(colA, "薪資", Number(record.baseSalary) || 0);
  pushIfNonZero(colA, "職位加級", positionGrade);
  pushIfNonZero(colA, "請假扣款", -(Number(record.leaveDeduction) || 0));
  pushIfNonZero(colA, "遲到扣款", -(Number(record.tardinessDeduction) || 0));

  const colB: [string, number][] = [];
  if (fixedAllowance > 0) {
    colB.push([
      fullAttendance > 0 ? `固定津貼／獎金（含全勤 ${fullAttendance}）` : "固定津貼／獎金",
      fixedAllowance,
    ]);
  }
  pushIfNonZero(colB, "加班費", Number(record.overtimePay) || 0);
  pushIfNonZero(colB, "其他加項／異動", otherBonus);

  const colC: [string, number][] = [];
  pushIfNonZero(colC, "勞保費", Number(record.laborInsurance) || 0);
  pushIfNonZero(colC, "健保費", Number(record.healthInsurance) || 0);
  pushIfNonZero(colC, "員工自提", Number(record.pensionDeduction) || 0);

  const ws = buildPayslipWorksheet({
    title: `${storeName}　${rocYear}年${record.month}月　薪資明細表`,
    employeeName: meta.employeeName,
    position: meta.position,
    bankAccount: meta.bankAccount,
    payDate: meta.payDate || "隔月5日",
    colA,
    colB,
    colC,
    overtimeHours: meta.overtimeHours,
    overtimePay: Number(record.overtimePay) || 0,
    holidayOvertimeHours: meta.holidayOvertimeHours,
    leaveHours: meta.leaveHours,
    leaveDeduction: Number(record.leaveDeduction) || 0,
    hourlyRate: meta.hourlyRate,
    companyPensionRate: meta.companyPensionRate,
    companyPensionBase: meta.companyPensionBase,
    unionFee: meta.unionFee,
    note: composedNote || undefined,
    finalPay: Number(record.finalPay) || 0,
  });

  const wb = XLSX.utils.book_new();
  const sheetName = `${meta.employeeName}`.slice(0, 28) || "個人薪資";
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(
    wb,
    `${storeName}_${rocYear}年${record.month}月_薪資明細_${meta.employeeName}.xlsx`
  );
}
