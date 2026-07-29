import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import type { PunchRecord, ShiftType } from "@/lib/context/AppContext";

export type PunchPdfEmployee = {
  id: string;
  name: string;
  byDate: Record<string, PunchRecord[]>;
};

type ExportPunchPdfParams = {
  year: number;
  month: number;
  daysInMonth: number;
  employees: PunchPdfEmployee[];
  getShiftForDate: (date: string, employeeId: string) => ShiftType;
};

/**
 * 以 HTML → Canvas → PDF 匯出打卡明細，避免 jsPDF 內建字型無法顯示中文。
 */
export async function exportMonthlyPunchPdf(params: ExportPunchPdfParams): Promise<void> {
  const { year, month, daysInMonth, employees, getShiftForDate } = params;
  const dayLabels = ["日", "一", "二", "三", "四", "五", "六"];

  const sections = employees
    .map((emp) => {
      const rows = Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const date = new Date(dateStr);
        const dayOfWeek = dayLabels[date.getDay()];
        const weekend = dayOfWeek === "六" || dayOfWeek === "日";
        const shift = getShiftForDate(dateStr, emp.id);
        const punches = emp.byDate[dateStr] || [];
        const times =
          punches.length > 0
            ? punches.map((p) => p.time).join("　")
            : "無打卡";
        return `
          <tr>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${month}/${day}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;color:${weekend ? "#dc2626" : "#374151"};">${dayOfWeek}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;">${shift}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;color:${punches.length ? "#059669" : "#9ca3af"};">${times}</td>
          </tr>
        `;
      }).join("");

      return `
        <section style="margin-bottom:22px;page-break-inside:avoid;">
          <h2 style="margin:0 0 8px;font-size:16px;color:#111827;">${emp.name}</h2>
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="text-align:left;padding:6px 8px;">日期</th>
                <th style="text-align:left;padding:6px 8px;">星期</th>
                <th style="text-align:left;padding:6px 8px;">班別</th>
                <th style="text-align:left;padding:6px 8px;">打卡時間</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>
      `;
    })
    .join("");

  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-99999px";
  wrapper.style.top = "0";
  wrapper.style.width = "1100px";
  wrapper.style.padding = "24px";
  wrapper.style.background = "#ffffff";
  wrapper.style.fontFamily = "'Noto Sans TC', 'Microsoft JhengHei', 'PingFang TC', sans-serif";
  wrapper.style.color = "#1f2937";
  wrapper.innerHTML = `
    <div style="border-top:8px solid #059669;padding-top:12px;">
      <h1 style="margin:0 0 16px;text-align:center;color:#047857;font-size:24px;">
        ${year} 年 ${month} 月 打卡記錄明細
      </h1>
      ${sections || `<p style="text-align:center;color:#6b7280;">本月無打卡資料</p>`}
      <div style="margin-top:12px;border-top:1px solid #e5e7eb;padding-top:8px;font-size:11px;color:#9ca3af;text-align:center;">
        耀聖藥局排班系統產生 · ${new Date().toLocaleString("zh-TW")}
      </div>
    </div>
  `;

  document.body.appendChild(wrapper);
  try {
    const canvas = await html2canvas(wrapper, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 18;
    const imgWidth = pageWidth - margin * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = margin;
    const imgData = canvas.toDataURL("image/png");

    pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight, undefined, "FAST");
    heightLeft -= pageHeight - margin * 2;

    while (heightLeft > 0) {
      position = margin - (imgHeight - heightLeft);
      pdf.addPage();
      pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight, undefined, "FAST");
      heightLeft -= pageHeight - margin * 2;
    }

    pdf.save(`打卡記錄_${year}_${String(month).padStart(2, "0")}.pdf`);
  } finally {
    wrapper.remove();
  }
}
