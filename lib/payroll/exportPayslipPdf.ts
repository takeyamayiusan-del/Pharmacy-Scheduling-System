import { jsPDF } from "jspdf";
import { type PayrollRecord } from "@/lib/context/AppContext";

export const exportPayslipPdf = (record: PayrollRecord, employeeName: string) => {
  const doc = new jsPDF();
  
  // 由於瀏覽器端 jsPDF 對中文字體支援需要額外配置，這裡使用基礎字體並儘量以結構化展示
  // 在實際生產環境中，建議加載 NotoSansTC 等中文字體
  
  const title = `Pharmacy Payroll - ${record.year}/${record.month}`;
  doc.setFontSize(20);
  doc.text(title, 105, 20, { align: "center" });
  
  doc.setFontSize(12);
  doc.text(`Employee: ${employeeName}`, 20, 40);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 150, 40);
  
  doc.line(20, 45, 190, 45);
  
  // 薪資項目
  let y = 60;
  const lineHeight = 10;
  
  const items = [
    ["Base Salary", record.baseSalary],
    ["Labor Insurance", -record.laborInsurance],
    ["Health Insurance", -record.healthInsurance],
    ["Pension Deduction", -record.pensionDeduction],
    ["Leave Deduction", -record.leaveDeduction],
    ["Overtime Pay", record.overtimePay],
    ["Tardiness Deduction", -record.tardinessDeduction],
    ["Bonus/Adjustments", record.bonusTotal],
  ];
  
  items.forEach(([label, value]) => {
    doc.text(label as string, 30, y);
    doc.text(`$${(value as number).toLocaleString()}`, 170, y, { align: "right" });
    y += lineHeight;
  });
  
  doc.line(20, y, 190, y);
  y += lineHeight;
  
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Net Pay", 30, y);
  doc.text(`$${record.finalPay.toLocaleString()}`, 170, y, { align: "right" });
  
  doc.save(`Payslip_${employeeName}_${record.year}_${record.month}.pdf`);
};
