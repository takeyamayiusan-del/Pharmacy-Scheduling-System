import { jsPDF } from "jspdf";
import { type PayrollRecord } from "@/lib/context/AppContext";

export const exportPayslipPdf = (record: PayrollRecord, employeeName: string) => {
  const pageWidth = 595;
  const marginLeft = 30;
  const marginRight = 30;
  const contentWidth = pageWidth - marginLeft - marginRight;
  
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });
  
  let y = 30;
  const rowHeight = 28;
  
  // 頂部綠色條
  pdf.setFillColor(16, 185, 129);
  pdf.rect(0, 0, pageWidth, 8, 'F');
  y += 20;
  
  // 移除 Payroll Statement 副標題，直接用大標題
  pdf.setTextColor(5, 150, 105);
  pdf.setFontSize(24);
  pdf.setFont('helvetica', 'bold');
  pdf.text('薪資單', pageWidth / 2, y, { align: 'center' });
  y += 30;
  
  // 分隔線
  pdf.setDrawColor(229, 231, 235);
  pdf.setLineWidth(0.5);
  pdf.line(marginLeft, y, pageWidth - marginRight, y);
  y += 20;
  
  // 基本資訊
  pdf.setFillColor(249, 250, 251);
  pdf.rect(marginLeft, y, contentWidth, 55, 'F');
  
  pdf.setTextColor(55, 65, 81);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`員工：${employeeName}`, marginLeft + 8, y + 15);
  pdf.text(`${record.year}年${record.month}月`, marginLeft + 200, y + 15);
  pdf.text(`發布：${record.publishedAt ? new Date(record.publishedAt).toLocaleDateString('zh-TW') : '-'}| 列印：${new Date().toLocaleDateString('zh-TW')}`, marginLeft + 8, y + 40);
  y += 65;
  
  // ===== 應發項目 =====
  pdf.setFillColor(16, 185, 129);
  pdf.rect(marginLeft, y, contentWidth, 20, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.text('應發項目', marginLeft + 8, y + 14);
  y += 25;
  
  const earnings = [
    ['底薪', record.baseSalary ?? 0],
    ['加班費', record.overtimePay ?? 0],
    ['獎金', record.bonusTotal > 0 ? record.bonusTotal : 0],
  ];
  
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(55, 65, 81);
  pdf.setFontSize(10);
  earnings.forEach(([label, amount]) => {
    pdf.text(label as string, marginLeft + 8, y + 5);
    pdf.setTextColor(5, 150, 105);
    pdf.text(`${(amount as number).toLocaleString()} 元`, pageWidth - marginRight - 8, y + 5, { align: 'right' });
    pdf.setTextColor(55, 65, 81);
    y += rowHeight;
  });
  
  const totalEarnings = (record.baseSalary ?? 0) + (record.overtimePay ?? 0) + (record.bonusTotal > 0 ? record.bonusTotal : 0);
  pdf.setDrawColor(16, 185, 129);
  pdf.line(marginLeft + 5, y, pageWidth - marginRight - 5, y);
  y += 8;
  pdf.setTextColor(5, 150, 105);
  pdf.setFont('helvetica', 'bold');
  pdf.text('應發合計', marginLeft + 8, y + 5);
  pdf.text(`${totalEarnings.toLocaleString()} 元`, pageWidth - marginRight - 8, y + 5, { align: 'right' });
  y += 35;
	
  // ===== 扣除項目 =====
  pdf.setFillColor(239, 68, 68);
  pdf.rect(marginLeft, y, contentWidth, 20, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.text('扣除項目', marginLeft + 8, y + 14);
  y += 25;

  const deductions = [
    ['請假扣款', record.leaveDeduction ?? 0],
    ['遲到扣款', record.tardinessDeduction ?? 0],
    ['勞保', record.laborInsurance ?? 0],
    ['健保', record.healthInsurance ?? 0],
    ['退休金', record.pensionDeduction ?? 0],
  ];

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  deductions.forEach(([label, amount]) => {
    pdf.setTextColor(55, 65, 81);
    pdf.text(label as string, marginLeft + 8, y + 5);
    pdf.setTextColor(239, 68, 68);
    pdf.text(`- ${(amount as number).toLocaleString()} 元`, pageWidth - marginRight - 8, y + 5, { align: 'right' });
    y += rowHeight;
  });

  const totalDeductions = (record.leaveDeduction ?? 0) + (record.tardinessDeduction ?? 0) +
    (record.laborInsurance ?? 0) + (record.healthInsurance ?? 0) +
    (record.pensionDeduction ?? 0);
  pdf.setDrawColor(239, 68, 68);
  pdf.line(marginLeft + 5, y, pageWidth - marginRight - 5, y);
  y += 8;
  pdf.setTextColor(239, 68, 68);
  pdf.setFont('helvetica', 'bold');
  pdf.text('扣除合計', marginLeft + 8, y + 5);
  pdf.text(`- ${totalDeductions.toLocaleString()} 元`, pageWidth - marginRight - 8, y + 5, { align: 'right' });
  y += 40;

  // ===== 實領金額 =====
  pdf.setFillColor(30, 64, 175);
  pdf.rect(marginLeft, y, contentWidth, 40, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('實領金額', marginLeft + 12, y + 16);
  pdf.setFontSize(16);
  pdf.text(`NT$ ${record.finalPay.toLocaleString()} 元`, pageWidth - marginRight - 12, y + 28, { align: 'right' });
  y += 55;

  // 備註
  pdf.setDrawColor(229, 231, 235);
  pdf.line(marginLeft, y, pageWidth - marginRight, y);
  y += 15;
  pdf.setTextColor(156, 163, 175);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.text('耀聖藥局排班系統產生 | ' + new Date().toLocaleString('zh-TW'), pageWidth / 2, y, { align: 'center' });

  pdf.save(`薪資單_${employeeName}_${record.year}_${record.month}.pdf`);
};
