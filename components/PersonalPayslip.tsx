"use client";

import { useApp } from "@/lib/context/AppContext";
import { CreditCard, Download, FileText } from "lucide-react";
import { exportPayslipPdf } from "@/lib/payroll/exportPayslipPdf";

export default function PersonalPayslip() {
  const { currentUser, payrollRecords } = useApp();

  if (!currentUser) return null;

  // 獲取最新發布的薪資單
  const latestPublished = payrollRecords
    .filter(r => r.userId === currentUser.id && r.isPublished)
    .sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    })[0];

  if (!latestPublished) return null;

  const handleDownload = (): void => {
    exportPayslipPdf(latestPublished, currentUser.name);
  };

  return (
    <div className="app-card p-4 border-emerald-100 bg-emerald-50/30">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-emerald-600" />
          最新薪資單發布
        </h3>
        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
          {latestPublished.year} 年 {latestPublished.month} 月
        </span>
      </div>
      
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">實領薪資</p>
          <p className="text-2xl font-mono font-bold text-emerald-700">
            ${latestPublished.finalPay.toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            className="flex items-center gap-1 px-3 py-2 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Download className="h-3.5 w-3.5" />
            下載明細
          </button>
        </div>
      </div>
      
      <p className="mt-3 text-[10px] text-gray-400 flex items-center gap-1">
        <FileText className="h-3 w-3" />
        發布時間：{new Date(latestPublished.publishedAt!).toLocaleString()}
      </p>
    </div>
  );
}
