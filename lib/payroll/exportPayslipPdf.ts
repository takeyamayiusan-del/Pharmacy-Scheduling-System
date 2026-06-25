import { jsPDF } from "jspdf";
import { type PayrollRecord } from "@/lib/context/AppContext";

export const exportPayslipPdf = (record: PayrollRecord, employeeName: string) => {
  // 使用 Canvas 繪製再轉 PDF（確保中文正常顯示）
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const width = 595; // A4 width in points
  const height = 842; // A4 height in points
  
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;
  ctx.scale(scale, scale);
  ctx.textBaseline = 'top';
  
  // 背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  
  let y = 30;
  
  // 頂部裝飾線
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(20, y);
  ctx.lineTo(width - 20, y);
  ctx.stroke();
  y += 20;
  
  // 標題
  ctx.fillStyle = '#059669';
  ctx.font = 'bold 32px "Microsoft JhengHei", "PingFang TC", "Heiti TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('薪資單', width / 2, y);
  y += 25;
  
  // 副標題
  ctx.fillStyle = '#6b7280';
  ctx.font = '16px "Microsoft JhengHei", "PingFang TC", "Heiti TC", sans-serif';
  ctx.fillText('Payroll Statement', width / 2, y);
  y += 25;
  
  // 分隔線
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(20, y);
  ctx.lineTo(width - 20, y);
  ctx.stroke();
  y += 25;
  
  // 基本資訊區塊
  ctx.fillStyle = '#f9fafb';
  ctx.fillRect(20, y, width - 40, 60);
  ctx.strokeStyle = '#e5e7eb';
  ctx.strokeRect(20, y, width - 40, 60);
  
  ctx.fillStyle = '#374151';
  ctx.font = '14px "Microsoft JhengHei", "PingFang TC", "Heiti TC", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`員工姓名：${employeeName}`, 30, y + 20);
  ctx.fillText(`薪資期間：${record.year} 年 ${record.month} 月`, 320, y + 20);
  ctx.fillText(`發布日期：${record.publishedAt ? new Date(record.publishedAt).toLocaleDateString('zh-TW') : 'N/A'}`, 30, y + 42);
  ctx.fillText(`列印日期：${new Date().toLocaleDateString('zh-TW')}`, 320, y + 42);
  y += 80;
  
  // ===== 應發項目 =====
  ctx.fillStyle = '#10b981';
  ctx.fillRect(20, y, width - 40, 20);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px "Microsoft JhengHei", "PingFang TC", "Heiti TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('應 發 項 目', 30, y + 14);
  y += 30;
  
  const earnings = [
    ['底　　薪', record.baseSalary ?? 0],
    ['加 班 費', record.overtimePay ?? 0],
    ['獎　　金', record.bonusTotal > 0 ? record.bonusTotal : 0],
  ];
  
  ctx.textAlign = 'left';
  ctx.font = '14px "Microsoft JhengHei", "PingFang TC", "Heiti TC", sans-serif';
  earnings.forEach(([label, amount]) => {
    if (y > height - 80) return; // 防止超出頁面
    ctx.fillStyle = '#374151';
    ctx.fillText(label as string, 30, y);
    ctx.fillStyle = '#059669';
    ctx.textAlign = 'right';
    ctx.fillText(`${(amount as number).toLocaleString('zh-TW')} 元`, width - 30, y);
    ctx.textAlign = 'left';
    y += 20;
  });
  
  // 應發合計
  const totalEarnings = (record.baseSalary ?? 0) + (record.overtimePay ?? 0) + (record.bonusTotal > 0 ? record.bonusTotal : 0);
  ctx.strokeStyle = '#10b981';
  ctx.beginPath();
  ctx.moveTo(25, y - 5);
  ctx.lineTo(width - 25, y - 5);
  ctx.stroke();
  ctx.fillStyle = '#059669';
  ctx.font = 'bold 14px "Microsoft JhengHei", "PingFang TC", "Heiti TC", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('應發合計', 30, y + 8);
  ctx.textAlign = 'right';
  ctx.fillText(`${totalEarnings.toLocaleString('zh-TW')} 元`, width - 30, y + 8);
  ctx.textAlign = 'left';
  y += 35;

  // ===== 扣除項目 =====
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(20, y, width - 40, 20);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px "Microsoft JhengHei", "PingFang TC", "Heiti TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('扣 除 項 目', 30, y + 14);
  y += 30;

  const deductions = [
    ['請假扣款', record.leaveDeduction ?? 0],
    ['遲到扣款', record.tardinessDeduction ?? 0],
    ['勞工保險', record.laborInsurance ?? 0],
    ['健康保險', record.healthInsurance ?? 0],
    ['勞工退休金', record.pensionDeduction ?? 0],
  ];

  ctx.textAlign = 'left';
  ctx.font = '14px "Microsoft JhengHei", "PingFang TC", "Heiti TC", sans-serif';
  deductions.forEach(([label, amount]) => {
    if (y > height - 80) return;
    ctx.fillStyle = '#374151';
    ctx.fillText(label as string, 30, y);
    ctx.fillStyle = '#ef4444';
    ctx.textAlign = 'right';
    ctx.fillText(`- ${(amount as number).toLocaleString('zh-TW')} 元`, width - 30, y);
    ctx.textAlign = 'left';
    y += 20;
  });

  // 扣除合計
  const totalDeductions = (record.leaveDeduction ?? 0) + (record.tardinessDeduction ?? 0) +
    (record.laborInsurance ?? 0) + (record.healthInsurance ?? 0) +
    (record.pensionDeduction ?? 0);
  ctx.strokeStyle = '#ef4444';
  ctx.beginPath();
  ctx.moveTo(25, y - 5);
  ctx.lineTo(width - 25, y - 5);
  ctx.stroke();
  ctx.fillStyle = '#ef4444';
  ctx.font = 'bold 14px "Microsoft JhengHei", "PingFang TC", "Heiti TC", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('扣除合計', 30, y + 8);
  ctx.textAlign = 'right';
  ctx.fillText(`- ${totalDeductions.toLocaleString('zh-TW')} 元`, width - 30, y + 8);
  ctx.textAlign = 'left';
  y += 40;

  // ===== 實領金額 =====
  ctx.fillStyle = '#1e40af';
  ctx.fillRect(20, y, width - 40, 40);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px "Microsoft JhengHei", "PingFang TC", "Heiti TC", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('實 領 金 額', 30, y + 14);
  ctx.textAlign = 'right';
  ctx.fillText(`$${record.finalPay.toLocaleString('zh-TW')} 元`, width - 30, y + 14);
  ctx.textAlign = 'left';
  y += 60;

  // 底部分隔線
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(20, y);
  ctx.lineTo(width - 20, y);
  ctx.stroke();
  y += 20;

  // 備註
  ctx.fillStyle = '#9ca3af';
  ctx.font = '12px "Microsoft JhengHei", "PingFang TC", "Heiti TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('以上薪資單由耀聖藥局排班系統產生', width / 2, y);

  // 轉換為 PDF
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('portrait', 'pt', 'a4');
  pdf.addImage(imgData, 'PNG', 0, 0, width, height);
  pdf.save(`薪資單_${employeeName}_${record.year}_${record.month}.pdf`);
};
