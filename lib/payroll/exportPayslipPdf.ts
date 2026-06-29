import { jsPDF } from "jspdf";
import { type PayrollRecord } from "@/lib/context/AppContext";
import html2canvas from "html2canvas";

export const exportPayslipPdf = async (record: PayrollRecord, employeeName: string) => {
  const totalEarnings =
    (record.baseSalary ?? 0) + (record.overtimePay ?? 0) + (record.bonusTotal > 0 ? record.bonusTotal : 0);
  const totalDeductions =
    (record.leaveDeduction ?? 0) +
    (record.tardinessDeduction ?? 0) +
    (record.laborInsurance ?? 0) +
    (record.healthInsurance ?? 0) +
    (record.pensionDeduction ?? 0);

  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-99999px";
  wrapper.style.top = "0";
  wrapper.style.width = "840px";
  wrapper.style.padding = "24px";
  wrapper.style.background = "#ffffff";
  wrapper.style.fontFamily = "'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
  wrapper.style.color = "#1f2937";
  wrapper.innerHTML = `
    <div style="border-top:8px solid #10b981;padding-top:16px;">
      <h1 style="margin:0 0 14px;text-align:center;color:#047857;font-size:30px;letter-spacing:2px;">薪資單</h1>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;font-size:14px;line-height:1.7;">
        <div><strong>員工：</strong>${employeeName}</div>
        <div><strong>年月：</strong>${record.year}年${record.month}月</div>
        <div><strong>發布：</strong>${record.publishedAt ? new Date(record.publishedAt).toLocaleDateString("zh-TW") : "-"}</div>
        <div><strong>列印：</strong>${new Date().toLocaleString("zh-TW")}</div>
      </div>
      <div style="margin-top:14px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <div style="background:#10b981;color:white;padding:8px 12px;font-weight:700;">應發項目</div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">底薪</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;color:#047857;">${(record.baseSalary ?? 0).toLocaleString()} 元</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">加班費</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;color:#047857;">${(record.overtimePay ?? 0).toLocaleString()} 元</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">獎金</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;color:#047857;">${(record.bonusTotal > 0 ? record.bonusTotal : 0).toLocaleString()} 元</td></tr>
          <tr><td style="padding:10px 12px;font-weight:700;">應發合計</td><td style="padding:10px 12px;font-weight:700;text-align:right;color:#047857;">${totalEarnings.toLocaleString()} 元</td></tr>
        </table>
      </div>
      <div style="margin-top:14px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <div style="background:#ef4444;color:white;padding:8px 12px;font-weight:700;">扣除項目</div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">請假扣款</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;color:#b91c1c;">- ${(record.leaveDeduction ?? 0).toLocaleString()} 元</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">遲到扣款</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;color:#b91c1c;">- ${(record.tardinessDeduction ?? 0).toLocaleString()} 元</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">勞保</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;color:#b91c1c;">- ${(record.laborInsurance ?? 0).toLocaleString()} 元</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">健保</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;color:#b91c1c;">- ${(record.healthInsurance ?? 0).toLocaleString()} 元</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">退休金</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;color:#b91c1c;">- ${(record.pensionDeduction ?? 0).toLocaleString()} 元</td></tr>
          <tr><td style="padding:10px 12px;font-weight:700;">扣除合計</td><td style="padding:10px 12px;font-weight:700;text-align:right;color:#b91c1c;">- ${totalDeductions.toLocaleString()} 元</td></tr>
        </table>
      </div>
      <div style="margin-top:16px;background:#1e40af;color:#fff;border-radius:8px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:16px;font-weight:700;">實領金額</span>
        <span style="font-size:30px;font-weight:800;letter-spacing:1px;">NT$ ${record.finalPay.toLocaleString()}</span>
      </div>
      <div style="margin-top:12px;border-top:1px solid #e5e7eb;padding-top:8px;font-size:12px;color:#9ca3af;text-align:center;">
        耀聖藥局排班系統產生
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
    const imgWidth = pageWidth - 36;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const y = imgHeight < pageHeight ? (pageHeight - imgHeight) / 2 : 18;
    pdf.addImage(imageData, "PNG", 18, y, imgWidth, imgHeight, undefined, "FAST");
    pdf.save(`薪資單_${employeeName}_${record.year}_${record.month}.pdf`);
  } finally {
    wrapper.remove();
  }
};
