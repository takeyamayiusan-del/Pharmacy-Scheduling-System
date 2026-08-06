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

function pushIfNonZero(rows: [string, number][], label: string, amount: number) {
  const n = Number(amount) || 0;
  if (Math.abs(n) < 0.0001) return;
  rows.push([label, n]);
}

type CellStyle = NonNullable<XLSX.CellObject["s"]>;

function styleSheet(ws: XLSX.WorkSheet, opts: { titleRow: number; sectionHeaderRow: number; colHeaderRow: number }) {
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1:G40");
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const ref = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[ref]) ws[ref] = { t: "s", v: "" };
      const cell = ws[ref];
      const s: CellStyle = {
        font: { name: "Microsoft JhengHei", sz: 11, color: { rgb: "1F2937" } },
        alignment: { vertical: "center", wrapText: true },
        border: {
          top: { style: "thin", color: { rgb: "E5E7EB" } },
          bottom: { style: "thin", color: { rgb: "E5E7EB" } },
          left: { style: "thin", color: { rgb: "E5E7EB" } },
          right: { style: "thin", color: { rgb: "E5E7EB" } },
        },
      };

      if (R === opts.titleRow) {
        s.font = { name: "Microsoft JhengHei", sz: 16, bold: true, color: { rgb: "0F766E" } };
        s.alignment = { vertical: "center", horizontal: "left" };
        s.fill = { patternType: "solid", fgColor: { rgb: "ECFDF5" } };
      }
      if (R === opts.sectionHeaderRow) {
        s.font = { name: "Microsoft JhengHei", sz: 11, bold: true, color: { rgb: "FFFFFF" } };
        s.fill = { patternType: "solid", fgColor: { rgb: "0F766E" } };
        s.alignment = { vertical: "center", horizontal: "center" };
      }
      if (R === opts.colHeaderRow) {
        s.font = { name: "Microsoft JhengHei", sz: 10, bold: true, color: { rgb: "334155" } };
        s.fill = { patternType: "solid", fgColor: { rgb: "F1F5F9" } };
      }
      if (typeof cell.v === "string" && cell.v.includes("實領金額")) {
        s.font = { name: "Microsoft JhengHei", sz: 12, bold: true, color: { rgb: "1D4ED8" } };
      }
      if (typeof cell.v === "string" && cell.v.includes("(A)+(B)-(C)")) {
        s.font = { name: "Microsoft JhengHei", sz: 12, bold: true, color: { rgb: "0F766E" } };
      }
      // 金額欄靠右
      if (C === 1 || C === 3 || C === 5) {
        s.alignment = { ...(s.alignment || {}), horizontal: "right", vertical: "center" };
      }
      cell.s = s;
    }
  }

  ws["!cols"] = [
    { wch: 26 },
    { wch: 14 },
    { wch: 30 },
    { wch: 14 },
    { wch: 18 },
    { wch: 14 },
    { wch: 22 },
  ];
  ws["!rows"] = [{ hpt: 28 }, { hpt: 10 }, { hpt: 22 }];
}

/**
 * 員工個人薪資明細 Excel（格式對齊結算頁個人 sheet，不含其他人）
 * - 員工自提（退休金）放應代扣
 * - 金額為 0 的項目不顯示
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
  const otherBonus = Math.max(0, rawBonus - fixedAllowance);

  // A：約定應給（不含員工自提）
  const colA: [string, number][] = [];
  pushIfNonZero(colA, "底薪（合約）", Number(record.baseSalary) || 0);
  pushIfNonZero(colA, "職位加級", positionGrade);
  pushIfNonZero(colA, "請假扣款", -(Number(record.leaveDeduction) || 0));
  pushIfNonZero(colA, "遲到扣款", -(Number(record.tardinessDeduction) || 0));

  // B：非固定／津貼
  const colB: [string, number][] = [];
  if (fixedAllowance > 0) {
    colB.push([
      fullAttendance > 0 ? `固定津貼／獎金（含全勤 ${fullAttendance}）` : "固定津貼／獎金",
      fixedAllowance,
    ]);
  }
  pushIfNonZero(colB, "加班費", Number(record.overtimePay) || 0);
  pushIfNonZero(colB, "其他加項／異動", otherBonus);

  // C：應代扣（含員工自提）
  const colC: [string, number][] = [];
  pushIfNonZero(colC, "勞保費", Number(record.laborInsurance) || 0);
  pushIfNonZero(colC, "健保費", Number(record.healthInsurance) || 0);
  pushIfNonZero(colC, "員工自提", Number(record.pensionDeduction) || 0);

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
  aoa.push([`耀聖藥局　${rocYear}年${record.month}月　薪資明細表（個人）`]);
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
  const sectionHeaderRow = aoa.length;
  aoa.push(["約定薪資結構", null, "非固定／津貼項目", null, "應代扣項目"]);
  const colHeaderRow = aoa.length;
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
    if (normalHours > 0) aoa.push(["正常時數", normalHours, normalPay]);
    if (overtimeHours > 0) aoa.push(["額外時數", overtimeHours, Number(record.overtimePay) || 0]);
    if (holidayOvertimeHours > 0) aoa.push(["其中國定假加班", holidayOvertimeHours, ""]);
    if (leaveHours > 0) {
      aoa.push([
        "請假時數",
        leaveHours,
        Number(record.leaveDeduction) > 0 ? -Number(record.leaveDeduction) : "",
      ]);
    }
    aoa.push([]);
  }

  if ((Number(record.baseSalary) || 0) > 0) {
    aoa.push(["合約底薪", null, Number(record.baseSalary)]);
  }
  if (hourlyRate > 0) aoa.push(["時薪", `${hourlyRate} /HR`]);
  aoa.push([]);

  if (companyPensionRate > 0 || companyPensionBase > 0) {
    aoa.push(["公司提撥退休金資訊（雇主負擔，非員工扣款）"]);
    if (companyPensionRate > 0) aoa.push(["公司提撥退休金", `${companyPensionRate}%`]);
    if (companyPensionBase > 0) aoa.push(["提撥工資級距（部分工時）", companyPensionBase]);
    if (companyPensionAmt > 0) aoa.push(["提撥金額", companyPensionAmt]);
  }
  if (unionFee > 0) aoa.push([`每月補助職業工會會費 ${unionFee} 元`]);
  if (record.note) {
    aoa.push([]);
    aoa.push(["備註", String(record.note)]);
  }
  aoa.push([]);
  aoa.push(["實領金額"]);
  aoa.push(["(A)+(B)-(C) =", finalPay]);
  aoa.push([]);
  aoa.push(["簽收："]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 1 } },
    { s: { r: 2, c: 2 }, e: { r: 2, c: 3 } },
    { s: { r: 2, c: 4 }, e: { r: 2, c: 6 } },
    { s: { r: sectionHeaderRow, c: 0 }, e: { r: sectionHeaderRow, c: 1 } },
    { s: { r: sectionHeaderRow, c: 2 }, e: { r: sectionHeaderRow, c: 3 } },
    { s: { r: sectionHeaderRow, c: 4 }, e: { r: sectionHeaderRow, c: 5 } },
  ];
  styleSheet(ws, { titleRow: 0, sectionHeaderRow, colHeaderRow });

  const wb = XLSX.utils.book_new();
  const sheetName = `${meta.employeeName}`.slice(0, 28) || "個人薪資";
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(
    wb,
    `耀聖藥局_${rocYear}年${record.month}月_薪資明細_${meta.employeeName}.xlsx`
  );
}
