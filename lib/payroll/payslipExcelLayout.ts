import XLSX from "xlsx-js-style";
import type { CellObject, WorkSheet } from "xlsx-js-style";

type CellStyle = NonNullable<CellObject["s"]>;
type BorderStyle = NonNullable<NonNullable<CellStyle["border"]>["top"]>;

const FONT = "Microsoft JhengHei";
const NONE: BorderStyle = { style: "none", color: { rgb: "FFFFFF" } };
const THIN: BorderStyle = { style: "thin", color: { rgb: "CBD5E1" } };
const THICK: BorderStyle = { style: "medium", color: { rgb: "0F766E" } };
const THICK_NET: BorderStyle = { style: "medium", color: { rgb: "1D4ED8" } };
const WHITE = { patternType: "solid" as const, fgColor: { rgb: "FFFFFF" } };

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

function noBorder(): CellStyle["border"] {
  return cellBorder(NONE, NONE, NONE, NONE);
}

function applyA5Print(ws: WorkSheet) {
  const sheet = ws as WorkSheet & {
    "!pageSetup"?: Record<string, unknown>;
    "!margins"?: Record<string, number>;
    "!printOptions"?: Record<string, boolean>;
    "!sheetViews"?: Array<Record<string, unknown>>;
  };
  sheet["!pageSetup"] = {
    paperSize: 11,
    orientation: "portrait",
    fitToWidth: 1,
    fitToHeight: false,
    fitToPage: true,
    scale: 100,
  };
  sheet["!margins"] = {
    left: 0.2,
    right: 0.2,
    top: 0.2,
    bottom: 0.2,
    header: 0.15,
    footer: 0.15,
  };
  sheet["!printOptions"] = {
    horizontalCentered: true,
    gridLines: false,
  };
  // 隱藏 Excel 格線，避免區塊外看起來像表格
  sheet["!sheetViews"] = [{ showGridLines: false }];
}

type Block = { r0: number; r1: number; c0: number; c1: number; thick: BorderStyle };

function inBlock(blocks: Block[], R: number, C: number): Block | null {
  for (const b of blocks) {
    if (R >= b.r0 && R <= b.r1 && C >= b.c0 && C <= b.c1) return b;
  }
  return null;
}

function blockBorder(b: Block, R: number, C: number): CellStyle["border"] {
  const top = R === b.r0 ? b.thick : THIN;
  const bottom = R === b.r1 ? b.thick : THIN;
  const left = C === b.c0 ? b.thick : THIN;
  const right = C === b.c1 ? b.thick : THIN;
  return cellBorder(top, bottom, left, right);
}

/**
 * 建立 A5 薪資明細表
 * - 只有粗線區塊才有表格線
 * - 區塊外白底、無格線
 * - 整張外框粗線包覆
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
  const infoRow1 = aoa.length;
  aoa.push([
    `姓名：${input.employeeName}`,
    null,
    `職位：${input.position || "—"}`,
    null,
    `發薪日期：${input.payDate || "—"}`,
    null,
  ]);
  const infoRow2 = aoa.length;
  aoa.push([
    `入帳帳號：${input.bankAccount || "—"}`,
    null,
    null,
    null,
    null,
    null,
  ]);
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
  const signRow = aoa.length;
  // 簽名只靠底線（合併格），不要再放底線字元，避免雙線
  aoa.push(["簽收：", "", null, null, null, null]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const merges: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }> = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: infoRow1, c: 2 }, e: { r: infoRow1, c: 3 } },
    { s: { r: infoRow1, c: 4 }, e: { r: infoRow1, c: 5 } },
    { s: { r: infoRow2, c: 0 }, e: { r: infoRow2, c: 5 } },
    { s: { r: sectionHeaderRow, c: 0 }, e: { r: sectionHeaderRow, c: 1 } },
    { s: { r: sectionHeaderRow, c: 2 }, e: { r: sectionHeaderRow, c: 3 } },
    { s: { r: sectionHeaderRow, c: 4 }, e: { r: sectionHeaderRow, c: 5 } },
    // 簽名長底線：B–F 合併
    { s: { r: signRow, c: 1 }, e: { r: signRow, c: 5 } },
  ];
  if (pensionStart >= 0) {
    merges.push({ s: { r: pensionStart, c: 0 }, e: { r: pensionStart, c: 5 } });
  }
  merges.push({ s: { r: netLabelRow, c: 0 }, e: { r: netLabelRow, c: 5 } });
  ws["!merges"] = merges;

  const blocks: Block[] = [
    { r0: sectionHeaderRow, r1: mainBlockEnd, c0: 0, c1: 5, thick: THICK },
  ];
  if (hoursStart >= 0) {
    blocks.push({ r0: hoursStart, r1: hoursEnd, c0: 0, c1: 2, thick: THICK });
  }
  if (pensionStart >= 0) {
    blocks.push({ r0: pensionStart, r1: pensionEnd, c0: 0, c1: 5, thick: THICK });
  }
  blocks.push({ r0: netLabelRow, r1: netValueRow, c0: 0, c1: 5, thick: THICK_NET });

  const range = XLSX.utils.decode_range(ws["!ref"] || "A1:F40");
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const ref = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[ref]) ws[ref] = { t: "s", v: "" };
      const cell = ws[ref];

      const block = inBlock(blocks, R, C);
      // 區塊外：白底、無格線；區塊內才有表格線
      let border = block ? blockBorder(block, R, C) : noBorder();

      // 簽名：僅一條長底線（無上下左右框，避免雙線）
      if (R === signRow) {
        if (C === 0) {
          border = noBorder();
        } else {
          border = cellBorder(NONE, THICK, NONE, NONE);
        }
      }

      const s: CellStyle = {
        font: { name: FONT, sz: 10, color: { rgb: "1F2937" } },
        alignment: { vertical: "center", wrapText: true },
        fill: WHITE,
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
      if (R === signRow) {
        s.alignment = { vertical: "bottom", horizontal: C === 0 ? "left" : "left" };
      }
      // 金額欄靠右（僅區塊內）
      if (block && (C === 1 || C === 3 || C === 5)) {
        s.alignment = { ...(s.alignment || {}), horizontal: "right", vertical: "center" };
      }

      cell.s = s;
    }
  }

  // 整張薪資單外框粗線（覆蓋外緣）
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const ref = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[ref];
      if (!cell?.s) continue;
      if (!cell.s.border) cell.s.border = noBorder();
      if (R === range.s.r) cell.s.border.top = THICK;
      if (R === range.e.r) cell.s.border.bottom = THICK;
      if (C === range.s.c) cell.s.border.left = THICK;
      if (C === range.e.c) cell.s.border.right = THICK;
    }
  }

  // A5 直式拉滿可用寬度（約 6 欄）
  ws["!cols"] = [
    { wch: 18 },
    { wch: 14 },
    { wch: 20 },
    { wch: 14 },
    { wch: 16 },
    { wch: 14 },
  ];
  ws["!rows"] = [{ hpt: 26 }, { hpt: 6 }, { hpt: 20 }, { hpt: 18 }];
  applyA5Print(ws);
  return ws;
}
