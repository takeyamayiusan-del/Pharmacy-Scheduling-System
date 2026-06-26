import { jsPDF } from "jspdf";
import { type PayrollRecord } from "@/lib/context/AppContext";

export const exportPayslipPdf = (record: PayrollRecord, employeeName: string) => {
  // 頁面尺寸
  const pageWidth = 595; // A4 portrait
  const pageHeight = 842;
  const marginLeft = 30;
  const marginRight = 30;
  const contentWidth = pageWidth - marginLeft - marginRight;
  
  // 創建 PDF
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });
  
  let y = 40;
  const lineHeight = 22;
  
  // 頂部綠色條
  pdf.setFillColor(16, 185, 129);
  pdf.rect(0, 0, pageWidth, 8, 'F');
  y += 20;
  
  // 標題
  pdf.setTextColor(5, 150, 105);
  pdf.setFontSize(28);
  pdf.setFont('helvetica', 'bold');
  pdf.text('薪資單', pageWidth / 2, y, { align: 'center' });
  y += 20;
  
  // 副標題
  pdf.setTextColor(107, 114, 128);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Payroll Statement', pageWidth / 2, y, { align: 'center' });
  y += 25;
  
  // 分隔線
  pdf.setDrawColor(229, 231, 235);
  pdf.setLineWidth(1);
  pdf.line(marginLeft, y, pageWidth - marginRight, y);
  y += 25;
  
  // 基本資訊區塊背景
  pdf.setFillColor(249, 250, 251);
  pdf.rect(marginLeft, y, contentWidth, 55, 'F');
  pdf.setDrawColor(229, 231, 235);
  pdf.rect(marginLeft, y, contentWidth, 55, 'S');
  
  pdf.setTextColor(55, 65, 81);
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`員工姓名：${employeeName}`, marginLeft + 10, y + 20);
  pdf.text(`薪資期間：${record.year} 年 ${record.month} 月`, marginLeft + 200, y + 20);
  pdf.text(`發布日期：${record.publishedAt ? new Date(record.publishedAt).toLocaleDateString('zh-TW') : 'N/A'}`, marginLeft + 10, y + 42);
  pdf.text(`列印日期：${new Date().toLocaleDateString('zh-TW')}`, marginLeft + 200, y + 42);
  y += 70;
  
  // ===== 應發項目 =====
  pdf.setFillColor(16, 185, 129);
  pdf.rect(marginLeft, y, contentWidth, 22, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(13);
  pdf.setFont('helvetica', 'bold');
  pdf.text('應 發 項 目', marginLeft + 10, y + 15);
  y += 35;
  
  const earnings = [
    ['底　　薪', record.baseSalary ?? 0],
    ['加 班 費', record.overtimePay ?? 0],
    ['獎　　金', record.bonusTotal > 0 ? record.bonusTotal : 0],
  ];
  
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(55, 65, 81);
  earnings.forEach(([label, amount]) => {
    pdf.setTextColor(55, 65, 81);
    pdf.text(label as string, marginLeft + 10, y);
    pdf.setTextColor(5, 150, 105);
    pdf.text(`${(amount as number).toLocaleString('zh-TW')} 元`, pageWidth - marginRight - 10, y, { align: 'right' });
    y += lineHeight;
  });
  
  // 應發合計
  const totalEarnings = (record.baseSalary ?? 0) + (record.overtimePay ?? 0) + (record.bonusTotal > 0 ? record.bonusTotal : 0);
  pdf.setDrawColor(16, 185, 129);
  pdf.setLineWidth(1);
  pdf.line(marginLeft + 5, y - 5, pageWidth - marginRight - 5, y - 5);
  pdf.setTextColor(5, 150, 105);
  pdf.setFont('helvetica', 'bold');
  pdf.text('應發合計', marginLeft + 10, y + 10);
  pdf.text(`${totalEarnings.toLocaleString('zh-TW')} 元`, pageWidth - marginRight - 10, y + 10, { align: 'right' });
  y += 40;
	
  // ===== 扣除項目 =====
  pdf.setFillColor(239, 68, 68);
  pdf.rect(marginLeft, y, contentWidth, 22, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(13);
  pdf.setFont('helvetica', 'bold');
  pdf.text('扣 除 項 目', marginLeft + 10, y + 15);
  y += 35;

  const deductions = [
    ['請假扣款', record.leaveDeduction ?? 0],
    ['遲到扣款', record.tardinessDeduction ?? 0],
    ['勞工保險', record.laborInsurance ?? 0],
    ['健康保險', record.healthInsurance ?? 0],
    ['勞工退休金', record.pensionDeduction ?? 0],
  ];

  pdf.setFont('helvetica', 'normal');
  deductions.forEach(([label, amount]) => {
    pdf.setTextColor(55, 65, 81);
    pdf.text(label as string, marginLeft + 10, y);
    pdf.setTextColor(239, 68, 68);
    pdf.text(`- ${(amount as number).toLocaleString('zh-TW')} 元`, pageWidth - marginRight - 10, y, { align: 'right' });
    y += lineHeight;
  });

  // 扣除合計
  const totalDeductions = (record.leaveDeduction ?? 0) + (record.tardinessDeduction ?? 0) +
    (record.laborInsurance ?? 0) + (record.healthInsurance ?? 0) +
    (record.pensionDeduction ?? 0);
  pdf.setDrawColor(239, 68, 68);
  pdf.line(marginLeft + 5, y - 5, pageWidth - marginRight - 5, y - 5);
  pdf.setTextColor(239, 68, 68);
  pdf.setFont('helvetica', 'bold');
  pdf.text('扣除合計', marginLeft + 10, y + 10);
  pdf.text(`- ${totalDeductions.toLocaleString('zh-TW')} 元`, pageWidth - marginRight - 10, y + 10, { align: 'right' });
  y += 50;

  // ===== 實領金額 =====
  pdf.setFillColor(30, 64, 175);
  pdf.rect(marginLeft, y, contentWidth, 45, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('實 領 金 額', marginLeft + 15, y + 28);
  pdf.setFontSize(20);
  pdf.text(`NT$ ${record.finalPay.toLocaleString('zh-TW')} 元`, pageWidth - marginRight - 15, y + 30, { align: 'right' });
  y += 60;

  // 底部分隔線
  pdf.setDrawColor(229, 231, 235);
  pdf.setLineWidth(1);
  pdf.line(marginLeft, y, pageWidth - marginRight, y);
  y += 25;

  // 備註
  pdf.setTextColor(156, 163, 175);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text('以上薪資單由耀聖藥局排班系統產生', pageWidth / 2, y, { align: 'center' });
  y += 15;
  pdf.text(`產生時間：${new Date().toLocaleString('zh-TW')}`, pageWidth / 2, y, { align: 'center' });

  pdf.save(`薪資單_${employeeName}_${record.year}_${record.month}.pdf`);
};
