import XLSX from "xlsx-js-style";
import type { PayrollRecord } from "@/lib/context/AppContext";

export type PersonalPayslipExcelMeta = {
  employeeName: string;
  position?: string;
  bankAccount?: string;
  payDate?: string;
  hourlyRate?: number;
  normalHours?: number;
  leaveHours?: number;
  overtimeHours?: number;
  holidayOvertimeHours?: number;
  companyPensionRate?: number;
  companyPensionBase?: number;
  unionFee?: number;
};

const toROC = (westernYear: number) => westernYear - 1911;

/**
 * 員工個人薪資明細 Excel（格式對齊結算頁個人 sheet，不含其他人）
 */
export function exportPersonalPayslipExcel(
  record: PayrollRecord,
  meta: PersonalPayslipExcelMeta
): void {
  const rocYear = toROC(record.year);
  const positionGrade = Number(record.positionGradeTotal ?? 0);
  const fixedAllowance = Number(record.fixedAllowanceTotal ?? 0);
  const fullAttendance = Number(record.fullAttendancePay ?? 0);
  const rawBonus = Number(record.bonusTotal ?? 0);
  // 新版發布可能把固定項目併入 bonus_total
  const otherBonus = Math.max(0, rawBonus - fixedAllowance);

  const colA: [string, number][] = [
    ["底薪（合約）", Number(record.baseSalary) || 0],
  ];
  if (positionGrade > 0) colA.push(["職位加級", positionGrade]);
  if ((Number(record.pensionDeduction) || 0) > 0) {
    colA.push(["退休金提撥", -Number(record.pensionDeduction)]);
  }
  if ((Number(record.leaveDeduction) || 0) > 0) {
    colA.push(["請假扣款", -Number(record.leaveDeduction)]);
  }
  if ((Number(record.tardinessDeduction) || 0) > 0) {
    colA.push(["遲到扣款", -Number(record.tardinessDeduction)]);
  }

  const colB: [string, number][] = [];
  if (fixedAllowance > 0) {
    colB.push([
      fullAttendance > 0 ? `固定津貼／獎金（含全勤 ${fullAttendance}）` : "固定津貼／獎金",
      fixedAllowance,
    ]);
  }
  if ((Number(record.overtimePay) || 0) > 0) {
    colB.push(["加班費", Number(record.overtimePay)]);
  }
  if (otherBonus > 0) colB.push(["其他加項／異動", otherBonus]);

  const colC: [string, number][] = [
    ["勞保費", Number(record.laborInsurance) || 0],
    ["健保費", Number(record.healthInsurance) || 0],
  ];

  const subA = colA.reduce((s, [, v]) => s + Number(v), 0);
  const subB = colB.reduce((s, [, v]) => s + Number(v), 0);
  const subC = colC.reduce((s, [, v]) => s + Number(v), 0);
  const finalPay = Number(record.finalPay) || 0;

  const hourlyRate = Number(meta.hourlyRate) || 0;
  const normalHours = Number(meta.normalHours) || 0;
  const overtimeHours = Number(meta.overtimeHours) || 0;
  const holidayOvertimeHours = Number(meta.holidayOvertimeHours) || 0;
  const leaveHours = Number(meta.leaveHours) || 0;
  const normalPay = Math.round(normalHours * hourlyRate);
  const companyPensionRate = Number(meta.companyPensionRate) || 0;
  const companyPensionBase = Number(meta.companyPensionBase) || 0;
  const companyPensionAmt = Math.round((companyPensionBase * companyPensionRate) / 100);
  const unionFee = Number(meta.unionFee) || 0;

  const aoa: (string | number | null)[][] = [];
  aoa.push(["耀聖藥局", null, null, `${rocYear}年`, null, `${record.month}月 薪資明細表（個人）`]);
  aoa.push([]);
  aoa.push([
    `姓名：${meta.employeeName}`,
    null,
    `職位：${meta.position || "—"}`,
    null,
    `入帳帳號：${meta.bankAccount || "—"}`,
    null,
    `發薪日期：${meta.payDate || "隔月5日"}`,
  ]);
  aoa.push([]);
  aoa.push(["約定薪資結構", null, "非固定／津貼項目", null, "應代扣項目"]);
  aoa.push(["項目", "金額", "項目", "金額", "項目", "金額"]);

  const maxRows = Math.max(colA.length, colB.length, colC.length, 1);
  for (let i = 0; i < maxRows; i++) {
    aoa.push([
      colA[i]?.[0] ?? "",
      colA[i]?.[1] ?? "",
      colB[i]?.[0] ?? "",
      colB[i]?.[1] ?? "",
      colC[i]?.[0] ?? "",
      colC[i]?.[1] ?? "",
    ]);
  }

  aoa.push([`小計(A)`, subA, `小計(B)`, subB, `小計(C)`, subC]);
  aoa.push([]);

  if (normalHours > 0 || overtimeHours > 0 || leaveHours > 0) {
    aoa.push(["正常時數", normalHours || "", normalHours > 0 ? normalPay : ""]);
    aoa.push(["額外時數", overtimeHours || "", Number(record.overtimePay) || ""]);
    if (holidayOvertimeHours > 0) {
      aoa.push(["其中國定假加班", holidayOvertimeHours, ""]);
    }
    if (leaveHours > 0) {
      aoa.push(["請假時數", leaveHours, Number(record.leaveDeduction) > 0 ? -Number(record.leaveDeduction) : 0]);
    }
    aoa.push([]);
  }

  aoa.push(["合約底薪", null, Number(record.baseSalary) || 0]);
  if (hourlyRate > 0) aoa.push([`時薪：`, `${hourlyRate} /HR`]);
  aoa.push([]);

  if (companyPensionRate > 0 || companyPensionBase > 0) {
    aoa.push(["公司提撥退休金資訊："]);
    aoa.push([`公司提撥退休金`, `${companyPensionRate}%`]);
    aoa.push([`提撥工資級距 部分工時`, companyPensionBase]);
    aoa.push([`提撥金額`, companyPensionAmt]);
  }
  if (unionFee > 0) {
    aoa.push([`每月補助職業工會會費${unionFee}元`]);
  }
  if (record.note) {
    aoa.push([]);
    aoa.push(["備註", String(record.note)]);
  }
  aoa.push([]);
  aoa.push(["實領金額"]);
  aoa.push([`(A)+(B)-(C) =`, finalPay]);
  aoa.push([]);
  aoa.push(["簽收："]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
  ];
  ws["!cols"] = [
    { wch: 22 },
    { wch: 14 },
    { wch: 28 },
    { wch: 14 },
    { wch: 16 },
    { wch: 14 },
    { wch: 18 },
  ];

  const wb = XLSX.utils.book_new();
  const sheetName = `${meta.employeeName}`.slice(0, 28) || "個人薪資";
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(
    wb,
    `耀聖藥局_${rocYear}年${record.month}月_薪資明細_${meta.employeeName}.xlsx`
  );
}
