"use client";

import { useState } from "react";
import { useApp, type Employee } from "@/lib/context/AppContext";
import { SITE_IDS, SITES, type SiteId } from "@/lib/sites";

type Role = "owner" | "manager" | "staff";

export default function EmployeesPage() {
  const {
    currentUser,
    employees,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    activeSiteId,
    canSwitchSite,
  } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selfPassword, setSelfPassword] = useState({ newPassword: "", confirmPassword: "" });
  const [changingOwnPassword, setChangingOwnPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    role: "staff" as Role,
    username: "",
    password: "",
    hireDate: new Date().toISOString().split('T')[0],
    endDate: "",
    siteId: activeSiteId as SiteId,
  });
  
  const loadEmployee = (employee: Employee) => {
    setEditingId(employee.id);
    setFormData({
      name: employee.name,
      role: employee.role,
      username: employee.username ?? "",
      password: "",
      hireDate: employee.hireDate || new Date().toISOString().split('T')[0],
      endDate: employee.endDate || "",
      siteId: employee.siteId ?? activeSiteId,
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
    });
    setEditingId(null);
    setShowForm(false);
  };
  
  // 提交表單
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingId) {
        const updates: Partial<Employee> = {
          name: formData.name,
          role: formData.role,
          username: formData.username.trim() || undefined,
          hireDate: formData.hireDate,
          endDate: formData.endDate.trim() || null,
          siteId: formData.siteId,
        };
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
  const getRoleLabel = (role: Role) => {
    switch (role) {
      case "owner": return "老闆";
      case "manager": return "店長";
      case "staff": return "員工";
    }
  };
  
  // 取得角色顏色
  const getRoleColor = (role: Role) => {
    switch (role) {
      case "owner": return "bg-purple-100 text-purple-800";
      case "manager": return "bg-blue-100 text-blue-800";
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
  
  // 店長與老闆權限一致
  if (currentUser?.role !== "owner" && currentUser?.role !== "manager") {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-800 mb-2">權限不足</h2>
          <p className="text-gray-600">僅店長與老闆可以管理員工</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* 頁頭 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">員工管理</h2>
          <p className="text-sm text-gray-500 mt-1">
            目前店別：{SITES[activeSiteId].displayName}（僅顯示此店人員）
          </p>
        </div>
        <button
          onClick={() => {
            setFormData((prev) => ({ ...prev, siteId: activeSiteId }));
            setShowForm(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          新增員工
        </button>
      </div>
      
      {/* 員工統計 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="app-panel p-4">
          <h3 className="font-medium text-gray-900 mb-2">總員工數</h3>
          <p className="text-2xl font-bold text-blue-600">
            {employees.filter(e => e.role !== "owner").length}人
          </p>
        </div>
        <div className="app-panel p-4">
          <h3 className="font-medium text-gray-900 mb-2">店長</h3>
          <p className="text-2xl font-bold text-purple-600">
            {employees.filter(e => e.role === "manager").length}人
          </p>
        </div>
        <div className="app-panel p-4">
          <h3 className="font-medium text-gray-900 mb-2">一般員工</h3>
          <p className="text-2xl font-bold text-green-600">
            {employees.filter(e => e.role === "staff").length}人
          </p>
        </div>
      </div>
      
      {/* 變更自己的密碼 */}
      {currentUser && (
        <div className="app-panel p-6">
          <h3 className="font-medium text-gray-900 mb-1">變更我的密碼</h3>
          <p className="text-sm text-gray-500 mb-4">
            目前登入：{currentUser.name}（{getRoleLabel(currentUser.role as Role)}）
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
                required
              />
              {formData.role === "manager" && (
                <p className="mt-1 text-xs text-gray-500">
                  班表列名只顯示此姓名，不會再加「店長」字樣；請勿把角色寫進姓名。
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  角色
                </label>
                <select
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value as Role })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="staff">員工</option>
                  <option value="manager">店長</option>
                </select>
              </div>
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
