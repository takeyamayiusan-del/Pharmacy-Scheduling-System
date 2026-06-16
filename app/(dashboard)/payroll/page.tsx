"use client";

import { useState, useEffect, useCallback } from "react";
import { useApp, type LeaveRequest } from "@/lib/context/AppContext";
import { buildEffectiveTardinessRecords } from "@/lib/tardiness";
import { createClient } from "@/lib/supabase/client";
import {
  calculateLeaveWorkHours,
  PAYROLL_LEAVE_RATE_KEYS,
  type LeaveType,
} from "@/lib/attendance/leaveHours";
import XLSX from "xlsx-js-style";

// ─── Types ───────────────────────────────────────────────────────────────────

type SalaryConfig = {
  userId: string;
  baseSalary: number;
  laborInsurance: number;
  healthInsurance: number;
  pensionDeduction: number;
  position: string;
  bankAccount: string;
  hourlyRate: number;
  normalHours: number;
  companyPensionRate: number;
  companyPensionBase: number;
  payDate: string;
  unionFee: number;
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
  position: string;
  bankAccount: string;
  hourlyRate: number;
  normalHours: number;
  companyPensionRate: number;
  companyPensionBase: number;
  payDate: string;
  unionFee: number;
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

const emptySalaryForm: Omit<SalaryConfig, "userId"> = {
  baseSalary: 0,
  laborInsurance: 0,
  healthInsurance: 0,
  pensionDeduction: 0,
  position: "",
  bankAccount: "",
  hourlyRate: 0,
  normalHours: 0,
  companyPensionRate: 6,
  companyPensionBase: 0,
  payDate: "",
  unionFee: 0,
};

// 西元年 → 民國年
const toROC = (westernYear: number) => westernYear - 1911;

// ─── Main Component ───────────────────────────────────────────────────────────

function getMonthBounds(year: number, month: number) {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const lastDay = new Date(year, month, 0).getDate();
  return {
    monthStart: `${monthStr}-01`,
    monthEnd: `${monthStr}-${String(lastDay).padStart(2, "0")}`,
  };
}

function getApprovedLeaveHoursInMonth(
  request: LeaveRequest,
  year: number,
  month: number,
  getShiftForDate: (date: string, employeeId: string) => import("@/lib/context/AppContext").ShiftType,
  shiftTimeConfig: import("@/lib/context/AppContext").ShiftTimeConfig
): number {
  const { monthStart, monthEnd } = getMonthBounds(year, month);
  if (request.endDate < monthStart || request.startDate > monthEnd) return 0;
  if (request.startDate >= monthStart && request.endDate <= monthEnd && request.leaveHours > 0) {
    return request.leaveHours;
  }
  const startDate = request.startDate < monthStart ? monthStart : request.startDate;
  const endDate = request.endDate > monthEnd ? monthEnd : request.endDate;
  return calculateLeaveWorkHours({
    startDate,
    endDate,
    startTime: request.startTime,
    endTime: request.endTime,
    period: request.period,
    shiftMode: request.shiftMode,
    employeeId: request.employeeId,
    getShiftForDate,
    shiftTimeConfig,
  });
}

function isDateInMonth(dateValue: string, year: number, month: number) {
  const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return false;
  return Number(match[1]) === year && Number(match[2]) === month;
}

export default function PayrollPage() {
  const {
    currentUser,
    employees,
    leaveRequests,
    overtimeRequests,
    tardinessRecords,
    punchRecords,
    getShiftForDate,
    shiftTimeConfig,
    payrollRecords,
    publishPayrollRecord,
    unpublishPayrollRecord,
    loadPayrollRecords,
  } = useApp();
  const supabase = createClient();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [salaryConfigs, setSalaryConfigs] = useState<Record<string, SalaryConfig>>({});
  const [rateConfigs, setRateConfigs] = useState<RateConfig[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [editingSalary, setEditingSalary] = useState<string | null>(null);
  const [salaryForm, setSalaryForm] = useState<Omit<SalaryConfig, "userId">>(emptySalaryForm);
  const [editingRate, setEditingRate] = useState<string | null>(null);
  const [rateForm, setRateForm] = useState({ label: "", amount: 0, unit: "元/小時", isDeduction: true });
  const [newAdjForm, setNewAdjForm] = useState({ userId: "", label: "", amount: 0, isDeduction: false });

  const isManager = currentUser?.role === "owner" || currentUser?.role === "manager";
  const displayEmployees = employees.filter((e) => e.role !== "owner");

  // ─── Load data ─────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [salaryRes, rateRes, adjRes] = await Promise.all([
        supabase.from("employee_salary_config").select("*"),
        supabase.from("payroll_rate_config").select("*").order("sort_order"),
        supabase.from("payroll_adjustments").select("*").eq("year", year).eq("month", month),
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
            position: r.position ?? "",
            bankAccount: r.bank_account ?? "",
            hourlyRate: Number(r.hourly_rate ?? 0),
            normalHours: Number(r.normal_hours ?? 0),
            companyPensionRate: Number(r.company_pension_rate ?? 6),
            companyPensionBase: Number(r.company_pension_base ?? 0),
            payDate: r.pay_date ?? "",
            unionFee: Number(r.union_fee ?? 0),
          };
        });
        setSalaryConfigs(map);
      }
      if (rateRes.data) {
        setRateConfigs(rateRes.data.map((r) => ({
          id: r.id, itemKey: r.item_key, label: r.label,
          amount: Number(r.amount), unit: r.unit,
          isDeduction: r.is_deduction, sortOrder: r.sort_order,
        })));
      }
      if (adjRes.data) {
        setAdjustments(adjRes.data.map((r) => ({
          id: r.id, userId: r.user_id, label: r.label,
          amount: Number(r.amount), isDeduction: r.is_deduction,
        })));
      }
    } finally {
      setIsLoading(false);
    }
  }, [supabase, year, month]);

  useEffect(() => { 
    if (isManager) {
      loadData(); 
      loadPayrollRecords(year, month);
    }
  }, [isManager, loadData, loadPayrollRecords, year, month]);

  // ─── Compute payroll ────────────────────────────────────────────────────────

  const computePayroll = useCallback((): EmployeePayroll[] => {
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    const overtimeRate = rateConfigs.find((r) => r.itemKey === "overtime_hourly")?.amount ?? 0;
    const tardinessRate = rateConfigs.find((r) => r.itemKey === "tardiness_per_min")?.amount ?? 0;

    const leaveRateByType = (type: LeaveType) => {
      if (type === "補休假") return 0;
      const key = PAYROLL_LEAVE_RATE_KEYS[type as Exclude<LeaveType, "補休假">];
      return rateConfigs.find((r) => r.itemKey === key)?.amount ?? 0;
    };

    return displayEmployees.map((emp) => {
      const cfg = salaryConfigs[emp.id] ?? { ...emptySalaryForm, userId: emp.id };

      const empLeaves = leaveRequests.filter(
        (r) =>
          r.employeeId === emp.id &&
          r.status === "approved" &&
          r.type !== "補休假" &&
          r.endDate >= `${monthStr}-01` &&
          r.startDate <= `${monthStr}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`
      );

      let leaveHours = 0;
      let leaveDeduction = 0;
      for (const r of empLeaves) {
        const hours = getApprovedLeaveHoursInMonth(
          r,
          year,
          month,
          getShiftForDate,
          shiftTimeConfig
        );
        leaveHours += hours;
        leaveDeduction += hours * leaveRateByType(r.type);
      }
      leaveHours = Math.round(leaveHours * 100) / 100;
      leaveDeduction = Math.round(leaveDeduction * 100) / 100;

      const empOvertimes = overtimeRequests.filter(
        (r) =>
          r.employeeId === emp.id &&
          r.status === "approved" &&
          r.compensationType === "pay" &&
          r.date.startsWith(monthStr)
      );
      const overtimeHours = empOvertimes.reduce((acc, r) => {
        const s = r.startTime.split(":").map(Number);
        const e = r.endTime.split(":").map(Number);
        return acc + (e[0] * 60 + e[1] - (s[0] * 60 + s[1])) / 60;
      }, 0);

      const effectiveTardinessRecords = buildEffectiveTardinessRecords(
        tardinessRecords,
        punchRecords,
        overtimeRequests
      );

      const tardinessMinutes = effectiveTardinessRecords
        .filter((r) => r.employeeId === emp.id && isDateInMonth(r.date, year, month))
        .reduce((acc, r) => acc + r.minutes, 0);

      const empAdj = adjustments.filter((a) => a.userId === emp.id);
      const bonusTotal = empAdj.reduce((acc, a) => acc + (a.isDeduction ? -a.amount : a.amount), 0);

      const overtimePay = Math.round(overtimeHours * overtimeRate * 100) / 100;
      const tardinessDeduction = Math.round(tardinessMinutes * tardinessRate * 100) / 100;

      const finalPay =
        cfg.baseSalary -
        cfg.laborInsurance -
        cfg.healthInsurance -
        cfg.pensionDeduction -
        leaveDeduction +
        overtimePay -
        tardinessDeduction +
        bonusTotal;

      return {
        userId: emp.id,
        name: emp.name,
        position: cfg.position,
        bankAccount: cfg.bankAccount,
        hourlyRate: cfg.hourlyRate,
        normalHours: cfg.normalHours,
        companyPensionRate: cfg.companyPensionRate,
        companyPensionBase: cfg.companyPensionBase,
        payDate: cfg.payDate,
        unionFee: cfg.unionFee,
        baseSalary: cfg.baseSalary,
        laborInsurance: cfg.laborInsurance,
        healthInsurance: cfg.healthInsurance,
        pensionDeduction: cfg.pensionDeduction,
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
  }, [displayEmployees, salaryConfigs, rateConfigs, adjustments, leaveRequests, overtimeRequests, tardinessRecords, punchRecords, year, month, getShiftForDate, shiftTimeConfig]);

  const payrollData = computePayroll();

  // ─── Publish Payroll ────────────────────────────────────────────────────────
  const handlePublish = async (employeeId: string) => {
    const p = payrollData.find(d => d.userId === employeeId);
    if (!p) return;

    if (!confirm(`確定要發布 ${p.name} 的 ${year} 年 ${month} 月薪資單嗎？發布後員工將收到通知並可查看詳情。`)) return;

    // 先存檔到資料庫
    const { data, error } = await supabase.from("payroll_records").upsert({
      user_id: p.userId,
      year,
      month,
      base_salary: p.baseSalary,
      labor_insurance: p.laborInsurance,
      health_insurance: p.healthInsurance,
      pension_deduction: p.pensionDeduction,
      leave_deduction: p.leaveDeduction,
      overtime_pay: p.overtimePay,
      tardiness_deduction: p.tardinessDeduction,
      bonus_total: p.bonusTotal,
      final_pay: p.finalPay,
      note: "",
      created_by: currentUser?.id,
    }, { onConflict: "user_id,year,month" }).select().single();

    if (error) {
      alert("儲存失敗：" + error.message);
      return;
    }

    if (data) {
      await publishPayrollRecord(data.id);
      alert(`${p.name} 的薪資單已發布並通知員工！`);
    }
  };

  // ─── Save salary config ─────────────────────────────────────────────────────

  const saveSalaryConfig = async (userId: string) => {
    await supabase.from("employee_salary_config").upsert({
      user_id: userId,
      base_salary: salaryForm.baseSalary,
      labor_insurance: salaryForm.laborInsurance,
      health_insurance: salaryForm.healthInsurance,
      pension_deduction: salaryForm.pensionDeduction,
      position: salaryForm.position,
      bank_account: salaryForm.bankAccount,
      hourly_rate: salaryForm.hourlyRate,
      normal_hours: salaryForm.normalHours,
      company_pension_rate: salaryForm.companyPensionRate,
      company_pension_base: salaryForm.companyPensionBase,
      pay_date: salaryForm.payDate,
      union_fee: salaryForm.unionFee,
      updated_by: currentUser?.id,
    }, { onConflict: "user_id" });
    setSalaryConfigs((prev) => ({ ...prev, [userId]: { userId, ...salaryForm } }));
    setEditingSalary(null);
  };

  // ─── Save rate config ───────────────────────────────────────────────────────

  const saveRateConfig = async (id: string) => {
    await supabase.from("payroll_rate_config")
      .update({ amount: rateForm.amount, updated_by: currentUser?.id }).eq("id", id);
    setRateConfigs((prev) => prev.map((r) => (r.id === id ? { ...r, amount: rateForm.amount } : r)));
    setEditingRate(null);
  };

  // ─── Adjustments ───────────────────────────────────────────────────────────

  const addAdjustment = async () => {
    if (!newAdjForm.userId || !newAdjForm.label) return;
    const { data } = await supabase.from("payroll_adjustments").insert({
      user_id: newAdjForm.userId, year, month, label: newAdjForm.label,
      amount: newAdjForm.amount, is_deduction: newAdjForm.isDeduction, created_by: currentUser?.id,
    }).select().single();
    if (data) setAdjustments((prev) => [...prev, { id: data.id, userId: data.user_id, label: data.label, amount: Number(data.amount), isDeduction: data.is_deduction }]);
    setNewAdjForm({ userId: "", label: "", amount: 0, isDeduction: false });
  };

  const deleteAdjustment = async (id: string) => {
    await supabase.from("payroll_adjustments").delete().eq("id", id);
    setAdjustments((prev) => prev.filter((a) => a.id !== id));
  };

  // ─── Export Excel（附圖格式，每人一 sheet，民國年）──────────────────────────

  // 匯出全體薪資總表 (第二個按鈕功能)
  const exportSummaryExcel = () => {
    const rocYear = toROC(year);
    const wb = XLSX.utils.book_new();
    const rows: (string | number)[][] = [
      [`耀聖藥局 ${rocYear} 年 ${month} 月 薪資結算總表`],
      ["姓名", "職位", "底薪", "勞保費", "健保費", "退休金", "請假扣款", "加班費", "遲到扣款", "異動加減", "實領金額", "入帳帳號"]
    ];

    payrollData.forEach(p => {
      rows.push([
        p.name,
        p.position || "—",
        p.baseSalary,
        -p.laborInsurance,
        -p.healthInsurance,
        -p.pensionDeduction,
        p.leaveDeduction > 0 ? -p.leaveDeduction : 0,
        p.overtimePay,
        p.tardinessDeduction > 0 ? -p.tardinessDeduction : 0,
        p.bonusTotal,
        p.finalPay,
        p.bankAccount || "—"
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "薪資總表");
    XLSX.writeFile(wb, `耀聖藥局_${rocYear}年${month}月_全體薪資總表.xlsx`);
  };

  const exportExcel = () => {
    const rocYear = toROC(year);
    // 使用 xlsx-js-style 相容的結構，但需注意環境是否支援。
    // 如果單純使用 xlsx 庫，樣式 .s 屬性在 writeFile 時會被忽略。
    // 我們改用更結構化的排版，並確保欄位與合併單元格正確。
    const wb = XLSX.utils.book_new();

    payrollData.forEach((p) => {
      // 準備三欄資料：A=約定薪資結構, B=非固定支付, C=應代扣
      const colA: [string, number | string][] = [
        ["薪資", p.baseSalary],
        ["退休金提撥", p.pensionDeduction],
      ];
      if (p.leaveDeduction > 0) colA.push(["請假扣款", -p.leaveDeduction]);
      if (p.tardinessDeduction > 0) colA.push(["遲到扣款", -p.tardinessDeduction]);

      const colB: [string, number][] = p.adjustments
        .filter((a) => !a.isDeduction)
        .map((a) => [a.label, a.amount]);
      if (p.overtimePay > 0) colB.push(["加班費", p.overtimePay]);
      const deductAdj = p.adjustments.filter((a) => a.isDeduction);
      if (deductAdj.length > 0) deductAdj.forEach((a) => colB.push([a.label, -a.amount]));

      const colC: [string, number][] = [
        ["勞保費", p.laborInsurance],
        ["健保費", p.healthInsurance],
      ];
      if (p.unionFee > 0) colC.push(["職業工會費", p.unionFee]);

      const subA = colA.reduce((s, [, v]) => s + Number(v), 0);
      const subB = colB.reduce((s, [, v]) => s + v, 0);
      const subC = colC.reduce((s, [, v]) => s + v, 0);
      const finalPay = subA + subB - subC;

      // 正常工時薪資 = 正常時數 × 時薪
      const normalPay = Math.round(p.normalHours * p.hourlyRate);
      // 加班薪資
      const overtimePay2 = Math.round(p.overtimeHours * p.hourlyRate);
      // 公司提撥退休金金額
      const companyPensionAmt = Math.round(p.companyPensionBase * p.companyPensionRate / 100);

      // ── 用 aoa（array of arrays）手工排版 ──
      const aoa: (string | number | null)[][] = [];

      // 標題
      aoa.push(["耀聖藥局", null, null, `${rocYear}年`, null, `${month}月 薪資明細表`]);
      aoa.push([]);
      aoa.push([
        `姓名：${p.name}`,
        null,
        `職位：${p.position}`,
        null,
        `入帳帳號：${p.bankAccount}`,
        null,
        `發薪日期：${p.payDate}`,
      ]);
      aoa.push([]);

      // 三欄表頭
      aoa.push(["約定薪資結構", null, "非固定支付項目", null, "應代扣項目"]);
      aoa.push(["項目", "金額", "項目", "金額", "項目", "金額"]);

      // 三欄內容（取最大行數對齊）
      const maxRows = Math.max(colA.length, colB.length, colC.length);
      for (let i = 0; i < maxRows; i++) {
        aoa.push([
          colA[i]?.[0] ?? "", colA[i]?.[1] ?? "",
          colB[i]?.[0] ?? "", colB[i]?.[1] ?? "",
          colC[i]?.[0] ?? "", colC[i]?.[1] ?? "",
        ]);
      }

      // 小計列
      aoa.push([`小計(A)`, subA, `小計(B)`, subB, `小計(C)`, subC]);
      aoa.push([]);

      // 工時區塊（左側）
      aoa.push(["正常時數", p.normalHours, normalPay]);
      aoa.push(["額外時數", p.overtimeHours, overtimePay2]);
      aoa.push([]);
      aoa.push(["總計", null, p.baseSalary]);
      aoa.push([`時薪：`, `${p.hourlyRate} /HR`]);
      aoa.push([]);

      // 公司提撥退休金（右側，放在備註行）
      aoa.push(["公司提撥退休金資訊："]);
      aoa.push([`公司提撥退休金`, `${p.companyPensionRate}%`]);
      aoa.push([`提撥工資級距 部分工時`, p.companyPensionBase]);
      aoa.push([`提撥金額`, companyPensionAmt]);
      if (p.hourlyRate > 0) {
        aoa.push([`時薪自 ${rocYear}/01/01 調整為${p.hourlyRate}元`]);
      }
      if (p.unionFee > 0) {
        aoa.push([`每月補助職業工會會費${p.unionFee}元`]);
      }
      aoa.push([]);

      // 實領金額
      aoa.push(["實領金額"]);
      aoa.push([`(A)+(B)-(C) =`, finalPay]);
      aoa.push([]);
      aoa.push(["簽收："]);

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      
      // 設定合併單元格以美化標題與區塊
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, // 標題
        { s: { r: 2, c: 0 }, e: { r: 2, c: 1 } }, // 姓名
        { s: { r: 2, c: 2 }, e: { r: 2, c: 3 } }, // 職位
        { s: { r: 2, c: 4 }, e: { r: 2, c: 6 } }, // 帳號
        { s: { r: 4, c: 0 }, e: { r: 4, c: 1 } }, // A區表頭
        { s: { r: 4, c: 2 }, e: { r: 4, c: 3 } }, // B區表頭
        { s: { r: 4, c: 4 }, e: { r: 4, c: 5 } }, // C區表頭
      ];

      // 由於 xlsx 基礎版不支援 .s 樣式對象，
      // 如果您需要框線，必須確保在環境中安裝了 xlsx-js-style 或類似庫。
      // 這裡我保留邏輯，並確保基礎結構清晰。
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:G50');
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cell_ref = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cell_ref]) ws[cell_ref] = { t: 's', v: '' };
          if (!ws[cell_ref].s) ws[cell_ref].s = {};
          
          ws[cell_ref].s.border = {
            top: { style: 'thin' },
            bottom: { style: 'thin' },
            left: { style: 'thin' },
            right: { style: 'thin' }
          };
          
          if (R === 4 || R === 5) {
            ws[cell_ref].s.font = { bold: true };
            ws[cell_ref].s.fill = { fgColor: { rgb: "F2F2F2" } };
          }
          
          if (C === 1 || C === 3 || C === 5) ws[cell_ref].s.border.right = { style: 'medium' };
          if (C === 0 || C === 2 || C === 4) ws[cell_ref].s.border.left = { style: 'medium' };
          if (R === 0) ws[cell_ref].s.font = { bold: true, sz: 14 };
          if (ws[cell_ref].v === "實領金額") ws[cell_ref].s.font = { bold: true, color: { rgb: "0000FF" } };
        }
      }

      // 欄寬
      ws["!cols"] = [
        { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 12 },
        { wch: 16 }, { wch: 12 }, { wch: 18 },
      ];

      // Sheet 名稱：姓名（避免特殊字元問題，最多 31 字）
      const sheetName = p.name.substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    XLSX.writeFile(wb, `耀聖藥局_${rocYear}年${month}月薪資明細.xlsx`);
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
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
            {[2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}年（民國{toROC(y)}年）</option>)}
          </select>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}月</option>)}
          </select>
          <button onClick={exportExcel} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
            📥 匯出 Excel（每人一份）
          </button>
        </div>
      </div>

      {isLoading ? <div className="text-center py-12 text-gray-500">載入中...</div> : (
        <>
          {/* ── 費率設定 ── */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="font-semibold text-gray-900 mb-4">計算費率設定</h2>
            <p className="text-sm text-gray-600 mb-3">
              請假依假別分項計算扣薪；補休假不計費率（由補休時數帳本抵扣）。加班費僅計「選擇加班費」且已核准的申請。
            </p>
            <div className="space-y-3">
              {rateConfigs
                .filter((rate) => rate.itemKey !== "leave_hourly")
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((rate) => (
                <div key={rate.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                  <span className="flex-1 text-sm font-medium text-gray-700">{rate.label}</span>
                  {editingRate === rate.id ? (
                    <>
                      <input type="number" value={rateForm.amount} onChange={(e) => setRateForm({ ...rateForm, amount: Number(e.target.value) })} className="w-28 border rounded px-2 py-1 text-sm" />
                      <span className="text-xs text-gray-500">{rate.unit}</span>
                      <button onClick={() => saveRateConfig(rate.id)} className="px-3 py-1 bg-blue-600 text-white text-xs rounded">儲存</button>
                      <button onClick={() => setEditingRate(null)} className="px-3 py-1 border text-xs rounded">取消</button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm text-gray-900 font-medium">${rate.amount.toLocaleString()} {rate.unit}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${rate.isDeduction ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>{rate.isDeduction ? "扣款" : "加項"}</span>
                      <button onClick={() => { setEditingRate(rate.id); setRateForm({ label: rate.label, amount: rate.amount, unit: rate.unit, isDeduction: rate.isDeduction }); }} className="px-3 py-1 bg-blue-600 text-white text-xs rounded">編輯</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── 員工薪資詳細設定 ── */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="font-semibold text-gray-900 mb-4">員工薪資設定</h2>
            <div className="space-y-3">
              {displayEmployees.map((emp) => {
                const cfg = salaryConfigs[emp.id];
                const isEditing = editingSalary === emp.id;
                return (
                  <div key={emp.id} className="border rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                      <span className="font-medium text-gray-900">{emp.name}</span>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span>底薪 ${(cfg?.baseSalary ?? 0).toLocaleString()}</span>
                        <span>時薪 ${cfg?.hourlyRate ?? 0}/hr</span>
                        <span>職位 {cfg?.position || "—"}</span>
                        {!isEditing && (
                          <button
                            onClick={() => { setEditingSalary(emp.id); setSalaryForm(cfg ? { ...cfg } : emptySalaryForm); }}
                            className="px-3 py-1 bg-blue-600 text-white text-xs rounded"
                          >編輯</button>
                        )}
                      </div>
                    </div>
                    {isEditing && (
                      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                        {([
                          ["姓名底薪", "baseSalary", "number"],
                          ["勞保費（員工）", "laborInsurance", "number"],
                          ["健保費（員工）", "healthInsurance", "number"],
                          ["退休金提撥（員工6%）", "pensionDeduction", "number"],
                          ["職位", "position", "text"],
                          ["入帳帳號（如：合庫 0251-9880-17402）", "bankAccount", "text"],
                          ["時薪（元/HR）", "hourlyRate", "number"],
                          ["本月正常時數", "normalHours", "number"],
                          ["公司提撥比率（%）", "companyPensionRate", "number"],
                          ["提撥工資級距", "companyPensionBase", "number"],
                          ["發薪日期（如：115/05/05）", "payDate", "text"],
                          ["職業工會補助費", "unionFee", "number"],
                        ] as [string, keyof typeof salaryForm, string][]).map(([label, field, type]) => (
                          <div key={field}>
                            <label className="block text-xs text-gray-500 mb-1">{label}</label>
                            <input
                              type={type}
                              value={salaryForm[field] as string | number}
                              onChange={(e) => setSalaryForm({ ...salaryForm, [field]: type === "number" ? Number(e.target.value) : e.target.value })}
                              className="w-full border rounded px-2 py-1.5 text-sm"
                            />
                          </div>
                        ))}
                        <div className="col-span-2 md:col-span-4 flex gap-2 pt-2">
                          <button onClick={() => saveSalaryConfig(emp.id)} className="px-4 py-2 bg-blue-600 text-white text-sm rounded">儲存</button>
                          <button onClick={() => setEditingSalary(null)} className="px-4 py-2 border text-sm rounded">取消</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 本月異動項目 ── */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="font-semibold text-gray-900 mb-4">本月異動項目（民國{toROC(year)}年{month}月）</h2>
            {adjustments.length > 0 && (
              <div className="space-y-2 mb-4">
                {adjustments.map((adj) => {
                  const emp = employees.find((e) => e.id === adj.userId);
                  return (
                    <div key={adj.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <span className="font-medium w-16">{emp?.name}</span>
                      <span className="flex-1 text-sm">{adj.label}</span>
                      <span className={`text-sm font-medium ${adj.isDeduction ? "text-red-600" : "text-green-600"}`}>
                        {adj.isDeduction ? "-" : "+"}${adj.amount.toLocaleString()}
                      </span>
                      <button onClick={() => deleteAdjustment(adj.id)} className="text-red-500 text-xs">刪除</button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-3 border-t">
              <select value={newAdjForm.userId} onChange={(e) => setNewAdjForm({ ...newAdjForm, userId: e.target.value })} className="border rounded px-3 py-1.5 text-sm">
                <option value="">選擇員工</option>
                {displayEmployees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <input type="text" placeholder="項目名稱（如：業績獎金）" value={newAdjForm.label} onChange={(e) => setNewAdjForm({ ...newAdjForm, label: e.target.value })} className="border rounded px-3 py-1.5 text-sm w-44" />
              <input type="number" placeholder="金額" value={newAdjForm.amount} onChange={(e) => setNewAdjForm({ ...newAdjForm, amount: Number(e.target.value) })} className="border rounded px-3 py-1.5 text-sm w-24" />
              <select value={newAdjForm.isDeduction ? "true" : "false"} onChange={(e) => setNewAdjForm({ ...newAdjForm, isDeduction: e.target.value === "true" })} className="border rounded px-3 py-1.5 text-sm">
                <option value="false">加項（獎金）</option>
                <option value="true">扣款</option>
              </select>
              <button onClick={addAdjustment} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded">新增</button>
            </div>
          </div>

          {/* ── 薪資結算預覽 ── */}
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">民國{toROC(year)}年{month}月 薪資結算預覽</h2>
              <button onClick={exportSummaryExcel} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm">📥 匯出全體薪資總表</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
	                    {["姓名", "職位", "底薪", "勞保", "健保", "退休金", "請假扣", "加班費", "遲到扣", "異動", "實領", "狀態"].map((h) => (
	                      <th key={h} className="px-3 py-3 text-right font-medium text-gray-700 first:text-left">{h}</th>
	                    ))}
	                  </tr>
	                </thead>
	                <tbody className="divide-y">
	                  {payrollData.map((p) => {
                      const record = payrollRecords.find(r => r.userId === p.userId && r.year === year && r.month === month);
                      const isPublished = record?.isPublished;
                      return (
                        <tr key={p.userId} className="hover:bg-gray-50">
                          <td className="px-3 py-3 font-medium">{p.name}</td>
                          <td className="px-3 py-3 text-right text-gray-500">{p.position || "—"}</td>
                          <td className="px-3 py-3 text-right">${p.baseSalary.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right text-red-600">-${p.laborInsurance.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right text-red-600">-${p.healthInsurance.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right text-red-600">-${p.pensionDeduction.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right text-red-600">{p.leaveDeduction > 0 ? `-$${p.leaveDeduction}` : "—"}</td>
                          <td className="px-3 py-3 text-right text-green-600">{p.overtimePay > 0 ? `+$${p.overtimePay}` : "—"}</td>
                          <td className="px-3 py-3 text-right text-red-600">{p.tardinessDeduction > 0 ? `-$${p.tardinessDeduction}` : "—"}</td>
                          <td className="px-3 py-3 text-right">
                            {p.bonusTotal !== 0 ? <span className={p.bonusTotal > 0 ? "text-green-600" : "text-red-600"}>{p.bonusTotal > 0 ? "+" : ""}${p.bonusTotal.toLocaleString()}</span> : "—"}
                          </td>
                          <td className="px-3 py-3 text-right font-bold text-blue-600">${p.finalPay.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right">
                            {isPublished ? (
                              <button
                                onClick={() => {
                                  const record = payrollRecords.find(r => r.userId === p.userId && r.year === year && r.month === month);
                                  if (record && confirm(`確定要取消發布 ${p.name} 的薪資單嗎？`)) {
                                    unpublishPayrollRecord(record.id);
                                  }
                                }}
                                className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium hover:bg-emerald-200 transition-colors"
                              >
                                已發布 ✓
                              </button>
                            ) : (
                              <button
                                onClick={() => handlePublish(p.userId)}
                                className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full hover:bg-blue-700 transition-colors"
                              >
                                發布
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
