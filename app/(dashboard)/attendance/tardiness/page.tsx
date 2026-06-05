"use client";

import { useMemo, useState } from "react";
import { useApp, type TardinessRecord } from "@/lib/context/AppContext";

export default function TardinessPage() {
  const {
    currentUser,
    employees,
    tardinessRecords,
    punchRecords,
    overtimeRequests,
    addTardinessRecord,
    deleteTardinessRecord,
    updatePunchRecord,
  } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    employeeId: "",
    date: "",
    minutes: 0,
    notes: ""
  });
  
  // 提交遲到記錄
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const employee = employees.find(e => e.id === formData.employeeId);
    if (!employee) return;
    
    addTardinessRecord({
      employeeId: employee.id,
      employeeName: employee.name,
      date: formData.date,
      minutes: formData.minutes,
      notes: formData.notes
    });
    
    setFormData({
      employeeId: "",
      date: "",
      minutes: 0,
      notes: ""
    });
    setShowForm(false);
    alert("遲到記錄已新增！");
  };
  
  type LinkedTardinessRecord = TardinessRecord & { sourcePunchId?: string };

  const linkedTardinessRecords = useMemo<LinkedTardinessRecord[]>(() => {
    // 檢查是否有已核准的加班可抵銷遲到
    const shouldCancelTardiness = (employeeId: string, date: string): boolean => {
      return overtimeRequests.some(
        (req) =>
          req.employeeId === employeeId &&
          req.date === date &&
          req.status === "approved"
      );
    };
    const records: LinkedTardinessRecord[] = tardinessRecords
      .filter((record) => !shouldCancelTardiness(record.employeeId, record.date))
      .map((record) => ({
        ...record,
        employeeName:
          record.employeeName ||
          employees.find((employee) => employee.id === record.employeeId)?.name ||
          "",
      }));

    punchRecords
      .filter(
        (punch) =>
          punch.action === "work_in" &&
          punch.lateMinutes > 0 &&
          !shouldCancelTardiness(punch.employeeId, punch.date)
      )
      .forEach((punch) => {
        const alreadyExists = records.some(
          (record) =>
            record.employeeId === punch.employeeId &&
            record.date === punch.date
        );
        if (!alreadyExists) {
          records.push({
            id: `punch:${punch.id}`,
            sourcePunchId: punch.id,
            employeeId: punch.employeeId,
            employeeName:
              punch.employeeName ||
              employees.find((employee) => employee.id === punch.employeeId)?.name ||
              "",
            date: punch.date,
            minutes: punch.lateMinutes,
            notes: punch.reason || "由打卡管理自動同步",
            createdAt: punch.createdAt,
          });
        }
      });

    return records.sort(
      (a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime() ||
        b.createdAt.localeCompare(a.createdAt)
    );
  }, [employees, punchRecords, tardinessRecords, overtimeRequests]);

  // 計算統計數據
  const getStats = () => {
    const stats: Record<string, { count: number; totalMinutes: number }> = {};
    linkedTardinessRecords.forEach(r => {
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
  
  return (
    <div className="space-y-6">
      {/* 頁頭 */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">遲到管理</h2>
        {(currentUser?.role === "owner" || currentUser?.role === "manager") && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            新增記錄
          </button>
        )}
      </div>
      
      {/* 統計卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h3 className="font-medium text-gray-900 mb-2">總遲到次數</h3>
          <p className="text-2xl font-bold text-blue-600">{linkedTardinessRecords.length}次</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h3 className="font-medium text-gray-900 mb-2">總遲到分鐘</h3>
          <p className="text-2xl font-bold text-orange-600">
            {linkedTardinessRecords.reduce((sum, r) => sum + r.minutes, 0)}分鐘
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h3 className="font-medium text-gray-900 mb-2">平均每次遲到</h3>
          <p className="text-2xl font-bold text-green-600">
            {linkedTardinessRecords.length > 0 
              ? Math.round(linkedTardinessRecords.reduce((sum, r) => sum + r.minutes, 0) / linkedTardinessRecords.length) 
              : 0}分鐘
          </p>
        </div>
      </div>
      
      {/* 員工統計 */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <h3 className="font-medium text-gray-900">員工遲到統計</h3>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {employees.filter(e => e.role !== "owner").map(emp => {
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
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-medium text-gray-900 mb-4">新增遲到記錄</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  員工
                </label>
                <select
                  value={formData.employeeId}
                  onChange={e => setFormData({ ...formData, employeeId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                >
                  <option value="">請選擇</option>
                  {employees.filter(e => e.role !== "owner").map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  日期
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={e => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                遲到分鐘
              </label>
              <input
                type="number"
                min={1}
                value={formData.minutes}
                onChange={e => setFormData({ ...formData, minutes: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                備註
              </label>
              <textarea
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
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
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <h3 className="font-medium text-gray-900">遲到記錄</h3>
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
              {linkedTardinessRecords.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    沒有遲到記錄
                  </td>
                </tr>
              ) : (
                linkedTardinessRecords
                  .map(record => (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {record.employeeName}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {record.date}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <span className="text-red-600 font-medium">{record.minutes}分鐘</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {record.notes}
                      </td>
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
