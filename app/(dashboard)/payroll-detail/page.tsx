"use client";

import { useState, useEffect } from "react";
import { useApp, type PayrollRecord } from "@/lib/context/AppContext";
import { createClient } from "@/lib/supabase/client";
import XLSX from "xlsx-js-style";
import { DollarSign, Download, Calendar, CheckCircle, Clock, AlertCircle } from "lucide-react";

export default function PayrollDetailPage() {
  const { currentUser, payrollRecords, loadPayrollRecords } = useApp();
  const supabase = createClient();
  
  const [salaryConfig, setSalaryConfig] = useState<{ position?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<PayrollRecord | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!currentUser) return;
      setIsLoading(true);
      
      // 載入薪資設定
      const { data: config } = await supabase
        .from("employee_salary_config")
        .select("*")
        .eq("user_id", currentUser.id)
        .single();
      setSalaryConfig(config);
      
      // 載入所有已發布的薪資記錄
      await loadPayrollRecords(new Date().getFullYear() - 1, 1);
      
      setIsLoading(false);
    };
    
    loadData();
  }, [currentUser, supabase, loadPayrollRecords]);

  // 取得當前員工的已發布薪資記錄
  const myPublishedRecords = payrollRecords
    .filter(r => r.userId === currentUser?.id && r.isPublished)
    .sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });

  const currentMonthRecord = myPublishedRecords.find(
    r => r.year === new Date().getFullYear() && r.month === new Date().getMonth() + 1
  );

  const handleViewDetail = (record: PayrollRecord) => {
    setSelectedRecord(record);
    setShowDetailModal(true);
  };

  // 下載薪資單 Excel
  const downloadSalaryExcel = (record: PayrollRecord) => {
    if (!currentUser || !salaryConfig) return;

    const wb = XLSX.utils.book_new();
    
    const wsData = [
      ["薪資單", "", "", ""],
      [`姓名：${currentUser.name}`, "", "", ""],
      [`期間：${record.year}年${record.month}月`, "", "", ""],
      ["", "", "", ""],
      ["項目", "金額", "備註", ""],
      ["底薪", record.baseSalary ?? 0, salaryConfig?.position ?? "", ""],
      ["加班費", record.overtimePay ?? 0, "", ""],
      ["獎金", record.bonusTotal > 0 ? record.bonusTotal : 0, "", ""],
      ["", "", "", ""],
      ["扣除項目", "", "", ""],
      ["請假扣款", record.leaveDeduction ?? 0, "", ""],
      ["遲到扣款", record.tardinessDeduction ?? 0, "", ""],
      ["勞保", record.laborInsurance ?? 0, "", ""],
      ["健保", record.healthInsurance ?? 0, "", ""],
      ["退休金", record.pensionDeduction ?? 0, "", ""],
      ["", "", "", ""],
      ["實領金額", record.finalPay ?? 0, "", ""],
      ["", "", "", ""],
      [`發布日期：${record.publishedAt ? new Date(record.publishedAt).toLocaleDateString('zh-TW') : 'N/A'}`, "", "", ""],
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // 設置列寬
    ws['!cols'] = [
      { wch: 20 },
      { wch: 15 },
      { wch: 20 },
      { wch: 10 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "薪資單");
    XLSX.writeFile(wb, `薪資單_${record.year}年${record.month}月.xlsx`);
  };

  const formatCurrency = (amount: number) => {
    return amount?.toLocaleString('zh-TW', { minimumFractionDigits: 0 }) ?? "0";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-500">載入中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-emerald-600" />
          薪資查詢
        </h1>
      </div>

      {/* 當月薪資預覽 */}
      {currentMonthRecord ? (
        <div className="app-card p-6 bg-gradient-to-br from-emerald-50 to-blue-50 border-emerald-200">
          <div className="flex items-center gap-2 mb-4">
            <span className="bg-emerald-500 text-white text-xs px-2 py-1 rounded-full">本月已發布</span>
            <span className="text-sm text-gray-600">{new Date().getFullYear()}年{new Date().getMonth() + 1}月</span>
          </div>
          
          <div className="text-center mb-4">
            <p className="text-sm text-gray-600 mb-1">實領金額</p>
            <p className="text-4xl font-bold text-emerald-600">
              ${formatCurrency(currentMonthRecord.finalPay)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div className="bg-white/50 rounded-lg p-3">
              <p className="text-gray-500 text-xs">底薪</p>
              <p className="font-medium">${formatCurrency(currentMonthRecord.baseSalary)}</p>
            </div>
            <div className="bg-white/50 rounded-lg p-3">
              <p className="text-gray-500 text-xs">加班費</p>
              <p className="font-medium text-green-600">+${formatCurrency(currentMonthRecord.overtimePay)}</p>
            </div>
            <div className="bg-white/50 rounded-lg p-3">
              <p className="text-gray-500 text-xs">請假扣款</p>
              <p className="font-medium text-red-500">-${formatCurrency(currentMonthRecord.leaveDeduction)}</p>
            </div>
            <div className="bg-white/50 rounded-lg p-3">
              <p className="text-gray-500 text-xs">遲到扣款</p>
              <p className="font-medium text-red-500">-${formatCurrency(currentMonthRecord.tardinessDeduction)}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => handleViewDetail(currentMonthRecord)}
              className="flex-1 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              查看詳細
            </button>
            <button
              onClick={() => downloadSalaryExcel(currentMonthRecord)}
              className="flex items-center gap-2 px-4 py-2 border border-emerald-600 text-emerald-600 rounded-lg hover:bg-emerald-50 transition-colors"
            >
              <Download className="h-4 w-4" />
              下載
            </button>
          </div>
        </div>
      ) : (
        <div className="app-card p-6 text-center text-gray-500">
          <AlertCircle className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p>本月薪資尚未發布</p>
          <p className="text-sm mt-1">請耐心等候，或聯繫管理員</p>
        </div>
      )}

      {/* 歷史薪資記錄 */}
      <div className="app-card">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-gray-500" />
            歷史薪資記錄
          </h2>
        </div>
        
        {myPublishedRecords.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            尚無歷史薪資記錄
          </div>
        ) : (
          <div className="divide-y">
            {myPublishedRecords
              .filter(r => !(r.year === new Date().getFullYear() && r.month === new Date().getMonth() + 1))
              .map((record) => (
                <div key={record.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                  <div>
                    <p className="font-medium text-gray-900">
                      {record.year}年{record.month}月
                    </p>
                    <p className="text-sm text-gray-500">
                      實領 ${formatCurrency(record.finalPay)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3 text-emerald-500" />
                      已發布
                    </span>
                    <button
                      onClick={() => handleViewDetail(record)}
                      className="text-xs text-blue-600 hover:text-blue-700"
                    >
                      詳細
                    </button>
                    <button
                      onClick={() => downloadSalaryExcel(record)}
                      className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* 詳細薪資 Modal */}
      {showDetailModal && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
              <h3 className="font-bold text-gray-900">
                {selectedRecord.year}年{selectedRecord.month}月 薪資明細
              </h3>
              <button onClick={() => setShowDetailModal(false)} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              {/* 應發項目 */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  應發項目
                </h4>
                <div className="space-y-2 pl-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">底薪</span>
                    <span className="font-medium">${formatCurrency(selectedRecord.baseSalary)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">加班費</span>
                    <span className="font-medium text-green-600">+${formatCurrency(selectedRecord.overtimePay)}</span>
                  </div>
                  {selectedRecord.bonusTotal > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">獎金</span>
                      <span className="font-medium text-green-600">+${formatCurrency(selectedRecord.bonusTotal)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 扣除項目 */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                  扣除項目
                </h4>
                <div className="space-y-2 pl-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">請假扣款</span>
                    <span className="font-medium text-red-500">-${formatCurrency(selectedRecord.leaveDeduction)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">遲到扣款</span>
                    <span className="font-medium text-red-500">-${formatCurrency(selectedRecord.tardinessDeduction)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">勞保</span>
                    <span className="font-medium text-red-500">-${formatCurrency(selectedRecord.laborInsurance)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">健保</span>
                    <span className="font-medium text-red-500">-${formatCurrency(selectedRecord.healthInsurance)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">退休金</span>
                    <span className="font-medium text-red-500">-${formatCurrency(selectedRecord.pensionDeduction)}</span>
                  </div>
                </div>
              </div>

              {/* 實領金額 */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-900">實領金額</span>
                  <span className="text-xl font-bold text-emerald-600">
                    ${formatCurrency(selectedRecord.finalPay)}
                  </span>
                </div>
              </div>

              {/* 發布資訊 */}
              <div className="text-xs text-gray-400 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                發布於 {selectedRecord.publishedAt ? new Date(selectedRecord.publishedAt).toLocaleString('zh-TW') : 'N/A'}
              </div>
            </div>

            <div className="p-4 border-t bg-gray-50">
              <button
                onClick={() => downloadSalaryExcel(selectedRecord)}
                className="w-full py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
              >
                <Download className="h-4 w-4" />
                下載薪資單 Excel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
