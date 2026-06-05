import { jsPDF } from "jspdf";
import type { ShiftType } from "@/lib/context/AppContext";

export type ExportEmployee = { id: string; name: string };
export type ExportLayout = "landscape" | "portrait";

const dayLabels = ["日", "一", "二", "三", "四", "五", "六"];

const exportShiftPalette: Record<ShiftType, { bg: string; text: string; border: string }> = {
  A: { bg: "#dbeafe", text: "#1d4ed8", border: "#93c5fd" },
  B: { bg: "#dcfce7", text: "#15803d", border: "#86efac" },
  C: { bg: "#fef9c3", text: "#a16207", border: "#fde68a" },
  D: { bg: "#ede9fe", text: "#6d28d9", border: "#c4b5fd" },
  E: { bg: "#fce7f3", text: "#be185d", border: "#f9a8d4" },
  X: { bg: "#f1f5f9", text: "#64748b", border: "#cbd5e1" },
};

export type DrawScheduleOptions = {
  year: number;
  month: number;
  daysInMonth: number;
  employees: ExportEmployee[];
  getShiftForDate: (date: string, employeeId: string) => ShiftType;
  getHolidayInfo: (date: string) => { isHoliday: boolean; name?: string };
  layout: ExportLayout;
  leaveRequests?: Array<{ employeeId: string; startDate: string; endDate: string; status: string }>;
  overtimeRequests?: Array<{ employeeId: string; date: string; status: string }>;
};

type SegmentOptions = DrawScheduleOptions & {
  dayStart: number;
  dayEnd: number;
  tableY: number;
  sectionTitle?: string;
};

function drawScheduleSegment(
  ctx: CanvasRenderingContext2D,
  options: SegmentOptions
): number {
  const { year, month, employees, getShiftForDate, getHolidayInfo, dayStart, dayEnd, tableY, sectionTitle } =
    options;
  const dayCount = dayEnd - dayStart + 1;
  const rowHeight = 42;
  const dayColWidth = 50;
  const nameColWidth = 100;
  const tableX = 20;
  const tableWidth = nameColWidth + dayCount * dayColWidth;
  const tableHeight = (employees.length + 1) * rowHeight;

  if (sectionTitle) {
    ctx.fillStyle = "#334155";
    ctx.font = "bold 14px 'Microsoft JhengHei', sans-serif";
    ctx.fillText(sectionTitle, tableX, tableY - 8);
  }

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.fillRect(tableX, tableY, tableWidth, tableHeight);
  ctx.strokeRect(tableX, tableY, tableWidth, tableHeight);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(tableX, tableY, tableWidth, rowHeight);
  ctx.fillStyle = "#334155";
  ctx.font = "bold 12px 'Microsoft JhengHei', sans-serif";
  ctx.fillText("員工", tableX + 12, tableY + 26);

  for (let day = dayStart; day <= dayEnd; day += 1) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayOfWeek = new Date(dateStr).getDay();
    const holidayInfo = getHolidayInfo(dateStr);
    const col = day - dayStart;
    const x = tableX + nameColWidth + col * dayColWidth;
    const textColor = dayOfWeek === 0 ? "#dc2626" : dayOfWeek === 6 ? "#c2410c" : "#334155";

    if (dayOfWeek === 0) {
      ctx.fillStyle = "#fee2e2";
      ctx.fillRect(x, tableY, dayColWidth, tableHeight);
    } else if (dayOfWeek === 6) {
      ctx.fillStyle = "#ffedd5";
      ctx.fillRect(x, tableY, dayColWidth, tableHeight);
    } else if (holidayInfo.isHoliday) {
      ctx.fillStyle = "#fef9c3";
      ctx.fillRect(x, tableY, dayColWidth, tableHeight);
    }

    ctx.strokeStyle = "#e2e8f0";
    ctx.strokeRect(x, tableY, dayColWidth, rowHeight);
    ctx.fillStyle = textColor;
    ctx.font = "bold 11px 'Microsoft JhengHei', sans-serif";
    ctx.fillText(String(day), x + 18, tableY + 16);
    ctx.font = "10px 'Microsoft JhengHei', sans-serif";
    ctx.fillStyle = "#64748b";
    ctx.fillText(dayLabels[dayOfWeek], x + 19, tableY + 30);
    if (holidayInfo.isHoliday && dayOfWeek !== 0) {
      // 繪記國定假日標記的圓形背景 (位於日期方格的右上角)
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(x + dayColWidth - 6, tableY + 6, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#d97706";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // 繪記國字
      ctx.font = "bold 8px 'Microsoft JhengHei', sans-serif";
      ctx.fillStyle = "#92400e";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("國", x + dayColWidth - 6, tableY + 6);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
  }

  employees.forEach((emp, rowIndex) => {
    const rowY = tableY + rowHeight + rowIndex * rowHeight;
    ctx.strokeStyle = "#e2e8f0";
    ctx.strokeRect(tableX, rowY, nameColWidth, rowHeight);
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 12px 'Microsoft JhengHei', sans-serif";
    ctx.fillText(emp.name, tableX + 8, rowY + 26);

    for (let day = dayStart; day <= dayEnd; day += 1) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const shift = getShiftForDate(dateStr, emp.id);
      const col = day - dayStart;
      const x = tableX + nameColWidth + col * dayColWidth;
      
      // 檢查是否有核准的請假申請
      const hasApprovedLeave = options.leaveRequests?.some(
        (req) =>
          req.employeeId === emp.id &&
          req.startDate <= dateStr &&
          req.endDate >= dateStr &&
          req.status === "approved"
      );
      
      // 檢查是否有核准的加班申請
      const hasApprovedOvertime = options.overtimeRequests?.some(
        (req) =>
          req.employeeId === emp.id &&
          req.date === dateStr &&
          req.status === "approved"
      );
      
      const palette = hasApprovedLeave
        ? { bg: "#e9d5ff", text: "#6d28d9", border: "#c4b5fd" }
        : hasApprovedOvertime
          ? { bg: "#fed7aa", text: "#9a3412", border: "#fdba74" }
          : exportShiftPalette[shift];
      
      ctx.strokeStyle = "#e2e8f0";
      ctx.strokeRect(x, rowY, dayColWidth, rowHeight);
      ctx.fillStyle = palette.bg;
      ctx.fillRect(x + 6, rowY + 6, dayColWidth - 12, rowHeight - 12);
      ctx.strokeStyle = palette.border;
      ctx.strokeRect(x + 6, rowY + 6, dayColWidth - 12, rowHeight - 12);
      ctx.fillStyle = palette.text;
      ctx.font = "bold 11px 'Microsoft JhengHei', sans-serif";
      const displayText = hasApprovedLeave ? "假" : hasApprovedOvertime ? "加" : shift;
      // 設定文字對齊方式，確保水平與垢直居中
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(displayText, x + dayColWidth / 2, rowY + rowHeight / 2);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
  });

  return tableHeight + (sectionTitle ? 24 : 8);
}

function drawHorizontalSchedule(
  ctx: CanvasRenderingContext2D,
  options: DrawScheduleOptions
): { width: number; height: number } {
  const { year, month, daysInMonth, employees } = options;
  const headerHeight = 70;
  const tableY = headerHeight + 20;
  const rowHeight = 42;
  const tableHeight = (employees.length + 1) * rowHeight;
  const dayCount = daysInMonth;
  const width = Math.max(1100, 120 + dayCount * 50 + 40);
  const height = tableY + tableHeight + 28;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 28px 'Microsoft JhengHei', sans-serif";
  ctx.fillText(`${year}年${month}月 班表`, 20, 42);
  ctx.font = "12px 'Microsoft JhengHei', sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(`匯出日期：${year}/${month}`, 20, 58);

  drawScheduleSegment(ctx, {
    ...options,
    dayStart: 1,
    dayEnd: daysInMonth,
    tableY,
  });

  return { width, height };
}

function drawPortraitSchedule(
  ctx: CanvasRenderingContext2D,
  options: DrawScheduleOptions
): { width: number; height: number } {
  const { year, month, daysInMonth, employees } = options;
  const firstHalfEnd = Math.min(15, daysInMonth);
  const secondHalfStart = 16;
  const hasSecondHalf = daysInMonth >= 16;

  const dayCount1 = firstHalfEnd;
  const dayCount2 = hasSecondHalf ? daysInMonth - 15 : 0;
  const width = Math.max(
    720,
    120 + Math.max(dayCount1, dayCount2) * 50 + 40
  );

  const headerHeight = 64;
  let y = headerHeight + 16;
  const rowHeight = 42;
  const seg1Height = (employees.length + 1) * rowHeight + 28;
  const seg2Height = hasSecondHalf ? (employees.length + 1) * rowHeight + 28 : 0;
  const height = y + seg1Height + (hasSecondHalf ? seg2Height + 16 : 0) + 24;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 22px 'Microsoft JhengHei', sans-serif";
  ctx.fillText(`${year}年${month}月 班表（直式・A4列印）`, 20, 32);
  ctx.font = "11px 'Microsoft JhengHei', sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("上半月 1–15 日 / 下半月 16–月底", 20, 50);

  drawScheduleSegment(ctx, {
    ...options,
    dayStart: 1,
    dayEnd: firstHalfEnd,
    tableY: y,
    sectionTitle: "▲ 1 – 15 日",
  });
  y += seg1Height + 8;

  if (hasSecondHalf) {
    drawScheduleSegment(ctx, {
      ...options,
      dayStart: secondHalfStart,
      dayEnd: daysInMonth,
      tableY: y,
      sectionTitle: "▼ 16 – 月底",
    });
  }

  return { width, height };
}

function renderToCanvas(options: DrawScheduleOptions): {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
} {
  const scale = 2;
  const probe = document.createElement("canvas");
  const probeCtx = probe.getContext("2d")!;
  const dimensions =
    options.layout === "portrait"
      ? drawPortraitSchedule(probeCtx, options)
      : drawHorizontalSchedule(probeCtx, options);

  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width * scale;
  canvas.height = dimensions.height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  if (options.layout === "portrait") {
    drawPortraitSchedule(ctx, options);
  } else {
    drawHorizontalSchedule(ctx, options);
  }
  return { canvas, width: dimensions.width, height: dimensions.height };
}

export async function exportSchedulePdf(options: DrawScheduleOptions): Promise<void> {
  const { canvas, width, height } = renderToCanvas(options);
  const imageData = canvas.toDataURL("image/png");
  // 直式排版 → 橫向A4紙（landscape），讓內容不被壓縮
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;
  const imgRatio = width / height;
  let renderWidth = maxWidth;
  let renderHeight = renderWidth / imgRatio;
  if (renderHeight > maxHeight) {
    renderHeight = maxHeight;
    renderWidth = renderHeight * imgRatio;
  }
  const offsetX = (pageWidth - renderWidth) / 2;
  const offsetY = (pageHeight - renderHeight) / 2;
  pdf.addImage(imageData, "PNG", offsetX, offsetY, renderWidth, renderHeight);
  pdf.save(
    `班表-${options.year}-${String(options.month).padStart(2, "0")}-${options.layout === "portrait" ? "直式" : "橫式"}.pdf`
  );
}
