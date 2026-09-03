"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useApp } from "@/lib/context/AppContext";
import {
  canManagePayroll,
  canSubmitBonus,
  BONUS_ADJUSTMENT_PRESETS,
} from "@/lib/auth/permissions";
import { buildEffectiveTardinessRecords } from "@/lib/tardiness";
import { createClient } from "@/lib/supabase/client";
import {
  PAYROLL_LEAVE_RATE_DEFS,
  PAYROLL_LEAVE_RATE_KEYS,
  type LeaveType,
} from "@/lib/attendance/leaveHours";
import { getApprovedLeaveHoursInMonth } from "@/lib/attendance/canonicalMonthHours";
import { calculateLeavePayDeduction } from "@/lib/payroll/leaveDeduction";
import {
  FORMULA_TYPE_OPTIONS,
  calculateRateAmount,
  deriveHourlyRateByLaborStandard,
  describeRateFormula,
  isHourlyMultiplierFormula,
  isPercentageFormula,
  normalizePayrollFormulaType,
  suggestFormulaTypeForItem,
  type PayrollFormulaType,
} from "@/lib/payroll/rateFormulas";
import {
  getDefaultPayrollPeriod,
  computeMonthlyAttendanceHours,
} from "@/lib/payroll/monthlyHours";
import {
  calculateFullAttendancePay,
  contractualPay,
  getYearlySickLeaveDays,
  mapSalaryItemRow,
  sumSalaryItems,
  wageBaseForOvertime,
  type EmployeeSalaryItem,
  type SalaryItemDraft,
} from "@/lib/payroll/salaryItems";
import EmployeeSalaryItemsEditor from "@/components/payroll/EmployeeSalaryItemsEditor";
import { buildPayslipWorksheet } from "@/lib/payroll/payslipExcelLayout";
import { parseStoreConfig } from "@/lib/store-config";
import { SITES, storeConfigSettingId } from "@/lib/sites";
import { isEmployeeActiveInMonth } from "@/lib/schedule/employeeActivePeriod";
import { APP_ROLE_LABELS } from "@/lib/auth/roles";
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
  formulaType: PayrollFormulaType;
  percentage: number;
};

type Adjustment = {
  id: string;
  userId: string;
  label: string;
  amount: number;
  isDeduction: boolean;
  bonusCategory?: string | null;
};

type AdjustmentAttachment = {
  id: string;
  adjustmentId: string;
  fileName: string;
  expiresAt: string;
};

type EmployeePayroll = {
  userId: string;
  name: string;
  position: string;
  bankAccount: string;
  hourlyRate: number;
  /** 薪資設定的正常時數；若為 0 則試算改用出勤應出勤時數 */
  normalHours: number;
  /** 班表彙總應出勤工時（已扣請假） */
  workHours: number;
  /** 實際用於明細／試算的正常時數 */
  effectiveNormalHours: number;
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
  /** 加班申請（選加班費）時數 */
  overtimeAppHours: number;
  /** 國定假日排班工時 */
  holidayOvertimeHours: number;
  /** 加班費合計時數（申請加班費＋國定假） */
  overtimeHours: number;
  overtimePay: number;
  tardinessMinutes: number;
  tardinessDeduction: number;
  adjustments: Adjustment[];
  bonusTotal: number;
  positionGradeTotal: number;
  fixedAllowanceTotal: number;
  fullAttendancePay: number;
  contractualPay: number;
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

function isDateInMonth(dateValue: string | null | undefined, year: number, month: number) {
  if (!dateValue) return false;
  const match = String(dateValue).match(/^(\d{4})-(\d{2})-(\d{2})/);
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
    getHolidayInfo,
    shiftTimeConfig,
    payrollRecords,
    publishPayrollRecord,
    unpublishPayrollRecord,
    loadPayrollRecords,
    storeConfig: homeStoreConfig,
    activeSiteId,
    workSiteId,
  } = useApp();
  const supabase = createClient();
  const [payrollStoreConfig, setPayrollStoreConfig] = useState(homeStoreConfig);

  useEffect(() => {
    setPayrollStoreConfig(homeStoreConfig);
  }, [homeStoreConfig]);

  useEffect(() => {
    let cancelled = false;
    if (currentUser?.role === "owner" || activeSiteId === workSiteId) {
      return;
    }
    void (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("id", storeConfigSettingId(activeSiteId))
        .maybeSingle();
      if (!cancelled) {
        setPayrollStoreConfig(parseStoreConfig(data?.value ?? null, activeSiteId));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSiteId, workSiteId, currentUser?.role, supabase]);

  const storeConfig = payrollStoreConfig;

  const defaultPeriod = getDefaultPayrollPeriod();
  const [year, setYear] = useState(defaultPeriod.year);
  const [month, setMonth] = useState(defaultPeriod.month);
  const [showTrial, setShowTrial] = useState(true);

  const [salaryConfigs, setSalaryConfigs] = useState<Record<string, SalaryConfig>>({});
  const [salaryItemsByUser, setSalaryItemsByUser] = useState<Record<string, EmployeeSalaryItem[]>>({});
  const [rateConfigs, setRateConfigs] = useState<RateConfig[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [attachmentsByAdjId, setAttachmentsByAdjId] = useState<
    Record<string, AdjustmentAttachment[]>
  >({});
  const [uploadingAdjId, setUploadingAdjId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [editingSalary, setEditingSalary] = useState<string | null>(null);
  const [salaryForm, setSalaryForm] = useState<Omit<SalaryConfig, "userId">>(emptySalaryForm);
  const [editingItems, setEditingItems] = useState<SalaryItemDraft[]>([]);
  const [editingRate, setEditingRate] = useState<string | null>(null);
  const [rateForm, setRateForm] = useState({
    label: "",
    amount: 0,
    unit: "元/小時",
    isDeduction: true,
    formulaType: "fixed_amount" as PayrollFormulaType,
    percentage: 0,
  });
  const [newAdjForm, setNewAdjForm] = useState({
    userIds: [] as string[],
    label: "",
    amount: 0,
    isDeduction: false,
  });

  const actor = { role: currentUser?.role, capabilities: currentUser?.capabilities };
  const canSettle = canManagePayroll(actor, storeConfig.policies);
  const canBonus = canSubmitBonus(actor, storeConfig.policies);
  const displayEmployees = employees.filter(
    (e) =>
      e.role !== "owner" &&
      isEmployeeActiveInMonth(e, year, month)
  );

  // ─── Load data ─────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [salaryRes, monthlyRes, rateRes, adjRes, itemRes] = await Promise.all([
        supabase.from("employee_salary_config").select("*"),
        supabase.from("employee_salary_monthly").select("*").eq("year", year).eq("month", month),
        supabase.from("payroll_rate_config").select("*").order("sort_order"),
        supabase.from("payroll_adjustments").select("*").eq("year", year).eq("month", month),
        supabase.from("employee_salary_items").select("*").order("sort_order"),
      ]);
      if (salaryRes.data) {
        const map: Record<string, SalaryConfig> = {};
        const toConfig = (r: Record<string, unknown>, userId: string): SalaryConfig => ({
          userId,
          baseSalary: Number(r.base_salary),
          laborInsurance: Number(r.labor_insurance),
          healthInsurance: Number(r.health_insurance),
          pensionDeduction: Number(r.pension_deduction),
          position: String(r.position ?? ""),
          bankAccount: String(r.bank_account ?? ""),
          hourlyRate: Number(r.hourly_rate ?? 0),
          normalHours: Number(r.normal_hours ?? 0),
          companyPensionRate: Number(r.company_pension_rate ?? 6),
          companyPensionBase: Number(r.company_pension_base ?? 0),
          payDate: String(r.pay_date ?? ""),
          unionFee: Number(r.union_fee ?? 0),
        });
        salaryRes.data.forEach((r) => {
          map[r.user_id] = toConfig(r as Record<string, unknown>, r.user_id);
        });
        (monthlyRes.data ?? []).forEach((r) => {
          map[r.user_id] = {
            ...toConfig(r as Record<string, unknown>, r.user_id),
            normalHours: map[r.user_id]?.normalHours ?? Number(r.normal_hours ?? 0),
          };
        });
        setSalaryConfigs(map);
      }
      if (itemRes.data) {
        const map: Record<string, EmployeeSalaryItem[]> = {};
        itemRes.data.forEach((r) => {
          const item = mapSalaryItemRow(r as Record<string, unknown>);
          if (!map[item.userId]) map[item.userId] = [];
          map[item.userId].push(item);
        });
        setSalaryItemsByUser(map);
      } else if (itemRes.error) {
        // migration 尚未套用時略過
        setSalaryItemsByUser({});
      }
      if (rateRes.data) {
        const mapped = rateRes.data.map((r) => ({
          id: r.id, itemKey: r.item_key, label: r.label,
          amount: Number(r.amount), unit: r.unit,
          isDeduction: r.is_deduction, sortOrder: r.sort_order,
          formulaType: normalizePayrollFormulaType(r.formula_type),
          percentage: Number(r.percentage ?? 0),
        }));
        const missing = PAYROLL_LEAVE_RATE_DEFS.filter(
          (d) => !mapped.some((r) => r.itemKey === d.itemKey)
        );
        if (missing.length > 0) {
          await supabase.from("payroll_rate_config").insert(
            missing.map((d) => ({
              item_key: d.itemKey,
              label: d.label,
              amount: 0,
              unit: "元/小時",
              is_deduction: d.isDeduction,
              sort_order: d.itemKey.length,
            }))
          );
          const { data: refreshed } = await supabase
            .from("payroll_rate_config")
            .select("*")
            .order("sort_order");
          if (refreshed) {
            setRateConfigs(
              refreshed.map((r) => ({
                id: r.id, itemKey: r.item_key, label: r.label,
                amount: Number(r.amount), unit: r.unit,
                isDeduction: r.is_deduction, sortOrder: r.sort_order,
                formulaType: normalizePayrollFormulaType(r.formula_type),
                percentage: Number(r.percentage ?? 0),
              }))
            );
          } else {
            setRateConfigs(mapped);
          }
        } else {
          setRateConfigs(mapped);
        }
      }
      if (adjRes.data) {
        const mapped = adjRes.data.map((r) => ({
          id: r.id,
          userId: r.user_id,
          label: r.label,
          amount: Number(r.amount),
          isDeduction: r.is_deduction,
          bonusCategory: r.bonus_category ?? null,
        }));
        setAdjustments(mapped);
        const adjIds = mapped.map((a) => a.id);
        if (adjIds.length > 0) {
          const { data: attachRows } = await supabase
            .from("payroll_adjustment_attachments")
            .select("id, adjustment_id, file_name, expires_at")
            .in("adjustment_id", adjIds)
            .gte("expires_at", new Date().toISOString());
          const grouped: Record<string, AdjustmentAttachment[]> = {};
          (attachRows ?? []).forEach((row) => {
            const item: AdjustmentAttachment = {
              id: row.id,
              adjustmentId: row.adjustment_id,
              fileName: row.file_name,
              expiresAt: row.expires_at,
            };
            if (!grouped[item.adjustmentId]) grouped[item.adjustmentId] = [];
            grouped[item.adjustmentId].push(item);
          });
          setAttachmentsByAdjId(grouped);
        } else {
          setAttachmentsByAdjId({});
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [supabase, year, month]);

  useEffect(() => { 
    if (canSettle || canBonus) {
      loadData(); 
      if (canSettle) loadPayrollRecords(year, month);
    }
  }, [canSettle, canBonus, loadData, loadPayrollRecords, year, month]);

  // ─── Compute payroll ────────────────────────────────────────────────────────

  const computePayroll = useCallback((): EmployeePayroll[] => {
    const overtimeRateCfg = rateConfigs.find((r) => r.itemKey === "overtime_hourly");
    const tardinessRateCfg = rateConfigs.find((r) => r.itemKey === "tardiness_per_min");

    const leaveRateCfgByType = (type: LeaveType) => {
      if (type === "補休假") return null;
      const key = PAYROLL_LEAVE_RATE_KEYS[type as Exclude<LeaveType, "補休假">];
      return rateConfigs.find((r) => r.itemKey === key) ?? null;
    };

    const effectiveTardinessRecords = buildEffectiveTardinessRecords(
      tardinessRecords,
      punchRecords,
      overtimeRequests,
      leaveRequests
    );

    return displayEmployees.map((emp) => {
      const cfg = salaryConfigs[emp.id] ?? { ...emptySalaryForm, userId: emp.id };
      const items = salaryItemsByUser[emp.id] ?? [];
      const positionGradeTotal = sumSalaryItems(items, "position_grade");
      const contractPay = contractualPay(cfg.baseSalary, items);
      const wageBase = wageBaseForOvertime(cfg.baseSalary, items);
      const salaryBasis = {
        baseSalary: wageBase > 0 ? wageBase : cfg.baseSalary,
        hourlyRate: cfg.hourlyRate,
      };

      const attendanceHours = computeMonthlyAttendanceHours({
        employeeId: emp.id,
        year,
        month,
        getShiftForDate,
        getHolidayInfo,
        shiftTimeConfig,
        leaveRequests,
        overtimeRequests,
        storeConfig,
      });

      const empLeaves = leaveRequests.filter(
        (r) =>
          r.employeeId === emp.id &&
          r.status === "approved" &&
          r.type !== "補休假" &&
          r.endDate >= `${year}-NT${String(month).padStart(2, "0")}-01` &&
          r.startDate <=
            `${year}-NT${String(month).padStart(2, "0")}-NT${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`
      );

      let leaveHours = 0;
      let leaveDeduction = 0;
      const leaveHoursByType: Record<string, number> = {};
      for (const r of empLeaves) {
        const hours = getApprovedLeaveHoursInMonth({
          request: r,
          year,
          month,
          getShiftForDate,
          shiftTimeConfig,
          storeConfig,
        });
        leaveHours += hours;
        leaveHoursByType[r.type] = (leaveHoursByType[r.type] ?? 0) + hours;
        const leaveRate = leaveRateCfgByType(r.type);
        leaveDeduction += calculateLeavePayDeduction({
          leaveType: r.type,
          hours,
          overrides: storeConfig.policies.leaveRules,
          rate: leaveRate
            ? {
                itemKey: leaveRate.itemKey,
                amount: leaveRate.amount,
                formulaType: leaveRate.formulaType,
                percentage: leaveRate.percentage,
              }
            : null,
          salary: salaryBasis,
        }).amount;
      }
      leaveHours = Math.round(leaveHours * 100) / 100;
      leaveDeduction = Math.round(leaveDeduction * 100) / 100;

      const overtimeAppHours = attendanceHours.overtimePayHours;
      const holidayOvertimeHours = attendanceHours.holidayOvertimeHours;
      const overtimeHours = Math.round((overtimeAppHours + holidayOvertimeHours) * 100) / 100;
      const workHours = attendanceHours.workHours;
      const effectiveNormalHours = workHours;

      const tardinessMinutes = effectiveTardinessRecords
        .filter((r) => r.employeeId === emp.id && isDateInMonth(r.date, year, month))
        .reduce((acc, r) => acc + r.minutes, 0);

      const empAdj = adjustments.filter((a) => a.userId === emp.id);
      const bonusTotal = empAdj.reduce((acc, a) => acc + (a.isDeduction ? -a.amount : a.amount), 0);

      const overtimePay = overtimeRateCfg
        ? calculateRateAmount(overtimeHours, overtimeRateCfg, salaryBasis, "hour")
        : 0;
      const tardinessDeduction = tardinessRateCfg
        ? calculateRateAmount(tardinessMinutes, tardinessRateCfg, salaryBasis, "minute")
        : 0;

      // 固定津貼：全勤依規則試算；其餘啟用項目全額
      let fullAttendancePay = 0;
      let fixedAllowanceTotal = 0;
      for (const item of items.filter((i) => i.isEnabled && i.category === "fixed_allowance")) {
        if (item.presetKey === "full_attendance") {
          const fa = calculateFullAttendancePay({
            configuredAmount: item.amount,
            leaveHoursByType,
            yearlySickLeaveDays: getYearlySickLeaveDays({
              employeeId: emp.id,
              leaveRequests,
              asOfYear: year,
              asOfMonth: month,
            }),
          });
          fullAttendancePay = fa.paidAmount;
          fixedAllowanceTotal += fa.paidAmount;
        } else {
          fixedAllowanceTotal += item.amount;
        }
      }

      const finalPayRaw =
        contractPay +
        fixedAllowanceTotal -
        cfg.laborInsurance -
        cfg.healthInsurance -
        cfg.pensionDeduction -
        leaveDeduction +
        overtimePay -
        tardinessDeduction +
        bonusTotal;
      const finalPay = Math.round(finalPayRaw);

      return {
        userId: emp.id,
        name: emp.name,
        position: cfg.position,
        bankAccount: cfg.bankAccount,
        hourlyRate: cfg.hourlyRate,
        normalHours: cfg.normalHours,
        workHours,
        effectiveNormalHours,
        companyPensionRate: cfg.companyPensionRate,
        companyPensionBase: cfg.companyPensionBase,
        payDate: cfg.payDate,
        unionFee: cfg.unionFee,
        baseSalary: cfg.baseSalary,
        laborInsurance: cfg.laborInsurance,
        healthInsurance: cfg.healthInsurance,
        pensionDeduction: cfg.pensionDeduction,
        leaveHours,
        leaveDeduction,
        overtimeAppHours,
        holidayOvertimeHours,
        overtimeHours,
        overtimePay,
        tardinessMinutes,
        tardinessDeduction,
        adjustments: empAdj,
        bonusTotal,
        positionGradeTotal,
        fixedAllowanceTotal,
        fullAttendancePay,
        contractualPay: contractPay,
        finalPay,
      };
    });
  }, [
    displayEmployees,
    salaryConfigs,
    salaryItemsByUser,
    rateConfigs,
    adjustments,
    leaveRequests,
    overtimeRequests,
    tardinessRecords,
    punchRecords,
    year,
    month,
    getShiftForDate,
    getHolidayInfo,
    shiftTimeConfig,
    storeConfig,
  ]);

  const payrollData = useMemo(() => {
    try {
      return computePayroll();
    } catch (err) {
      console.error("[payroll] computePayroll failed", err);
      return [] as EmployeePayroll[];
    }
  }, [computePayroll]);
  const storeName = storeConfig.storeName?.trim() || "本店";

  const runTrial = () => {
    setShowTrial(true);
    void loadData();
    void loadPayrollRecords(year, month);
  };

  // ─── Publish Payroll ────────────────────────────────────────────────────────
  const handlePublish = async (employeeId: string) => {
    const p = payrollData.find(d => d.userId === employeeId);
    if (!p) return;

    if (!confirm(`確定要發布 ${p.name} 的 ${year} 年 ${month} 月薪資單嗎？發布後員工將收到通知並可查看詳情。`)) return;

    // 先存檔到資料庫（含新結構欄位；舊庫無欄位時退回基本欄位）
    const payload = {
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
      bonus_total: p.bonusTotal + p.fixedAllowanceTotal,
      position_grade_total: p.positionGradeTotal,
      fixed_allowance_total: p.fixedAllowanceTotal,
      full_attendance_pay: p.fullAttendancePay,
      final_pay: p.finalPay,
      note: p.positionGradeTotal > 0 || p.fixedAllowanceTotal > 0
        ? `合約加級 ${p.positionGradeTotal}；固定項目 ${p.fixedAllowanceTotal}（含全勤 ${p.fullAttendancePay}）`
        : "",
      created_by: currentUser?.id,
    };
    let { data, error } = await supabase.from("payroll_records").upsert(payload, { onConflict: "user_id,year,month" }).select().single();
    if (error && /position_grade_total|fixed_allowance_total|full_attendance_pay/.test(String(error.message || ""))) {
      const legacy = {
        user_id: payload.user_id,
        year: payload.year,
        month: payload.month,
        base_salary: payload.base_salary,
        labor_insurance: payload.labor_insurance,
        health_insurance: payload.health_insurance,
        pension_deduction: payload.pension_deduction,
        leave_deduction: payload.leave_deduction,
        overtime_pay: payload.overtime_pay,
        tardiness_deduction: payload.tardiness_deduction,
        bonus_total: payload.bonus_total,
        final_pay: payload.final_pay,
        note: payload.note,
        created_by: payload.created_by,
      };
      ({ data, error } = await supabase.from("payroll_records").upsert(legacy, { onConflict: "user_id,year,month" }).select().single());
    }

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
    const { error: cfgErr } = await supabase.from("employee_salary_config").upsert({
      user_id: userId,
      base_salary: salaryForm.baseSalary,
      labor_insurance: salaryForm.laborInsurance,
      health_insurance: salaryForm.healthInsurance,
      pension_deduction: salaryForm.pensionDeduction,
      position: salaryForm.position,
      bank_account: salaryForm.bankAccount,
      hourly_rate: salaryForm.hourlyRate,
      company_pension_rate: salaryForm.companyPensionRate,
      company_pension_base: salaryForm.companyPensionBase,
      pay_date: salaryForm.payDate,
      union_fee: salaryForm.unionFee,
      updated_by: currentUser?.id,
    }, { onConflict: "user_id" });
    if (cfgErr) {
      alert("儲存薪資設定失敗：" + cfgErr.message);
      return;
    }

    const { error: snapErr } = await supabase.from("employee_salary_monthly").upsert(
      {
        user_id: userId,
        year,
        month,
        base_salary: salaryForm.baseSalary,
        labor_insurance: salaryForm.laborInsurance,
        health_insurance: salaryForm.healthInsurance,
        pension_deduction: salaryForm.pensionDeduction,
        position: salaryForm.position,
        bank_account: salaryForm.bankAccount,
        hourly_rate: salaryForm.hourlyRate,
        company_pension_rate: salaryForm.companyPensionRate,
        company_pension_base: salaryForm.companyPensionBase,
        pay_date: salaryForm.payDate,
        union_fee: salaryForm.unionFee,
        updated_by: currentUser?.id,
      },
      { onConflict: "user_id,year,month" }
    );
    if (snapErr && !/does not exist|schema cache/i.test(String(snapErr.message || ""))) {
      alert("儲存本月薪資快照失敗：" + snapErr.message);
      return;
    }

    // 重寫薪資項目（職位加級／固定項目）
    const { error: delErr } = await supabase.from("employee_salary_items").delete().eq("user_id", userId);
    if (delErr && !String(delErr.message || "").includes("does not exist")) {
      // 表不存在時略過；其他錯誤提示
      if (!/relation|does not exist|schema cache/i.test(String(delErr.message || ""))) {
        alert("儲存薪資項目失敗：" + delErr.message);
        return;
      }
    } else if (!delErr) {
      const rows = editingItems
        .filter((i) => i.label.trim())
        .map((i, idx) => ({
          user_id: userId,
          category: i.category,
          label: i.label.trim(),
          amount: Number(i.amount) || 0,
          preset_key: i.presetKey,
          counts_as_wage: i.countsAsWage,
          is_enabled: i.isEnabled !== false,
          sort_order: idx,
        }));
      if (rows.length > 0) {
        const { error: insErr } = await supabase.from("employee_salary_items").insert(rows);
        if (insErr) {
          alert("儲存薪資項目失敗：" + insErr.message + "\n請先套用 migration：employee_salary_items");
          return;
        }
      }
      setSalaryItemsByUser((prev) => ({
        ...prev,
        [userId]: rows.map((r, idx) =>
          mapSalaryItemRow({ ...r, id: `local-NT${idx}` })
        ),
      }));
      // 重新載入以取得正式 id
      const { data: refreshed } = await supabase
        .from("employee_salary_items")
        .select("*")
        .eq("user_id", userId)
        .order("sort_order");
      if (refreshed) {
        setSalaryItemsByUser((prev) => ({
          ...prev,
          [userId]: refreshed.map((r) => mapSalaryItemRow(r as Record<string, unknown>)),
        }));
      }
    }

    setSalaryConfigs((prev) => ({ ...prev, [userId]: { userId, ...salaryForm } }));
    setEditingSalary(null);
    setEditingItems([]);
  };

  // ─── Save rate config ───────────────────────────────────────────────────────

  const saveRateConfig = async (id: string) => {
    const payload: Record<string, unknown> = {
      amount: rateForm.amount,
      formula_type: rateForm.formulaType,
      percentage: rateForm.percentage,
      updated_by: currentUser?.id,
    };
    const { error } = await supabase.from("payroll_rate_config").update(payload).eq("id", id);
    if (error) {
      // 舊資料庫尚未跑 migration 時，至少先存金額
      if (String(error.message || "").includes("formula_type") || String(error.message || "").includes("percentage")) {
        const { error: fallbackError } = await supabase
          .from("payroll_rate_config")
          .update({ amount: rateForm.amount, updated_by: currentUser?.id })
          .eq("id", id);
        if (fallbackError) {
          alert("儲存費率失敗：" + fallbackError.message);
          return;
        }
        alert("已儲存金額。請套用資料庫 migration 後即可儲存自訂公式。");
      } else {
        alert("儲存費率失敗：" + error.message);
        return;
      }
    }
    setRateConfigs((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              amount: rateForm.amount,
              formulaType: rateForm.formulaType,
              percentage: rateForm.percentage,
            }
          : r
      )
    );
    setEditingRate(null);
  };

  // ─── Adjustments ───────────────────────────────────────────────────────────

  const addAdjustment = async () => {
    const selectedIds = Array.isArray(newAdjForm.userIds) ? newAdjForm.userIds : [];
    if (selectedIds.length === 0 || !newAdjForm.label.trim()) {
      alert("請至少選擇一位員工，並填寫項目名稱。");
      return;
    }
    const amount = Number(newAdjForm.amount);
    if (!Number.isFinite(amount)) {
      alert("請填寫有效金額。");
      return;
    }
    const bonusCategory = BONUS_ADJUSTMENT_PRESETS.includes(
      newAdjForm.label.trim() as (typeof BONUS_ADJUSTMENT_PRESETS)[number]
    )
      ? newAdjForm.label.trim()
      : null;
    const rows = selectedIds.map((userId) => ({
      user_id: userId,
      year,
      month,
      label: newAdjForm.label.trim(),
      amount,
      is_deduction: newAdjForm.isDeduction,
      bonus_category: bonusCategory,
      created_by: currentUser?.id,
    }));
    const { data, error } = await supabase.from("payroll_adjustments").insert(rows).select();
    if (error) {
      alert("新增異動失敗：" + error.message);
      return;
    }
    if (data?.length) {
      setAdjustments((prev) => [
        ...prev,
        ...data.map((row) => ({
          id: row.id,
          userId: row.user_id,
          label: row.label,
          amount: Number(row.amount),
          isDeduction: row.is_deduction,
          bonusCategory: row.bonus_category ?? null,
        })),
      ]);
    }
    setNewAdjForm({ userIds: [], label: "", amount: 0, isDeduction: false });
  };

  const toggleAdjEmployee = (userId: string) => {
    setNewAdjForm((prev) => {
      const current = Array.isArray(prev.userIds) ? prev.userIds : [];
      const exists = current.includes(userId);
      return {
        ...prev,
        userIds: exists ? current.filter((id) => id !== userId) : [...current, userId],
      };
    });
  };

  const deleteAdjustment = async (id: string) => {
    await supabase.from("payroll_adjustments").delete().eq("id", id);
    setAdjustments((prev) => prev.filter((a) => a.id !== id));
    setAttachmentsByAdjId((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const uploadAdjustmentAttachment = async (adjustmentId: string, file: File) => {
    setUploadingAdjId(adjustmentId);
    try {
      const form = new FormData();
      form.append("adjustmentId", adjustmentId);
      form.append("file", file);
      const res = await fetch("/api/payroll/adjustments/attachments", {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as {
        error?: string;
        attachment?: {
          id: string;
          adjustment_id: string;
          file_name: string;
          expires_at: string;
        };
      };
      if (!res.ok || !json.attachment) {
        alert(json.error || "上傳失敗");
        return;
      }
      const item: AdjustmentAttachment = {
        id: json.attachment.id,
        adjustmentId: json.attachment.adjustment_id,
        fileName: json.attachment.file_name,
        expiresAt: json.attachment.expires_at,
      };
      setAttachmentsByAdjId((prev) => ({
        ...prev,
        [adjustmentId]: [...(prev[adjustmentId] ?? []), item],
      }));
    } catch (err) {
      alert(err instanceof Error ? err.message : "上傳失敗");
    } finally {
      setUploadingAdjId(null);
    }
  };

  const openAdjustmentAttachment = async (attachmentId: string) => {
    try {
      const res = await fetch(
        `/api/payroll/adjustments/attachments?id=${encodeURIComponent(attachmentId)}`
      );
      const json = (await res.json()) as { error?: string; url?: string };
      if (!res.ok || !json.url) {
        alert(json.error || "無法開啟附件");
        return;
      }
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      alert(err instanceof Error ? err.message : "無法開啟附件");
    }
  };

  // ─── Export Excel（附圖格式，每人一 sheet，民國年）──────────────────────────

  // 匯出全體薪資總表 (第二個按鈕功能)
  const exportSummaryExcel = () => {
    const rocYear = toROC(year);
    const wb = XLSX.utils.book_new();
    const rows: (string | number)[][] = [
      [`${storeName} ${rocYear} 年 ${month} 月 薪資結算總表`],
      [
        "姓名",
        "職位",
        "應出勤時數",
        "請假時數(含補休)",
        "加班費時數",
        "國定假加班時數",
        "遲到分鐘",
        "底薪",
        "勞保費",
        "健保費",
        "員工自提",
        "請假扣款",
        "加班費",
        "遲到扣款",
        "異動加減",
        "實領金額",
        "入帳帳號",
        "換算說明",
      ]
    ];

    payrollData.forEach(p => {
      const formulaNotes: string[] = [];
      if (p.overtimePay > 0 && p.overtimeHours > 0) {
        formulaNotes.push(
          `加班費=${p.overtimeHours.toFixed(2)}h×${(p.overtimePay / p.overtimeHours).toFixed(2)}元/h`
        );
      }
      if (p.leaveDeduction > 0 && p.leaveHours > 0) {
        formulaNotes.push(
          `請假扣款=${p.leaveHours.toFixed(2)}h×${(p.leaveDeduction / p.leaveHours).toFixed(2)}元/h`
        );
      }
      if (p.tardinessDeduction > 0 && p.tardinessMinutes > 0) {
        formulaNotes.push(
          `遲到扣款=${p.tardinessMinutes}m×${(p.tardinessDeduction / p.tardinessMinutes).toFixed(2)}元/m`
        );
      }
      if (p.bonusTotal !== 0) {
        formulaNotes.push(`異動淨額=${p.bonusTotal > 0 ? "+" : ""}${p.bonusTotal.toFixed(0)}元`);
      }
      rows.push([
        p.name,
        p.position || "—",
        p.workHours,
        p.leaveHours,
        p.overtimeHours,
        p.holidayOvertimeHours,
        p.tardinessMinutes,
        p.baseSalary,
        -p.laborInsurance,
        -p.healthInsurance,
        p.pensionDeduction > 0 ? -p.pensionDeduction : "",
        p.leaveDeduction > 0 ? -p.leaveDeduction : 0,
        p.overtimePay,
        p.tardinessDeduction > 0 ? -p.tardinessDeduction : 0,
        p.bonusTotal,
        p.finalPay,
        p.bankAccount || "—",
        formulaNotes.join("；"),
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "薪資總表");
    XLSX.writeFile(wb, `${storeName}_${rocYear}年${month}月_全體薪資總表.xlsx`);
  };

  const exportExcel = () => {
    const rocYear = toROC(year);
    const wb = XLSX.utils.book_new();

    payrollData.forEach((p) => {
      // A=約定薪資結構，B=非固定，C=應代扣（含員工自提）；金額 0 不列出
      const colA: [string, number | string][] = [];
      if (p.baseSalary > 0) colA.push(["薪資", p.baseSalary]);
      if ((p.positionGradeTotal ?? 0) > 0) colA.push(["職位加級", p.positionGradeTotal]);
      if (p.leaveDeduction > 0) colA.push(["請假扣款", -p.leaveDeduction]);
      if (p.tardinessDeduction > 0) colA.push(["遲到扣款", -p.tardinessDeduction]);

      const colB: [string, number][] = [];
      if ((p.fixedAllowanceTotal ?? 0) > 0) {
        const fa = p.fullAttendancePay ?? 0;
        colB.push([
          fa > 0 ? `固定津貼／獎金（含全勤 ${fa}）` : "固定津貼／獎金",
          p.fixedAllowanceTotal,
        ]);
      }
      p.adjustments
        .filter((a) => !a.isDeduction && a.amount > 0)
        .forEach((a) => colB.push([a.label, a.amount]));
      if (p.overtimePay > 0) colB.push(["加班費", p.overtimePay]);
      p.adjustments
        .filter((a) => a.isDeduction && a.amount > 0)
        .forEach((a) => colB.push([a.label, -a.amount]));

      const colC: [string, number][] = [];
      if (p.laborInsurance > 0) colC.push(["勞保費", p.laborInsurance]);
      if (p.healthInsurance > 0) colC.push(["健保費", p.healthInsurance]);
      if (p.pensionDeduction > 0) colC.push(["員工自提", p.pensionDeduction]);

      const ws = buildPayslipWorksheet({
        title: `${storeName}　${rocYear}年${month}月　薪資明細表`,
        employeeName: p.name,
        position: p.position,
        bankAccount: p.bankAccount,
        payDate: p.payDate || "—",
        colA,
        colB,
        colC,
        overtimeHours: p.overtimeHours,
        overtimePay: p.overtimePay,
        holidayOvertimeHours: p.holidayOvertimeHours,
        leaveHours: p.leaveHours,
        leaveDeduction: p.leaveDeduction,
        hourlyRate: p.hourlyRate,
        companyPensionRate: p.companyPensionRate,
        companyPensionBase: p.companyPensionBase,
        unionFee: p.unionFee,
        note: [
          p.overtimePay > 0 && p.overtimeHours > 0
            ? `加班費 = NT${p.overtimeHours.toFixed(2)} 小時 × ${(p.overtimePay / p.overtimeHours).toFixed(
                2
              )} 元/小時 = NT${p.overtimePay.toFixed(0)} 元`
            : "",
          p.leaveDeduction > 0 && p.leaveHours > 0
            ? `請假扣款 = NT${p.leaveHours.toFixed(2)} 小時 × ${(p.leaveDeduction / p.leaveHours).toFixed(
                2
              )} 元/小時 = NT${p.leaveDeduction.toFixed(0)} 元`
            : "",
          p.tardinessDeduction > 0 && p.tardinessMinutes > 0
            ? `遲到扣款 = NT${p.tardinessMinutes} 分鐘 × ${(
                p.tardinessDeduction / p.tardinessMinutes
              ).toFixed(2)} 元/分鐘 = NT${p.tardinessDeduction.toFixed(0)} 元`
            : "",
          p.bonusTotal !== 0
            ? `其他加扣項淨額 = NT${p.bonusTotal > 0 ? "+" : ""}${p.bonusTotal.toFixed(0)} 元（依本月異動項目）`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
        finalPay: p.finalPay,
      });

      const sheetName = p.name.substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    XLSX.writeFile(wb, `${storeName}_${rocYear}年${month}月薪資明細.xlsx`);
  };

  // ─── Guard ──────────────────────────────────────────────────────────────────

  if (!canSettle && !canBonus) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-gray-500">您沒有薪資結算或獎金登錄權限</p>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* 頁頭 */}
      <div className="app-toolbar justify-between">
        <div>
          <h1 className="app-page-title">{canSettle ? "月底薪資結算" : "本月獎金登錄"}</h1>
          <p className="app-meta mt-1">
            {canSettle
              ? "預設為上個月（本月結上月薪）。店長登錄獎金後，由會計試算、核對出勤並發布。"
              : "依各店銷售報表登錄個人／團體獎金；會計將於月底統一試算薪資。"}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setShowTrial(false); }} className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white/90">
            {Array.from({ length: 5 }, (_, i) => defaultPeriod.year - 2 + i).map((y) => (
              <option key={y} value={y}>{y}年（民國{toROC(y)}年）</option>
            ))}
          </select>
          <select value={month} onChange={(e) => { setMonth(Number(e.target.value)); setShowTrial(false); }} className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white/90">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}月</option>)}
          </select>
          {canSettle && (
            <>
          <button
            type="button"
            onClick={runTrial}
            className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 text-sm font-medium"
          >
            試算
          </button>
          <button onClick={exportExcel} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
            匯出 Excel（每人一份）
          </button>
            </>
          )}
        </div>
      </div>

      {isLoading ? <div className="text-center py-12 text-gray-500">載入中...</div> : (
        <>
          {canSettle && (
          <>
          {/* ── 費率設定 ── */}
          <div className="app-panel p-6">
            <h2 className="font-semibold text-gray-900 mb-4">計算費率設定</h2>
            <p className="text-sm text-gray-600 mb-3">
              費率可選「小時公式」或「分鐘公式」。請假／加班以小時計算；遲到以分鐘計算；若公式單位不同會自動換算。
              補休假不計費率（由補休帳本抵扣）。試算會依店規給薪語意：有薪假（特休／婚喪／產假／陪產／公假）不扣；
              半薪／無薪若費率為 0，自動用時薪（無時薪則月薪÷30÷8；半薪再 ×0.5）。有填每小時扣款則以費率為準。
              試算會從班表／請假／加班自動匯入時數；「本月正常時數」若未填，明細改用出勤應出勤時數。
            </p>
            <div className="space-y-3">
              {rateConfigs
                .filter((rate) => rate.itemKey !== "leave_hourly")
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((rate) => (
                <div key={rate.id} className="p-3 bg-gray-50 rounded-lg space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex-1 text-sm font-medium text-gray-700 min-w-[8rem]">{rate.label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${rate.isDeduction ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                      {rate.isDeduction ? "扣款" : "加項"}
                    </span>
                    {editingRate !== rate.id && (
                      <button
                        onClick={() => {
                          setEditingRate(rate.id);
                          const raw = rate.formulaType || "fixed_amount";
                          let nextFormula: PayrollFormulaType = raw;
                          if (raw === "fixed_amount") {
                            nextFormula = suggestFormulaTypeForItem(rate.itemKey);
                          } else if (raw === "base_salary_percent") {
                            nextFormula =
                              suggestFormulaTypeForItem(rate.itemKey) === "fixed_per_minute"
                                ? "base_salary_percent_per_minute"
                                : "base_salary_percent_per_hour";
                          } else if (raw === "hourly_rate") {
                            nextFormula =
                              suggestFormulaTypeForItem(rate.itemKey) === "fixed_per_minute"
                                ? "hourly_rate_per_minute"
                                : "hourly_rate_per_hour";
                          }
                          setRateForm({
                            label: rate.label,
                            amount: rate.amount,
                            unit: rate.unit,
                            isDeduction: rate.isDeduction,
                            formulaType: nextFormula,
                            percentage: rate.percentage || 0,
                          });
                        }}
                        className="px-3 py-1 bg-blue-600 text-white text-xs rounded"
                      >
                        編輯
                      </button>
                    )}
                  </div>
                  {editingRate === rate.id ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">計算公式</label>
                        <select
                          value={rateForm.formulaType}
                          onChange={(e) =>
                            setRateForm({
                              ...rateForm,
                              formulaType: e.target.value as PayrollFormulaType,
                            })
                          }
                          className="w-full border rounded px-2 py-1.5 text-sm"
                        >
                          <optgroup label="小時公式（請假／加班建議）">
                            {FORMULA_TYPE_OPTIONS.filter((o) => o.group === "hour").map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="分鐘公式（遲到建議）">
                            {FORMULA_TYPE_OPTIONS.filter((o) => o.group === "minute").map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                        <p className="text-[11px] text-gray-500 mt-1">
                          {FORMULA_TYPE_OPTIONS.find((o) => o.value === rateForm.formulaType)?.hint}
                        </p>
                      </div>
                      {isPercentageFormula(rateForm.formulaType) ? (
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">底薪百分比（%）</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={rateForm.percentage}
                            onChange={(e) =>
                              setRateForm({ ...rateForm, percentage: Number(e.target.value) })
                            }
                            className="w-full border rounded px-2 py-1.5 text-sm"
                          />
                          <p className="text-[11px] text-gray-500 mt-1">
                            小時例：月薪÷240 ≈ 0.4167；分鐘例：月薪÷240÷60 ≈ 0.00695
                          </p>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">
                            {isHourlyMultiplierFormula(rateForm.formulaType)
                              ? "時薪倍數"
                              : rateForm.formulaType.includes("minute")
                                ? "固定金額（元／分鐘）"
                                : "固定金額（元／小時）"}
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={rateForm.amount}
                            onChange={(e) =>
                              setRateForm({ ...rateForm, amount: Number(e.target.value) })
                            }
                            className="w-full border rounded px-2 py-1.5 text-sm"
                          />
                        </div>
                      )}
                      <div className="md:col-span-2 flex gap-2">
                        <button
                          onClick={() => void saveRateConfig(rate.id)}
                          className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded"
                        >
                          儲存
                        </button>
                        <button
                          onClick={() => setEditingRate(null)}
                          className="px-3 py-1.5 border text-xs rounded"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-600">
                      {describeRateFormula(rate, rate.unit)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── 員工薪資詳細設定 ── */}
          <div className="app-panel p-6">
            <h2 className="font-semibold text-gray-900 mb-1">員工薪資設定</h2>
            <p className="text-xs text-gray-500 mb-4">
              合約項目：底薪＋職位加級（應給）。固定津貼／獎金可新增（全勤、包班等）。
              薪資設定依「{year}年{month}月」快照儲存，改這個月的勞健保不會回溯其他月份。
            </p>
            <div className="space-y-3">
              {displayEmployees.map((emp) => {
                const cfg = salaryConfigs[emp.id];
                const items = salaryItemsByUser[emp.id] ?? [];
                const gradeTotal = sumSalaryItems(items, "position_grade");
                const isEditing = editingSalary === emp.id;
                const faItem = items.find((i) => i.presetKey === "full_attendance" && i.isEnabled);
                let faHint: string | null = null;
                if (isEditing && faItem) {
                  const leaveHoursByType: Record<string, number> = {};
                  leaveRequests
                    .filter(
                      (r) =>
                        r.employeeId === emp.id &&
                        r.status === "approved" &&
                        r.endDate >= `${year}-NT${String(month).padStart(2, "0")}-01` &&
                        r.startDate <=
                          `${year}-NT${String(month).padStart(2, "0")}-NT${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`
                    )
                    .forEach((r) => {
                      const hours = getApprovedLeaveHoursInMonth({
                        request: r,
                        year,
                        month,
                        getShiftForDate,
                        shiftTimeConfig,
                        storeConfig,
                      });
                      leaveHoursByType[r.type] = (leaveHoursByType[r.type] ?? 0) + hours;
                    });
                  const preview = calculateFullAttendancePay({
                    configuredAmount: editingItems.find((i) => i.presetKey === "full_attendance")?.amount ?? faItem.amount,
                    leaveHoursByType,
                    yearlySickLeaveDays: getYearlySickLeaveDays({
                      employeeId: emp.id,
                      leaveRequests,
                      asOfYear: year,
                      asOfMonth: month,
                    }),
                  });
                  faHint = `本月試算實發 NT$${preview.paidAmount.toLocaleString()}（設定 NT$${preview.configuredAmount.toLocaleString()}）`;
                  if (preview.notes[0]) faHint += ` · ${preview.notes[0]}`;
                }
                return (
                  <div key={emp.id} className="border rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">
                        {emp.name}
                        <span className="ml-2 text-xs font-normal text-slate-500">
                          {APP_ROLE_LABELS[emp.role] ?? emp.role}
                          {emp.username ? ` · ${emp.username}` : ""}
                          {" · "}
                          {SITES[emp.siteId ?? activeSiteId]?.name ?? ""}
                        </span>
                      </span>
                      <div className="flex items-center gap-3 text-sm text-gray-600 flex-wrap">
                        <span>底薪 NT${(cfg?.baseSalary ?? 0).toLocaleString()}</span>
                        <span>加級 NT${gradeTotal.toLocaleString()}</span>
                        <span>時薪 NT${cfg?.hourlyRate ?? 0}/hr</span>
                        <span>職位 {cfg?.position || "—"}</span>
                        {!isEditing && (
                          <button
                            onClick={() => {
                              setEditingSalary(emp.id);
                              setSalaryForm(cfg ? { ...cfg } : emptySalaryForm);
                              setEditingItems(
                                (salaryItemsByUser[emp.id] ?? []).map((i) => ({
                                  id: i.id,
                                  category: i.category,
                                  label: i.label,
                                  amount: i.amount,
                                  presetKey: i.presetKey,
                                  countsAsWage: i.countsAsWage,
                                  isEnabled: i.isEnabled,
                                  sortOrder: i.sortOrder,
                                }))
                              );
                            }}
                            className="px-3 py-1 bg-blue-600 text-white text-xs rounded"
                          >
                            編輯
                          </button>
                        )}
                      </div>
                    </div>
                    {isEditing && (
                      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="col-span-2 md:col-span-4 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-600">
                          合約應給試算：底薪 NT${(Number(salaryForm.baseSalary) || 0).toLocaleString()} + 職位加級 NT$
                          {sumSalaryItems(
                            editingItems.map((i) => ({
                              ...i,
                              isEnabled: i.isEnabled !== false,
                            })),
                            "position_grade"
                          ).toLocaleString()}{" "}
                          = NT$
                          {contractualPay(
                            Number(salaryForm.baseSalary) || 0,
                            editingItems.map((i, idx) => ({
                              id: String(i.id ?? idx),
                              userId: emp.id,
                              category: i.category,
                              label: i.label,
                              amount: Number(i.amount) || 0,
                              presetKey: i.presetKey,
                              countsAsWage: i.countsAsWage,
                              isEnabled: i.isEnabled !== false,
                              sortOrder: i.sortOrder,
                            }))
                          ).toLocaleString()}
                        </div>
                        {([
                          ["底薪（合約）", "baseSalary", "number"],
                          ["勞保費（員工）", "laborInsurance", "number"],
                          ["健保費（員工）", "healthInsurance", "number"],
                          ["員工自提（勞退自提，屬扣項）", "pensionDeduction", "number"],
                          ["職位", "position", "text"],
                          ["入帳帳號（如：合庫 0251-9880-17402）", "bankAccount", "text"],
                          ["時薪（元/HR）", "hourlyRate", "number"],
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
                              onChange={(e) =>
                                setSalaryForm({
                                  ...salaryForm,
                                  [field]: type === "number" ? Number(e.target.value) : e.target.value,
                                })
                              }
                              className="w-full border rounded px-2 py-1.5 text-sm"
                            />
                          </div>
                        ))}

                        <EmployeeSalaryItemsEditor
                          items={editingItems}
                          onChange={setEditingItems}
                          fullAttendanceHint={faHint}
                        />

                        <div className="col-span-2 md:col-span-4 flex flex-wrap gap-2 pt-2 items-center">
                          <button
                            type="button"
                            onClick={() => {
                              const contract = contractualPay(
                                Number(salaryForm.baseSalary) || 0,
                                editingItems.map((i, idx) => ({
                                  id: String(i.id ?? idx),
                                  userId: emp.id,
                                  category: i.category,
                                  label: i.label,
                                  amount: Number(i.amount) || 0,
                                  presetKey: i.presetKey,
                                  countsAsWage: i.countsAsWage,
                                  isEnabled: i.isEnabled !== false,
                                  sortOrder: i.sortOrder,
                                }))
                              );
                              const derived = deriveHourlyRateByLaborStandard(contract);
                              if (derived <= 0) {
                                alert("請先填寫底薪（與職位加級），才能依勞基法（月薪÷30÷8）推算時薪。");
                                return;
                              }
                              setSalaryForm({ ...salaryForm, hourlyRate: derived });
                            }}
                            className="px-3 py-2 border text-sm rounded text-sky-700 border-sky-200 bg-sky-50"
                          >
                            依勞基法（合約月薪÷30÷8）推算時薪
                          </button>
                          <button
                            onClick={() => saveSalaryConfig(emp.id)}
                            className="px-4 py-2 bg-blue-600 text-white text-sm rounded"
                          >
                            儲存
                          </button>
                          <button
                            onClick={() => {
                              setEditingSalary(null);
                              setEditingItems([]);
                            }}
                            className="px-4 py-2 border text-sm rounded"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          </>
          )}

          {/* ── 本月異動項目 ── */}
          <div className="app-panel p-6">
            <h2 className="font-semibold text-gray-900 mb-4">
              {canSettle ? "本月異動項目" : "本月獎金／加扣項"}（民國{toROC(year)}年{month}月）
            </h2>
            {!canSettle && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
                店長僅登錄獎金；月底由會計統一試算、核對打卡／加班／請假並發布薪資。
              </p>
            )}
            {adjustments.length > 0 && (
              <div className="space-y-2 mb-4">
                {adjustments.map((adj) => {
                  const emp = employees.find((e) => e.id === adj.userId);
                  const attachments = attachmentsByAdjId[adj.id] ?? [];
                  return (
                    <div key={adj.id} className="p-3 bg-gray-50 rounded-lg space-y-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-medium w-16">{emp?.name}</span>
                        <span className="flex-1 text-sm">
                          {adj.label}
                          {adj.bonusCategory ? (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                              {adj.bonusCategory}
                            </span>
                          ) : null}
                        </span>
                        <span className={`text-sm font-medium ${adj.isDeduction ? "text-red-600" : "text-green-600"}`}>
                          {adj.isDeduction ? "-" : "+"}${adj.amount.toLocaleString()}
                        </span>
                        <button onClick={() => deleteAdjustment(adj.id)} className="text-red-500 text-xs">刪除</button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pl-16">
                        {attachments.map((att) => (
                          <button
                            key={att.id}
                            type="button"
                            onClick={() => void openAdjustmentAttachment(att.id)}
                            className="text-xs text-sky-700 hover:underline"
                          >
                            📎 {att.fileName}
                          </button>
                        ))}
                        <label className="inline-flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                          <input
                            type="file"
                            accept="image/jpeg,image/png,application/pdf"
                            className="hidden"
                            disabled={uploadingAdjId === adj.id}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              if (file) void uploadAdjustmentAttachment(adj.id, file);
                            }}
                          />
                          <span className="px-2 py-0.5 rounded border border-slate-200 bg-white hover:border-blue-300">
                            {uploadingAdjId === adj.id ? "上傳中…" : "附加佐證"}
                          </span>
                        </label>
                        {attachments.length > 0 && (
                          <span className="text-[10px] text-gray-400">
                            附件約 30 天後自動刪除
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="pt-3 border-t space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label className="text-xs text-gray-500">選擇員工（可複選）</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setNewAdjForm({
                          ...newAdjForm,
                          userIds: displayEmployees.map((e) => e.id),
                        })
                      }
                      className="text-xs text-sky-700 hover:underline"
                    >
                      全選
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewAdjForm({ ...newAdjForm, userIds: [] })}
                      className="text-xs text-gray-500 hover:underline"
                    >
                      清除
                    </button>
                  </div>
                </div>
                <div
                  className="flex flex-wrap gap-2 rounded-lg border bg-slate-50 p-2"
                  role="group"
                  aria-label="選擇員工"
                >
                  {displayEmployees.map((e) => {
                    const selectedIds = Array.isArray(newAdjForm.userIds)
                      ? newAdjForm.userIds
                      : [];
                    const checked = selectedIds.includes(e.id);
                    return (
                      <button
                        key={e.id}
                        type="button"
                        aria-pressed={checked}
                        onClick={() => toggleAdjEmployee(e.id)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm ${
                          checked
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-700 border-gray-200 hover:border-blue-300"
                        }`}
                      >
                        {e.name}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  已選 {Array.isArray(newAdjForm.userIds) ? newAdjForm.userIds.length : 0}{" "}
                  人；新增後每人各一筆相同項目與金額
                </p>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-gray-500">快速帶入：</span>
                {BONUS_ADJUSTMENT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setNewAdjForm({ ...newAdjForm, label: preset, isDeduction: false })}
                    className="px-2 py-1 text-xs rounded border border-slate-200 bg-white hover:border-blue-300"
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  placeholder="項目名稱（可自訂）"
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
                  onChange={(e) =>
                    setNewAdjForm({ ...newAdjForm, isDeduction: e.target.value === "true" })
                  }
                  className="border rounded px-3 py-1.5 text-sm"
                >
                  <option value="false">加項（獎金）</option>
                  <option value="true">扣款</option>
                </select>
                <button
                  type="button"
                  onClick={addAdjustment}
                  className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded"
                >
                  新增
                </button>
              </div>
            </div>
          </div>

          {canSettle && (
          <>
          {/* ── 薪資試算結果 ── */}
          <div className="app-panel overflow-hidden">
            <div className="p-6 border-b flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="font-semibold text-gray-900">
                  民國{toROC(year)}年{month}月 薪資試算
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  時數來自班表、核准請假／加班與國定假；金額為試算結果，發布後員工才看得到薪資單。
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={runTrial}
                  className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm"
                >
                  重新試算
                </button>
                <button onClick={exportSummaryExcel} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm">
                  匯出全體薪資總表
                </button>
              </div>
            </div>
            {!showTrial ? (
              <div className="p-8 text-center text-gray-500 text-sm">
                已變更結算月份，請按上方「試算」重新匯入時數並計算。
              </div>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {[
                      "姓名",
                      "出勤時數",
                      "請假時數",
                      "加班時數",
                      "合約應給",
                      "固定項目",
                      "勞保",
                      "健保",
                      "員工自提",
                      "請假扣",
                      "加班費",
                      "遲到扣",
                      "異動",
                      "實領",
                      "狀態",
                    ].map((h) => (
                      <th key={h} className="px-3 py-3 text-right font-medium text-gray-700 first:text-left whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payrollData.map((p) => {
                      const record = payrollRecords.find(r => r.userId === p.userId && r.year === year && r.month === month);
                      const isPublished = record?.isPublished;
                      const otDetail =
                        p.holidayOvertimeHours > 0
                          ? `（申請 ${p.overtimeAppHours}＋國定假 ${p.holidayOvertimeHours}）`
                          : "";
                      return (
                        <tr key={p.userId} className="hover:bg-gray-50">
                          <td className="px-3 py-3 font-medium">
                            <div>{p.name}</div>
                            {p.position ? <div className="text-xs text-gray-400">{p.position}</div> : null}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            <div>{p.workHours > 0 ? p.workHours : "—"}</div>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {p.leaveHours > 0 ? p.leaveHours : "—"}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {p.overtimeHours > 0 ? (
                              <>
                                <div>{p.overtimeHours}</div>
                                {otDetail ? <div className="text-[10px] text-gray-400">{otDetail}</div> : null}
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            <div>NT${p.contractualPay.toLocaleString()}</div>
                            {p.positionGradeTotal > 0 ? (
                              <div className="text-[10px] text-gray-400">
                                底薪 {p.baseSalary.toLocaleString()}+加級 {p.positionGradeTotal.toLocaleString()}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-green-700">
                            {p.fixedAllowanceTotal > 0 ? (
                              <>
                                <div>+NT${p.fixedAllowanceTotal.toLocaleString()}</div>
                                {p.fullAttendancePay > 0 ? (
                                  <div className="text-[10px] text-gray-400">
                                    含全勤 {p.fullAttendancePay.toLocaleString()}
                                  </div>
                                ) : null}
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-3 text-right text-red-600">
                            {p.laborInsurance > 0 ? `-NT$${p.laborInsurance.toLocaleString()}` : "—"}
                          </td>
                          <td className="px-3 py-3 text-right text-red-600">
                            {p.healthInsurance > 0 ? `-NT$${p.healthInsurance.toLocaleString()}` : "—"}
                          </td>
                          <td className="px-3 py-3 text-right text-red-600">
                            {p.pensionDeduction > 0 ? `-NT$${p.pensionDeduction.toLocaleString()}` : "—"}
                          </td>
                          <td className="px-3 py-3 text-right text-red-600">{p.leaveDeduction > 0 ? `-NT$${p.leaveDeduction}` : "—"}</td>
                          <td className="px-3 py-3 text-right text-green-600">{p.overtimePay > 0 ? `+NT$${p.overtimePay}` : "—"}</td>
                          <td className="px-3 py-3 text-right text-red-600">{p.tardinessDeduction > 0 ? `-NT$${p.tardinessDeduction}` : "—"}</td>
                          <td className="px-3 py-3 text-right">
                            {p.bonusTotal !== 0 ? <span className={p.bonusTotal > 0 ? "text-green-600" : "text-red-600"}>{p.bonusTotal > 0 ? "+" : ""}NT${p.bonusTotal.toLocaleString()}</span> : "—"}
                          </td>
                          <td className="px-3 py-3 text-right font-bold text-blue-600">NT${p.finalPay.toLocaleString()}</td>
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
            )}
          </div>
          </>
          )}
        </>
      )}
    </div>
  );
}
