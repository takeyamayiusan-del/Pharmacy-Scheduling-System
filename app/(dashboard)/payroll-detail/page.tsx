"use client";

import { useState, useEffect } from "react";
import { useApp, type PayrollRecord } from "@/lib/context/AppContext";
import { createClient } from "@/lib/supabase/client";
import { DollarSign, Download, Calendar, CheckCircle, Clock, AlertCircle, FileSpreadsheet } from "lucide-react";
import { exportPayslipPdf } from "@/lib/payroll/exportPayslipPdf";
import { exportPersonalPayslipExcel } from "@/lib/payroll/exportPersonalPayslipExcel";
import { computeMonthlyAttendanceHours, getDefaultPayrollPeriod } from "@/lib/payroll/monthlyHours";

type SalaryMeta = {
  position: string;
  bankAccount: string;
  payDate: string;
  hourlyRate: number;
  companyPensionRate: number;
  companyPensionBase: number;
  unionFee: number;
};

function mapRecord(r: Record<string, unknown>): PayrollRecord {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    year: Number(r.year),
    month: Number(r.month),
    baseSalary: Number(r.base_salary),
    laborInsurance: Number(r.labor_insurance),
    healthInsurance: Number(r.health_insurance),
    pensionDeduction: Number(r.pension_deduction),
    leaveDeduction: Number(r.leave_deduction),
    overtimePay: Number(r.overtime_pay),
    tardinessDeduction: Number(r.tardiness_deduction),
    bonusTotal: Number(r.bonus_total),
    positionGradeTotal: Number(r.position_grade_total ?? 0),
    fixedAllowanceTotal: Number(r.fixed_allowance_total ?? 0),
    fullAttendancePay: Number(r.full_attendance_pay ?? 0),
    finalPay: Number(r.final_pay),
    note: r.note ? String(r.note) : undefined,
    isPublished: Boolean(r.is_published),
    publishedAt: r.published_at ? String(r.published_at) : undefined,
    createdAt: String(r.created_at),
  };
}

export default function PayrollDetailPage() {
  const {
    currentUser,
    payrollRecords,
    setPayrollRecords,
    overtimeRequests,
    leaveRequests,
    tardinessRecords,
    getShiftForDate,
    getHolidayInfo,
    shiftTimeConfig,
    storeConfig,
  } = useApp();
  const supabase = createClient();

  const [isLoading, setIsLoading] = useState(true);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<PayrollRecord | null>(null);
  const [salaryMeta, setSalaryMeta] = useState<SalaryMeta | null>(null);

  // 隔月發薪：上方以「上個月」為主（與結算預設期間一致）
  const payrollPeriod = getDefaultPayrollPeriod();

  useEffect(() => {
    const loadData = async () => {
      if (!currentUser) return;
      setIsLoading(true);

      const [{ data: records }, { data: cfg }] = await Promise.all([
        supabase
          .from("payroll_records")
          .select("*")
          .eq("user_id", currentUser.id)
          .eq("is_published", true)
          .order("year", { ascending: false })
          .order("month", { ascending: false }),
        supabase.from("employee_salary_config").select("*").eq("user_id", currentUser.id).maybeSingle(),
      ]);

      if (records) {
        const mapped = records.map((r) => mapRecord(r as Record<string, unknown>));
        mapped.forEach((rec) => {
          setPayrollRecords((prev) => {
            const exists = prev.find((p) => p.id === rec.id);
            if (exists) return prev.map((p) => (p.id === rec.id ? rec : p));
            return [...prev, rec];
          });
        });
      }

      if (cfg) {
        setSalaryMeta({
          position: cfg.position ?? "",
          bankAccount: cfg.bank_account ?? "",
          payDate: cfg.pay_date ?? "",
          hourlyRate: Number(cfg.hourly_rate ?? 0),
          companyPensionRate: Number(cfg.company_pension_rate ?? 6),
          companyPensionBase: Number(cfg.company_pension_base ?? 0),
          unionFee: Number(cfg.union_fee ?? 0),
        });
      }

      setIsLoading(false);
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, supabase]);

  const myPublishedRecords = payrollRecords
    .filter((r) => r.userId === currentUser?.id && r.isPublished)
    .sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });

  const lastMonthRecord = myPublishedRecords.find(
    (r) => r.year === payrollPeriod.year && r.month === payrollPeriod.month
  );
  // 若上個月尚未發布，上方改顯示「最近一期」避免空白
  const featuredRecord = lastMonthRecord ?? myPublishedRecords[0] ?? null;
  const featuredIsLastMonth = Boolean(lastMonthRecord);

  const historyRecords = myPublishedRecords.filter((r) => r.id !== featuredRecord?.id);

  const handleViewDetail = (record: PayrollRecord) => {
    setSelectedRecord(record);
    setShowDetailModal(true);
  };

  const downloadExcel = (record: PayrollRecord) => {
    if (!currentUser) return;
    try {
      exportPersonalPayslipExcel(record, {
        employeeName: currentUser.name,
        position: salaryMeta?.position,
        bankAccount: salaryMeta?.bankAccount,
        payDate: salaryMeta?.payDate || "隔月5日",
        hourlyRate: salaryMeta?.hourlyRate,
        companyPensionRate: salaryMeta?.companyPensionRate,
        companyPensionBase: salaryMeta?.companyPensionBase,
        unionFee: salaryMeta?.unionFee,
      });
    } catch (err) {
      console.error(err);
      alert("Excel 匯出失敗");
    }
  };

  const downloadPdf = async (record: PayrollRecord) => {
    if (!currentUser) return;
    try {
      await exportPayslipPdf(record, currentUser.name);
    } catch (err) {
      console.error(err);
      alert("PDF 生成失敗");
    }
  };

  const formatCurrency = (amount: number) =>
    amount?.toLocaleString("zh-TW", { minimumFractionDigits: 0 }) ?? "0";

  const earningsExtra = (r: PayrollRecord) => {
    const grade = Number(r.positionGradeTotal ?? 0);
    const fixed = Number(r.fixedAllowanceTotal ?? 0);
    const fa = Number(r.fullAttendancePay ?? 0);
    const rawBonus = Number(r.bonusTotal ?? 0);
    const otherBonus = Math.max(0, rawBonus - fixed);
    return { grade, fixed, fa, otherBonus };
  };

  const buildFormulaMeta = (record: PayrollRecord) => {
    if (!currentUser) {
      return {
        overtimeHours: 0,
        leaveDeductionHours: 0,
        tardinessMinutes: 0,
        leaveTypes: [] as string[],
      };
    }
    const monthStart = `${record.year}-${String(record.month).padStart(2, "0")}-01`;
    const monthEnd = `${record.year}-${String(record.month).padStart(2, "0")}-${String(
      new Date(record.year, record.month, 0).getDate()
    ).padStart(2, "0")}`;

    const attendance = computeMonthlyAttendanceHours({
      employeeId: currentUser.id,
      year: record.year,
      month: record.month,
      getShiftForDate,
      getHolidayInfo,
      shiftTimeConfig,
      leaveRequests,
      overtimeRequests,
      storeConfig,
    });
    const overtimeHours = Math.round(
      (attendance.overtimePayHours + attendance.holidayOvertimeHours) * 100
    ) / 100;

    const tardinessMinutes = tardinessRecords
      .filter(
        (t) =>
          t.employeeId === currentUser.id &&
          t.date >= monthStart &&
          t.date <= monthEnd
      )
      .reduce((sum, t) => sum + (t.minutes || 0), 0);

    const leaveTypes = Array.from(
      new Set(
        leaveRequests
          .filter(
            (req) =>
              req.employeeId === currentUser.id &&
              req.status === "approved" &&
              req.startDate <= monthEnd &&
              req.endDate >= monthStart
          )
          .map((req) => req.type)
      )
    );

    return {
      overtimeHours,
      leaveDeductionHours: Math.round(attendance.leaveDeductionHours * 100) / 100,
      tardinessMinutes,
      leaveTypes,
    };
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
      <div className="app-toolbar">
        <h1 className="app-page-title flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-emerald-600" />
          薪資查詢
        </h1>
      </div>

      {featuredRecord ? (
        <div className="app-card p-6 bg-gradient-to-br from-emerald-50/90 to-sky-50/80 border-emerald-200/80">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="bg-emerald-500 text-white text-xs px-2.5 py-1 rounded-full font-medium">
              {featuredIsLastMonth ? "上個月薪水" : "最近一期薪水"}
            </span>
            <span className="text-sm text-slate-600">
              {featuredRecord.year}年{featuredRecord.month}月
            </span>
            <span className="text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">已發布</span>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            隔月發薪（通常次月 5 日）· 上方顯示上個月所屬薪資
            {!featuredIsLastMonth
              ? ` · ${payrollPeriod.year}年${payrollPeriod.month}月尚未發布，改顯示最近一期`
              : ""}
          </p>

          <div className="text-center mb-4">
            <p className="text-sm text-slate-600 mb-1">總薪資</p>
            <p className="text-4xl font-semibold tracking-tight text-emerald-600">
              ${formatCurrency(featuredRecord.finalPay)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm mb-4">
            <div className="bg-white/50 rounded-lg p-3">
              <p className="text-gray-500 text-xs">底薪（合約）</p>
              <p className="font-medium">${formatCurrency(featuredRecord.baseSalary)}</p>
            </div>
            <div className="bg-white/50 rounded-lg p-3">
              <p className="text-gray-500 text-xs">職位加級</p>
              <p className="font-medium text-green-700">
                +${formatCurrency(featuredRecord.positionGradeTotal ?? 0)}
              </p>
            </div>
            <div className="bg-white/50 rounded-lg p-3">
              <p className="text-gray-500 text-xs">固定津貼／獎金</p>
              <p className="font-medium text-green-700">
                +${formatCurrency(featuredRecord.fixedAllowanceTotal ?? 0)}
              </p>
            </div>
            <div className="bg-white/50 rounded-lg p-3">
              <p className="text-gray-500 text-xs">加班費</p>
              <p className="font-medium text-green-600">+${formatCurrency(featuredRecord.overtimePay)}</p>
            </div>
            <div className="bg-white/50 rounded-lg p-3">
              <p className="text-gray-500 text-xs">請假＋遲到扣</p>
              <p className="font-medium text-red-500">
                -$
                {formatCurrency(
                  (featuredRecord.leaveDeduction ?? 0) + (featuredRecord.tardinessDeduction ?? 0)
                )}
              </p>
            </div>
            <div className="bg-white/50 rounded-lg p-3">
              <p className="text-gray-500 text-xs">勞健退合計</p>
              <p className="font-medium text-red-500">
                -$
                {formatCurrency(
                  (featuredRecord.laborInsurance ?? 0) +
                    (featuredRecord.healthInsurance ?? 0) +
                    (featuredRecord.pensionDeduction ?? 0)
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => handleViewDetail(featuredRecord)}
              className="flex-1 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              查看詳細
            </button>
            <button
              onClick={() => downloadExcel(featuredRecord)}
              className="flex items-center justify-center gap-2 px-4 py-2 border border-emerald-600 text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4" />
              下載個人 Excel
            </button>
            <button
              onClick={() => downloadPdf(featuredRecord)}
              className="flex items-center justify-center gap-2 px-4 py-2 border text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="h-4 w-4" />
              PDF
            </button>
          </div>
        </div>
      ) : (
        <div className="app-card p-6 text-center text-gray-500">
          <AlertCircle className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-700">上個月薪水尚未發布</p>
          <p className="text-sm mt-1">
            {payrollPeriod.year}年{payrollPeriod.month}月 · 通常隔月 5 號發薪
          </p>
          <p className="text-sm mt-1">請耐心等候，或聯繫管理員</p>
        </div>
      )}

      <div className="app-card">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-gray-500" />
            歷史薪資記錄
          </h2>
        </div>

        {historyRecords.length === 0 ? (
          <div className="p-6 text-center text-gray-500">尚無其他歷史薪資記錄</div>
        ) : (
          <div className="divide-y">
            {historyRecords.map((record) => (
              <div key={record.id} className="p-4 flex items-center justify-between hover:bg-gray-50 gap-2">
                <div>
                  <p className="font-medium text-gray-900">
                    {record.year}年{record.month}月
                  </p>
                  <p className="text-sm text-gray-500">實領 ${formatCurrency(record.finalPay)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
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
                    onClick={() => downloadExcel(record)}
                    className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded"
                    title="下載個人 Excel"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => downloadPdf(record)}
                    className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded"
                    title="下載 PDF"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showDetailModal && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="app-panel shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-bold text-gray-900">
                  {selectedRecord.year}年{selectedRecord.month}月 薪資明細
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">隔月發薪 · 個人明細</p>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>

            {(() => {
              const { grade, fixed, fa, otherBonus } = earningsExtra(selectedRecord);
              const earnSum =
                selectedRecord.baseSalary +
                grade +
                fixed +
                selectedRecord.overtimePay +
                otherBonus;
              const deductSum =
                selectedRecord.leaveDeduction +
                selectedRecord.tardinessDeduction +
                selectedRecord.laborInsurance +
                selectedRecord.healthInsurance +
                selectedRecord.pensionDeduction;
              return (
                <div className="p-4 space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      應發項目
                    </h4>
                    <div className="space-y-2 pl-3 text-sm">
                      {selectedRecord.baseSalary > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">底薪（合約）</span>
                          <span className="font-medium">${formatCurrency(selectedRecord.baseSalary)}</span>
                        </div>
                      )}
                      {grade > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">職位加級</span>
                          <span className="font-medium text-green-700">+${formatCurrency(grade)}</span>
                        </div>
                      )}
                      {fixed > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">
                            固定津貼／獎金{fa > 0 ? `（含全勤 $${formatCurrency(fa)}）` : ""}
                          </span>
                          <span className="font-medium text-green-700">+${formatCurrency(fixed)}</span>
                        </div>
                      )}
                      {selectedRecord.overtimePay > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">加班費</span>
                          <span className="font-medium text-green-600">
                            +${formatCurrency(selectedRecord.overtimePay)}
                          </span>
                        </div>
                      )}
                      {otherBonus > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">其他加項／異動</span>
                          <span className="font-medium text-green-600">+${formatCurrency(otherBonus)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t pt-2 font-semibold text-emerald-800">
                        <span>應發小計</span>
                        <span>${formatCurrency(earnSum)}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                      <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                      扣除項目
                    </h4>
                    <div className="space-y-2 pl-3 text-sm">
                      {selectedRecord.leaveDeduction > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">請假扣款</span>
                          <span className="font-medium text-red-500">
                            -${formatCurrency(selectedRecord.leaveDeduction)}
                          </span>
                        </div>
                      )}
                      {selectedRecord.tardinessDeduction > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">遲到扣款</span>
                          <span className="font-medium text-red-500">
                            -${formatCurrency(selectedRecord.tardinessDeduction)}
                          </span>
                        </div>
                      )}
                      {selectedRecord.laborInsurance > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">勞保</span>
                          <span className="font-medium text-red-500">
                            -${formatCurrency(selectedRecord.laborInsurance)}
                          </span>
                        </div>
                      )}
                      {selectedRecord.healthInsurance > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">健保</span>
                          <span className="font-medium text-red-500">
                            -${formatCurrency(selectedRecord.healthInsurance)}
                          </span>
                        </div>
                      )}
                      {selectedRecord.pensionDeduction > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">員工自提</span>
                          <span className="font-medium text-red-500">
                            -${formatCurrency(selectedRecord.pensionDeduction)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between border-t pt-2 font-semibold text-red-700">
                        <span>扣除小計</span>
                        <span>-${formatCurrency(deductSum)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-900">總薪資</span>
                      <span className="text-xl font-bold text-emerald-600">
                        ${formatCurrency(selectedRecord.finalPay)}
                      </span>
                    </div>
                  </div>

                  {(() => {
                    const formula = buildFormulaMeta(selectedRecord);
                    const overtimeUnit =
                      formula.overtimeHours > 0
                        ? selectedRecord.overtimePay / formula.overtimeHours
                        : 0;
                    const leaveUnit =
                      formula.leaveDeductionHours > 0
                        ? selectedRecord.leaveDeduction / formula.leaveDeductionHours
                        : 0;
                    const tardinessUnit =
                      formula.tardinessMinutes > 0
                        ? selectedRecord.tardinessDeduction / formula.tardinessMinutes
                        : 0;
                    const overtimeMultiplier =
                      salaryMeta?.hourlyRate && salaryMeta.hourlyRate > 0 && overtimeUnit > 0
                        ? overtimeUnit / salaryMeta.hourlyRate
                        : 0;

                    return (
                      <div className="rounded-lg bg-sky-50 border border-sky-200 p-3 space-y-2">
                        <p className="text-sm font-semibold text-sky-900">換算過程（供核對）</p>
                        {selectedRecord.overtimePay > 0 && (
                          <p className="text-xs text-slate-700 leading-relaxed">
                            加班費：
                            {formula.overtimeHours.toFixed(2)} 小時 ×
                            {overtimeUnit.toFixed(2)} 元/小時 =
                            <span className="font-semibold text-emerald-700">
                              {" "}
                              {formatCurrency(selectedRecord.overtimePay)} 元
                            </span>
                            {overtimeMultiplier > 0 && (
                              <span className="text-slate-500">
                                {" "}
                                （約 時薪 {salaryMeta?.hourlyRate ?? 0} × {overtimeMultiplier.toFixed(2)} 倍）
                              </span>
                            )}
                          </p>
                        )}
                        {selectedRecord.leaveDeduction > 0 && (
                          <p className="text-xs text-slate-700 leading-relaxed">
                            請假扣款：
                            {formula.leaveDeductionHours.toFixed(2)} 小時 ×
                            {leaveUnit.toFixed(2)} 元/小時 =
                            <span className="font-semibold text-rose-700">
                              {" "}
                              {formatCurrency(selectedRecord.leaveDeduction)} 元
                            </span>
                            {formula.leaveTypes.length > 0 && (
                              <span className="text-slate-500">
                                {" "}
                                （本月假別：{formula.leaveTypes.join("、")}）
                              </span>
                            )}
                          </p>
                        )}
                        {selectedRecord.tardinessDeduction > 0 && (
                          <p className="text-xs text-slate-700 leading-relaxed">
                            遲到扣款：
                            {formula.tardinessMinutes} 分鐘 ×
                            {tardinessUnit.toFixed(2)} 元/分鐘 =
                            <span className="font-semibold text-rose-700">
                              {" "}
                              {formatCurrency(selectedRecord.tardinessDeduction)} 元
                            </span>
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {selectedRecord.note ? (
                    <div className="text-xs text-gray-600 bg-slate-50 rounded p-2 border">
                      <span className="font-medium text-gray-700">備註：</span>
                      {selectedRecord.note}
                    </div>
                  ) : null}

                  <div className="text-xs text-gray-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    發布於{" "}
                    {selectedRecord.publishedAt
                      ? new Date(selectedRecord.publishedAt).toLocaleString("zh-TW")
                      : "N/A"}
                  </div>
                </div>
              );
            })()}

            <div className="p-4 border-t bg-gray-50 space-y-2 sticky bottom-0">
              <button
                onClick={() => downloadExcel(selectedRecord)}
                className="w-full py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
              >
                <FileSpreadsheet className="h-4 w-4" />
                下載個人 Excel（結算格式）
              </button>
              <button
                onClick={() => downloadPdf(selectedRecord)}
                className="w-full py-2 border text-gray-700 rounded-lg hover:bg-white transition-colors flex items-center justify-center gap-2"
              >
                <Download className="h-4 w-4" />
                下載 PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
