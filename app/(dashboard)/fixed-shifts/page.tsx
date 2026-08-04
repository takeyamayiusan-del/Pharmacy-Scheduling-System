"use client";

import { useEffect, useState } from "react";
import { useApp, type ShiftType, type Employee } from "@/lib/context/AppContext";

const shiftOptions: ShiftType[] = ["A", "B", "C", "D", "E", "X"];
const dayLabels = ["日", "一", "二", "三", "四", "五", "六"];

export default function FixedShiftsPage() {
  const {
    currentUser,
    employees,
    fixedShifts,
    addFixedShift,
    updateFixedShift,
    deleteFixedShift,
    shiftTimeConfig,
    updateShiftTimeConfig,
    shiftDisplayConfig,
    updateShiftDisplayConfig,
    updateEmployee,
  } = useApp();

  const [newEmployeeId, setNewEmployeeId] = useState<string>("");
  const [newDayOfWeek, setNewDayOfWeek] = useState<number>(1);
  const [newShift, setNewShift] = useState<ShiftType>("B");
  const [shiftTimeInputs, setShiftTimeInputs] = useState<Record<ShiftType, string>>({
    A: shiftTimeConfig.A.join(", "),
    B: shiftTimeConfig.B.join(", "),
    C: shiftTimeConfig.C.join(", "),
    D: shiftTimeConfig.D.join(", "),
    E: shiftTimeConfig.E.join(", "),
    X: shiftTimeConfig.X.join(", "),
  });
  const [shiftDisplayInputs, setShiftDisplayInputs] = useState<
    Record<ShiftType, { label: string; displayText: string; bgColor: string; textColor: string; borderColor: string }>
  >({
    A: { ...shiftDisplayConfig.A },
    B: { ...shiftDisplayConfig.B },
    C: { ...shiftDisplayConfig.C },
    D: { ...shiftDisplayConfig.D },
    E: { ...shiftDisplayConfig.E },
    X: { ...shiftDisplayConfig.X },
  });
  const [savingRule, setSavingRule] = useState<string | null>(null);

  useEffect(() => {
    setShiftDisplayInputs({
      A: { ...shiftDisplayConfig.A },
      B: { ...shiftDisplayConfig.B },
      C: { ...shiftDisplayConfig.C },
      D: { ...shiftDisplayConfig.D },
      E: { ...shiftDisplayConfig.E },
      X: { ...shiftDisplayConfig.X },
    });
  }, [shiftDisplayConfig]);

  // 只顯示員工（不包含老闆）
  const displayEmployees = employees.filter((e) => e.role !== "owner");

  const canManage = currentUser?.role === "owner" || currentUser?.role === "manager";

  const handleAdd = () => {
    if (!newEmployeeId) return;
    addFixedShift({
      employeeId: newEmployeeId,
      dayOfWeek: newDayOfWeek,
      shift: newShift,
    });
    setNewEmployeeId("");
  };

  const handleUpdate = (
    index: number,
    field: "employeeId" | "dayOfWeek" | "shift",
    value: string | number
  ) => {
    const updated = { ...fixedShifts[index] };
    if (field === "employeeId" && typeof value === "string") updated.employeeId = value;
    if (field === "dayOfWeek" && typeof value === "number") updated.dayOfWeek = value;
    if (field === "shift" && typeof value === "string") updated.shift = value as ShiftType;
    updateFixedShift(index, updated);
  };

  const handleSaveShiftTimes = (shift: ShiftType) => {
    const ranges = shiftTimeInputs[shift]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    updateShiftTimeConfig(shift, ranges.length > 0 ? ranges : ["未設定"]);
  };

  const handleSaveShiftDisplay = async (shift: ShiftType) => {
    await updateShiftDisplayConfig(shift, shiftDisplayInputs[shift]);
  };

  const handleToggleRule = async (
    emp: Employee,
    rule: "isWednesdayRotation" | "isWeekdayOffRule"
  ) => {
    setSavingRule(`${emp.id}-${rule}`);
    try {
      await updateEmployee(emp.id, {
        [rule]: !emp[rule],
      });
    } finally {
      setSavingRule(null);
    }
  };

  if (!canManage) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-800 mb-2">權限不足</h2>
          <p className="text-gray-600">僅店長與老闆可以管理固定班表</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">固定班表管理</h1>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-900">
        禮拜六可設固定班（含休假 X）。未設定時預設為 C 班；設為休假後班表會顯示 X。
        若該月班表已鎖定，需店長解鎖或手動改格子才會看到變更。
      </div>

      {/* ── 特殊規則設定 ── */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="font-semibold text-gray-900 mb-1">特殊排班規則</h3>
        <p className="text-sm text-gray-500 mb-4">
          規則綁定員工身份，換人後只要重新設定即可，不受名字影響。
        </p>

        {displayEmployees.length === 0 ? (
          <p className="text-gray-400 text-sm">目前沒有員工，請先到員工管理新增。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium text-gray-700">員工</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-700">
                    <div>禮拜三晚班輪值</div>
                    <div className="text-xs font-normal text-gray-500 mt-0.5">
                      週三依選休輪流上 A/B 班
                    </div>
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-gray-700">
                    <div>平日不排休規則</div>
                    <div className="text-xs font-normal text-gray-500 mt-0.5">
                      平日正常上班，排休只能選週六
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {displayEmployees.map((emp) => {
                  const wKey = `${emp.id}-isWednesdayRotation`;
                  const dKey = `${emp.id}-isWeekdayOffRule`;
                  return (
                    <tr key={emp.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>

                      {/* 禮拜三晚班輪值 */}
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          disabled={savingRule === wKey}
                          onClick={() => handleToggleRule(emp, "isWednesdayRotation")}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                            emp.isWednesdayRotation ? "bg-blue-600" : "bg-gray-200"
                          } ${savingRule === wKey ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                          aria-label={`${emp.name} 禮拜三晚班輪值`}
                        >
                          <span
                            className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                              emp.isWednesdayRotation ? "translate-x-6" : "translate-x-1"
                            }`}
                          />
                        </button>
                        {emp.isWednesdayRotation && (
                          <span className="ml-2 text-xs text-blue-600 font-medium">已啟用</span>
                        )}
                      </td>

                      {/* 平日不排休 */}
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          disabled={savingRule === dKey}
                          onClick={() => handleToggleRule(emp, "isWeekdayOffRule")}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                            emp.isWeekdayOffRule ? "bg-purple-600" : "bg-gray-200"
                          } ${savingRule === dKey ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                          aria-label={`${emp.name} 平日不排休規則`}
                        >
                          <span
                            className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                              emp.isWeekdayOffRule ? "translate-x-6" : "translate-x-1"
                            }`}
                          />
                        </button>
                        {emp.isWeekdayOffRule && (
                          <span className="ml-2 text-xs text-purple-600 font-medium">已啟用</span>
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

      {/* ── 班別時段設定 ── */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="font-medium text-gray-900 mb-4">班別時段設定（可客製）</h3>
        <div className="space-y-3">
          {shiftOptions.map((shift) => (
            <div
              key={shift}
              className="grid grid-cols-1 md:grid-cols-[120px_1fr_auto] gap-3 items-center"
            >
              <div className="text-sm font-medium text-gray-700">
                {shift} 班（{shiftDisplayConfig[shift].label}）
              </div>
              <input
                value={shiftTimeInputs[shift]}
                onChange={(e) =>
                  setShiftTimeInputs((prev) => ({ ...prev, [shift]: e.target.value }))
                }
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="例如 08:30-12:00, 13:30-17:00"
              />
              <button
                type="button"
                onClick={() => handleSaveShiftTimes(shift)}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
              >
                儲存
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          用逗號分隔多個時段，更新後班表下方圖例會即時顯示。
        </p>
      </div>

      {/* ── 新增固定班表 ── */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="font-medium text-gray-900 mb-4">班別顯示設定（文字 / 顏色）</h3>
        <div className="space-y-3">
          {shiftOptions.map((shift) => (
            <div
              key={shift}
              className="grid grid-cols-1 md:grid-cols-[100px_90px_1fr_1fr_1fr_1fr_auto] gap-3 items-center"
            >
              <div
                className="h-10 rounded border-2 flex items-center justify-center text-sm font-medium"
                style={{
                  backgroundColor: shiftDisplayInputs[shift].bgColor,
                  color: shiftDisplayInputs[shift].textColor,
                  borderColor: shiftDisplayInputs[shift].borderColor,
                }}
              >
                {shiftDisplayInputs[shift].displayText}
              </div>
              <input
                value={shiftDisplayInputs[shift].displayText}
                onChange={(e) =>
                  setShiftDisplayInputs((prev) => ({
                    ...prev,
                    [shift]: { ...prev[shift], displayText: e.target.value.slice(0, 4) || shift },
                  }))
                }
                className="border rounded-lg px-2 py-2 text-sm"
                placeholder="框內字"
              />
              <input
                value={shiftDisplayInputs[shift].label}
                onChange={(e) =>
                  setShiftDisplayInputs((prev) => ({
                    ...prev,
                    [shift]: { ...prev[shift], label: e.target.value },
                  }))
                }
                className="border rounded-lg px-3 py-2 text-sm"
                placeholder="圖例文字"
              />
              <input
                type="color"
                value={shiftDisplayInputs[shift].bgColor}
                onChange={(e) =>
                  setShiftDisplayInputs((prev) => ({
                    ...prev,
                    [shift]: { ...prev[shift], bgColor: e.target.value },
                  }))
                }
                className="h-10 border rounded-lg px-2 py-1"
                title="背景色"
              />
              <input
                type="color"
                value={shiftDisplayInputs[shift].borderColor}
                onChange={(e) =>
                  setShiftDisplayInputs((prev) => ({
                    ...prev,
                    [shift]: { ...prev[shift], borderColor: e.target.value },
                  }))
                }
                className="h-10 border rounded-lg px-2 py-1"
                title="框線色"
              />
              <input
                type="color"
                value={shiftDisplayInputs[shift].textColor}
                onChange={(e) =>
                  setShiftDisplayInputs((prev) => ({
                    ...prev,
                    [shift]: { ...prev[shift], textColor: e.target.value },
                  }))
                }
                className="h-10 border rounded-lg px-2 py-1"
                title="文字色"
              />
              <button
                type="button"
                onClick={() => handleSaveShiftDisplay(shift)}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
              >
                儲存樣式
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          可客製每個班別在班表中的框色、顯示文字與圖例名稱。
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="font-medium text-gray-900 mb-4">新增固定班表</h3>
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">員工</label>
            <select
              value={newEmployeeId}
              onChange={(e) => setNewEmployeeId(e.target.value)}
              className="border rounded-lg px-4 py-2"
            >
              <option value="">請選擇</option>
              {displayEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">星期</label>
            <select
              value={newDayOfWeek}
              onChange={(e) => setNewDayOfWeek(parseInt(e.target.value))}
              className="border rounded-lg px-4 py-2"
            >
              {[1, 2, 3, 4, 5, 6].map((day) => (
                <option key={day} value={day}>
                  {dayLabels[day]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">班別</label>
            <select
              value={newShift}
              onChange={(e) => setNewShift(e.target.value as ShiftType)}
              className="border rounded-lg px-4 py-2"
            >
              {shiftOptions.map((shift) => (
                <option key={shift} value={shift}>
                  {shiftDisplayConfig[shift].label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col justify-end">
            <button
              onClick={handleAdd}
              disabled={!newEmployeeId}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              新增
            </button>
          </div>
        </div>
      </div>

      {/* ── 固定班表列表 ── */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-6">
          <h3 className="font-medium text-gray-900 mb-4">已設定的固定班表</h3>
          {fixedShifts.length === 0 ? (
            <p className="text-gray-500 text-center py-8">目前沒有設定任何固定班表</p>
          ) : (
            <div className="space-y-3">
              {fixedShifts.map((fs, index) => {
                const emp = employees.find((e) => e.id === fs.employeeId);
                return (
                  <div key={index} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                    <select
                      value={fs.employeeId}
                      onChange={(e) => handleUpdate(index, "employeeId", e.target.value)}
                      className="border rounded px-3 py-2"
                    >
                      {displayEmployees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name}
                        </option>
                      ))}
                    </select>
                    <span className="text-gray-400">→</span>
                    <select
                      value={fs.dayOfWeek}
                      onChange={(e) =>
                        handleUpdate(index, "dayOfWeek", parseInt(e.target.value))
                      }
                      className="border rounded px-3 py-2"
                    >
                      {[1, 2, 3, 4, 5, 6].map((day) => (
                        <option key={day} value={day}>
                          {dayLabels[day]}
                        </option>
                      ))}
                    </select>
                    <span className="text-gray-400">→</span>
                    <select
                      value={fs.shift}
                      onChange={(e) => handleUpdate(index, "shift", e.target.value)}
                      className="border rounded px-3 py-2"
                    >
                      {shiftOptions.map((shift) => (
                        <option key={shift} value={shift}>
                          {shiftDisplayConfig[shift].label}
                        </option>
                      ))}
                    </select>
                    {emp?.isWednesdayRotation && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        禮三輪值
                      </span>
                    )}
                    {emp?.isWeekdayOffRule && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                        平日不排休
                      </span>
                    )}
                    <button
                      onClick={() => deleteFixedShift(index)}
                      className="ml-auto text-red-600 hover:text-red-800 text-sm"
                    >
                      刪除
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
