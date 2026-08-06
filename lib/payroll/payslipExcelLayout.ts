import XLSX from "xlsx-js-style";
import type { CellObject, WorkSheet } from "xlsx-js-style";

type CellStyle = NonNullable<CellObject["s"]>;
type BorderStyle = NonNullable<NonNullable<CellStyle["border"]>["top"]>;

const FONT = "Microsoft JhengHei";
const THIN: BorderStyle = { style: "thin", color: { rgb: "CBD5E1" } };
const THICK: BorderStyle = { style: "medium", color: { rgb: "0F766E" } };
const THICK_NET: BorderStyle = { style: "medium", color: { rgb: "1D4ED8" } };

export type PayslipColPair = [string, number | string];

export type PayslipExcelInput = {
  title: string;
  employeeName: string;
  position?: string;
  bankAccount?: string;
  payDate?: string;
  colA: PayslipColPair[];
  colB: PayslipColPair[];
  colC: PayslipColPair[];
  overtimeHours?: number;
  overtimePay?: number;
  holidayOvertimeHours?: number;
  leaveHours?: number;
  leaveDeduction?: number;
  hourlyRate?: number;
  companyPensionRate?: number;
  companyPensionBase?: number;
  unionFee?: number;
  note?: string;
  finalPay: number;
};

function cellBorder(
  top: BorderStyle,
  bottom: BorderStyle,
  left: BorderStyle,
  right: BorderStyle
): CellStyle["border"] {
  return { top, bottom, left, right };
}

function applyA5Print(ws: WorkSheet) {
  // Excel paperSize 11 = A5；單頁寬高縮放方便列印
  const sheet = ws as WorkSheet & {
    "!pageSetup"?: Record<string, unknown>;
    "!margins"?: Record<string, number>;
    "!printOptions"?: Record<string, boolean>;
  };
  sheet["!pageSetup"] = {
    paperSize: 11,
    orientation: "portrait",
    fitToWidth: 1,
    fitToHeight: 1,
    fitToPage: true,
  };
  sheet["!margins"] = {
    left: 0.35,
    right: 0.35,
    top: 0.35,
    bottom: 0.35,
    header: 0.15,
    footer: 0.15,
  };
  sheet["!printOptions"] = {
    horizontalCentered: true,
  };
}

/**
 * 建立 A5 薪資明細表（約定／非固定／應代扣 + 加班時數 + 公司提撥區塊 + 實領）
 */
export function buildPayslipWorksheet(input: PayslipExcelInput): WorkSheet {
  const subA = input.colA.reduce((s, [, v]) => s + Number(v), 0);
  const subB = input.colB.reduce((s, [, v]) => s + Number(v), 0);
  const subC = input.colC.reduce((s, [, v]) => s + Number(v), 0);

  const overtimeHours = Number(input.overtimeHours) || 0;
  const overtimePay = Number(input.overtimePay) || 0;
  const holidayOvertimeHours = Number(input.holidayOvertimeHours) || 0;
  const leaveHours = Number(input.leaveHours) || 0;
  const leaveDeduction = Number(input.leaveDeduction) || 0;
  const hourlyRate = Number(input.hourlyRate) || 0;
  const companyPensionRate = Number(input.companyPensionRate) || 0;
  const companyPensionBase = Number(input.companyPensionBase) || 0;
  const companyPensionAmt = Math.round((companyPensionBase * companyPensionRate) / 100);
  const unionFee = Number(input.unionFee) || 0;

  const aoa: (string | number | null)[][] = [];
  aoa.push([input.title]);
  aoa.push([]);
  aoa.push([
    `姓名：${input.employeeName}`,
    null,
    `職位：${input.position || "—"}`,
    null,
    `入帳帳號：${input.bankAccount || "—"}`,
    null,
  ]);
  if (input.payDate) {
    aoa[2].push(`發薪日期：${input.payDate}`);
  }
  aoa.push([]);

  const sectionHeaderRow = aoa.length;
  aoa.push(["約定薪資結構", null, "非固定支付項目", null, "應代扣項目"]);
  const colHeaderRow = aoa.length;
  aoa.push(["項目", "金額", "項目", "金額", "項目", "金額"]);

  const maxRows = Math.max(input.colA.length, input.colB.length, input.colC.length, 1);
  for (let i = 0; i < maxRows; i++) {
    aoa.push([
      input.colA[i]?.[0] ?? "",
      input.colA[i]?.[1] ?? "",
      input.colB[i]?.[0] ?? "",
      input.colB[i]?.[1] ?? "",
      input.colC[i]?.[0] ?? "",
      input.colC[i]?.[1] ?? "",
    ]);
  }
  const subtotalRow = aoa.length;
  aoa.push([`小計(A)`, subA, `小計(B)`, subB, `小計(C)`, subC]);
  const mainBlockEnd = subtotalRow;

  // 時數區：已移除正常時數；額外時數→加班時數；無則不顯示
  let hoursStart = -1;
  let hoursEnd = -1;
  const hasHours = overtimeHours > 0 || holidayOvertimeHours > 0 || leaveHours > 0 || hourlyRate > 0;
  if (hasHours) {
    aoa.push([]);
    hoursStart = aoa.length;
    if (overtimeHours > 0) aoa.push(["加班時數", overtimeHours, overtimePay]);
    if (holidayOvertimeHours > 0) aoa.push(["其中國定假加班", holidayOvertimeHours, ""]);
    if (leaveHours > 0) {
      aoa.push(["請假時數", leaveHours, leaveDeduction > 0 ? -leaveDeduction : ""]);
    }
    if (hourlyRate > 0) aoa.push(["時薪", `${hourlyRate} /HR`]);
    hoursEnd = aoa.length - 1;
  }

  // 公司提撥區塊：級距在上、提撥比率在下；移除「部分工時」括弧
  let pensionStart = -1;
  let pensionEnd = -1;
  if (companyPensionRate > 0 || companyPensionBase > 0) {
    aoa.push([]);
    pensionStart = aoa.length;
    aoa.push(["公司提撥資訊（雇主負擔，非員工扣款）", null, null, null, null, null]);
    if (companyPensionBase > 0) aoa.push(["提撥級距", companyPensionBase]);
    if (companyPensionRate > 0) aoa.push(["公司提撥退休金", `${companyPensionRate}%`]);
    if (companyPensionAmt > 0) aoa.push(["提撥金額", companyPensionAmt]);
    pensionEnd = aoa.length - 1;
  }

  if (unionFee > 0) {
    aoa.push([]);
    aoa.push([`每月補助職業工會會費 ${unionFee} 元`]);
  }
  if (input.note) {
    aoa.push([]);
    aoa.push(["備註", String(input.note)]);
  }

  aoa.push([]);
  const netLabelRow = aoa.length;
  aoa.push(["實領金額"]);
  const netValueRow = aoa.length;
  aoa.push(["(A)+(B)-(C) =", input.finalPay]);
  aoa.push([]);
  aoa.push(["簽收："]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const merges: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }> = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 1 } },
    { s: { r: 2, c: 2 }, e: { r: 2, c: 3 } },
    { s: { r: 2, c: 4 }, e: { r: 2, c: 5 } },
    { s: { r: sectionHeaderRow, c: 0 }, e: { r: sectionHeaderRow, c: 1 } },
    { s: { r: sectionHeaderRow, c: 2 }, e: { r: sectionHeaderRow, c: 3 } },
    { s: { r: sectionHeaderRow, c: 4 }, e: { r: sectionHeaderRow, c: 5 } },
  ];
  if (pensionStart >= 0) {
    merges.push({ s: { r: pensionStart, c: 0 }, e: { r: pensionStart, c: 5 } });
  }
  merges.push({ s: { r: netLabelRow, c: 0 }, e: { r: netLabelRow, c: 5 } });
  ws["!merges"] = merges;

  const range = XLSX.utils.decode_range(ws["!ref"] || "A1:F40");
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const ref = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[ref]) ws[ref] = { t: "s", v: "" };
      const cell = ws[ref];
      let border = cellBorder(THIN, THIN, THIN, THIN);

      // 主表粗線外框
      if (R >= sectionHeaderRow && R <= mainBlockEnd && C <= 5) {
        const top = R === sectionHeaderRow ? THICK : THIN;
        const bottom = R === mainBlockEnd ? THICK : THIN;
        const left = C === 0 ? THICK : THIN;
        const right = C === 5 ? THICK : THIN;
        border = cellBorder(top, bottom, left, right);
      }

      // 時數區塊粗線
      if (hoursStart >= 0 && R >= hoursStart && R <= hoursEnd && C <= 2) {
        const top = R === hoursStart ? THICK : THIN;
        const bottom = R === hoursEnd ? THICK : THIN;
        const left = C === 0 ? THICK : THIN;
        const right = C === 2 ? THICK : THIN;
        border = cellBorder(top, bottom, left, right);
      }

      // 公司提撥區塊粗線
      if (pensionStart >= 0 && R >= pensionStart && R <= pensionEnd && C <= 5) {
        const top = R === pensionStart ? THICK : THIN;
        const bottom = R === pensionEnd ? THICK : THIN;
        const left = C === 0 ? THICK : THIN;
        const right = C === 5 ? THICK : THIN;
        border = cellBorder(top, bottom, left, right);
      }

      // 實領區塊粗線
      if ((R === netLabelRow || R === netValueRow) && C <= 5) {
        const top = R === netLabelRow ? THICK_NET : THIN;
        const bottom = R === netValueRow ? THICK_NET : THIN;
        const left = C === 0 ? THICK_NET : THIN;
        const right = C === 5 ? THICK_NET : THIN;
        border = cellBorder(top, bottom, left, right);
      }

      const s: CellStyle = {
        font: { name: FONT, sz: 10, color: { rgb: "1F2937" } },
        alignment: { vertical: "center", wrapText: true },
        border,
      };

      if (R === 0) {
        s.font = { name: FONT, sz: 14, bold: true, color: { rgb: "0F766E" } };
        s.fill = { patternType: "solid", fgColor: { rgb: "ECFDF5" } };
        s.alignment = { vertical: "center", horizontal: "left" };
      }
      if (R === sectionHeaderRow) {
        s.font = { name: FONT, sz: 10, bold: true, color: { rgb: "FFFFFF" } };
        s.fill = { patternType: "solid", fgColor: { rgb: "0F766E" } };
        s.alignment = { vertical: "center", horizontal: "center", wrapText: true };
      }
      if (R === colHeaderRow) {
        s.font = { name: FONT, sz: 9, bold: true, color: { rgb: "334155" } };
        s.fill = { patternType: "solid", fgColor: { rgb: "F1F5F9" } };
      }
      if (R === subtotalRow) {
        s.font = { name: FONT, sz: 10, bold: true, color: { rgb: "0F172A" } };
        s.fill = { patternType: "solid", fgColor: { rgb: "F8FAFC" } };
      }
      if (pensionStart >= 0 && R === pensionStart) {
        s.font = { name: FONT, sz: 10, bold: true, color: { rgb: "FFFFFF" } };
        s.fill = { patternType: "solid", fgColor: { rgb: "334155" } };
        s.alignment = { vertical: "center", horizontal: "left", wrapText: true };
      }
      if (R === netLabelRow) {
        s.font = { name: FONT, sz: 11, bold: true, color: { rgb: "1D4ED8" } };
        s.fill = { patternType: "solid", fgColor: { rgb: "EFF6FF" } };
      }
      if (R === netValueRow) {
        s.font = { name: FONT, sz: 12, bold: true, color: { rgb: "0F766E" } };
        s.fill = { patternType: "solid", fgColor: { rgb: "ECFDF5" } };
      }
      if (C === 1 || C === 3 || C === 5) {
        s.alignment = { ...(s.alignment || {}), horizontal: "right", vertical: "center" };
      }

      cell.s = s;
    }
  }

  // A5 直式可容納寬度（約 6 欄）
  ws["!cols"] = [
    { wch: 18 },
    { wch: 11 },
    { wch: 20 },
    { wch: 11 },
    { wch: 14 },
    { wch: 11 },
  ];
  ws["!rows"] = [{ hpt: 24 }, { hpt: 6 }, { hpt: 18 }];
  applyA5Print(ws);
  return ws;
}
