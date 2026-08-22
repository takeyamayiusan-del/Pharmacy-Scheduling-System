"use client";

import { useMemo, useState } from "react";
import { useApp, type TardinessRecord } from "@/lib/context/AppContext";
import { canUsePunchAdmin } from "@/lib/auth/permissions";
import { buildEffectiveTardinessRecords } from "@/lib/tardiness";
import {
  MonthFilterBar,
  getCurrentYearMonth,
  isDateInYearMonth,
} from "@/components/MonthFilterBar";
import { SITES } from "@/lib/sites";

export default function TardinessPage() {
  const {
    currentUser,
    employees,
    tardinessRecords,
    punchRecords,
    overtimeRequests,
    leaveRequests,
    addTardinessRecord,
    deleteTardinessRecord,
    updatePunchRecord,
    activeSiteId,
    storeConfig,
  } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    employeeId: "",
    date: "",
    minutes: 0,
    notes: "",
  });
  const initialPeriod = getCurrentYearMonth();
  const [filterYear, setFilterYear] = useState(initialPeriod.year);
  const [filterMonth, setFilterMonth] = useState(initialPeriod.month);

  const isManager = canUsePunchAdmin({ role: currentUser?.role, capabilities: currentUser?.capabilities }, storeConfig.policies);

  // 提交遲到記錄
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const employee = employees.find((emp) => emp.id === formData.employeeId);
    if (!employee) return;

    try {
      await addTardinessRecord({
        employeeId: employee.id,
        employeeName: employee.name,
        date: formData.date,
        minutes: formData.minutes,
        notes: formData.notes,
      });

      setFormData({
        employeeId: "",
        date: "",
        minutes: 0,
        notes: "",
      });
      setShowForm(false);
      alert("遲到記錄已新增！");
    } catch (error) {
      console.error("[tardiness] add failed", error);
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? (error as { message?: string }).message || "新增遲到記錄失敗，請稍後重試"
            : "新增遲到記錄失敗，請稍後重試";
      alert(message);
    }
  };

  type LinkedTardinessRecord = TardinessRecord & { sourcePunchId?: string };

  const linkedTardinessRecords = useMemo<LinkedTardinessRecord[]>(() => {
    // 已核准加班或請假覆蓋的時段，不計遲到（與出勤／薪資頁一致）
    return buildEffectiveTardinessRecords(
      tardinessRecords,
      punchRecords,
      overtimeRequests,
      leaveRequests
    ).map((record) => ({
      ...record,
      employeeName:
        record.employeeName ||
        employees.find((employee) => employee.id === record.employeeId)?.name ||
        "",
    }));
  }, [employees, punchRecords, tardinessRecords, overtimeRequests, leaveRequests]);

  const monthRecords = useMemo(
    () =>
      linkedTardinessRecords.filter((r) =>
        isDateInYearMonth(r.date, filterYear, filterMonth)
      ),
    [linkedTardinessRecords, filterYear, filterMonth]
  );

  // 計算統計數據（依目前選擇月份）
  const getStats = () => {
    const stats: Record<string, { count: number; totalMinutes: number }> = {};
    monthRecords.forEach((r) => {
      if (!stats[r.employeeId]) {
        stats[r.employeeId] = { count: 0, totalMinutes: 0 };
      }
      stats[r.employeeId].count++;
      stats[r.employeeId].totalMinutes += r.minutes;
    });
    return stats;
  };

  const stats = getStats();

  const handleDeleteRecord = async (record: LinkedTardinessRecord) => {
    if (!confirm("確定要刪除這筆遲到記錄嗎？")) return;

    try {
      if (record.sourcePunchId) {
        await updatePunchRecord(record.sourcePunchId, {
          lateMinutes: 0,
          reason: null,
        });
      } else {
        await deleteTardinessRecord(record.id);
      }
    } catch (error) {
      console.error("[tardiness] delete failed", error);
      alert(error instanceof Error ? error.message : "刪除失敗");
    }
  };

  if (!isManager) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-800 mb-2">權限不足</h2>
          <p className="text-gray-600">僅店長、副店與老闆可以管理遲到記錄</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 頁頭 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">遲到管理</h2>
          <p className="text-sm text-gray-500 mt-1">
            目前店別：{SITES[activeSiteId].displayName}（僅顯示此店員工）
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <MonthFilterBar
            year={filterYear}
            month={filterMonth}
            onYearChange={setFilterYear}
            onMonthChange={setFilterMonth}
            count={monthRecords.length}
          />
          {(currentUser?.role === "owner" || currentUser?.role === "manager") && (
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              新增記錄
            </button>
          )}
        </div>
      </div>

      {/* 統計卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="app-panel p-4">
          <h3 className="font-medium text-gray-900 mb-2">本月總遲到次數</h3>
          <p className="text-2xl font-bold text-blue-600">{monthRecords.length}次</p>
        </div>
        <div className="app-panel p-4">
          <h3 className="font-medium text-gray-900 mb-2">本月總遲到分鐘</h3>
          <p className="text-2xl font-bold text-orange-600">
            {monthRecords.reduce((sum, r) => sum + r.minutes, 0)}分鐘
          </p>
        </div>
        <div className="app-panel p-4">
          <h3 className="font-medium text-gray-900 mb-2">本月平均每次遲到</h3>
          <p className="text-2xl font-bold text-green-600">
            {monthRecords.length > 0
              ? Math.round(
                  monthRecords.reduce((sum, r) => sum + r.minutes, 0) / monthRecords.length
                )
              : 0}
            分鐘
          </p>
        </div>
      </div>

      {/* 員工統計 */}
      <div className="app-panel overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <h3 className="font-medium text-gray-900">員工遲到統計（{filterYear}/{filterMonth}）</h3>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {employees
              .filter((e) => e.role !== "owner")
              .map((emp) => {
                const empStats = stats[emp.id] || { count: 0, totalMinutes: 0 };
                return (
                  <div key={emp.id} className="border rounded-lg p-4">
                    <h4 className="font-medium text-gray-900">{emp.name}</h4>
                    <div className="mt-2 space-y-1 text-sm">
                      <p className="text-gray-600">
                        次數: <span className="font-medium text-red-600">{empStats.count}</span>
                      </p>
                      <p className="text-gray-600">
                        總分鐘: <span className="font-medium text-orange-600">{empStats.totalMinutes}</span>
                      </p>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* 新增表單 */}
      {showForm && (
        <div className="app-panel p-6">
          <h3 className="font-medium text-gray-900 mb-4">新增遲到記錄</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">員工</label>
                <select
                  value={formData.employeeId}
                  onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                >
                  <option value="">請選擇</option>
                  {employees
                    .filter((e) => e.role !== "owner")
                    .map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">日期</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">遲到分鐘</label>
              <input
                type="number"
                min={1}
                value={formData.minutes}
                onChange={(e) => setFormData({ ...formData, minutes: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                rows={3}
                placeholder="說明遲到原因..."
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                確認新增
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 遲到記錄列表 */}
      <div className="app-panel overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <h3 className="font-medium text-gray-900">遲到記錄（{filterYear}/{filterMonth}）</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">員工</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">日期</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">遲到分鐘</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">備註</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">動作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {monthRecords.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    本月沒有遲到記錄
                  </td>
                </tr>
              ) : (
                monthRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{record.employeeName}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{record.date}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <span className="text-red-600 font-medium">{record.minutes}分鐘</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{record.notes}</td>
                    <td className="px-4 py-3 text-sm">
                      {(currentUser?.role === "owner" || currentUser?.role === "manager") && (
                        <button
                          onClick={() => void handleDeleteRecord(record)}
                          className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                        >
                          刪除
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
