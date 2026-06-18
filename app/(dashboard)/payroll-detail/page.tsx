"use client";

import { useState, useEffect } from "react";
import { useApp, type PayrollRecord } from "@/lib/context/AppContext";
import { createClient } from "@/lib/supabase/client";
import { jsPDF } from "jspdf";
import { DollarSign, Download, Calendar, CheckCircle, Clock, AlertCircle } from "lucide-react";

// 載入中文字體
let fontBase64: string | null = null;
let fontLoadPromise: Promise<string | null> | null = null;

const loadFont = async () => {
  if (fontBase64) return fontBase64;
  if (fontLoadPromise) return fontLoadPromise;
  
  fontLoadPromise = (async () => {
    try {
      console.log('Loading font from /fonts/NotoSansTC-Regular.ttf');
      const response = await fetch('/fonts/NotoSansTC-Regular.ttf');
      console.log('Font fetch status:', response.status);
      if (!response.ok) {
        console.error('Font fetch failed:', response.status);
        return null;
      }
      const buffer = await response.arrayBuffer();
      console.log('Font buffer size:', buffer.byteLength);
      const binary = Array.from(new Uint8Array(buffer)).map(b => String.fromCharCode(b)).join('');
      fontBase64 = btoa(binary);
      console.log('Font loaded successfully, base64 size:', fontBase64.length);
      return fontBase64;
    } catch (e) {
      console.error('Failed to load font:', e);
      return null;
    }
  })();
  
  return fontLoadPromise;
};

export default function PayrollDetailPage() {
  const { currentUser, payrollRecords, setPayrollRecords } = useApp();
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

      // 一次性載入該員工所有已發布的薪資記錄
      const { data: records } = await supabase
        .from("payroll_records")
        .select("*")
        .eq("user_id", currentUser.id)
        .eq("is_published", true)
        .order("year", { ascending: false })
        .order("month", { ascending: false });

      if (records) {
        const mapped = records.map((r) => ({
          id: r.id,
          userId: r.user_id,
          year: r.year,
          month: r.month,
          baseSalary: Number(r.base_salary),
          laborInsurance: Number(r.labor_insurance),
          healthInsurance: Number(r.health_insurance),
          pensionDeduction: Number(r.pension_deduction),
          leaveDeduction: Number(r.leave_deduction),
          overtimePay: Number(r.overtime_pay),
          tardinessDeduction: Number(r.tardiness_deduction),
          bonusTotal: Number(r.bonus_total),
          finalPay: Number(r.final_pay),
          note: r.note,
          isPublished: r.is_published,
          publishedAt: r.published_at,
          createdAt: r.created_at,
        }));
        // 直接更新 payrollRecords
        mapped.forEach((r) => {
          setPayrollRecords((prev) => {
            const exists = prev.find((p) => p.id === r.id);
            if (exists) {
              return prev.map((p) => (p.id === r.id ? r : p));
            }
            return [...prev, r];
          });
        });
      }

      setIsLoading(false);
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, supabase]);

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

  // 下載薪資單 PDF
  const downloadSalaryPDF = async (record: PayrollRecord) => {
    if (!currentUser) return;

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal?.pageSize?.getWidth() ?? 210;
      const pageHeight = doc.internal?.pageSize?.getHeight() ?? 297;
      const margin = 20;
      let y = margin;

      // 載入中文字體
      let fontLoaded = false;
      const fontData = await loadFont();
      if (fontData) {
        try {
          doc.addFileToVFS('NotoSansTC-Regular.ttf', fontData);
          doc.addFont('NotoSansTC-Regular.ttf', 'NotoSansTC', 'normal');
          doc.addFont('NotoSansTC-Regular.ttf', 'NotoSansTC', 'bold');
          fontLoaded = true;
        } catch (fontErr) {
          console.error('Font add error:', fontErr);
        }
      }

      const fontName = fontLoaded ? "NotoSansTC" : "helvetica";

      // 頂部裝飾線
      doc.setDrawColor(16, 185, 129);
      doc.setLineWidth(2);
      doc.line(margin, y, pageWidth - margin, y);
      y += 10;

      // 標題
      doc.setFont(fontName, "bold");
      doc.setFontSize(24);
      doc.setTextColor(5, 150, 105);
      doc.text("薪資單", pageWidth / 2, y, { align: "center" });
      y += 15;

      // 副標題
      doc.setFont(fontName, "normal");
      doc.setFontSize(12);
      doc.setTextColor(107, 114, 128);
      doc.text("Payroll Statement", pageWidth / 2, y, { align: "center" });
      y += 15;

      // 分隔線
      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageWidth - margin, y);
      y += 15;

      // 基本資訊區塊
      doc.setFillColor(249, 250, 251);
      doc.roundedRect(margin, y, pageWidth - 2 * margin, 35, 3, 3, "F");
      
      doc.setFontSize(10);
      doc.setTextColor(55, 65, 81);
      doc.text(`員工姓名：${currentUser.name}`, margin + 5, y + 10);
      doc.text(`職　　稱：${salaryConfig?.position || '員工'}`, margin + 5, y + 20);
      doc.text(`薪資期間：${record.year} 年 ${record.month} 月`, margin + 100, y + 10);
      doc.text(`發布日期：${record.publishedAt ? new Date(record.publishedAt).toLocaleDateString('zh-TW') : 'N/A'}`, margin + 100, y + 20);
      y += 45;

      // ===== 應發項目 =====
      doc.setFillColor(16, 185, 129);
      doc.roundedRect(margin, y, pageWidth - 2 * margin, 10, 2, 2, "F");
      doc.setFont(fontName, "bold");
      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      doc.text("應 發 項 目", margin + 5, y + 7);
      y += 15;

      const earnings = [
        ["底　　薪", record.baseSalary ?? 0],
        ["加 班 費", record.overtimePay ?? 0],
        ["獎　　金", record.bonusTotal > 0 ? record.bonusTotal : 0],
      ];

      doc.setFont(fontName, "normal");
      doc.setFontSize(10);
      earnings.forEach(([label, amount]) => {
        doc.setTextColor(55, 65, 81);
        doc.text(label as string, margin + 5, y);
        doc.setTextColor(5, 150, 105);
        doc.text(`${(amount as number).toLocaleString('zh-TW')} 元`, pageWidth - margin - 5, y, { align: "right" });
        y += 10;
      });

      // 應發合計
      const totalEarnings = (record.baseSalary ?? 0) + (record.overtimePay ?? 0) + (record.bonusTotal > 0 ? record.bonusTotal : 0);
      doc.setFont(fontName, "bold");
      doc.setDrawColor(16, 185, 129);
      doc.setLineWidth(0.5);
      doc.line(margin + 5, y - 3, pageWidth - margin - 5, y - 3);
      doc.setTextColor(5, 150, 105);
      doc.text("應發合計", margin + 5, y + 3);
      doc.text(`${totalEarnings.toLocaleString('zh-TW')} 元`, pageWidth - margin - 5, y + 3, { align: "right" });
      y += 15;

      // ===== 扣除項目 =====
      doc.setFillColor(239, 68, 68);
      doc.roundedRect(margin, y, pageWidth - 2 * margin, 10, 2, 2, "F");
      doc.setFont(fontName, "bold");
      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      doc.text("扣 除 項 目", margin + 5, y + 7);
      y += 15;

      const deductions = [
        ["請假扣款", record.leaveDeduction ?? 0],
        ["遲到扣款", record.tardinessDeduction ?? 0],
        ["勞工保險", record.laborInsurance ?? 0],
        ["健康保險", record.healthInsurance ?? 0],
        ["勞工退休金", record.pensionDeduction ?? 0],
      ];

      doc.setFont(fontName, "normal");
      doc.setFontSize(10);
      deductions.forEach(([label, amount]) => {
        doc.setTextColor(55, 65, 81);
        doc.text(label as string, margin + 5, y);
        doc.setTextColor(239, 68, 68);
        doc.text(`- ${(amount as number).toLocaleString('zh-TW')} 元`, pageWidth - margin - 5, y, { align: "right" });
        y += 10;
      });

      // 扣除合計
      const totalDeductions = (record.leaveDeduction ?? 0) + (record.tardinessDeduction ?? 0) + 
                             (record.laborInsurance ?? 0) + (record.healthInsurance ?? 0) + 
                             (record.pensionDeduction ?? 0);
      doc.setFont(fontName, "bold");
      doc.setDrawColor(239, 68, 68);
      doc.setLineWidth(0.5);
      doc.line(margin + 5, y - 3, pageWidth - margin - 5, y - 3);
      doc.setTextColor(239, 68, 68);
      doc.text("扣除合計", margin + 5, y + 3);
      doc.text(`- ${totalDeductions.toLocaleString('zh-TW')} 元`, pageWidth - margin - 5, y + 3, { align: "right" });
      y += 20;

      // ===== 實領金額 =====
      doc.setFillColor(5, 150, 105);
      doc.roundedRect(margin, y, pageWidth - 2 * margin, 20, 3, 3, "F");
      doc.setFont(fontName, "bold");
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.text("實 領 金 額", margin + 10, y + 8);
      doc.setFontSize(18);
      doc.text(`NT$ ${(record.finalPay ?? 0).toLocaleString('zh-TW')} 元`, pageWidth - margin - 10, y + 13, { align: "right" });
      y += 30;

      // 底部裝飾線
      doc.setDrawColor(16, 185, 129);
      doc.setLineWidth(2);
      doc.line(margin, y, pageWidth - margin, y);
      y += 10;

      // 備註
      if (record.note) {
        doc.setFont(fontName, "normal");
        doc.setFontSize(9);
        doc.setTextColor(107, 114, 128);
        doc.text(`備註：${record.note}`, margin, y);
        y += 10;
      }

      // 頁尾
      doc.setFontSize(8);
      doc.setTextColor(156, 163, 175);
      doc.text("本薪資單由系統自動產生，如有任何疑問請聯繫管理人員。", pageWidth / 2, pageHeight - 15, { align: "center" });
      doc.text(`產生時間：${new Date().toLocaleString('zh-TW')}`, pageWidth / 2, pageHeight - 10, { align: "center" });

      // 下載
      console.log('Generating PDF...');
      doc.save(`薪資單_${record.year}年${record.month}月.pdf`);
      console.log('PDF saved');
    } catch (err) {
      console.error('PDF generation error:', err);
      const errorMessage = err instanceof Error ? err.message : '未知錯誤';
      alert(`PDF 生成失敗：${errorMessage}`);
    }
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
              onClick={() => downloadSalaryPDF(currentMonthRecord)}
              className="flex items-center gap-2 px-4 py-2 border border-emerald-600 text-emerald-600 rounded-lg hover:bg-emerald-50 transition-colors"
            >
              <Download className="h-4 w-4" />
              下載 PDF
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
                      onClick={() => downloadSalaryPDF(record)}
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
                onClick={() => downloadSalaryPDF(selectedRecord)}
                className="w-full py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
              >
                <Download className="h-4 w-4" />
                下載薪資單 PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
