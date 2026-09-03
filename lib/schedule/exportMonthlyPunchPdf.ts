import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import type { PunchRecord, ScheduleShiftCode } from "@/lib/context/AppContext";

export type PersonalPunchPdfDay = {
  dateStr: string;
  day: number;
  weekdayLabel: string;
  shiftLabel: string;
  isRest: boolean;
  punches: PunchRecord[];
  leaveLabels?: string[];
  overtimeLabels?: string[];
};

/**
 * 個人當月打卡 PDF：一日一日直排（手機閱讀友善、直式 A4）。
 */
export async function exportPersonalMonthlyPunchPdf(params: {
  employeeName: string;
  year: number;
  month: number;
  days: PersonalPunchPdfDay[];
}): Promise<void> {
  const { employeeName, year, month, days } = params;

  const dayBlocks =
    days.length === 0
      ? `<p style="text-align:center;color:#6b7280;padding:24px 0;">本月尚無打卡紀錄</p>`
      : days
          .map((d) => {
            const punchLines =
              d.punches.length > 0
                ? d.punches
                    .map((p) => {
                      const action = p.action === "work_in" ? "上班" : "下班";
                      const late =
                        typeof p.lateMinutes === "number" && p.lateMinutes > 0
                          ? `　遲到 ${p.lateMinutes} 分`
                          : "";
                      const reason = p.reason ? `　｜　${p.reason}` : "";
                      return `<div style="padding:2px 0;color:#374151;">${p.time}　${action}${late}${reason}</div>`;
                    })
                    .join("")
                : `<div style="color:#9ca3af;">尚無打卡</div>`;
            const leave =
              d.leaveLabels && d.leaveLabels.length > 0
                ? `<div style="margin-top:4px;color:#0284c7;">請假：${d.leaveLabels.join("、")}</div>`
                : "";
            const ot =
              d.overtimeLabels && d.overtimeLabels.length > 0
                ? `<div style="margin-top:4px;color:#7c3aed;">加班：${d.overtimeLabels.join("、")}</div>`
                : "";
            return `
              <section style="margin:0 0 12px;padding:12px 14px;border:1px solid #e5e7eb;border-radius:10px;background:#f8fafc;page-break-inside:avoid;">
                <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
                  <strong style="font-size:15px;color:#0f172a;">${month}/${d.day}（${d.weekdayLabel}）</strong>
                  <span style="font-size:12px;color:#64748b;">${d.isRest ? "休假" : d.shiftLabel}</span>
                </div>
                ${punchLines}
                ${ot}
                ${leave}
              </section>
            `;
          })
          .join("");

  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-99999px";
  wrapper.style.top = "0";
  wrapper.style.width = "640px";
  wrapper.style.padding = "20px";
  wrapper.style.background = "#ffffff";
  wrapper.style.fontFamily =
    "'Noto Sans TC', 'Microsoft JhengHei', 'PingFang TC', sans-serif";
  wrapper.style.color = "#1f2937";
  wrapper.innerHTML = `
    <div style="border-top:6px solid #0d9488;padding-top:10px;">
      <h1 style="margin:0 0 4px;font-size:20px;color:#0f766e;">
        ${employeeName}　${year}年${month}月打卡紀錄
      </h1>
      <p style="margin:0 0 14px;font-size:11px;color:#94a3b8;">
        一日一日直排 · 匯出時間 ${new Date().toLocaleString("zh-TW")}
      </p>
      ${dayBlocks}
    </div>
  `;

  document.body.appendChild(wrapper);
  try {
    const canvas = await html2canvas(wrapper, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 28;
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;
    const ratio = usableWidth / canvas.width;
    const pageCanvasHeight = usableHeight / ratio;

    let offsetY = 0;
    let pageIndex = 0;
    while (offsetY < canvas.height) {
      if (pageIndex > 0) pdf.addPage();
      const sliceHeight = Math.min(pageCanvasHeight, canvas.height - offsetY);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceHeight;
      const ctx = slice.getContext("2d");
      if (!ctx) throw new Error("無法建立 PDF 畫布");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(
        canvas,
        0,
        offsetY,
        canvas.width,
        sliceHeight,
        0,
        0,
        canvas.width,
        sliceHeight
      );
      const sliceData = slice.toDataURL("image/png");
      pdf.addImage(
        sliceData,
        "PNG",
        margin,
        margin,
        usableWidth,
        sliceHeight * ratio
      );
      offsetY += sliceHeight;
      pageIndex += 1;
    }

    pdf.save(
      `${employeeName}_${year}-${String(month).padStart(2, "0")}_打卡.pdf`
    );
  } finally {
    wrapper.remove();
  }
}

/** @deprecated 請用 exportPersonalMonthlyPunchPdf；保留別名避免舊匯入中斷 */
export async function exportMonthlyPunchPdf(params: {
  year: number;
  month: number;
  daysInMonth: number;
  employees: Array<{
    id: string;
    name: string;
    byDate: Record<string, PunchRecord[]>;
  }>;
  getShiftForDate: (date: string, employeeId: string) => ScheduleShiftCode;
}): Promise<void> {
  const emp = params.employees[0];
  if (!emp) return;
  const dayLabels = ["日", "一", "二", "三", "四", "五", "六"];
  const days: PersonalPunchPdfDay[] = [];
  for (let day = 1; day <= params.daysInMonth; day++) {
    const dateStr = `${params.year}-${String(params.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const punches = emp.byDate[dateStr] || [];
    if (punches.length === 0) continue;
    const shift = params.getShiftForDate(dateStr, emp.id);
    days.push({
      dateStr,
      day,
      weekdayLabel: dayLabels[new Date(dateStr).getDay()] || "",
      shiftLabel: shift === "X" ? "休假" : shift,
      isRest: shift === "X",
      punches,
    });
  }
  await exportPersonalMonthlyPunchPdf({
    employeeName: emp.name,
    year: params.year,
    month: params.month,
    days,
  });
}
