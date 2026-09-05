"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp, type Employee } from "@/lib/context/AppContext";
import { SITE_IDS, SITES, type SiteId } from "@/lib/sites";
import { APP_ROLE_LABELS, isAccountantRole, isStaffLikeRole, type AppRole } from "@/lib/auth/roles";
import {
  CAPABILITY_KEYS,
  CAPABILITY_LABELS,
  canGrantCapabilities,
  canManageEmployees,
  canViewCapabilityGrants,
  describeCapabilityGrants,
  type UserCapabilities,
} from "@/lib/auth/permissions";
import {
  GENDER_LABELS,
  type EmergencyContact,
  type EmployeeDependent,
  type Gender,
} from "@/lib/employees/profile";
import {
  WORK_HOURS_REGIME_OPTIONS,
  type WorkHoursRegime,
} from "@/lib/attendance/workHoursRegime";
import { getScheduleShiftOptions } from "@/lib/shift-catalog/resolve";
import { getShiftName } from "@/lib/store-config";

const emptyCaps = (): UserCapabilities => ({
  schedule: false,
  payroll: false,
  employees: false,
  store_settings: false,
  punch_admin: false,
  approve: false,
});

const emptyContact = (): EmergencyContact => ({ name: "", phone: "", relationship: "" });
const emptyDependent = (): EmployeeDependent => ({
  name: "",
  nationalId: "",
  birthDate: "",
  enrollmentDate: "",
  relationship: "",
});

type EmployeeFormData = {
  name: string;
  role: AppRole;
  username: string;
  password: string;
  hireDate: string;
  endDate: string;
  siteId: SiteId;
  workHoursRegime: "" | WorkHoursRegime;
  baselineShift: string;
  leaveSelectionMode: "full_day" | "shift_rest";
  halfDayWorkShift: string;
  capabilities: UserCapabilities;
  nationalId: string;
  birthDate: string;
  gender: "" | Gender;
  registeredAddress: string;
  mailingAddress: string;
  mailingSameAsRegistered: boolean;
  phone: string;
  emergencyContacts: EmergencyContact[];
  dependents: EmployeeDependent[];
};

export default function EmployeesPage() {
  const {
    currentUser,
    employees,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    activeSiteId,
    canSwitchSite,
    storeConfig,
  } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selfPassword, setSelfPassword] = useState({ newPassword: "", confirmPassword: "" });
  const [changingOwnPassword, setChangingOwnPassword] = useState(false);
  const [formData, setFormData] = useState<EmployeeFormData>({
    name: "",
    role: "staff",
    username: "",
    password: "",
    hireDate: new Date().toISOString().split('T')[0],
    endDate: "",
    siteId: activeSiteId as SiteId,
    workHoursRegime: "",
    baselineShift: "",
    leaveSelectionMode: "full_day",
    halfDayWorkShift: "",
    capabilities: emptyCaps(),
    nationalId: "",
    birthDate: "",
    gender: "",
    registeredAddress: "",
    mailingAddress: "",
    mailingSameAsRegistered: false,
    phone: "",
    emergencyContacts: [emptyContact()],
    dependents: [],
  });
  
  const loadEmployee = (employee: Employee) => {
    setEditingId(employee.id);
    const contacts = employee.emergencyContacts?.length
      ? employee.emergencyContacts.map((c) => ({ ...c }))
      : [emptyContact()];
    setFormData({
      name: employee.name,
      role: employee.role,
      username: employee.username ?? "",
      password: "",
      hireDate: employee.hireDate || new Date().toISOString().split('T')[0],
      endDate: employee.endDate || "",
      siteId: employee.siteId ?? activeSiteId,
      workHoursRegime: employee.workHoursRegime ?? "",
      baselineShift: employee.baselineShift ?? "",
      leaveSelectionMode: employee.isHalfDayLeaveRule ? "shift_rest" : "full_day",
      halfDayWorkShift: employee.halfDayWorkShift ?? "",
      capabilities: { ...emptyCaps(), ...employee.capabilities },
      nationalId: employee.nationalId ?? "",
      birthDate: employee.birthDate ?? "",
      gender: employee.gender ?? "",
      registeredAddress: employee.registeredAddress ?? "",
      mailingAddress: employee.mailingAddress ?? "",
      mailingSameAsRegistered: employee.mailingSameAsRegistered ?? false,
      phone: employee.phone ?? "",
      emergencyContacts: contacts,
      dependents: employee.dependents?.map((d) => ({ ...d })) ?? [],
    });
    setShowForm(true);
  };
  
  const resetForm = () => {
    setFormData({
      name: "",
      role: "staff",
      username: "",
      password: "",
      hireDate: new Date().toISOString().split('T')[0],
      endDate: "",
      siteId: activeSiteId,
      workHoursRegime: "",
      baselineShift: "",
      leaveSelectionMode: "full_day",
      halfDayWorkShift: "",
      capabilities: emptyCaps(),
      nationalId: "",
      birthDate: "",
      gender: "",
      registeredAddress: "",
      mailingAddress: "",
      mailingSameAsRegistered: false,
      phone: "",
      emergencyContacts: [emptyContact()],
      dependents: [],
    });
    setEditingId(null);
    setShowForm(false);
  };
  
  // 提交表單
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const filledContacts = formData.emergencyContacts.filter(
        (c) => c.name.trim() && c.phone.trim()
      );
      if (filledContacts.length === 0) {
        alert("請至少填寫一位緊急聯絡人（姓名與電話）");
        return;
      }
      if (filledContacts.length > 2) {
        alert("緊急聯絡人最多兩位");
        return;
      }

      let caps =
        isStaffLikeRole(formData.role) || formData.role === "deputy"
          ? { ...formData.capabilities }
          : emptyCaps();
      if (isAccountantRole(formData.role)) {
        caps = { ...caps, payroll: false };
      }
      // 非老闆不可改授權：更新時不送 capabilities，避免清掉老闆已設權限
      const canGrant = canGrantCapabilities({ role: currentUser?.role });

      // 升為店長時：同店其他店長可選擇降為員工
      if (formData.role === "manager") {
        const otherManagers = employees.filter(
          (emp) =>
            emp.role === "manager" &&
            (emp.siteId ?? activeSiteId) === formData.siteId &&
            emp.id !== editingId
        );
        if (otherManagers.length > 0) {
          const names = otherManagers.map((m) => m.name).join("、");
          const demote = window.confirm(
            `將「${formData.name}」設為店長後，同店目前店長（${names}）是否降為員工？\n\n按「確定」會降職；按「取消」則保留多位店長（僅儲存本次角色）。`
          );
          if (demote) {
            for (const m of otherManagers) {
              await updateEmployee(m.id, { role: "staff", capabilities: emptyCaps() });
            }
          }
        }
      }

      if (editingId) {
        const updates: Partial<Employee> = {
          name: formData.name,
          role: formData.role,
          username: formData.username.trim() || undefined,
          hireDate: formData.hireDate,
          endDate: formData.endDate.trim() || null,
          siteId: formData.siteId,
          workHoursRegime: formData.workHoursRegime || null,
          baselineShift: formData.baselineShift.trim() || null,
          isHalfDayLeaveRule: formData.leaveSelectionMode === "shift_rest",
          halfDayWorkShift:
            formData.leaveSelectionMode === "shift_rest"
              ? formData.halfDayWorkShift.trim() || null
              : null,
          nationalId: formData.nationalId.trim() || undefined,
          birthDate: formData.birthDate || undefined,
          gender: formData.gender || null,
          registeredAddress: formData.registeredAddress.trim() || undefined,
          mailingAddress: formData.mailingSameAsRegistered
            ? undefined
            : formData.mailingAddress.trim() || undefined,
          mailingSameAsRegistered: formData.mailingSameAsRegistered,
          phone: formData.phone.trim() || undefined,
          emergencyContacts: filledContacts,
          dependents: formData.dependents.filter((d) => d.name.trim()),
        };
        if (canGrant) {
          updates.capabilities = caps;
        }
        if (formData.password) {
          updates.password = formData.password;
        }
        await updateEmployee(editingId, updates);
        if (formData.siteId !== activeSiteId) {
          alert(
            `已更新。此人員屬於「${SITES[formData.siteId].name}」，請用上方選店切換後查看。`
          );
        } else {
          alert("員工資料已更新！");
        }
      } else {
        if (!formData.username.trim() || !formData.password) {
          alert("新增員工請設定登入帳號與密碼");
          return;
        }
        await addEmployee({
          name: formData.name,
          role: formData.role,
          username: formData.username.trim(),
          password: formData.password,
          hireDate: formData.hireDate,
          endDate: formData.endDate.trim() || null,
          siteId: formData.siteId,
          workHoursRegime: formData.workHoursRegime || null,
          baselineShift: formData.baselineShift.trim() || null,
          isHalfDayLeaveRule: formData.leaveSelectionMode === "shift_rest",
          halfDayWorkShift:
            formData.leaveSelectionMode === "shift_rest"
              ? formData.halfDayWorkShift.trim() || null
              : null,
          capabilities: canGrant ? caps : emptyCaps(),
          nationalId: formData.nationalId.trim() || undefined,
          birthDate: formData.birthDate || undefined,
          gender: formData.gender || null,
          registeredAddress: formData.registeredAddress.trim() || undefined,
          mailingAddress: formData.mailingSameAsRegistered
            ? undefined
            : formData.mailingAddress.trim() || undefined,
          mailingSameAsRegistered: formData.mailingSameAsRegistered,
          phone: formData.phone.trim() || undefined,
          emergencyContacts: filledContacts,
          dependents: formData.dependents.filter((d) => d.name.trim()),
        });
        if (formData.siteId !== activeSiteId) {
          alert(
            `員工已新增至「${SITES[formData.siteId].name}」。請用上方選店切換後查看。`
          );
        } else {
          alert("員工已新增！");
        }
      }
      
      resetForm();
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失敗");
    }
  };
  
  // 確認刪除
  const confirmDelete = async (employee: Employee) => {
    if (employee.id === currentUser?.id) {
      alert("無法刪除自己的帳號，請使用「變更我的密碼」修改密碼。");
      return;
    }
    if (!window.confirm(`確定要停用員工 ${employee.name} 嗎？停用後將無法登入，歷史資料仍會保留。`)) return;
    try {
      await deleteEmployee(employee.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "刪除失敗");
    }
  };
  
  // 取得角色顯示文字
  const getRoleLabel = (role: AppRole) => APP_ROLE_LABELS[role] ?? role;
  
  const getRoleColor = (role: AppRole) => {
    switch (role) {
      case "owner": return "bg-purple-100 text-purple-800";
      case "manager": return "bg-blue-100 text-blue-800";
      case "deputy": return "bg-cyan-100 text-cyan-800";
      case "director": return "bg-amber-100 text-amber-800";
      case "accountant": return "bg-indigo-100 text-indigo-800";
      case "staff": return "bg-green-100 text-green-800";
    }
  };
  
  const handleChangeOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (selfPassword.newPassword.length < 6) {
      alert("新密碼至少需要 6 個字元");
      return;
    }
    if (selfPassword.newPassword !== selfPassword.confirmPassword) {
      alert("兩次輸入的密碼不一致");
      return;
    }
    setChangingOwnPassword(true);
    try {
      await updateEmployee(currentUser.id, { password: selfPassword.newPassword });
      setSelfPassword({ newPassword: "", confirmPassword: "" });
      alert("您的密碼已更新！");
    } catch (err) {
      alert(err instanceof Error ? err.message : "密碼更新失敗");
    } finally {
      setChangingOwnPassword(false);
    }
  };
  
  const canGrant = canGrantCapabilities({ role: currentUser?.role });
  const canViewGrants = canViewCapabilityGrants({ role: currentUser?.role });
  const grantableCapabilityKeys = CAPABILITY_KEYS;

  // 店長／老闆／有員工管理授權者
  if (
    !canManageEmployees(
      { role: currentUser?.role, capabilities: currentUser?.capabilities },
      storeConfig.policies
    )
  ) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-800 mb-2">權限不足</h2>
          <p className="text-gray-600">僅有員工管理權限者可進入（店長／副店／老闆，或已額外授權）</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* 頁頭 */}
      <div className="app-toolbar justify-between">
        <div>
          <h2 className="app-page-title">員工管理</h2>
          <p className="app-meta mt-1">
            目前店別：{SITES[activeSiteId].displayName}（僅顯示此店人員）
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href="/employees/offboarding" className="app-btn-outline">
            離職結清
          </Link>
          <button
            onClick={() => {
              setFormData((prev) => ({ ...prev, siteId: activeSiteId }));
              setShowForm(true);
            }}
            className="app-btn-primary"
          >
            新增員工
          </button>
        </div>
      </div>
      
      {/* 員工統計 */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="app-panel p-4">
          <h3 className="app-meta mb-2">總員工數</h3>
          <p className="text-2xl font-semibold text-sky-600">
            {employees.filter(e => e.role !== "owner").length}人
          </p>
        </div>
        <div className="app-panel p-4">
          <h3 className="app-meta mb-2">店長</h3>
          <p className="text-2xl font-semibold text-violet-600">
            {employees.filter(e => e.role === "manager").length}人
          </p>
        </div>
        <div className="app-panel p-4">
          <h3 className="app-meta mb-2">副店</h3>
          <p className="text-2xl font-semibold text-cyan-600">
            {employees.filter(e => e.role === "deputy").length}人
          </p>
        </div>
        <div className="app-panel p-4">
          <h3 className="app-meta mb-2">主任</h3>
          <p className="text-2xl font-semibold text-amber-600">
            {employees.filter(e => e.role === "director").length}人
          </p>
        </div>
        <div className="app-panel p-4">
          <h3 className="app-meta mb-2">會計</h3>
          <p className="text-2xl font-semibold text-indigo-600">
            {employees.filter(e => e.role === "accountant").length}人
          </p>
        </div>
        <div className="app-panel p-4">
          <h3 className="app-meta mb-2">一般員工</h3>
          <p className="text-2xl font-semibold text-emerald-600">
            {employees.filter(e => e.role === "staff").length}人
          </p>
        </div>
      </div>
      
      {/* 變更自己的密碼 */}
      {currentUser && (
        <div className="app-panel p-6">
          <h3 className="font-medium text-gray-900 mb-1">變更我的密碼</h3>
          <p className="text-sm text-gray-500 mb-4">
            目前登入：{currentUser.name}（{getRoleLabel(currentUser.role)}）
          </p>
          <form onSubmit={handleChangeOwnPassword} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">新密碼</label>
              <input
                type="password"
                value={selfPassword.newPassword}
                onChange={(e) => setSelfPassword({ ...selfPassword, newPassword: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="至少 6 個字元"
                minLength={6}
                required
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">確認新密碼</label>
              <input
                type="password"
                value={selfPassword.confirmPassword}
                onChange={(e) => setSelfPassword({ ...selfPassword, confirmPassword: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="再次輸入新密碼"
                minLength={6}
                required
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              disabled={changingOwnPassword}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {changingOwnPassword ? "更新中…" : "更新我的密碼"}
            </button>
          </form>
        </div>
      )}
      
      {/* 員工表單 */}
      {showForm && (
        <div className="app-panel p-6">
          <h3 className="font-medium text-gray-900 mb-4">
            {editingId ? "編輯員工" : "新增員工"}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                員工姓名
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder={formData.role === "manager" ? "請輸入店長真實姓名（班表只顯示此姓名）" : "請輸入員工姓名"}
                maxLength={50}
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                允許同名；登入請用下方「帳號」區分。
                {formData.role === "manager" ? " 班表列名只顯示此姓名，請勿把角色寫進姓名。" : ""}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  角色
                </label>
                <select
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value as AppRole })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="staff">員工</option>
                  <option value="director">主任</option>
                  <option value="accountant">會計</option>
                  <option value="deputy">副店</option>
                  <option value="manager">店長</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  主任：權限同員工，請用「管理端登入」。會計：跨店薪資結算、仍屬單店上班，請用「管理端登入」。
                  換店長：把新任改成「店長」，儲存時可選擇把舊店長降為員工。
                  細部誰能排班／看薪資請到「店家設定 → 權限設定」。
                </p>
              </div>
              <div className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                <p className="text-sm font-medium text-slate-800">排休選擇模式</p>
                <p className="text-xs text-slate-500">
                  員工在「排休選擇」點日期時：整天休會變休假（X）；特定班別會直接排成指定班（集集店常用，非休上午／下午）。
                </p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="leaveSelectionMode"
                      checked={formData.leaveSelectionMode === "full_day"}
                      onChange={() =>
                        setFormData({ ...formData, leaveSelectionMode: "full_day" })
                      }
                    />
                    整天休（休假 X）
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="leaveSelectionMode"
                      checked={formData.leaveSelectionMode === "shift_rest"}
                      onChange={() =>
                        setFormData({ ...formData, leaveSelectionMode: "shift_rest" })
                      }
                    />
                    特定班別（點日期排成指定班）
                  </label>
                </div>
                {formData.leaveSelectionMode === "shift_rest" && (
                  <label className="block text-sm">
                    <span className="font-medium text-gray-800">排休日班別</span>
                    <select
                      value={
                        formData.halfDayWorkShift ||
                        getScheduleShiftOptions(storeConfig).find((c) => c !== "X") ||
                        storeConfig.defaultWeekdayShift
                      }
                      onChange={(e) =>
                        setFormData({ ...formData, halfDayWorkShift: e.target.value })
                      }
                      className="mt-1 w-full px-3 py-2 border rounded-lg"
                    >
                      {getScheduleShiftOptions(storeConfig)
                        .filter((c) => c !== "X")
                        .map((code) => (
                          <option key={code} value={code}>
                            {getShiftName(storeConfig, code)}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </div>
              {(isStaffLikeRole(formData.role) ||
                (formData.role === "deputy" &&
                  !storeConfig.policies.roleCapabilities.deputyLikeManager)) &&
                storeConfig.policies.roleCapabilities.allowStaffGrants &&
                canGrant && (
                <div className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <p className="text-sm font-medium text-slate-800">額外授權（僅老闆可見／可設）</p>
                  <p className="text-xs text-slate-500">
                    可讓員工接近店長能力，並可單獨開「審核申請」。審核順序請到「店家設定 → 審核關卡」（依關卡順序，或竹山式擇一人即可）。
                    {isAccountantRole(formData.role)
                      ? " 會計職位已內建薪資結算與跨店檢視，無需再勾「薪資結算」。"
                      : ""}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {grantableCapabilityKeys.map((key) => (
                      <label key={key} className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={
                            isAccountantRole(formData.role) && key === "payroll"
                              ? false
                              : Boolean(formData.capabilities[key])
                          }
                          disabled={isAccountantRole(formData.role) && key === "payroll"}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              capabilities: {
                                ...formData.capabilities,
                                [key]: e.target.checked,
                              },
                            })
                          }
                        />
                        {CAPABILITY_LABELS[key]}
                        {isAccountantRole(formData.role) && key === "payroll" ? "（職位內建）" : ""}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  所屬店
                </label>
                {canSwitchSite ? (
                  <select
                    value={formData.siteId}
                    onChange={(e) =>
                      setFormData({ ...formData, siteId: e.target.value as SiteId })
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    {SITE_IDS.map((id) => (
                      <option key={id} value={id}>
                        {SITES[id].displayName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={SITES[formData.siteId].displayName}
                    disabled
                    className="w-full px-3 py-2 border rounded-lg bg-gray-50 text-gray-700"
                  />
                )}
                <p className="text-xs text-gray-500 mt-1">
                  集集店長／員工請選「家禾藥局（集集）」；與竹山帳號互不影響。
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  入職日期
                </label>
                <input
                  type="date"
                  value={formData.hireDate}
                  onChange={e => setFormData({ ...formData, hireDate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  入職月之前不顯示於班表；入職當月，入職日前顯示休假
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  到期日（選填）
                </label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">到期日後不顯示於班表；空白=持續在職</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  工時制度（個人）
                </label>
                <select
                  value={formData.workHoursRegime}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      workHoursRegime: e.target.value as "" | WorkHoursRegime,
                    })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">跟店家（{storeConfig.workHoursRegime === "eight_week" ? "八周" : storeConfig.workHoursRegime === "two_week" ? "兩周" : storeConfig.workHoursRegime === "four_week" ? "四周" : "正常工時"}）</option>
                  {WORK_HOURS_REGIME_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  每人一套：有人八周、有人兩周、有人正常工時。系統僅警示與播假試算，不硬擋。
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  本月預設班（沒休假就上這班）
                </label>
                <select
                  value={formData.baselineShift}
                  onChange={(e) =>
                    setFormData({ ...formData, baselineShift: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">跟店家平日預設班</option>
                  {getScheduleShiftOptions(storeConfig)
                    .filter((c) => c !== "X")
                    .map((code) => (
                      <option key={code} value={code}>
                        {getShiftName(storeConfig, code)}
                      </option>
                    ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  沒休假時班表預設上這班；播假用此時數換算要播幾天（不是發補休）。
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-4">
              <h4 className="text-sm font-semibold text-slate-900">基本資料</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block text-sm">
                  <span className="font-medium text-gray-800">身分證字號</span>
                  <input
                    type="text"
                    value={formData.nationalId}
                    onChange={(e) => setFormData({ ...formData, nationalId: e.target.value.toUpperCase() })}
                    className="mt-1 w-full px-3 py-2 border rounded-lg"
                    placeholder="A123456789"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-800">出生日期</span>
                  <input
                    type="date"
                    value={formData.birthDate}
                    onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border rounded-lg"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-800">性別</span>
                  <select
                    value={formData.gender}
                    onChange={(e) =>
                      setFormData({ ...formData, gender: e.target.value as "" | Gender })
                    }
                    className="mt-1 w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">請選擇</option>
                    {(Object.entries(GENDER_LABELS) as [Gender, string][]).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-800">聯絡電話</span>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border rounded-lg"
                  />
                </label>
                <label className="block text-sm md:col-span-2">
                  <span className="font-medium text-gray-800">戶籍地址</span>
                  <input
                    type="text"
                    value={formData.registeredAddress}
                    onChange={(e) => setFormData({ ...formData, registeredAddress: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border rounded-lg"
                  />
                </label>
                <label className="inline-flex items-center gap-2 text-sm md:col-span-2">
                  <input
                    type="checkbox"
                    checked={formData.mailingSameAsRegistered}
                    onChange={(e) =>
                      setFormData({ ...formData, mailingSameAsRegistered: e.target.checked })
                    }
                  />
                  通訊地址同戶籍
                </label>
                {!formData.mailingSameAsRegistered && (
                  <label className="block text-sm md:col-span-2">
                    <span className="font-medium text-gray-800">通訊地址</span>
                    <input
                      type="text"
                      value={formData.mailingAddress}
                      onChange={(e) => setFormData({ ...formData, mailingAddress: e.target.value })}
                      className="mt-1 w-full px-3 py-2 border rounded-lg"
                    />
                  </label>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800">緊急聯絡人（至少 1 位、最多 2 位）</p>
                  {formData.emergencyContacts.length < 2 && (
                    <button
                      type="button"
                      className="text-xs text-sky-700 hover:underline"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          emergencyContacts: [...formData.emergencyContacts, emptyContact()],
                        })
                      }
                    >
                      + 新增第二位
                    </button>
                  )}
                </div>
                {formData.emergencyContacts.map((contact, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-white p-3">
                    <input
                      type="text"
                      value={contact.name}
                      onChange={(e) => {
                        const next = [...formData.emergencyContacts];
                        next[index] = { ...next[index], name: e.target.value };
                        setFormData({ ...formData, emergencyContacts: next });
                      }}
                      className="px-3 py-2 border rounded-lg text-sm"
                      placeholder="姓名"
                    />
                    <input
                      type="text"
                      value={contact.relationship ?? ""}
                      onChange={(e) => {
                        const next = [...formData.emergencyContacts];
                        next[index] = { ...next[index], relationship: e.target.value };
                        setFormData({ ...formData, emergencyContacts: next });
                      }}
                      className="px-3 py-2 border rounded-lg text-sm"
                      placeholder="關係（選填）"
                    />
                    <input
                      type="tel"
                      value={contact.phone}
                      onChange={(e) => {
                        const next = [...formData.emergencyContacts];
                        next[index] = { ...next[index], phone: e.target.value };
                        setFormData({ ...formData, emergencyContacts: next });
                      }}
                      className="px-3 py-2 border rounded-lg text-sm"
                      placeholder="電話"
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800">眷屬加保（健保，選填）</p>
                  <button
                    type="button"
                    className="text-xs text-sky-700 hover:underline"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        dependents: [...formData.dependents, emptyDependent()],
                      })
                    }
                  >
                    + 新增眷屬
                  </button>
                </div>
                {formData.dependents.length === 0 ? (
                  <p className="text-xs text-slate-500">若需眷屬加保，請按「新增眷屬」填寫加保日、身分證、生日等。</p>
                ) : (
                  formData.dependents.map((dep, index) => (
                    <div key={index} className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                          type="text"
                          value={dep.name}
                          onChange={(e) => {
                            const next = [...formData.dependents];
                            next[index] = { ...next[index], name: e.target.value };
                            setFormData({ ...formData, dependents: next });
                          }}
                          className="px-3 py-2 border rounded-lg text-sm"
                          placeholder="眷屬姓名"
                        />
                        <input
                          type="text"
                          value={dep.relationship ?? ""}
                          onChange={(e) => {
                            const next = [...formData.dependents];
                            next[index] = { ...next[index], relationship: e.target.value };
                            setFormData({ ...formData, dependents: next });
                          }}
                          className="px-3 py-2 border rounded-lg text-sm"
                          placeholder="關係（選填）"
                        />
                        <input
                          type="text"
                          value={dep.nationalId ?? ""}
                          onChange={(e) => {
                            const next = [...formData.dependents];
                            next[index] = { ...next[index], nationalId: e.target.value.toUpperCase() };
                            setFormData({ ...formData, dependents: next });
                          }}
                          className="px-3 py-2 border rounded-lg text-sm"
                          placeholder="身分證"
                        />
                        <label className="block text-sm">
                          <span className="font-medium text-gray-800">生日（眷屬出生日期）</span>
                          <input
                            type="date"
                            value={dep.birthDate ?? ""}
                            onChange={(e) => {
                              const next = [...formData.dependents];
                              next[index] = { ...next[index], birthDate: e.target.value };
                              setFormData({ ...formData, dependents: next });
                            }}
                            className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                          />
                          <span className="text-[11px] text-slate-500">請填眷屬的出生年月日</span>
                        </label>
                        <label className="block text-sm md:col-span-2">
                          <span className="font-medium text-gray-800">加保日期（健保生效日）</span>
                          <input
                            type="date"
                            value={dep.enrollmentDate ?? ""}
                            onChange={(e) => {
                              const next = [...formData.dependents];
                              next[index] = { ...next[index], enrollmentDate: e.target.value };
                              setFormData({ ...formData, dependents: next });
                            }}
                            className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                          />
                          <span className="text-[11px] text-slate-500">
                            請填此眷屬開始加入健保的日期（不是生日）
                          </span>
                        </label>
                      </div>
                      <button
                        type="button"
                        className="text-xs text-rose-700 hover:underline"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            dependents: formData.dependents.filter((_, i) => i !== index),
                          })
                        }
                      >
                        移除此眷屬
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                登入帳號
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={e => setFormData({ ...formData, username: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder={formData.role === "manager" ? "店長登入用" : "員工登入用"}
                required={!editingId}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                登入密碼{editingId ? "（留空則不變更）" : ""}
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder={editingId ? "不變更請留空" : "請設定密碼"}
                required={!editingId}
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {editingId ? "確認更新" : "確認新增"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}
      
      {/* 員工列表 */}
      <div className="app-panel overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <h3 className="font-medium text-gray-900">員工列表</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">員工姓名</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">所屬店</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">入職日期</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">到期日</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">登入帳號</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">角色</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">動作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {employees.filter(e => e.role !== "owner").map(employee => (
                <tr key={employee.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {employee.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {SITES[employee.siteId ?? activeSiteId].name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {employee.hireDate}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {employee.endDate || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {employee.username ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(employee.role)}`}>
                      {getRoleLabel(employee.role)}
                    </span>
                    {canViewGrants && describeCapabilityGrants(employee.capabilities) ? (
                      <p className="text-[11px] text-slate-500 mt-1">
                        授權：{describeCapabilityGrants(employee.capabilities)}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex gap-2">
                      <button
                        onClick={() => loadEmployee(employee)}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                      >
                        編輯
                      </button>
                      <button
                        onClick={() => confirmDelete(employee)}
                        className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                      >
                        刪除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
