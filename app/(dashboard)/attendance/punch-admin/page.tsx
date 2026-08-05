"use client";

import { useEffect, useState } from "react";
import { useApp, type PunchRecord, type ShiftType } from "@/lib/context/AppContext";
import { getPunchSlotsForShift, minutesDiff, timeToMinutes } from "@/lib/attendance/punchSchedule";
import {
  adjustPunchSlotsForApprovedLeave,
  resolvePunchLateMinutes,
} from "@/lib/attendance/punchLeaveAdjust";
import {
  createEmptyGeofenceDraft,
  type GeofenceLocation,
} from "@/lib/attendance/geofence";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";

type EditablePunchFields = {
  action: "work_in" | "work_out";
  segmentIndex: number;
  time: string;
};

type GeoDraft = {
  id: string;
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  radiusMeters: string;
};

function toDraft(loc: GeofenceLocation): GeoDraft {
  return {
    id: loc.id,
    name: loc.name,
    address: loc.address,
    latitude: String(loc.latitude),
    longitude: String(loc.longitude),
    radiusMeters: String(loc.radiusMeters),
  };
}

function fromDraft(draft: GeoDraft): GeofenceLocation {
  return {
    id: draft.id,
    name: draft.name.trim() || "未命名店點",
    address: draft.address.trim(),
    latitude: Number(draft.latitude),
    longitude: Number(draft.longitude),
    radiusMeters: Number(draft.radiusMeters),
  };
}

export default function PunchAdminPage() {
  const {
    currentUser,
    employees,
    punchRecords,
    tardinessRecords,
    leaveRequests,
    addPunchRecord,
    updatePunchRecord,
    deletePunchRecord,
    addTardinessRecord,
    deleteTardinessRecord,
    getShiftForDate,
    shiftTimeConfig,
    geofenceLocations,
    saveGeofenceLocations,
  } = useApp();

  const isManager =
    currentUser?.role === "manager" || currentUser?.role === "owner";

  const today = new Date().toISOString().split("T")[0];
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTime, setEditTime] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRecord, setNewRecord] = useState<EditablePunchFields>({
    action: "work_in",
    segmentIndex: 0,
    time: "",
  });
  const [geoDrafts, setGeoDrafts] = useState<GeoDraft[]>(() =>
    geofenceLocations.map(toDraft)
  );
  const [geoSaving, setGeoSaving] = useState(false);

  useEffect(() => {
    setGeoDrafts(geofenceLocations.map(toDraft));
  }, [geofenceLocations]);

  if (!isManager) {
    return (
      <div className="p-8 text-center text-gray-500">僅限店長或老闆使用此功能</div>
    );
  }

  const staffEmployees = employees.filter((e) => e.role !== "owner");

  const filteredRecords = punchRecords
    .filter(
      (p) =>
        (!selectedEmpId || p.employeeId === selectedEmpId) &&
        p.date === selectedDate
    )
    .sort((a, b) => a.time.localeCompare(b.time));

  const selectedEmployee = employees.find((e) => e.id === selectedEmpId);
  const shift: ShiftType = selectedEmployee
    ? getShiftForDate(selectedDate, selectedEmpId)
    : "A";
  const slots =
    shift !== "X" && selectedEmpId
      ? adjustPunchSlotsForApprovedLeave(
          getPunchSlotsForShift(shift, shiftTimeConfig),
          selectedEmpId,
          selectedDate,
          leaveRequests
        )
      : [];

  const findSlot = (record: EditablePunchFields) =>
    slots.find(
      (slot) =>
        slot.action === record.action && slot.segmentIndex === record.segmentIndex
    );

  const getLateInfo = (record: EditablePunchFields) => {
    const slot = findSlot(record);
    if (!slot || record.action !== "work_in" || !selectedEmpId) {
      return { lateMinutes: 0, reason: undefined as string | undefined };
    }

    const actual = timeToMinutes(record.time);
    const lateMinutes = resolvePunchLateMinutes({
      employeeId: selectedEmpId,
      date: selectedDate,
      scheduledTime: slot.scheduledTime,
      actualMinutes: actual,
      leaveRequests,
    });
    const diff = minutesDiff(actual, timeToMinutes(slot.scheduledTime));

    if (lateMinutes <= 0) {
      return { lateMinutes: 0, reason: undefined as string | undefined };
    }

    return {
      lateMinutes,
      reason: `打卡管理校正（${slot.label} ${slot.scheduledTime}）：${diff >= 30 ? "遲到超過30分鐘" : "遲到"}`,
    };
  };

  const deleteMatchingTardiness = async (record: Pick<PunchRecord, "employeeId" | "date" | "lateMinutes" | "reason">) => {
    if (record.lateMinutes <= 0) return;

    const exactMatches = tardinessRecords.filter(
      (t) =>
        t.employeeId === record.employeeId &&
        t.date === record.date &&
        t.minutes === record.lateMinutes &&
        (!record.reason || t.notes === record.reason)
    );

    if (exactMatches.length > 0) {
      await Promise.all(exactMatches.map((t) => deleteTardinessRecord(t.id)));
      return;
    }

    await fetch("/api/attendance/tardiness", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        match: {
          employeeId: record.employeeId,
          date: record.date,
          minutes: record.lateMinutes,
          notes: record.reason,
        },
      }),
    });
  };

  const handleEdit = (record: PunchRecord) => {
    setEditingId(record.id);
    setEditTime(record.time);
  };

  const handleSaveEdit = async (record: PunchRecord) => {
    if (!editTime.match(/^\d{2}:\d{2}$/)) {
      alert("請輸入正確格式 HH:MM");
      return;
    }

    const lateInfo = getLateInfo({
      action: record.action,
      segmentIndex: record.segmentIndex,
      time: editTime,
    });

    try {
      await deleteMatchingTardiness(record);
      await updatePunchRecord(record.id, {
        time: editTime,
        lateMinutes: lateInfo.lateMinutes,
        reason: lateInfo.reason ?? null,
      });
      if (lateInfo.lateMinutes > 0 && lateInfo.reason) {
        await addTardinessRecord({
          employeeId: record.employeeId,
          employeeName: record.employeeName,
          date: record.date,
          minutes: lateInfo.lateMinutes,
          notes: lateInfo.reason,
        });
      }
      setEditingId(null);
    } catch (error) {
      console.error("[punch-admin] save edit failed", error);
      alert(error instanceof Error ? error.message : "儲存失敗");
    }
  };

  const handleDelete = async (record: PunchRecord) => {
    if (!confirm("確定要刪除這筆打卡紀錄？對應的遲到記錄也會一併移除。")) return;
    try {
      await deleteMatchingTardiness(record);
      await deletePunchRecord(record.id);
    } catch (error) {
      console.error("[punch-admin] delete failed", error);
      alert(error instanceof Error ? error.message : "刪除失敗");
    }
  };

  const handleAdd = async () => {
    if (!selectedEmpId) {
      alert("請先選擇員工");
      return;
    }
    if (!newRecord.time.match(/^\d{2}:\d{2}$/)) {
      alert("請輸入正確時間格式 HH:MM");
      return;
    }
    const emp = employees.find((e) => e.id === selectedEmpId);
    if (!emp) return;

    const lateInfo = getLateInfo(newRecord);

    try {
      await addPunchRecord({
        employeeId: selectedEmpId,
        employeeName: emp.name,
        date: selectedDate,
        action: newRecord.action,
        segmentIndex: newRecord.segmentIndex,
        time: newRecord.time,
        shift,
        lateMinutes: lateInfo.lateMinutes,
        reason: lateInfo.reason,
        latitude: 0,
        longitude: 0,
      });

      if (lateInfo.lateMinutes > 0 && lateInfo.reason) {
        await addTardinessRecord({
          employeeId: selectedEmpId,
          employeeName: emp.name,
          date: selectedDate,
          minutes: lateInfo.lateMinutes,
          notes: lateInfo.reason,
        });
      }

      setShowAddForm(false);
      setNewRecord({ action: "work_in", segmentIndex: 0, time: "" });
    } catch (error) {
      console.error("[punch-admin] add failed", error);
      alert(error instanceof Error ? error.message : "新增失敗");
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900">打卡紀錄管理</h2>

      <div className="bg-white rounded-xl shadow-sm border p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-medium text-gray-900">打卡圍籬（多家店）</h3>
            <p className="text-xs text-gray-500 mt-1">
              可新增多個座標（本店、總點等）。員工在任一店點半徑內都能打卡，方便支援調度。
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = createEmptyGeofenceDraft({
                name: `店點 ${geoDrafts.length + 1}`,
                radiusMeters: 150,
              });
              setGeoDrafts((prev) => [...prev, toDraft(next)]);
            }}
            className="px-3 py-2 border text-sm rounded-lg hover:bg-gray-50 whitespace-nowrap"
          >
            + 新增店點
          </button>
        </div>

        <div className="space-y-4">
          {geoDrafts.map((draft, index) => (
            <div key={draft.id} className="border rounded-lg p-3 space-y-3 bg-gray-50">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-800">店點 {index + 1}</p>
                <button
                  type="button"
                  disabled={geoDrafts.length <= 1}
                  onClick={() =>
                    setGeoDrafts((prev) => prev.filter((item) => item.id !== draft.id))
                  }
                  className="text-xs text-red-600 hover:underline disabled:opacity-40 disabled:no-underline"
                >
                  刪除
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">店名</label>
                  <input
                    value={draft.name}
                    onChange={(e) =>
                      setGeoDrafts((prev) =>
                        prev.map((item) =>
                          item.id === draft.id ? { ...item, name: e.target.value } : item
                        )
                      )
                    }
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    placeholder="例如：竹山店／總點"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">半徑（公尺）</label>
                  <input
                    type="number"
                    min={20}
                    max={2000}
                    value={draft.radiusMeters}
                    onChange={(e) =>
                      setGeoDrafts((prev) =>
                        prev.map((item) =>
                          item.id === draft.id
                            ? { ...item, radiusMeters: e.target.value }
                            : item
                        )
                      )
                    }
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-600 mb-1">地址說明</label>
                  <input
                    value={draft.address}
                    onChange={(e) =>
                      setGeoDrafts((prev) =>
                        prev.map((item) =>
                          item.id === draft.id ? { ...item, address: e.target.value } : item
                        )
                      )
                    }
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">緯度</label>
                  <input
                    value={draft.latitude}
                    onChange={(e) =>
                      setGeoDrafts((prev) =>
                        prev.map((item) =>
                          item.id === draft.id ? { ...item, latitude: e.target.value } : item
                        )
                      )
                    }
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">經度</label>
                  <input
                    value={draft.longitude}
                    onChange={(e) =>
                      setGeoDrafts((prev) =>
                        prev.map((item) =>
                          item.id === draft.id ? { ...item, longitude: e.target.value } : item
                        )
                      )
                    }
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!navigator.geolocation) {
                    alert("此裝置不支援定位");
                    return;
                  }
                  navigator.geolocation.getCurrentPosition(
                    (pos) => {
                      setGeoDrafts((prev) =>
                        prev.map((item) =>
                          item.id === draft.id
                            ? {
                                ...item,
                                latitude: String(pos.coords.latitude),
                                longitude: String(pos.coords.longitude),
                              }
                            : item
                        )
                      );
                    },
                    () => alert("無法取得目前位置"),
                    { enableHighAccuracy: true, timeout: 15000 }
                  );
                }}
                className="px-3 py-1.5 border text-xs rounded-lg hover:bg-white bg-white"
              >
                用目前位置填入此店點
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled={geoSaving || geoDrafts.length === 0}
          onClick={async () => {
            setGeoSaving(true);
            try {
              const locations = geoDrafts.map(fromDraft);
              for (const loc of locations) {
                if (!Number.isFinite(loc.latitude) || !Number.isFinite(loc.longitude)) {
                  throw new Error(`「${loc.name}」緯度／經度格式不正確`);
                }
                if (!Number.isFinite(loc.radiusMeters) || loc.radiusMeters < 20) {
                  throw new Error(`「${loc.name}」半徑至少 20 公尺`);
                }
              }
              await saveGeofenceLocations(locations);
              alert(`已儲存 ${locations.length} 個打卡店點`);
            } catch (err) {
              alert(err instanceof Error ? err.message : "儲存失敗");
            } finally {
              setGeoSaving(false);
            }
          }}
          className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {geoSaving ? "儲存中…" : "儲存全部店點"}
        </button>
      </div>

      {/* 篩選條件 */}
      <div className="app-card p-4 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-40">
          <label className="block text-sm font-medium text-gray-700 mb-1">員工</label>
          <select
            value={selectedEmpId}
            onChange={(e) => setSelectedEmpId(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">— 選擇員工 —</option>
            {staffEmployees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-40">
          <label className="block text-sm font-medium text-gray-700 mb-1">日期</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          disabled={!selectedEmpId}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" />
          新增打卡
        </button>
      </div>

      {/* 班別資訊 */}
      {selectedEmpId && (
        <div className="text-sm text-gray-600 px-1">
          {selectedEmployee?.name} 當日班別：
          <span className="font-bold text-gray-900 ml-1">
            {shift === "X" ? "休假" : shift}
          </span>
          {shift !== "X" && slots.length > 0 && (
            <span className="ml-2 text-gray-400">
              （{slots.map((s) => `${s.label} ${s.scheduledTime}`).join("、")}）
            </span>
          )}
        </div>
      )}

      {/* 新增打卡表單 */}
      {showAddForm && (
        <div className="app-card p-4 border-2 border-blue-200 bg-blue-50">
          <p className="font-medium text-gray-900 mb-3">新增打卡紀錄</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-600 mb-1">動作</label>
              <select
                value={newRecord.action}
                onChange={(e) =>
                  setNewRecord((prev) => ({
                    ...prev,
                    action: e.target.value as "work_in" | "work_out",
                  }))
                }
                className="border rounded-lg px-3 py-2 text-sm"
              >
                <option value="work_in">上班</option>
                <option value="work_out">下班</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">段次</label>
              <select
                value={newRecord.segmentIndex}
                onChange={(e) =>
                  setNewRecord((prev) => ({
                    ...prev,
                    segmentIndex: Number(e.target.value),
                  }))
                }
                className="border rounded-lg px-3 py-2 text-sm"
              >
                {[0, 1, 2].map((i) => (
                  <option key={i} value={i}>
                    第 {i + 1} 段
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">時間</label>
              <input
                type="time"
                value={newRecord.time}
                onChange={(e) =>
                  setNewRecord((prev) => ({ ...prev, time: e.target.value }))
                }
                className="border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleAdd()}
                className="flex items-center gap-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700"
              >
                <Check className="h-4 w-4" /> 確認新增
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="flex items-center gap-1 px-3 py-2 border rounded-lg text-sm text-gray-600"
              >
                <X className="h-4 w-4" /> 取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 打卡紀錄列表 */}
      {filteredRecords.length === 0 ? (
        <div className="app-card p-8 text-center text-gray-500">
          {selectedEmpId
            ? "此日期尚無打卡紀錄"
            : "請選擇員工和日期查看打卡紀錄"}
        </div>
      ) : (
        <div className="app-card overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">員工</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">動作</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">段次</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">時間</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">遲到</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">原因/備註</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRecords.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {p.employeeName}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.action === "work_in"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {p.action === "work_in" ? "上班" : "下班"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    第 {p.segmentIndex + 1} 段
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {editingId === p.id ? (
                      <input
                        type="time"
                        value={editTime}
                        onChange={(e) => setEditTime(e.target.value)}
                        className="border rounded px-2 py-1 text-sm w-28"
                        autoFocus
                      />
                    ) : (
                      <span className="font-mono text-gray-900">{p.time}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {p.action === "work_in" && p.lateMinutes > 0 ? (
                      <span className="text-amber-600">{p.lateMinutes} 分</span>
                    ) : p.action === "work_out" && p.reason?.includes("加班") ? (
                      <span className="text-blue-600">逾時</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 truncate max-w-[150px]" title={p.reason || ""}>
                    {p.reason || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editingId === p.id ? (
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => void handleSaveEdit(p)}
                          className="p-1.5 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200"
                          title="儲存"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="p-1.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                          title="取消"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleEdit(p)}
                          className="p-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                          title="編輯時間"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(p)}
                          className="p-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100"
                          title="刪除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
