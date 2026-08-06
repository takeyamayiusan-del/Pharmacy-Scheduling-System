"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp, type ShiftType, type Employee } from "@/lib/context/AppContext";
import {
  getActiveRuleTags,
  getEnabledShiftCodes,
  type StoreRuleTagId,
} from "@/lib/store-config";

const dayLabels = ["日", "一", "二", "三", "四", "五", "六"];

const RULE_FIELD: Record<
  StoreRuleTagId,
  "isWednesdayRotation" | "isWeekdayOffRule"
> = {
  rotation_evening: "isWednesdayRotation",
  weekday_off: "isWeekdayOffRule",
};

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
    storeConfig,
  } = useApp();

  const shiftOptions = useMemo(
    () => getEnabledShiftCodes(storeConfig) as ShiftType[],
    [storeConfig]
  );
  const activeRuleTags = useMemo(() => getActiveRuleTags(storeConfig), [storeConfig]);

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

  useEffect(() => {
    if (!shiftOptions.includes(newShift)) {
      setNewShift(shiftOptions.find((s) => s !== "X") ?? "B");
    }
  }, [shiftOptions, newShift]);

  const displayEmployees = employees.filter((e) => e.role !== "owner");
  const canManage = currentUser?.role === "owner" || currentUser?.role === "manager";

  const handleAdd = async () => {
    if (!newEmployeeId) return;
    try {
      await addFixedShift({
        employeeId: newEmployeeId,
        dayOfWeek: newDayOfWeek,
        shift: newShift,
      });
      setNewEmployeeId("");
      if (newDayOfWeek === 6 && newShift === "X") {
        alert("已設定禮拜六固定休假。未來週六班表會顯示休假（若當月已鎖定，請先解鎖或清掉舊覆寫）。");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "新增固定班失敗");
    }
  };

  const handleUpdate = async (
    index: number,
    field: "employeeId" | "dayOfWeek" | "shift",
    value: string | number
  ) => {
    const updated = { ...fixedShifts[index] };
    if (field === "employeeId" && typeof value === "string") updated.employeeId = value;
    if (field === "dayOfWeek" && typeof value === "number") updated.dayOfWeek = value;
    if (field === "shift" && typeof value === "string") updated.shift = value as ShiftType;
    try {
      await updateFixedShift(index, updated);
      if (updated.dayOfWeek === 6 && updated.shift === "X") {
        alert("已更新為禮拜六固定休假。未來週六會顯示休假。");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "更新固定班失敗");
    }
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">固定班表管理</h1>
        <a
          href="/store-settings"
          className="text-sm text-blue-700 hover:underline"
        >
          班別清單／功能開關 → 店家設定
        </a>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-900">
        可為個別員工設定「禮拜六 → 休假（X）」。儲存後未來週六班表會顯示休假；未設定時禮拜六預設為{" "}
        {storeConfig.defaultSaturdayShift} 班。平日預設為 {storeConfig.defaultWeekdayShift} 班。
        若該月班表已鎖定且格子仍是舊資料，請店長解鎖後再確認。
      </div>

      {/* ── 特殊規則設定（依店家功能開關動態欄位） ── */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="font-semibold text-gray-900 mb-1">特殊排班規則</h3>
        <p className="text-sm text-gray-500 mb-4">
          規則綁定員工身份，換人後只要重新設定即可。欄位依「店家設定」功能開關顯示。
        </p>

        {activeRuleTags.length === 0 ? (
          <p className="text-gray-400 text-sm">
            目前沒有啟用的規則標籤。請至「店家設定」開啟輪值晚班或平日不排休等功能。
          </p>
        ) : displayEmployees.length === 0 ? (
          <p className="text-gray-400 text-sm">目前沒有員工，請先到員工管理新增。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium text-gray-700">員工</th>
                  {activeRuleTags.map((tag) => (
                    <th
                      key={tag.id}
                      className="px-4 py-3 text-center font-medium text-gray-700"
                    >
                      <div>{tag.label}</div>
                      <div className="text-xs font-normal text-gray-500 mt-0.5">
                        {tag.description}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {displayEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                    {activeRuleTags.map((tag) => {
                      const field = RULE_FIELD[tag.id];
                      const enabled = Boolean(emp[field]);
                      const key = `${emp.id}-${field}`;
                      const onColor =
                        tag.id === "weekday_off" ? "bg-purple-600" : "bg-blue-600";
                      const textColor =
                        tag.id === "weekday_off" ? "text-purple-600" : "text-blue-600";
                      return (
                        <td key={tag.id} className="px-4 py-3 text-center">
                          <button
                            type="button"
                            disabled={savingRule === key}
                            onClick={() => handleToggleRule(emp, field)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                              enabled ? onColor : "bg-gray-200"
                            } ${savingRule === key ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                            aria-label={`${emp.name} ${tag.label}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                                enabled ? "translate-x-6" : "translate-x-1"
                              }`}
                            />
                          </button>
                          {enabled && (
                            <span className={`ml-2 text-xs font-medium ${textColor}`}>
                              已啟用
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 班別時段設定（依店家啟用班別） ── */}
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
          用逗號分隔多個時段，更新後班表下方圖例會即時顯示。要增減班別請至店家設定。
        </p>
      </div>

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
                儲存
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="font-medium text-gray-900 mb-4">新增固定班表</h3>
        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={newEmployeeId}
            onChange={(e) => setNewEmployeeId(e.target.value)}
            className="border rounded-lg px-3 py-2"
          >
            <option value="">選擇員工</option>
            {displayEmployees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
          <select
            value={newDayOfWeek}
            onChange={(e) => setNewDayOfWeek(Number(e.target.value))}
            className="border rounded-lg px-3 py-2"
          >
            {[1, 2, 3, 4, 5, 6].map((day) => (
              <option key={day} value={day}>
                禮拜{dayLabels[day]}
              </option>
            ))}
          </select>
          <select
            value={newShift}
            onChange={(e) => setNewShift(e.target.value as ShiftType)}
            className="border rounded-lg px-3 py-2"
          >
            {shiftOptions.map((shift) => (
              <option key={shift} value={shift}>
                {shift}（{shiftDisplayConfig[shift].label}）
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAdd}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
          >
            新增
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div>
          <h3 className="font-medium text-gray-900 mb-4">已設定的固定班表</h3>
          {fixedShifts.length === 0 ? (
            <p className="text-gray-500 text-center py-8">目前沒有設定任何固定班表</p>
          ) : (
            <div className="space-y-3">
              {fixedShifts.map((fs, index) => {
                const emp = employees.find((e) => e.id === fs.employeeId);
                return (
                  <div
                    key={`${fs.employeeId}-${fs.dayOfWeek}-${index}`}
                    className="flex flex-wrap items-center gap-3 p-3 bg-gray-50 rounded-lg"
                  >
                    <select
                      value={fs.employeeId}
                      onChange={(e) => handleUpdate(index, "employeeId", e.target.value)}
                      className="border rounded px-3 py-2"
                    >
                      {displayEmployees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={fs.dayOfWeek}
                      onChange={(e) => handleUpdate(index, "dayOfWeek", Number(e.target.value))}
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
                      {/* 若舊資料班別已停用，仍顯示目前值 */}
                      {!shiftOptions.includes(fs.shift) && (
                        <option value={fs.shift}>{fs.shift}（已停用）</option>
                      )}
                    </select>
                    {activeRuleTags.map((tag) => {
                      const field = RULE_FIELD[tag.id];
                      if (!emp?.[field]) return null;
                      const chip =
                        tag.id === "weekday_off"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-blue-100 text-blue-700";
                      return (
                        <span
                          key={tag.id}
                          className={`text-xs px-2 py-0.5 rounded-full ${chip}`}
                        >
                          {tag.label}
                        </span>
                      );
                    })}
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
