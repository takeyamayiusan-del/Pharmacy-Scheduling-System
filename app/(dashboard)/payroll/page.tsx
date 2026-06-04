"use client";

import { useState, useEffect, useCallback } from "react";
import { useApp } from "@/lib/context/AppContext";
import { createClient } from "@/lib/supabase/client";
import * as XLSX from "xlsx";

// ─── Types ───────────────────────────────────────────────────────────────────

type SalaryConfig = {
  userId: string;
  baseSalary: number;
  laborInsurance: number;
  healthInsurance: number;
  pensionDeduction: number;
};

type RateConfig = {
  id: string;
  itemKey: string;
  label: string;
  amount: number;
  unit: string;
  isDeduction: boolean;
  sortOrder: number;
};

type Adjustment = {
  id: string;
  userId: string;
  label: string;
  amount: number;
  isDeduction: boolean;
};

type EmployeePayroll = {
  userId: string;
  name: string;
  baseSalary: number;
  laborInsurance: number;
  healthInsurance: number;
  pensionDeduction: number;
  leaveHours: number;
  leaveDeduction: number;
  overtimeHours: number;
  overtimePay: number;
  tardinessMinutes: number;
  tardinessDeduction: number;
  adjustments: Adjustment[];
  bonusTotal: number;
  finalPay: number;
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PayrollPage() {
  const { currentUser, employees, leaveRequests, overtimeRequests, tardinessRecords } = useApp();
  const supabase = createClient();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [salaryConfigs, setSalaryConfigs] = useState<Record<string, SalaryConfig>>({});
  const [rateConfigs, setRateConfigs] = useState<RateConfig[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // editing states
  const [editingSalary, setEditingSalary] = useState<string | null>(null);
  const [salaryForm, setSalaryForm] = useState<Omit<SalaryConfig, "userId">>({
    baseSalary: 0,
    laborInsurance: 0,
    healthInsurance: 0,
    pensionDeduction: 0,
  });
  const [editingRate, setEditingRate] = useState<string | null>(null);
  const [rateForm, setRateForm] = useState<{ label: string; amount: number; unit: string; isDeduction: boolean }>({
    label: "",
    amount: 0,
    unit: "元/小時",
    isDeduction: true,
  });
  const [newAdjForm, setNewAdjForm] = useState<{ userId: string; label: string; amount: number; isDeduction: boolean }>({
    userId: "",
    label: "",
    amount: 0,
    isDeduction: false,
  });

  const isManager = currentUser?.role === "owner" || currentUser?.role === "manager";
  const displayEmployees = employees.filter((e) => e.role !== "owner");

  // ─── Load data ─────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [salaryRes, rateRes, adjRes] = await Promise.all([
        supabase.from("employee_salary_config").select("*"),
        supabase.from("payroll_rate_config").select("*").order("sort_order"),
        supabase
          .from("payroll_adjustments")
          .select("*")
          .eq("year", year)
          .eq("month", month),
      ]);

      if (salaryRes.data) {
        const map: Record<string, SalaryConfig> = {};
        salaryRes.data.forEach((r) => {
          map[r.user_id] = {
            userId: r.user_id,
            baseSalary: Number(r.base_salary),
            laborInsurance: Number(r.labor_insurance),
            healthInsurance: Number(r.health_insurance),
            pensionDeduction: Number(r.pension_deduction),
          };
        });
        setSalaryConfigs(map);
      }

      if (rateRes.data) {
        setRateConfigs(
          rateRes.data.map((r) => ({
            id: r.id,
            itemKey: r.item_key,
            label: r.label,
            amount: Number(r.amount),
            unit: r.unit,
            isDeduction: r.is_deduction,
            sortOrder: r.sort_order,
          }))
        );
      }

      if (adjRes.data) {
        setAdjustments(
          adjRes.data.map((r) => ({
            id: r.id,
            userId: r.user_id,
            label: r.label,
            amount: Number(r.amount),
            isDeduction: r.is_deduction,
          }))
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, [supabase, year, month]);

  useEffect(() => {
    if (isManager) loadData();
  }, [isManager, loadData]);

  // ─── Compute payroll ────────────────────────────────────────────────────────

  const computePayroll = useCallback((): EmployeePayroll[] => {
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    const leaveRate = rateConfigs.find((r) => r.itemKey === "leave_hourly")?.amount ?? 0;
    const overtimeRate = rateConfigs.find((r) => r.itemKey === "overtime_hourly")?.amount ?? 0;
    const tardinessRate = rateConfigs.find((r) => r.itemKey === "tardiness_per_min")?.amount ?? 0;

    return displayEmployees.map((emp) => {
      const config = salaryConfigs[emp.id] ?? {
        baseSalary: 0,
        laborInsurance: 0,
        healthInsurance: 0,
        pensionDeduction: 0,
      };

      // 計算請假小時數（本月已核准的請假）
      const empLeaves = leaveRequests.filter(
        (r) => r.employeeId === emp.id && r.status === "approved" && r.startDate.startsWith(monthStr)
      );
      const leaveHours = empLeaves.reduce((acc, r) => {
        const start = r.startTime.split(":").map(Number);
        const end = r.endTime.split(":").map(Number);
        return acc + (end[0] * 60 + end[1] - (start[0] * 60 + start[1])) / 60;
      }, 0);

      // 計算加班小時數（本月已核准的加班）
      const empOvertimes = overtimeRequests.filter(
        (r) => r.employeeId === emp.id && r.status === "approved" && r.date.startsWith(monthStr)
      );
      const overtimeHours = empOvertimes.reduce((acc, r) => {
        const start = r.startTime.split(":").map(Number);
        const end = r.endTime.split(":").map(Number);
        return acc + (end[0] * 60 + end[1] - (start[0] * 60 + start[1])) / 60;
      }, 0);

      // 遲到分鐘數
      const empTardiness = tardinessRecords.filter(
        (r) => r.employeeId === emp.id && r.date.startsWith(monthStr)
      );
      const tardinessMinutes = empTardiness.reduce((acc, r) => acc + r.minutes, 0);

      // 本月異動
      const empAdj = adjustments.filter((a) => a.userId === emp.id);
      const bonusTotal = empAdj.reduce((acc, a) => {
        return acc + (a.isDeduction ? -a.amount : a.amount);
      }, 0);

      const leaveDeduction = Math.round(leaveHours * leaveRate * 100) / 100;
      const overtimePay = Math.round(overtimeHours * overtimeRate * 100) / 100;
      const tardinessDeduction = Math.round(tardinessMinutes * tardinessRate * 100) / 100;

      const finalPay =
        config.baseSalary -
        config.laborInsurance -
        config.healthInsurance -
        config.pensionDeduction -
        leaveDeduction +
        overtimePay -
        tardinessDeduction +
        bonusTotal;

      return {
        userId: emp.id,
        name: emp.name,
        baseSalary: config.baseSalary,
        laborInsurance: config.laborInsurance,
        healthInsurance: config.healthInsurance,
        pensionDeduction: config.pensionDeduction,
        leaveHours: Math.round(leaveHours * 100) / 100,
        leaveDeduction,
        overtimeHours: Math.round(overtimeHours * 100) / 100,
        overtimePay,
        tardinessMinutes,
        tardinessDeduction,
        adjustments: empAdj,
        bonusTotal,
        finalPay: Math.round(finalPay * 100) / 100,
      };
    });
  }, [displayEmployees, salaryConfigs, rateConfigs, adjustments, leaveRequests, overtimeRequests, tardinessRecords, year, month]);

  const payrollData = computePayroll();

  // ─── Save salary config ─────────────────────────────────────────────────────

  const saveSalaryConfig = async (userId: string) => {
    await supabase.from("employee_salary_config").upsert(
      {
        user_id: userId,
        base_salary: salaryForm.baseSalary,
        labor_insurance: salaryForm.laborInsurance,
        health_insurance: salaryForm.healthInsurance,
        pension_deduction: salaryForm.pensionDeduction,
        updated_by: currentUser?.id,
      },
      { onConflict: "user_id" }
    );
    setSalaryConfigs((prev) => ({ ...prev, [userId]: { userId, ...salaryForm } }));
    setEditingSalary(null);
  };

  // ─── Save rate config ───────────────────────────────────────────────────────

  const saveRateConfig = async (id: string) => {
    await supabase
      .from("payroll_rate_config")
      .update({ amount: rateForm.amount, updated_by: currentUser?.id })
      .eq("id", id);
    setRateConfigs((prev) =>
      prev.map((r) => (r.id === id ? { ...r, amount: rateForm.amount } : r))
    );
    setEditingRate(null);
  };

  const addCustomRate = async () => {
    if (!rateForm.label) return;
    const key = `custom_${Date.now()}`;
    const { data } = await supabase
      .from("payroll_rate_config")
      .insert({
        item_key: key,
        label: rateForm.label,
        amount: rateForm.amount,
        unit: rateForm.unit,
        is_deduction: rateForm.isDeduction,
        sort_order: rateConfigs.length + 1,
        updated_by: currentUser?.id,
      })
      .select()
      .single();
    if (data) {
      setRateConfigs((prev) => [
        ...prev,
        {
          id: data.id,
          itemKey: data.item_key,
          label: data.label,
          amount: Number(data.amount),
          unit: data.unit,
          isDeduction: data.is_deduction,
          sortOrder: data.sort_order,
        },
      ]);
    }
    setRateForm({ label: "", amount: 0, unit: "元/小時", isDeduction: true });
  };

  // ─── Add adjustment ─────────────────────────────────────────────────────────

  const addAdjustment = async () => {
    if (!newAdjForm.userId || !newAdjForm.label) return;
    const { data } = await supabase
      .from("payroll_adjustments")
      .insert({
        user_id: newAdjForm.userId,
        year,
        month,
        label: newAdjForm.label,
        amount: newAdjForm.amount,
        is_deduction: newAdjForm.isDeduction,
        created_by: currentUser?.id,
      })
      .select()
      .single();
    if (data) {
      setAdjustments((prev) => [
        ...prev,
        { id: data.id, userId: data.user_id, label: data.label, amount: Number(data.amount), isDeduction: data.is_deduction },
      ]);
    }
    setNewAdjForm({ userId: "", label: "", amount: 0, isDeduction: false });
  };

  const deleteAdjustment = async (id: string) => {
    await supabase.from("payroll_adjustments").delete().eq("id", id);
    setAdjustments((prev) => prev.filter((a) => a.id !== id));
  };

  // ─── Export Excel ───────────────────────────────────────────────────────────

  const exportExcel = () => {
    const rows = payrollData.map((p) => ({
      姓名: p.name,
      底薪: p.baseSalary,
      勞保扣除: p.laborInsurance,
      健保扣除: p.healthInsurance,
      退休金提撥: p.pensionDeduction,
      請假時數: p.leaveHours,
      請假扣款: p.leaveDeduction,
      加班時數: p.overtimeHours,
      加班費: p.overtimePay,
      遲到分鐘: p.tardinessMinutes,
      遲到扣款: p.tardinessDeduction,
      異動合計: p.bonusTotal,
      實領薪資: p.finalPay,
      異動明細: p.adjustments
        .map((a) => `${a.label}${a.isDeduction ? "(-" : "(+"}${a.amount})`)
        .join("、"),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    // 欄位寬度
    ws["!cols"] = [
      { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 40 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${year}年${month}月薪資`);
    XLSX.writeFile(wb, `耀聖藥局_${year}年${month}月薪資結算.xlsx`);
  };

  // ─── Guard ──────────────────────────────────────────────────────────────────

  if (!isManager) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-gray-500">僅店長/老闆可查看薪資結算</p>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* 頁頭 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">月底薪資結算</h1>
        <div className="flex items-center gap-3">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            {[2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{m}月</option>
            ))}
          </select>
          <button
            onClick={exportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
          >
            📥 匯出 Excel
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">載入中...</div>
      ) : (
        <>
          {/* ── 費率設定 ── */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="font-semibold text-gray-900 mb-4">計算費率設定</h2>
            <div className="space-y-3">
              {rateConfigs.map((rate) => (
                <div key={rate.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                  <span className="flex-1 text-sm font-medium text-gray-700">{rate.label}</span>
                  {editingRate === rate.id ? (
                    <>
                      <input
                        type="number"
                        value={rateForm.amount}
                        onChange={(e) => setRateForm({ ...rateForm, amount: Number(e.target.value) })}
                        className="w-28 border rounded px-2 py-1 text-sm"
                      />
                      <span className="text-xs text-gray-500">{rate.unit}</span>
                      <button
                        onClick={() => saveRateConfig(rate.id)}
                        className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                      >
                        儲存
                      </button>
                      <button
                        onClick={() => setEditingRate(null)}
                        className="px-3 py-1 border text-xs rounded"
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm text-gray-900 font-medium">
                        ${rate.amount.toLocaleString()} {rate.unit}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${rate.isDeduction ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                        {rate.isDeduction ? "扣款" : "加項"}
                      </span>
                      <button
                        onClick={() => { setEditingRate(rate.id); setRateForm({ label: rate.label, amount: rate.amount, unit: rate.unit, isDeduction: rate.isDeduction }); }}
                        className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                      >
                        編輯
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            {/* 新增自訂費率 */}
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm font-medium text-gray-700 mb-2">新增自訂費率項目</p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  placeholder="項目名稱"
                  value={rateForm.label}
                  onChange={(e) => setRateForm({ ...rateForm, label: e.target.value })}
                  className="border rounded px-3 py-1.5 text-sm w-36"
                />
                <input
                  type="number"
                  placeholder="金額"
                  value={rateForm.amount}
                  onChange={(e) => setRateForm({ ...rateForm, amount: Number(e.target.value) })}
                  className="border rounded px-3 py-1.5 text-sm w-24"
                />
                <input
                  type="text"
                  placeholder="單位"
                  value={rateForm.unit}
                  onChange={(e) => setRateForm({ ...rateForm, unit: e.target.value })}
                  className="border rounded px-3 py-1.5 text-sm w-28"
                />
                <select
                  value={rateForm.isDeduction ? "true" : "false"}
                  onChange={(e) => setRateForm({ ...rateForm, isDeduction: e.target.value === "true" })}
                  className="border rounded px-3 py-1.5 text-sm"
                >
                  <option value="true">扣款</option>
                  <option value="false">加項</option>
                </select>
                <button
                  onClick={addCustomRate}
                  className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                >
                  新增
                </button>
              </div>
            </div>
          </div>

          {/* ── 員工底薪設定 ── */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="font-semibold text-gray-900 mb-4">員工薪資設定</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-2 text-left">員工</th>
                    <th className="px-3 py-2 text-right">底薪</th>
                    <th className="px-3 py-2 text-right">勞保</th>
                    <th className="px-3 py-2 text-right">健保</th>
                    <th className="px-3 py-2 text-right">退休金</th>
                    <th className="px-3 py-2 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {displayEmployees.map((emp) => {
                    const cfg = salaryConfigs[emp.id];
                    const isEditing = editingSalary === emp.id;
                    return (
                      <tr key={emp.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{emp.name}</td>
                        {isEditing ? (
                          <>
                            {(["baseSalary", "laborInsurance", "healthInsurance", "pensionDeduction"] as const).map((field) => (
                              <td key={field} className="px-3 py-2">
                                <input
                                  type="number"
                                  value={salaryForm[field]}
                                  onChange={(e) => setSalaryForm({ ...salaryForm, [field]: Number(e.target.value) })}
                                  className="w-24 border rounded px-2 py-1 text-right"
                                />
                              </td>
                            ))}
                            <td className="px-3 py-2 text-center">
                              <button onClick={() => saveSalaryConfig(emp.id)} className="px-2 py-1 bg-blue-600 text-white text-xs rounded mr-1">儲存</button>
                              <button onClick={() => setEditingSalary(null)} className="px-2 py-1 border text-xs rounded">取消</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 text-right">${(cfg?.baseSalary ?? 0).toLocaleString()}</td>
                            <td className="px-3 py-2 text-right">${(cfg?.laborInsurance ?? 0).toLocaleString()}</td>
                            <td className="px-3 py-2 text-right">${(cfg?.healthInsurance ?? 0).toLocaleString()}</td>
                            <td className="px-3 py-2 text-right">${(cfg?.pensionDeduction ?? 0).toLocaleString()}</td>
                            <td className="px-3 py-2 text-center">
                              <button
                                onClick={() => {
                                  setEditingSalary(emp.id);
                                  setSalaryForm(cfg ?? { baseSalary: 0, laborInsurance: 0, healthInsurance: 0, pensionDeduction: 0 });
                                }}
                                className="px-2 py-1 bg-blue-600 text-white text-xs rounded"
                              >
                                編輯
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── 本月異動項目 ── */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="font-semibold text-gray-900 mb-4">本月異動項目（{year}年{month}月）</h2>
            {adjustments.length > 0 && (
              <div className="space-y-2 mb-4">
                {adjustments.map((adj) => {
                  const emp = employees.find((e) => e.id === adj.userId);
                  return (
                    <div key={adj.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <span className="font-medium text-gray-800 w-16">{emp?.name}</span>
                      <span className="flex-1 text-sm text-gray-700">{adj.label}</span>
                      <span className={`text-sm font-medium ${adj.isDeduction ? "text-red-600" : "text-green-600"}`}>
                        {adj.isDeduction ? "-" : "+"}${adj.amount.toLocaleString()}
                      </span>
                      <button
                        onClick={() => deleteAdjustment(adj.id)}
                        className="text-red-500 hover:text-red-700 text-xs"
                      >
                        刪除
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-3 border-t">
              <select
                value={newAdjForm.userId}
                onChange={(e) => setNewAdjForm({ ...newAdjForm, userId: e.target.value })}
                className="border rounded px-3 py-1.5 text-sm"
              >
                <option value="">選擇員工</option>
                {displayEmployees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="項目名稱（如：業績獎金）"
                value={newAdjForm.label}
                onChange={(e) => setNewAdjForm({ ...newAdjForm, label: e.target.value })}
                className="border rounded px-3 py-1.5 text-sm w-44"
              />
              <input
                type="number"
                placeholder="金額"
                value={newAdjForm.amount}
                onChange={(e) => setNewAdjForm({ ...newAdjForm, amount: Number(e.target.value) })}
                className="border rounded px-3 py-1.5 text-sm w-24"
              />
              <select
                value={newAdjForm.isDeduction ? "true" : "false"}
                onChange={(e) => setNewAdjForm({ ...newAdjForm, isDeduction: e.target.value === "true" })}
                className="border rounded px-3 py-1.5 text-sm"
              >
                <option value="false">加項（獎金）</option>
                <option value="true">扣款</option>
              </select>
              <button
                onClick={addAdjustment}
                className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                新增
              </button>
            </div>
          </div>

          {/* ── 薪資結算預覽 ── */}
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">{year}年{month}月 薪資結算預覽</h2>
              <button
                onClick={exportExcel}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
              >
                📥 匯出 Excel
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left font-medium text-gray-700">姓名</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-700">底薪</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-700 text-red-600">勞保</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-700 text-red-600">健保</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-700 text-red-600">退休金</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-700 text-red-600">請假扣款</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-700 text-green-600">加班費</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-700 text-red-600">遲到扣款</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-700">異動</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-900 bg-blue-50">實領</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payrollData.map((p) => (
                    <tr key={p.userId} className="hover:bg-gray-50">
                      <td className="px-3 py-3 font-medium text-gray-900">{p.name}</td>
                      <td className="px-3 py-3 text-right">${p.baseSalary.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right text-red-600">-${p.laborInsurance.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right text-red-600">-${p.healthInsurance.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right text-red-600">-${p.pensionDeduction.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right text-red-600">
                        {p.leaveDeduction > 0 ? (
                          <span title={`${p.leaveHours}h × 費率`}>-${p.leaveDeduction.toLocaleString()}</span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-green-600">
                        {p.overtimePay > 0 ? (
                          <span title={`${p.overtimeHours}h × 費率`}>+${p.overtimePay.toLocaleString()}</span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-red-600">
                        {p.tardinessDeduction > 0 ? (
                          <span title={`${p.tardinessMinutes}分 × 費率`}>-${p.tardinessDeduction.toLocaleString()}</span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {p.bonusTotal !== 0 ? (
                          <span className={p.bonusTotal > 0 ? "text-green-600" : "text-red-600"}>
                            {p.bonusTotal > 0 ? "+" : ""}${p.bonusTotal.toLocaleString()}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-blue-700 bg-blue-50">
                        ${p.finalPay.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
