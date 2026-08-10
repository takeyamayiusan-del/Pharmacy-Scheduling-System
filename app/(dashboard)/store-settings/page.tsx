"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/context/AppContext";
import {
  createEmptyCatalogShift,
  formatCatalogShiftSummary,
  getHeadStoreShiftTemplate,
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
  type StoreConfig,
  type StoreShiftCode,
} from "@/lib/store-config";
import {
  assertWritableShiftCode,
  getScheduleShiftOptions,
} from "@/lib/shift-catalog/resolve";

const WEEKDAY_OPTIONS = [1, 2, 3, 4, 5, 6]; // 不含日：公休
const CATEGORY_OPTIONS = Object.keys(SHIFT_CATEGORY_LABELS) as ShiftCategory[];

export default function StoreSettingsPage() {
  const { currentUser, storeConfig, saveStoreConfig, activeSiteId } = useApp();
  const [draft, setDraft] = useState<StoreConfig>(storeConfig);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraft(storeConfig);
    setMessage(null);
  }, [storeConfig, activeSiteId]);

  const canManage = currentUser?.role === "owner" || currentUser?.role === "manager";
  const siteMeta = SITES[activeSiteId];
  const useCatalog = draft.features.customShiftCatalog;

  if (!canManage) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-800 mb-2">權限不足</h2>
          <p className="text-gray-600">僅店長與老闆可以調整店家設定</p>
        </div>
      </div>
    );
  }

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
        const next = [...s[field]];
        next[index] = { ...next[index], [key]: value };
        return { ...s, [field]: next };
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
      !window.confirm("將以總店班別範本覆蓋目前目錄，確定？")
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
      await saveStoreConfig(normalized);
      setMessage("已儲存店家設定");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">店家設定</h1>
        <p className="text-sm text-gray-500 mt-1">
          目前編輯：{siteMeta.displayName}。各店設定分開儲存，互不影響。
        </p>
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

      <section className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
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
        <section className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-gray-900">進階班別目錄</h2>
              <p className="text-sm text-gray-500 mt-1">
                自訂名稱、多段上班／休息。目前供設定與日後排班接線；尚未寫入竹山 A–E 班表。
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
              {draft.shiftCatalog.map((shift) => (
                <div key={shift.id} className="border rounded-lg p-4 space-y-3 bg-gray-50/60">
                  <div className="flex flex-wrap gap-3 items-end">
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
                    <label className="text-sm w-28">
                      <span className="text-gray-700">識別碼</span>
                      <input
                        value={shift.code}
                        onChange={(e) =>
                          updateCatalogShift(shift.id, {
                            code: e.target.value.slice(0, 24),
                          })
                        }
                        className="mt-1 w-full border rounded-lg px-3 py-2 bg-white font-mono text-sm"
                        title="寫入班表用，改動會影響既有班表對應"
                      />
                    </label>
                    <label className="text-sm w-32">
                      <span className="text-gray-700">類型</span>
                      <select
                        value={shift.category}
                        onChange={(e) =>
                          updateCatalogShift(shift.id, {
                            category: e.target.value as ShiftCategory,
                          })
                        }
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
                      <span className="text-gray-700">工時</span>
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
                    <label className="inline-flex items-center gap-2 text-sm pb-2">
                      <input
                        type="checkbox"
                        checked={shift.enabled}
                        onChange={(e) =>
                          updateCatalogShift(shift.id, { enabled: e.target.checked })
                        }
                      />
                      啟用
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((p) => ({
                          ...p,
                          shiftCatalog: p.shiftCatalog.filter((s) => s.id !== shift.id),
                        }))
                      }
                      className="text-sm text-red-700 px-2 py-2 hover:underline"
                    >
                      刪除
                    </button>
                  </div>

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
              ))}

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
        <section className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
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

      <section className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
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

      <section className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
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
      </section>

      <section
        className={`bg-white rounded-xl shadow-sm border p-6 space-y-4 ${
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
