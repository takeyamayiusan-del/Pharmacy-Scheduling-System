"use client";

import { useState } from "react";
import { useApp } from "@/lib/context/AppContext";
// import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";

export default function BatchOperationsPage() {
  const {
    user,
    leaveApplications = [],
    overtimeApplications = [],
    shiftSwapApplications = [],
    batchApproveApplications,
    batchRejectApplications,
  } = useApp() as any;

  const [selectedTab, setSelectedTab] = useState<"leave" | "overtime" | "shift">(
    "leave"
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  if (!user || (user.role !== "admin" && user.role !== "manager")) {
    return <div>只有管理者可以使用批量操作</div>;
  }

  // 根據 tab 取得待核准的申請
  const getPendingApplications = (): any[] => {
    if (selectedTab === "leave") {
      return (leaveApplications || []).filter((app: any) => app.status === "pending");
    } else if (selectedTab === "overtime") {
      return (overtimeApplications || []).filter((app: any) => app.status === "pending");
    } else {
      return (shiftSwapApplications || []).filter((app: any) =>
        ["pending_approval", "pending_confirmation"].includes(app.status)
      );
    }
  };

  const applications = getPendingApplications();

  const handleSelectAll = () => {
    if (selectedIds.length === applications.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(applications.map((app) => app.id));
    }
  };

  const handleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((sid) => sid !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleApprove = async () => {
    if (selectedIds.length === 0) {
      alert("請選擇要核准的申請");
      return;
    }

    try {
      await batchApproveApplications(selectedIds, selectedTab);
      setSelectedIds([]);
    } catch (error) {
      console.error("批量核准失敗:", error);
    }
  };

  const handleReject = async () => {
    if (selectedIds.length === 0) {
      alert("請選擇要拒絕的申請");
      return;
    }

    if (!rejectReason.trim()) {
      alert("請輸入拒絕原因");
      return;
    }

    try {
      await batchRejectApplications(selectedIds, selectedTab, rejectReason);
      setSelectedIds([]);
      setRejectReason("");
      setShowRejectForm(false);
    } catch (error) {
      console.error("批量拒絕失敗:", error);
    }
  };

  const getTabLabel = () => {
    if (selectedTab === "leave") return "請假申請";
    if (selectedTab === "overtime") return "加班申請";
    return "換班申請";
  };

  const getApplicationDetails = (app: any): string => {
    if (selectedTab === "leave") {
      return `${app.employeeName} - ${app.type} (${app.startDate} ~ ${app.endDate})`;
    } else if (selectedTab === "overtime") {
      return `${app.employeeName} - ${app.date} (${app.hours} 小時)`;
    } else {
      return `${app.initiatorName} ↔ ${app.targetEmployeeName} - ${app.date}`;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">批量操作</h1>
        <p className="text-gray-600 mt-2">快速核准或拒絕多筆申請</p>
      </div>

      {/* Tab 選擇 */}
      <div className="flex gap-2 border-b">
        {(["leave", "overtime", "shift"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setSelectedTab(tab);
              setSelectedIds([]);
              setShowRejectForm(false);
            }}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              selectedTab === tab
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab === "leave"
              ? "請假申請"
              : tab === "overtime"
                ? "加班申請"
                : "換班申請"}
            <span className="ml-2 text-sm font-normal">
              ({applications.length})
            </span>
          </button>
        ))}
      </div>

      {/* 待核准申請列表 */}
      <div className="border rounded-lg">
        <div className="border-b p-4">
          <h2 className="text-lg font-semibold">{getTabLabel()} - 待核准</h2>
        </div>
        <div className="p-4">
          {applications.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              無待核准的申請
            </div>
          ) : (
            <>
              <div className="overflow-x-auto mb-4">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-semibold className="w-12">
                        <input type="checkbox" checked={$1} onChange={$2} />
                      </th>
                      <th className="text-left p-2 font-semibold>申請詳情</th>
                      <th className="text-left p-2 font-semibold>申請日期</th>
                      <th className="text-left p-2 font-semibold>狀態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((app: any) => (
                      <TableRow key={app.id}>
                        <td className="p-2>
                          <input type="checkbox" checked={$1} onChange={$2} />
                        </td>
                        <td className="p-2 className="font-medium">
                          {getApplicationDetails(app)}
                        </td>
                        <td className="p-2 className="text-sm text-gray-600">
                          {new Date(app.createdAt).toLocaleDateString("zh-TW")}
                        </td>
                        <td className="p-2>
                          <span className="px-2 py-1 rounded text-xs font-semibold bg-yellow-100 text-yellow-800">
                            待核准
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 操作按鈕 */}
              <div className="flex gap-2">
                <button onClick={$1} disabled={$2} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                  <CheckCircle2 className="w-4 h-4" />
                  核准選中的 {selectedIds.length} 筆
                </button>

                {!showRejectForm ? (
                  <button onClick={$1} disabled={$2} className="px-4 py-2 border rounded hover:bg-gray-100 disabled:opacity-50">
                    <XCircle className="w-4 h-4" />
                    拒絕選中的 {selectedIds.length} 筆
                  </button>
                ) : (
                  <div className="flex gap-2 flex-1">
                    <input placeholder="$1" value={$2} onChange={$3} className="px-3 py-2 border rounded" />
                    <button onClick={$1} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
                      確認拒絕
                    </button>
                    <Button
                      onClick={() => {
                        setShowRejectForm(false);
                        setRejectReason("");
                      }}
                      variant="outline"
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>

              {/* 選中統計 */}
              {selectedIds.length > 0 && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-900">
                  已選中 {selectedIds.length} / {applications.length} 筆申請
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 批量新增排班提示 */}
      <div className="border rounded-lg">
        <div className="border-b p-4">
          <h2 className="text-lg font-semibold">批量新增排班</h2>
        </div>
        <div className="p-4">
          <p className="text-gray-600 mb-4">
            若需要批量新增排班，請使用排班管理頁面的匯入功能
          </p>
          <button className="px-4 py-2 border rounded hover:bg-gray-100">前往排班管理</button>
        </div>
      </div>
    </div>
  );
}
