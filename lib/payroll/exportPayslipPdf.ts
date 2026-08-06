import { jsPDF } from "jspdf";
import { type PayrollRecord } from "@/lib/context/AppContext";
import html2canvas from "html2canvas";

function money(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("zh-TW");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const exportPayslipPdf = async (record: PayrollRecord, employeeName: string) => {
  const base = record.baseSalary ?? 0;
  const overtime = record.overtimePay ?? 0;
  const bonus = record.bonusTotal > 0 ? record.bonusTotal : 0;
  const leave = record.leaveDeduction ?? 0;
  const tardiness = record.tardinessDeduction ?? 0;
  const labor = record.laborInsurance ?? 0;
  const health = record.healthInsurance ?? 0;
  const pension = record.pensionDeduction ?? 0;

  const totalEarnings = base + overtime + bonus;
  const totalDeductions = leave + tardiness + labor + health + pension;
  const payMonthLabel = `${record.year} 年 ${record.month} 月`;
  // 隔月 5 號發薪：所屬月的下一個月
  const payOutDate = new Date(record.year, record.month, 5); // month is 1-based → Date month = record.month (= next calendar month index)
  const payOutLabel = `${payOutDate.getFullYear()}/${payOutDate.getMonth() + 1}/5`;
  const publishedLabel = record.publishedAt
    ? new Date(record.publishedAt).toLocaleDateString("zh-TW")
    : "—";
  const printedLabel = new Date().toLocaleString("zh-TW");
  const name = esc(employeeName);
  const noteHtml = record.note
    ? `<div style="margin-top:14px;padding:10px 12px;background:#f8fafc;border-left:3px solid #94a3b8;font-size:12px;color:#475569;line-height:1.6;">
        <div style="font-weight:700;margin-bottom:4px;color:#334155;">備註</div>
        <div>${esc(String(record.note))}</div>
      </div>`
    : "";

  const row = (label: string, value: string, tone: "earn" | "deduct" | "muted" = "muted") => {
    const color = tone === "earn" ? "#047857" : tone === "deduct" ? "#b91c1c" : "#0f172a";
    return `<tr>
      <td style="padding:11px 16px;border-bottom:1px solid #f1f5f9;color:#475569;font-size:13px;">${label}</td>
      <td style="padding:11px 16px;border-bottom:1px solid #f1f5f9;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;color:${color};font-size:13px;">${value}</td>
    </tr>`;
  };

  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-99999px";
  wrapper.style.top = "0";
  wrapper.style.width = "794px";
  wrapper.style.padding = "0";
  wrapper.style.background = "#ffffff";
  wrapper.style.fontFamily = "'Noto Sans TC', 'Microsoft JhengHei', 'PingFang TC', sans-serif";
  wrapper.style.color = "#0f172a";
  wrapper.innerHTML = `
    <div style="background:#ffffff;padding:36px 40px 28px;">
      <!-- 頁首 -->
      <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #0f766e;padding-bottom:18px;">
        <div>
          <div style="font-size:13px;letter-spacing:0.28em;color:#0f766e;font-weight:700;margin-bottom:6px;">耀聖藥局</div>
          <h1 style="margin:0;font-size:28px;font-weight:800;letter-spacing:0.12em;color:#0f172a;">員工薪資單</h1>
          <div style="margin-top:6px;font-size:12px;color:#64748b;">Employee Payslip</div>
        </div>
        <div style="text-align:right;">
          <div style="display:inline-block;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;border-radius:999px;padding:5px 12px;font-size:12px;font-weight:700;">
            所屬 ${payMonthLabel}
          </div>
          <div style="margin-top:8px;font-size:12px;color:#64748b;">預計發放 ${payOutLabel}</div>
        </div>
      </div>

      <!-- 基本資料 -->
      <div style="margin-top:20px;display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;">
        <div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:2px;">員工姓名</div>
          <div style="font-size:15px;font-weight:700;">${name}</div>
        </div>
        <div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:2px;">薪資所屬月份</div>
          <div style="font-size:15px;font-weight:700;">${payMonthLabel}</div>
        </div>
        <div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:2px;">發布日期</div>
          <div style="font-size:13px;font-weight:600;color:#334155;">${publishedLabel}</div>
        </div>
        <div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:2px;">列印時間</div>
          <div style="font-size:13px;font-weight:600;color:#334155;">${printedLabel}</div>
        </div>
      </div>

      <!-- 應發 -->
      <div style="margin-top:22px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(90deg,#0f766e,#14b8a6);color:#fff;padding:10px 16px;font-size:13px;font-weight:700;letter-spacing:0.08em;">
          應發項目
        </div>
        <table style="width:100%;border-collapse:collapse;">
          ${row("底薪", `${money(base)} 元`, "earn")}
          ${row("加班費", `${money(overtime)} 元`, "earn")}
          ${row("獎金", `${money(bonus)} 元`, "earn")}
          <tr>
            <td style="padding:12px 16px;background:#f0fdfa;font-weight:800;font-size:13px;color:#0f766e;">應發合計</td>
            <td style="padding:12px 16px;background:#f0fdfa;text-align:right;font-weight:800;font-size:15px;color:#0f766e;font-variant-numeric:tabular-nums;">${money(totalEarnings)} 元</td>
          </tr>
        </table>
      </div>

      <!-- 扣除 -->
      <div style="margin-top:16px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(90deg,#9f1239,#e11d48);color:#fff;padding:10px 16px;font-size:13px;font-weight:700;letter-spacing:0.08em;">
          扣除項目
        </div>
        <table style="width:100%;border-collapse:collapse;">
          ${row("請假扣款", `- ${money(leave)} 元`, "deduct")}
          ${row("遲到扣款", `- ${money(tardiness)} 元`, "deduct")}
          ${row("勞保", `- ${money(labor)} 元`, "deduct")}
          ${row("健保", `- ${money(health)} 元`, "deduct")}
          ${row("退休金", `- ${money(pension)} 元`, "deduct")}
          <tr>
            <td style="padding:12px 16px;background:#fff1f2;font-weight:800;font-size:13px;color:#9f1239;">扣除合計</td>
            <td style="padding:12px 16px;background:#fff1f2;text-align:right;font-weight:800;font-size:15px;color:#9f1239;font-variant-numeric:tabular-nums;">- ${money(totalDeductions)} 元</td>
          </tr>
        </table>
      </div>

      <!-- 實領 -->
      <div style="margin-top:20px;background:linear-gradient(135deg,#0f172a 0%,#134e4a 100%);color:#fff;border-radius:14px;padding:18px 20px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:12px;opacity:0.75;letter-spacing:0.1em;margin-bottom:4px;">實領金額 NET PAY</div>
          <div style="font-size:13px;opacity:0.85;">應發 ${money(totalEarnings)} − 扣除 ${money(totalDeductions)}</div>
        </div>
        <div style="font-size:34px;font-weight:800;letter-spacing:0.02em;font-variant-numeric:tabular-nums;">
          NT$ ${money(record.finalPay)}
        </div>
      </div>

      ${noteHtml}

      <div style="margin-top:22px;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#94a3b8;">
        <span>耀聖藥局排班系統 · 薪資單僅供本人核對</span>
        <span>隔月 5 日發薪</span>
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
    const imageData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const marginX = 28;
    const marginY = 28;
    const imgWidth = pageWidth - marginX * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (imgHeight <= pageHeight - marginY * 2) {
      pdf.addImage(imageData, "PNG", marginX, marginY, imgWidth, imgHeight, undefined, "FAST");
    } else {
      // 內容過長時縮放進單頁
      const scale = (pageHeight - marginY * 2) / imgHeight;
      const w = imgWidth * scale;
      const h = imgHeight * scale;
      const x = (pageWidth - w) / 2;
      pdf.addImage(imageData, "PNG", x, marginY, w, h, undefined, "FAST");
    }

    pdf.save(`薪資單_${employeeName}_${record.year}_${record.month}.pdf`);
  } finally {
    wrapper.remove();
  }
};
