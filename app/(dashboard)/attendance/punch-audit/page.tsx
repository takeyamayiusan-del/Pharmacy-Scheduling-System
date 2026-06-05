"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/context/AppContext";
import { createClient } from "@/lib/supabase/client";
import { ArrowRight, Download } from "lucide-react";
// import { zhTW } from "date-fns/locale";

interface PunchAuditLog {
  id: string;
  punch_id: string;
  action: "create" | "update" | "delete";
  old_data: any;
  new_data: any;
  admin_id: string;
  admin_name?: string;
  timestamp: string;
}

export default function PunchAuditPage() {
  const { user, employees = [] } = useApp() as any;
  const supabase = createClient();
  const [auditLogs, setAuditLogs] = useState<PunchAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState(
    format(new Date(), "yyyy-MM-dd")
  );
  const [filterEmployee, setFilterEmployee] = useState("");

  useEffect(() => {
    loadAuditLogs();
  }, [filterDate, filterEmployee]);

  const loadAuditLogs = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from("punch_audit_logs")
        .select("*")
        .order("timestamp", { ascending: false });

      if (filterDate) {
        const startOfDay = new Date(filterDate);
        const endOfDay = new Date(filterDate);
        endOfDay.setDate(endOfDay.getDate() + 1);

        query = query
          .gte("timestamp", startOfDay.toISOString())
          .lt("timestamp", endOfDay.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;

      // 補充員工名稱
      const logsWithNames = (data || []).map((log) => ({
        ...log,
        admin_name: employees.find((e) => e.id === log.admin_id)?.name || "未知",
      }));

      setAuditLogs(logsWithNames);
    } catch (error) {
      console.error("載入審計日誌失敗:", error);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    const headers = [
      "時間",
      "操作",
      "打卡 ID",
      "修改前",
      "修改後",
      "操作人",
    ];
    const rows = auditLogs.map((log) => [
      new Date(log.timestamp).toLocaleString("zh-TW"),
      log.action === "create" ? "新增" : log.action === "update" ? "編輯" : "刪除",
      log.punch_id,
      JSON.stringify(log.old_data || {}),
      JSON.stringify(log.new_data || {}),
      log.admin_name,
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `punch_audit_${filterDate}.csv`;
    link.click();
  };

  if (!user) return <div>未授權</div>;

  const isAdmin = user.role === "admin" || user.role === "manager";

  if (!isAdmin) {
    return <div>只有管理者可以查看審計日誌</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">打卡修改審計日誌</h1>
        <p className="text-gray-600 mt-2">查看所有打卡記錄的修改歷史</p>
      </div>

      <div className="border rounded-lg">
        <div className="border-b p-4">
          <h2 className="text-lg font-semibold">篩選</h2>
        </div>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">日期</label>
              <input type="date" value={$1} onChange={$2} className="px-3 py-2 border rounded" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">員工</label>
              <select
                value={filterEmployee}
                onChange={(e: any) => setFilterEmployee(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">所有員工</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button onClick={$1} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            <Download className="w-4 h-4" />
            匯出 CSV
          </button>
        </div>
      </div>

      <div className="border rounded-lg">
        <div className="border-b p-4">
          <h2 className="text-lg font-semibold">審計日誌</h2>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="text-center py-8">載入中...</div>
          ) : auditLogs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">無審計記錄</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-semibold>時間</th>
                    <th className="text-left p-2 font-semibold>操作</th>
                    <th className="text-left p-2 font-semibold>修改內容</th>
                    <th className="text-left p-2 font-semibold>操作人</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <TableRow key={log.id}>
                      <td className="p-2 className="text-sm">
                        {format(new Date(log.timestamp), "yyyy-MM-dd HH:mm:ss", {
                          locale: zhTW,
                        })}
                      </td>
                      <td className="p-2>
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${
                            log.action === "create"
                              ? "bg-green-100 text-green-800"
                              : log.action === "update"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-red-100 text-red-800"
                          }`}
                        >
                          {log.action === "create"
                            ? "新增"
                            : log.action === "update"
                              ? "編輯"
                              : "刪除"}
                        </span>
                      </td>
                      <td className="p-2 className="text-sm">
                        <div className="space-y-1">
                          {log.action === "update" && (
                            <>
                              <div className="text-gray-600">
                                {Object.entries(log.old_data || {}).map(
                                  ([key, value]) => (
                                    <div key={key} className="flex items-center gap-2">
                                      <span className="font-medium">{key}:</span>
                                      <span className="line-through text-red-600">
                                        {String(value)}
                                      </span>
                                      <ArrowRight className="w-3 h-3" />
                                      <span className="text-green-600">
                                        {String(log.new_data?.[key])}
                                      </span>
                                    </div>
                                  )
                                )}
                              </div>
                            </>
                          )}
                          {log.action === "create" && (
                            <div className="text-gray-600">
                              新增打卡記錄
                            </div>
                          )}
                          {log.action === "delete" && (
                            <div className="text-gray-600">
                              刪除打卡記錄
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-2 className="text-sm">{log.admin_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
