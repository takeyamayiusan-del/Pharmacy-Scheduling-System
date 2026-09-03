"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/context/AppContext";
import {
  buildCurrentMonthShiftUsage,
  createEmptyCatalogShift,
  defaultColorsForCategory,
  formatCatalogShiftSummary,
  getHeadStoreShiftTemplate,
  guardCatalogIdentityChange,
  SHIFT_CATEGORY_LABELS,
  type CatalogShift,
  type ShiftCategory,
} from "@/lib/shift-catalog";
import { SITES } from "@/lib/sites";
import {
  ALL_SHIFT_CODES,
  getRotationShiftOptions,
  getShiftName,
  parseStoreConfig,
  suggestRotationMenuLabel,
  weekdayLabel,
  WORK_HOURS_REGIME_OPTIONS,
  workHoursRegimeMeta,
  type StoreConfig,
  type StoreShiftCode,
  type WorkHoursRegime,
} from "@/lib/store-config";
import { canEditPermissionPolicy, canEditStoreSettings } from "@/lib/auth/permissions";
import { APPROVAL_STEP_LABELS, type ApprovalStepRole } from "@/lib/auth/roles";
import type { ManageRole, RoleCapabilityPolicy } from "@/lib/auth/permissions";
import type { StorePolicies } from "@/lib/store-policies";
import {
  LEAVE_TYPE_OPTIONS,
} from "@/lib/attendance/leaveHours";
import {
  STATUTORY_LEAVE_RULES,
  effectiveLeaveRule,
  formatLeaveLimit,
  statutoryLeaveRulesMap,
  type LeavePayKind,
} from "@/lib/attendance/leaveEntitlements";
import {
  assertWritableShiftCode,
  getScheduleShiftOptions,
} from "@/lib/shift-catalog/resolve";

const WEEKDAY_OPTIONS = [1, 2, 3, 4, 5, 6]; // 不含日：公休
const CATEGORY_OPTIONS = Object.keys(SHIFT_CATEGORY_LABELS) as ShiftCategory[];

export default function StoreSettingsPage() {
  const {
    currentUser,
    storeConfig,
    saveStoreConfig,
    activeSiteId,
    schedule,
    fixedShifts,
    employees,
  } = useApp();
  const [draft, setDraft] = useState<StoreConfig>(storeConfig);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraft(storeConfig);
    setMessage(null);
  }, [storeConfig, activeSiteId]);

  const actor = { role: currentUser?.role, capabilities: currentUser?.capabilities };
  const canManage = canEditStoreSettings(actor, draft?.policies ?? storeConfig.policies);
  const canEditPolicy = canEditPermissionPolicy(actor);
  const siteMeta = SITES[activeSiteId];
  const useCatalog = draft.features.customShiftCatalog;

  const patchPolicies = (patch: Partial<StorePolicies>) => {
    setDraft((p) => ({ ...p, policies: { ...p.policies, ...patch } }));
  };

  const monthUsage = useMemo(() => {
    const siteEmployeeIds = new Set(employees.map((e) => e.id));
    return buildCurrentMonthShiftUsage({
      schedule,
      fixedShifts,
      siteEmployeeIds,
    });
  }, [schedule, fixedShifts, employees]);

  const originalCodeById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of storeConfig.shiftCatalog) map.set(s.id, s.code);
    return map;
  }, [storeConfig.shiftCatalog]);

  if (!canManage) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-800 mb-2">權限不足</h2>
          <p className="text-gray-600">僅店長、副店與老闆可以調整店家設定</p>
        </div>
      </div>
    );
  }

  const guardIdentity = (action: "delete" | "rename", code: string) =>
    guardCatalogIdentityChange({
      action,
      code,
      monthKey: monthUsage.monthKey,
      usedInCurrentMonth: monthUsage.usedInMonth.has(code),
      usedInFixedShifts: monthUsage.usedInFixed.has(code),
    });

  const updateShift = (
    code: StoreShiftCode,
    patch: Partial<{ name: string; enabled: boolean }>
  ) => {
    setDraft((prev) => ({
      ...prev,
      shifts: prev.shifts.map((s) => (s.code === code ? { ...s, ...patch } : s)),
    }));
  };

  const toggleWeekday = (day: number) => {
    setDraft((prev) => {
      const set = new Set(prev.rotationEvening.weekdays);
      if (set.has(day)) set.delete(day);
      else set.add(day);
      const weekdays = Array.from(set).sort((a, b) => a - b);
      const menuLabel =
        prev.rotationEvening.menuLabel === suggestRotationMenuLabel(prev.rotationEvening.weekdays) ||
        prev.rotationEvening.menuLabel === "禮三晚班"
          ? suggestRotationMenuLabel(weekdays)
          : prev.rotationEvening.menuLabel;
      return {
        ...prev,
        rotationEvening: { ...prev.rotationEvening, weekdays, menuLabel },
      };
    });
  };

  const updateCatalogShift = (id: string, patch: Partial<CatalogShift>) => {
    setDraft((prev) => ({
      ...prev,
      shiftCatalog: prev.shiftCatalog.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  };

  const tryUpdateCatalogCode = (shift: CatalogShift, nextCode: string) => {
    const trimmed = nextCode.slice(0, 24);
    if (trimmed === shift.code) return;
    const original = originalCodeById.get(shift.id) ?? shift.code;
    // 以「原本已存檔的碼」檢查當月是否已使用（避免草稿改一半又改回來）
    const guard = guardIdentity("rename", original);
    if (!guard.ok) {
      setMessage(guard.message);
      return;
    }
    updateCatalogShift(shift.id, { code: trimmed });
    setMessage(null);
  };

  const tryDeleteCatalogShift = (shift: CatalogShift) => {
    const code = originalCodeById.get(shift.id) ?? shift.code;
    const guard = guardIdentity("delete", code);
    if (!guard.ok) {
      setMessage(guard.message);
      return;
    }
    if (!window.confirm(`確定刪除班別「${shift.name}」？`)) return;
    setDraft((p) => ({
      ...p,
      shiftCatalog: p.shiftCatalog.filter((s) => s.id !== shift.id),
    }));
    setMessage(null);
  };

  const tryDisableCatalogShift = (shift: CatalogShift, enabled: boolean) => {
    if (
      !enabled &&
      (monthUsage.usedInMonth.has(shift.code) || monthUsage.usedInFixed.has(shift.code))
    ) {
      const ok = window.confirm(
        `「${shift.name}」本月或固定班仍在使用。取消啟用後，本月已排班不受影響，但之後選單不會再出現此班。確定？`
      );
      if (!ok) return;
    }
    updateCatalogShift(shift.id, { enabled });
  };

  const updateCatalogRange = (
    id: string,
    field: "workSegments" | "breaks",
    index: number,
    key: "start" | "end",
    value: string
  ) => {
    setDraft((prev) => ({
      ...prev,
      shiftCatalog: prev.shiftCatalog.map((s) => {
        if (s.id !== id) return s;
        const list = s[field].map((row, i) =>
          i === index ? { ...row, [key]: value } : row
        );
        return { ...s, [field]: list };
      }),
    }));
  };

  const addCatalogRange = (id: string, field: "workSegments" | "breaks") => {
    setDraft((prev) => ({
      ...prev,
      shiftCatalog: prev.shiftCatalog.map((s) => {
        if (s.id !== id) return s;
        return {
          ...s,
          [field]: [...s[field], { start: "12:00", end: "13:00" }],
        };
      }),
    }));
  };

  const removeCatalogRange = (
    id: string,
    field: "workSegments" | "breaks",
    index: number
  ) => {
    setDraft((prev) => ({
      ...prev,
      shiftCatalog: prev.shiftCatalog.map((s) => {
        if (s.id !== id) return s;
        if (field === "workSegments" && s.workSegments.length <= 1) return s;
        return { ...s, [field]: s[field].filter((_, i) => i !== index) };
      }),
    }));
  };

  const handleLoadTemplate = () => {
    if (
      draft.shiftCatalog.length > 0 &&
      !window.confirm(
        `將以總店班別範本覆蓋目前目錄。\n${monthUsage.monthLabel}已排班的識別碼請勿改動；建議這個月維持現況、下個月再調整。確定？`
      )
    ) {
      return;
    }
    setDraft((prev) => ({
      ...prev,
      features: { ...prev.features, customShiftCatalog: true },
      shiftCatalog: getHeadStoreShiftTemplate(),
    }));
    setMessage("已載入總店班別範本（尚未儲存）");
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const normalized = parseStoreConfig(draft, activeSiteId);
      if (
        normalized.features.customShiftCatalog &&
        normalized.shiftCatalog.filter((s) => s.enabled).length === 0
      ) {
        throw new Error(
          "進階班別目錄已啟用，請至少啟用一個班別，或先按「載入總店範本」"
        );
      }

      // 儲存前再擋：刪除或改識別碼若動到本月／固定班
      const nextById = new Map(normalized.shiftCatalog.map((s) => [s.id, s]));
      for (const prev of storeConfig.shiftCatalog) {
        const next = nextById.get(prev.id);
        if (!next) {
          const guard = guardIdentity("delete", prev.code);
          if (!guard.ok) throw new Error(guard.message);
          continue;
        }
        if (next.code !== prev.code) {
          const guard = guardIdentity("rename", prev.code);
          if (!guard.ok) throw new Error(guard.message);
        }
      }

      for (const code of [
        normalized.defaultWeekdayShift,
        normalized.defaultSaturdayShift,
      ]) {
        const check = assertWritableShiftCode(code, normalized);
        if (!check.ok) throw new Error(`預設班：${check.message}`);
      }
      if (normalized.features.rotationEvening && normalized.rotationEvening.weekdays.length === 0) {
        throw new Error("輪值晚班至少需選擇一個星期");
      }
      if (normalized.features.rotationEvening) {
        for (const code of [
          normalized.rotationEvening.onDutyShift,
          normalized.rotationEvening.offDutyShift,
        ]) {
          const check = assertWritableShiftCode(code, normalized);
          if (!check.ok) throw new Error(check.message);
        }
      }
      const toSave =
        canEditPolicy
          ? normalized
          : {
              ...normalized,
              policies: {
                ...normalized.policies,
                roleCapabilities: storeConfig.policies.roleCapabilities,
              },
            };
      await saveStoreConfig(toSave);
      setMessage("已儲存店家設定");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="app-toolbar">
        <div>
          <h1 className="app-page-title">店家設定</h1>
          <p className="app-meta mt-1">
            目前編輯：{siteMeta.displayName}。各店設定分開儲存，互不影響。
          </p>
        </div>
      </div>

      <div
        className={`rounded-lg border px-4 py-3 text-sm ${
          activeSiteId === "zhushan"
            ? "border-amber-200 bg-amber-50 text-amber-950"
            : "border-sky-200 bg-sky-50 text-sky-950"
        }`}
      >
        {activeSiteId === "zhushan" ? (
          <>
            <p className="font-medium">竹山店（現行排班）</p>
            <p className="mt-1 text-amber-900/90">
              與集集已共用同一套程式；本店維持 A–E 與禮三晚班，請勿開啟「進階班別目錄」，以免改到現有排班。
            </p>
          </>
        ) : (
          <>
            <p className="font-medium">集集／家禾</p>
            <p className="mt-1 text-sky-900/90">
              使用班別目錄（短碼／多段休息）；調整只影響本店，不會改到竹山。
            </p>
          </>
        )}
      </div>

      {message && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">
          {message}
        </div>
      )}

      <section className="app-panel p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">基本資料</h2>
        <label className="block text-sm">
          <span className="text-gray-700">店名</span>
          <input
            value={draft.storeName}
            onChange={(e) => setDraft((p) => ({ ...p, storeName: e.target.value }))}
            className="mt-1 w-full border rounded-lg px-3 py-2"
          />
        </label>
      </section>

      {activeSiteId === "jiji" && (
        <section className="app-panel p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-gray-900">進階班別目錄</h2>
              <p className="text-sm text-gray-500 mt-1">
                以各班別名稱為主。可新增班別；名稱／短碼／時段／顏色可隨時改。
                {monthUsage.monthLabel}已排班或固定班仍在用的識別碼不可刪除或改碼——這個月維持，下個月再動。
              </p>
            </div>
            <button
              type="button"
              onClick={handleLoadTemplate}
              className="px-3 py-2 text-sm rounded-lg border border-sky-300 text-sky-800 bg-sky-50 hover:bg-sky-100"
            >
              載入總店範本
            </button>
          </div>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={draft.features.customShiftCatalog}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  features: { ...p.features, customShiftCatalog: e.target.checked },
                }))
              }
            />
            <span>
              <span className="font-medium text-gray-900">啟用進階班別目錄</span>
              <span className="block text-gray-500">關閉後仍保留目錄資料，僅不以此為主。</span>
            </span>
          </label>

          {useCatalog && (
            <div className="space-y-4">
              {draft.shiftCatalog.length === 0 && (
                <p className="text-sm text-gray-500">尚無班別，請載入總店範本或新增一筆。</p>
              )}
              {draft.shiftCatalog.map((shift) => {
                const identityCode = originalCodeById.get(shift.id) ?? shift.code;
                const protectedThisMonth =
                  monthUsage.usedInMonth.has(identityCode) ||
                  monthUsage.usedInFixed.has(identityCode);
                return (
                <div key={shift.id} className="border rounded-lg p-4 space-y-3 bg-gray-50/60">
                  <div className="flex flex-wrap gap-3 items-end">
                    <div
                      className="h-10 w-14 rounded border-2 flex items-center justify-center text-sm font-medium shrink-0"
                      style={{
                        backgroundColor: shift.bgColor,
                        color: shift.textColor,
                        borderColor: shift.borderColor,
                      }}
                      title="班表預覽"
                    >
                      {shift.shortLabel || shift.name.slice(0, 2)}
                    </div>
                    <label className="text-sm flex-1 min-w-[8rem]">
                      <span className="text-gray-700">名稱</span>
                      <input
                        value={shift.name}
                        onChange={(e) =>
                          updateCatalogShift(shift.id, {
                            name: e.target.value,
                          })
                        }
                        className="mt-1 w-full border rounded-lg px-3 py-2 bg-white"
                      />
                    </label>
                    <label className="text-sm w-28">
                      <span className="text-gray-700">班表短碼</span>
                      <input
                        value={shift.shortLabel}
                        onChange={(e) =>
                          updateCatalogShift(shift.id, {
                            shortLabel: e.target.value.slice(0, 6),
                          })
                        }
                        className="mt-1 w-full border rounded-lg px-3 py-2 bg-white font-mono text-sm"
                        placeholder="白2"
                        title="班表格子顯示用"
                      />
                    </label>
                    <label className="text-sm w-32">
                      <span className="text-gray-700">類型</span>
                      <select
                        value={shift.category}
                        onChange={(e) => {
                          const category = e.target.value as ShiftCategory;
                          updateCatalogShift(shift.id, {
                            category,
                            ...defaultColorsForCategory(category),
                          });
                        }}
                        className="mt-1 w-full border rounded-lg px-3 py-2 bg-white"
                      >
                        {CATEGORY_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {SHIFT_CATEGORY_LABELS[c]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm w-24">
                      <span className="text-gray-700">表定工時</span>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={shift.nominalHours}
                        onChange={(e) =>
                          updateCatalogShift(shift.id, {
                            nominalHours: Number(e.target.value) || 0,
                          })
                        }
                        className="mt-1 w-full border rounded-lg px-3 py-2 bg-white"
                      />
                    </label>
                    <label className="text-sm w-28">
                      <span className="text-gray-700">計工時</span>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={shift.countedHours ?? ""}
                        placeholder="同表定"
                        onChange={(e) =>
                          updateCatalogShift(shift.id, {
                            countedHours: e.target.value === "" ? null : Number(e.target.value) || 0,
                          })
                        }
                        className="mt-1 w-full border rounded-lg px-3 py-2 bg-white"
                      />
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm pb-2">
                      <input
                        type="checkbox"
                        checked={shift.enabled}
                        onChange={(e) =>
                          tryDisableCatalogShift(shift, e.target.checked)
                        }
                      />
                      啟用
                    </label>
                    <button
                      type="button"
                      onClick={() => tryDeleteCatalogShift(shift)}
                      className="text-sm text-red-700 px-2 py-2 hover:underline"
                      title={
                        protectedThisMonth
                          ? `${monthUsage.monthLabel}或固定班仍在使用，不可刪`
                          : "刪除班別"
                      }
                    >
                      刪除
                    </button>
                  </div>

                  {protectedThisMonth && (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      {monthUsage.usedInMonth.has(identityCode)
                        ? `${monthUsage.monthLabel}班表已使用此班`
                        : "固定班表仍使用此班"}
                      ：本月請勿刪除或改識別碼；可改名稱／短碼／顏色／時段。下個月再調整。
                    </p>
                  )}

                  <div className="flex flex-wrap gap-3 items-center">
                    <span className="text-sm text-gray-700">班表顏色</span>
                    <label className="text-xs text-gray-500 inline-flex items-center gap-1">
                      背景
                      <input
                        type="color"
                        value={shift.bgColor}
                        onChange={(e) =>
                          updateCatalogShift(shift.id, { bgColor: e.target.value })
                        }
                        className="h-9 w-12 border rounded-lg px-1 py-1 bg-white"
                      />
                    </label>
                    <label className="text-xs text-gray-500 inline-flex items-center gap-1">
                      框線
                      <input
                        type="color"
                        value={shift.borderColor}
                        onChange={(e) =>
                          updateCatalogShift(shift.id, { borderColor: e.target.value })
                        }
                        className="h-9 w-12 border rounded-lg px-1 py-1 bg-white"
                      />
                    </label>
                    <label className="text-xs text-gray-500 inline-flex items-center gap-1">
                      文字
                      <input
                        type="color"
                        value={shift.textColor}
                        onChange={(e) =>
                          updateCatalogShift(shift.id, { textColor: e.target.value })
                        }
                        className="h-9 w-12 border rounded-lg px-1 py-1 bg-white"
                      />
                    </label>
                    <button
                      type="button"
                      className="text-xs text-sky-700 hover:underline"
                      onClick={() =>
                        updateCatalogShift(shift.id, defaultColorsForCategory(shift.category))
                      }
                    >
                      還原類型預設色
                    </button>
                  </div>

                  <details className="text-sm">
                    <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                      系統識別碼（一般無需修改）
                    </summary>
                    <label className="mt-2 block text-sm max-w-xs">
                      <span className="text-gray-600">
                        {protectedThisMonth
                          ? "本月或固定班仍在使用，識別碼已鎖定"
                          : "寫入班表用；本月已排班者請勿改，下個月再動"}
                      </span>
                      <input
                        value={shift.code}
                        disabled={protectedThisMonth}
                        onChange={(e) => tryUpdateCatalogCode(shift, e.target.value)}
                        className="mt-1 w-full border rounded-lg px-3 py-2 bg-white font-mono text-sm disabled:bg-gray-100 disabled:text-gray-500"
                      />
                    </label>
                  </details>

                  <p className="text-xs text-gray-500">{formatCatalogShiftSummary(shift)}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-700">上班時段</span>
                        <button
                          type="button"
                          className="text-xs text-sky-700"
                          onClick={() => addCatalogRange(shift.id, "workSegments")}
                        >
                          ＋時段
                        </button>
                      </div>
                      {shift.workSegments.map((seg, i) => (
                        <div key={i} className="flex gap-2 items-center mb-1">
                          <input
                            type="time"
                            value={seg.start}
                            onChange={(e) =>
                              updateCatalogRange(shift.id, "workSegments", i, "start", e.target.value)
                            }
                            className="border rounded px-2 py-1 text-sm bg-white"
                          />
                          <span className="text-gray-400">–</span>
                          <input
                            type="time"
                            value={seg.end}
                            onChange={(e) =>
                              updateCatalogRange(shift.id, "workSegments", i, "end", e.target.value)
                            }
                            className="border rounded px-2 py-1 text-sm bg-white"
                          />
                          {shift.workSegments.length > 1 && (
                            <button
                              type="button"
                              className="text-xs text-red-600"
                              onClick={() => removeCatalogRange(shift.id, "workSegments", i)}
                            >
                              刪
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-700">休息</span>
                        <button
                          type="button"
                          className="text-xs text-sky-700"
                          onClick={() => addCatalogRange(shift.id, "breaks")}
                        >
                          ＋休息
                        </button>
                      </div>
                      {shift.breaks.length === 0 && (
                        <p className="text-xs text-gray-400">無休息段</p>
                      )}
                      {shift.breaks.map((br, i) => (
                        <div key={i} className="flex gap-2 items-center mb-1">
                          <input
                            type="time"
                            value={br.start}
                            onChange={(e) =>
                              updateCatalogRange(shift.id, "breaks", i, "start", e.target.value)
                            }
                            className="border rounded px-2 py-1 text-sm bg-white"
                          />
                          <span className="text-gray-400">–</span>
                          <input
                            type="time"
                            value={br.end}
                            onChange={(e) =>
                              updateCatalogRange(shift.id, "breaks", i, "end", e.target.value)
                            }
                            className="border rounded px-2 py-1 text-sm bg-white"
                          />
                          <button
                            type="button"
                            className="text-xs text-red-600"
                            onClick={() => removeCatalogRange(shift.id, "breaks", i)}
                          >
                            刪
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                );
              })}

              <button
                type="button"
                onClick={() =>
                  setDraft((p) => ({
                    ...p,
                    shiftCatalog: [
                      ...p.shiftCatalog,
                      createEmptyCatalogShift({ sortOrder: p.shiftCatalog.length }),
                    ],
                  }))
                }
                className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                新增班別
              </button>
            </div>
          )}
        </section>
      )}

      {!useCatalog && (
        <section className="app-panel p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">班別清單</h2>
          <p className="text-sm text-gray-500">
            請以名稱辨識班別（全天／白班／上午…）。後方代碼 A–E 僅供系統對應，可保持不動。
            啟用的班別會出現在固定班表選單；休假建議保持啟用。
          </p>
          <div className="space-y-2">
            {ALL_SHIFT_CODES.map((code) => {
              const row = draft.shifts.find((s) => s.code === code)!;
              return (
                <div
                  key={code}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_72px_auto] gap-3 items-center"
                >
                  <label className="block text-sm min-w-0">
                    <span className="text-gray-700">班別名稱</span>
                    <input
                      value={row.name}
                      onChange={(e) => updateShift(code, { name: e.target.value })}
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="例如：全天、白班"
                    />
                  </label>
                  <div className="text-sm">
                    <span className="text-gray-500">代碼</span>
                    <div
                      className="mt-1 rounded-lg border bg-gray-50 px-3 py-2 font-mono text-sm text-gray-600 text-center"
                      title="系統內部代碼，勿隨意更改"
                    >
                      {code}
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700 sm:pb-2 sm:self-end">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      disabled={code === "X"}
                      onChange={(e) => updateShift(code, { enabled: e.target.checked })}
                    />
                    啟用
                  </label>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="app-panel p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">預設班</h2>
        <p className="text-sm text-gray-500">
          {useCatalog
            ? "無固定班時套用。請先在上方班別目錄建立／啟用班別，再選擇預設。"
            : "無固定班時套用啟用中的班別（以下以名稱顯示，括號內為系統代碼）。"}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-gray-700">平日預設（無固定班時）</span>
            <select
              value={draft.defaultWeekdayShift}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  defaultWeekdayShift: e.target.value,
                }))
              }
              className="mt-1 w-full border rounded-lg px-3 py-2"
            >
              {getScheduleShiftOptions(draft).map((code) => {
                const name = getShiftName(draft, code);
                return (
                  <option key={code} value={code}>
                    {useCatalog ? name : `${name}（${code}）`}
                  </option>
                );
              })}
              {!getScheduleShiftOptions(draft).includes(draft.defaultWeekdayShift) && (
                <option value={draft.defaultWeekdayShift}>
                  {getShiftName(draft, draft.defaultWeekdayShift)}（目前值）
                </option>
              )}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">週六預設（無固定班時）</span>
            <select
              value={draft.defaultSaturdayShift}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  defaultSaturdayShift: e.target.value,
                }))
              }
              className="mt-1 w-full border rounded-lg px-3 py-2"
            >
              {getScheduleShiftOptions(draft).map((code) => {
                const name = getShiftName(draft, code);
                return (
                  <option key={code} value={code}>
                    {useCatalog ? name : `${name}（${code}）`}
                  </option>
                );
              })}
              {!getScheduleShiftOptions(draft).includes(draft.defaultSaturdayShift) && (
                <option value={draft.defaultSaturdayShift}>
                  {getShiftName(draft, draft.defaultSaturdayShift)}（目前值）
                </option>
              )}
            </select>
          </label>
        </div>
      </section>

      <section className="app-panel p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">變形工時制度（勞基法）</h2>
        <p className="text-sm text-gray-500">
          依勞基法兩周／八周變形工時標記本店制度。班表頁檢查週期正常工時、單日上限與例假（每七日一例假），
          <span className="font-medium text-gray-700">僅提醒、不阻擋存檔</span>
          ；不取代正式加班申請與勞檢判定。
        </p>
        <label className="block text-sm">
          <span className="text-gray-700">本店制度</span>
          <select
            value={draft.workHoursRegime}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                workHoursRegime: e.target.value as WorkHoursRegime,
              }))
            }
            className="mt-1 w-full border rounded-lg px-3 py-2"
          >
            {WORK_HOURS_REGIME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}（{opt.cycleWeeks} 周／{opt.cycleHoursCap}h／單日{opt.dailyNormalHoursCap}h）
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-gray-700">週期起算日（核備／約定）</span>
          <input
            type="date"
            value={draft.workHoursCycleAnchor}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                workHoursCycleAnchor: e.target.value,
              }))
            }
            className="mt-1 w-full border rounded-lg px-3 py-2"
          />
          <span className="mt-1 block text-xs text-gray-500">
            非法條規定的「每月1日」。請填與勞檢／核備文件相同的起算日（常見為某一星期一），系統自此對齊兩周或八周。
          </span>
        </label>
        <label className="block text-sm">
          <span className="text-gray-700">核備文號／備註（選填）</span>
          <input
            value={draft.workHoursAgreementNote}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                workHoursAgreementNote: e.target.value.slice(0, 200),
              }))
            }
            className="mt-1 w-full border rounded-lg px-3 py-2"
            placeholder="例如：勞資會議日期、核備文號"
          />
        </label>
        <p className="text-sm text-gray-600">
          {workHoursRegimeMeta(draft.workHoursRegime).legalRef}：
          {workHoursRegimeMeta(draft.workHoursRegime).summary}
        </p>
        <p className="text-xs text-gray-500">
          員工可在「員工管理」另設個人制度（八周／兩周／正常工時）。此處為本店預設。
        </p>
      </section>

      <section className="app-panel p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">店規（打卡／加班／排休／審核／播假）</h2>
        <p className="text-sm text-gray-500">
          兩店同一套程式，這裡改的是「目前這家店」。加班建議兩店統一：滿半小時才算、一小時內可選加班費或補休、超過固定補休、逾四小時自動扣 30 分用餐。可按下方按鈕套用後再儲存。排休／審核／播假仍可依店別客製。
        </p>
        <button
          type="button"
          className="app-btn-outline text-sm"
          onClick={() =>
            patchPolicies({
              overtimeMinApplyMinutes: 30,
              overtimeForceCompLeaveAfterMinutes: 60,
              overtimeMealDeductAfterMinutes: 240,
              overtimeMealDeductMinutes: 30,
            })
          }
        >
          套用兩店統一加班規則（半小時起算／1 小時內可選費／逾 4 小時扣 30 分）
        </button>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-gray-700">可提早打卡（分鐘）</span>
            <input
              type="number"
              min={0}
              value={draft.policies.earlyPunchMinutes}
              onChange={(e) =>
                patchPolicies({ earlyPunchMinutes: Number(e.target.value) || 0 })
              }
              className="mt-1 w-full border rounded-lg px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">下班後導向加班申請（分鐘）</span>
            <input
              type="number"
              min={0}
              value={draft.policies.overtimeRedirectMinutes}
              onChange={(e) =>
                patchPolicies({ overtimeRedirectMinutes: Number(e.target.value) || 0 })
              }
              className="mt-1 w-full border rounded-lg px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">未滿幾分鐘不可申請加班（滿半小時＝30）</span>
            <input
              type="number"
              min={0}
              value={draft.policies.overtimeMinApplyMinutes}
              onChange={(e) =>
                patchPolicies({ overtimeMinApplyMinutes: Number(e.target.value) || 0 })
              }
              className="mt-1 w-full border rounded-lg px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">幾分鐘以內可選加班費（超過僅補休；空白＝不強迫）</span>
            <input
              type="number"
              min={0}
              value={draft.policies.overtimeForceCompLeaveAfterMinutes ?? ""}
              placeholder="不強迫，自選加班費或補休"
              onChange={(e) =>
                patchPolicies({
                  overtimeForceCompLeaveAfterMinutes:
                    e.target.value === "" ? null : Number(e.target.value) || 0,
                })
              }
              className="mt-1 w-full border rounded-lg px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">加班超過幾分鐘自動扣用餐（空白＝不扣；建議 240＝4 小時）</span>
            <input
              type="number"
              min={0}
              value={draft.policies.overtimeMealDeductAfterMinutes ?? ""}
              placeholder="不自動扣除"
              onChange={(e) =>
                patchPolicies({
                  overtimeMealDeductAfterMinutes:
                    e.target.value === "" ? null : Number(e.target.value) || 0,
                })
              }
              className="mt-1 w-full border rounded-lg px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">逾門檻扣除分鐘數（建議 30）</span>
            <input
              type="number"
              min={0}
              value={draft.policies.overtimeMealDeductMinutes}
              onChange={(e) =>
                patchPolicies({ overtimeMealDeductMinutes: Number(e.target.value) || 0 })
              }
              className="mt-1 w-full border rounded-lg px-3 py-2"
            />
          </label>
          <label className="block text-sm">
          <span className="text-gray-700">員工每月打卡補登申請次數（空白＝不限）</span>
            <input
              type="number"
              min={0}
              value={draft.policies.monthlyPunchCorrectionLimit ?? ""}
              placeholder="不限"
              onChange={(e) =>
                patchPolicies({
                  monthlyPunchCorrectionLimit:
                    e.target.value === "" ? null : Number(e.target.value) || 0,
                })
              }
              className="mt-1 w-full border rounded-lg px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">週六排休配額</span>
            <select
              value={draft.policies.saturdayQuotaMode}
              onChange={(e) => {
                const saturdayQuotaMode = e.target.value as StorePolicies["saturdayQuotaMode"];
                patchPolicies({
                  saturdayQuotaMode,
                  weekdayLeaveQuota:
                    saturdayQuotaMode === "month_pool"
                      ? 0
                      : saturdayQuotaMode === "all_saturdays" &&
                          draft.policies.weekdayLeaveQuota <= 0
                        ? 2
                        : draft.policies.weekdayLeaveQuota,
                });
              }}
              className="mt-1 w-full border rounded-lg px-3 py-2"
            >
              <option value="fixed">固定天數（週六／平日分開）</option>
              <option value="all_saturdays">本月所有週六（只能休週六；平日另計）</option>
              <option value="month_pool">本月週六數＝可休天數（週一到週六都能休）</option>
            </select>
          </label>
          {draft.policies.saturdayQuotaMode === "fixed" && (
            <label className="block text-sm">
              <span className="text-gray-700">週六可排休天數</span>
              <input
                type="number"
                min={0}
                value={draft.policies.saturdayLeaveQuota}
                onChange={(e) =>
                  patchPolicies({ saturdayLeaveQuota: Number(e.target.value) || 0 })
                }
                className="mt-1 w-full border rounded-lg px-3 py-2"
              />
            </label>
          )}
          {draft.policies.saturdayQuotaMode !== "month_pool" && (
            <label className="block text-sm">
              <span className="text-gray-700">平日可排休天數</span>
              <input
                type="number"
                min={0}
                value={draft.policies.weekdayLeaveQuota}
                onChange={(e) =>
                  patchPolicies({ weekdayLeaveQuota: Number(e.target.value) || 0 })
                }
                className="mt-1 w-full border rounded-lg px-3 py-2"
              />
            </label>
          )}
          {draft.policies.saturdayQuotaMode === "month_pool" && (
            <p className="text-sm text-slate-600 sm:col-span-2">
              有幾個禮拜六就能休幾天，週一到週六都可排休，週日仍公休。
            </p>
          )}
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={draft.policies.sundayFixedRest}
            onChange={(e) => patchPolicies({ sundayFixedRest: e.target.checked })}
          />
          <span>週日固定公休</span>
          <span className="block text-xs text-slate-500 mt-0.5">
            開啟：週日不可排班、不可換班、排休不用選。關閉：週日可排班，工時會算進去。
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={draft.policies.halfDayLeaveCountsAsOne}
            onChange={(e) => patchPolicies({ halfDayLeaveCountsAsOne: e.target.checked })}
          />
          <span>排休半天也算一次機會</span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={draft.policies.allowLeaveDeferral}
            onChange={(e) => patchPolicies({ allowLeaveDeferral: e.target.checked })}
          />
          <span>特休／補休過期可提遞延申請</span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={draft.policies.autoRestSuggestEnabled}
            onChange={(e) => patchPolicies({ autoRestSuggestEnabled: e.target.checked })}
          />
          <span>
            超時播假預覽（可關）。班表試算後請店長確認即可寫入，不走申請多關、不默默改已鎖定月份。
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={draft.policies.workHoursCycleFromHireDate}
            onChange={(e) =>
              patchPolicies({ workHoursCycleFromHireDate: e.target.checked })
            }
          />
          <span>變形工時週期從個人入職日起算</span>
        </label>
        <div>
          <p className="text-sm font-medium text-gray-800 mb-2">申請審核方式</p>
          <p className="text-xs text-gray-500 mb-2">
            僅用於申請類：請假、加班、換班、特休／補休遞延、打卡補登。
            排班、超時播假、薪資結算權限改由下方「權限設定」控制。
          </p>
          <div className="flex flex-col gap-2 mb-3">
            <label className="inline-flex items-start gap-2 text-sm">
              <input
                type="radio"
                className="mt-1"
                name="approvalMode"
                checked={draft.policies.approvalMode === "sequential"}
                onChange={() =>
                  patchPolicies({
                    approvalMode: "sequential",
                    approvalChain:
                      draft.policies.approvalChain.length > 1
                        ? draft.policies.approvalChain
                        : ["manager", "deputy", "owner"],
                  })
                }
              />
              <span>
                依關卡順序（集集）
                <span className="block text-xs text-slate-500">店長 → 副店 → 老闆，一段段審</span>
              </span>
            </label>
            <label className="inline-flex items-start gap-2 text-sm">
              <input
                type="radio"
                className="mt-1"
                name="approvalMode"
                checked={draft.policies.approvalMode === "any"}
                onChange={() => patchPolicies({ approvalMode: "any" })}
              />
              <span>
                店長／副店／老闆任一即可（竹山）
                <span className="block text-xs text-slate-500">誰有空誰審，審一關就結案</span>
              </span>
            </label>
          </div>
          {draft.policies.approvalMode === "sequential" && (
            <>
              <p className="text-sm font-medium text-gray-800 mb-2">審核關卡順序</p>
              <div className="flex flex-wrap gap-3">
                {(["manager", "deputy", "owner"] as ApprovalStepRole[]).map((role) => {
                  const on = draft.policies.approvalChain.includes(role);
                  return (
                    <label key={role} className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? (["manager", "deputy", "owner"] as ApprovalStepRole[]).filter(
                                (r) =>
                                  r === role || draft.policies.approvalChain.includes(r)
                              )
                            : draft.policies.approvalChain.filter((r) => r !== role);
                          patchPolicies({
                            approvalChain: next.length > 0 ? next : ["manager"],
                          });
                        }}
                      />
                      {APPROVAL_STEP_LABELS[role]}
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                目前：{draft.policies.approvalChain.map((r) => APPROVAL_STEP_LABELS[r]).join(" → ")}
              </p>
            </>
          )}
        </div>
      </section>

      <section className="app-panel p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">權限設定（排班／薪資／管理）</h2>
        {!canEditPolicy ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            僅老闆可調整權限設定。若要指派會計，請到「員工管理」將角色設為「會計」（跨店薪資、仍屬單店上班）。
          </p>
        ) : (
        <>
        <p className="text-sm text-gray-500">
          控制誰能排班、誰能看薪資結算、誰能管員工。竹山換店長請到「員工管理」把新人改成店長（可一併把舊店長降職）。
          若要讓某人負責跨店薪資：到員工管理設「會計」職位；若只需部分能力，也可維持員工並勾選對應授權。
        </p>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={draft.policies.roleCapabilities.deputyLikeManager}
            onChange={(e) =>
              patchPolicies({
                roleCapabilities: {
                  ...draft.policies.roleCapabilities,
                  deputyLikeManager: e.target.checked,
                },
              })
            }
          />
          <span>
            副店等同店長（預設開啟）
            <span className="block text-xs text-slate-500">關閉後副店需另外勾選授權才有排班／薪資等功能</span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={draft.policies.roleCapabilities.allowStaffGrants}
            onChange={(e) =>
              patchPolicies({
                roleCapabilities: {
                  ...draft.policies.roleCapabilities,
                  allowStaffGrants: e.target.checked,
                },
              })
            }
          />
          <span>
            允許對「員工」額外授權
            <span className="block text-xs text-slate-500">關閉後員工管理頁無法再勾排班／薪資等授權</span>
          </span>
        </label>
        {(
          [
            ["scheduleRoles", "可排班（月曆／固定班／單人排班）"],
            ["bonusSubmitRoles", "可登錄獎金加扣項（不含試算發布）"],
            ["payrollRoles", "可薪資結算試算／發布"],
            ["adminRoles", "可管員工／店家設定／打卡管理"],
          ] as const
        ).map(([field, label]) => {
          const list = draft.policies.roleCapabilities[field] as ManageRole[];
          const toggle = (role: ManageRole, on: boolean) => {
            const next = on
              ? Array.from(new Set([...list, role]))
              : list.filter((r) => r !== role);
            const safe = (next.length > 0 ? next : ["owner"]) as ManageRole[];
            patchPolicies({
              roleCapabilities: {
                ...draft.policies.roleCapabilities,
                [field]: safe,
              } as RoleCapabilityPolicy,
            });
          };
          return (
            <div key={field} className="rounded-xl border border-slate-200 p-3 space-y-2">
              <p className="text-sm font-medium text-slate-800">{label}</p>
              <div className="flex flex-wrap gap-4 text-sm">
                {(
                  [
                    ["owner", "老闆"],
                    ["manager", "店長"],
                    ["deputy", "副店"],
                  ] as const
                ).map(([role, roleLabel]) => (
                  <label key={role} className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={list.includes(role)}
                      onChange={(e) => toggle(role, e.target.checked)}
                    />
                    {roleLabel}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
        </>
        )}
      </section>

      <section className="app-panel p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">假別上限與給薪（勞基預設，可改）</h2>
        <p className="text-sm text-gray-500">
          預設依勞基法／請假規則／性工法。超過上限只在請假時警示，不擋送出、也不硬擋排班。
          有薪假請把薪資「每小時扣款」維持 0；半薪／無薪請在薪資費率自行填每小時扣款。
        </p>
        <label className="block text-sm max-w-xs">
          <span className="text-gray-700">換算 1 日＝幾小時（上限警示用）</span>
          <input
            type="number"
            min={1}
            max={24}
            value={draft.policies.leaveHoursPerDay}
            onChange={(e) =>
              patchPolicies({ leaveHoursPerDay: Number(e.target.value) || 8 })
            }
            className="mt-1 w-full border rounded-lg px-3 py-2"
          />
        </label>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600 border-b">
                <th className="py-2 pr-3">假別</th>
                <th className="py-2 pr-3">給薪</th>
                <th className="py-2 pr-3">上限天數</th>
                <th className="py-2">法令對照</th>
              </tr>
            </thead>
            <tbody>
              {LEAVE_TYPE_OPTIONS.map((type) => {
                const statutory = STATUTORY_LEAVE_RULES[type];
                const rule = effectiveLeaveRule(type, draft.policies.leaveRules);
                return (
                  <tr key={type} className="border-b align-top">
                    <td className="py-2 pr-3 font-medium text-gray-900">{type}</td>
                    <td className="py-2 pr-3">
                      <select
                        value={rule.payKind}
                        onChange={(e) =>
                          patchPolicies({
                            leaveRules: {
                              ...draft.policies.leaveRules,
                              [type]: {
                                daysLimit: rule.daysLimit,
                                payKind: e.target.value as LeavePayKind,
                              },
                            },
                          })
                        }
                        className="border rounded-lg px-2 py-1"
                      >
                        <option value="paid">有薪</option>
                        <option value="half">半薪</option>
                        <option value="unpaid">無薪</option>
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        placeholder="不限"
                        value={rule.daysLimit ?? ""}
                        onChange={(e) =>
                          patchPolicies({
                            leaveRules: {
                              ...draft.policies.leaveRules,
                              [type]: {
                                daysLimit:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value) || 0,
                                payKind: rule.payKind,
                              },
                            },
                          })
                        }
                        className="w-24 border rounded-lg px-2 py-1"
                      />
                      <span className="block text-xs text-gray-400 mt-0.5">
                        空白＝不限；勞基預設 {formatLeaveLimit({ ...statutory, customized: false })}
                      </span>
                    </td>
                    <td className="py-2 text-xs text-gray-600">
                      {statutory.legalRef}：{statutory.summary}
                      {rule.customized ? (
                        <span className="block text-amber-700 mt-0.5">已改店規</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="app-btn-outline text-sm"
          onClick={() =>
            patchPolicies({
              leaveRules: statutoryLeaveRulesMap(),
              leaveHoursPerDay: 8,
            })
          }
        >
          重設為勞基預設
        </button>
      </section>

      <section className="app-panel p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">功能開關</h2>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={draft.features.rotationEvening}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                features: { ...p.features, rotationEvening: e.target.checked },
              }))
            }
          />
          <span>
            <span className="font-medium text-gray-900">週期輪班</span>
            <span className="block text-gray-500">
              關閉後側欄會隱藏「{draft.rotationEvening.menuLabel}」選單。
              {activeSiteId === "jiji" && "（集集預設關閉）"}
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={draft.features.weekdayOffRule}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                features: { ...p.features, weekdayOffRule: e.target.checked },
              }))
            }
          />
          <span>
            <span className="font-medium text-gray-900">平日不排休規則</span>
            <span className="block text-gray-500">
              關閉後固定班表不再顯示此規則勾選欄。
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={draft.features.halfDayLeaveRule}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                features: { ...p.features, halfDayLeaveRule: e.target.checked },
              }))
            }
          />
          <span>
            <span className="font-medium text-gray-900">排休可選特定班別</span>
            <span className="block text-gray-500">
              開啟後可在固定班表為個別員工勾選。該員工排休只能選休上午或下午，剩下半天自選班別。
              {activeSiteId === "jiji" && "（集集預設開啟，給店長等需要休半天的人用）"}
            </span>
          </span>
        </label>
      </section>

      <section
        className={`app-panel p-6 space-y-4 ${
          draft.features.rotationEvening ? "" : "opacity-60"
        }`}
      >
        <h2 className="font-semibold text-gray-900">週期輪班</h2>
        <p className="text-sm text-gray-500">
          可複選星期；選單名稱依店顯示。參與員工仍在「固定班表」用規則標籤勾選。
        </p>

        <div>
          <p className="text-sm text-gray-700 mb-2">輪值星期</p>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_OPTIONS.map((day) => {
              const on = draft.rotationEvening.weekdays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  disabled={!draft.features.rotationEvening}
                  onClick={() => toggleWeekday(day)}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${
                    on
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300"
                  }`}
                >
                  週{weekdayLabel(day)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-gray-700">值晚班班別</span>
            <select
              value={draft.rotationEvening.onDutyShift}
              disabled={!draft.features.rotationEvening}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  rotationEvening: {
                    ...p.rotationEvening,
                    onDutyShift: e.target.value,
                  },
                }))
              }
              className="mt-1 w-full border rounded-lg px-3 py-2"
            >
              {getRotationShiftOptions(draft).map((code) => {
                const name = getShiftName(draft, code);
                return (
                  <option key={code} value={code}>
                    {useCatalog ? name : `${name}（${code}）`}
                  </option>
                );
              })}
              {!getRotationShiftOptions(draft).includes(
                draft.rotationEvening.onDutyShift
              ) && (
                <option value={draft.rotationEvening.onDutyShift}>
                  {getShiftName(draft, draft.rotationEvening.onDutyShift)}（目前值）
                </option>
              )}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">其餘輪值員工班別</span>
            <select
              value={draft.rotationEvening.offDutyShift}
              disabled={!draft.features.rotationEvening}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  rotationEvening: {
                    ...p.rotationEvening,
                    offDutyShift: e.target.value,
                  },
                }))
              }
              className="mt-1 w-full border rounded-lg px-3 py-2"
            >
              {getRotationShiftOptions(draft).map((code) => {
                const name = getShiftName(draft, code);
                return (
                  <option key={code} value={code}>
                    {useCatalog ? name : `${name}（${code}）`}
                  </option>
                );
              })}
              {!getRotationShiftOptions(draft).includes(
                draft.rotationEvening.offDutyShift
              ) && (
                <option value={draft.rotationEvening.offDutyShift}>
                  {getShiftName(draft, draft.rotationEvening.offDutyShift)}（目前值）
                </option>
              )}
            </select>
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-gray-700">選單名稱</span>
          <input
            value={draft.rotationEvening.menuLabel}
            disabled={!draft.features.rotationEvening}
            onChange={(e) =>
              setDraft((p) => ({
                ...p,
                rotationEvening: { ...p.rotationEvening, menuLabel: e.target.value },
              }))
            }
            className="mt-1 w-full border rounded-lg px-3 py-2"
            placeholder="例如 禮三晚班、週四晚班"
          />
        </label>

        <label className="block text-sm">
          <span className="text-gray-700">每月可排休上限</span>
          <input
            type="number"
            min={0}
            disabled={!draft.features.rotationEvening}
            value={draft.rotationEvening.monthlyOffLimit ?? ""}
            onChange={(e) => {
              const raw = e.target.value.trim();
              setDraft((p) => ({
                ...p,
                rotationEvening: {
                  ...p.rotationEvening,
                  monthlyOffLimit: raw === "" ? null : Math.max(0, Number(raw) || 0),
                },
              }));
            }}
            className="mt-1 w-full border rounded-lg px-3 py-2"
            placeholder="自動"
          />
          <span className="mt-1 block text-xs text-gray-500">
            每人每月最多可選幾天「不輪班」。空白＝依本月輪班日數自動算一半（奇數則多一天，例如 5 天→上限 3）。填數字則用固定天數。
          </span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-gray-700">規則標籤名稱（固定班表欄位）</span>
            <input
              value={
                draft.ruleTags.find((t) => t.id === "rotation_evening")?.label ?? ""
              }
              disabled={!draft.features.rotationEvening}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  ruleTags: p.ruleTags.map((t) =>
                    t.id === "rotation_evening" ? { ...t, label: e.target.value } : t
                  ),
                }))
              }
              className="mt-1 w-full border rounded-lg px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">規則說明</span>
            <input
              value={
                draft.ruleTags.find((t) => t.id === "rotation_evening")?.description ?? ""
              }
              disabled={!draft.features.rotationEvening}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  ruleTags: p.ruleTags.map((t) =>
                    t.id === "rotation_evening"
                      ? { ...t, description: e.target.value }
                      : t
                  ),
                }))
              }
              className="mt-1 w-full border rounded-lg px-3 py-2"
            />
          </label>
        </div>
      </section>

      <div className="flex gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "儲存中…" : "儲存設定"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => setDraft(storeConfig)}
          className="px-5 py-2.5 rounded-lg border text-sm text-gray-700 hover:bg-gray-50"
        >
          還原未儲存變更
        </button>
      </div>
    </div>
  );
}
