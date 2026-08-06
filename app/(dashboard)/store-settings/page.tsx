"use client";

import { useEffect, useState } from "react";
import { useApp, type ShiftType } from "@/lib/context/AppContext";
import {
  ALL_SHIFT_CODES,
  parseStoreConfig,
  suggestRotationMenuLabel,
  weekdayLabel,
  type StoreConfig,
  type StoreShiftCode,
} from "@/lib/store-config";

const WEEKDAY_OPTIONS = [1, 2, 3, 4, 5, 6]; // 不含日：公休

export default function StoreSettingsPage() {
  const { currentUser, storeConfig, saveStoreConfig } = useApp();
  const [draft, setDraft] = useState<StoreConfig>(storeConfig);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraft(storeConfig);
  }, [storeConfig]);

  const canManage = currentUser?.role === "owner" || currentUser?.role === "manager";

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

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const normalized = parseStoreConfig(draft);
      if (normalized.features.rotationEvening && normalized.rotationEvening.weekdays.length === 0) {
        throw new Error("輪值晚班至少需選擇一個星期");
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
          班別、預設班、功能開關與週期輪班。之後多分店可各自一份設定；目前為本店共用。
        </p>
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

      <section className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">班別清單</h2>
        <p className="text-sm text-gray-500">
          啟用的班別會出現在固定班表選單。休假（X）建議保持啟用。
        </p>
        <div className="space-y-2">
          {ALL_SHIFT_CODES.map((code) => {
            const row = draft.shifts.find((s) => s.code === code)!;
            return (
              <div
                key={code}
                className="grid grid-cols-[48px_1fr_auto] gap-3 items-center"
              >
                <span className="font-mono font-semibold text-gray-800">{code}</span>
                <input
                  value={row.name}
                  onChange={(e) => updateShift(code, { name: e.target.value })}
                  className="border rounded-lg px-3 py-2 text-sm"
                  placeholder="班別名稱"
                />
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
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

      <section className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">預設班</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-gray-700">平日預設（無固定班時）</span>
            <select
              value={draft.defaultWeekdayShift}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  defaultWeekdayShift: e.target.value as StoreShiftCode,
                }))
              }
              className="mt-1 w-full border rounded-lg px-3 py-2"
            >
              {draft.shifts
                .filter((s) => s.enabled)
                .map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code}（{s.name}）
                  </option>
                ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">週六預設（無固定班時）</span>
            <select
              value={draft.defaultSaturdayShift}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  defaultSaturdayShift: e.target.value as StoreShiftCode,
                }))
              }
              className="mt-1 w-full border rounded-lg px-3 py-2"
            >
              {draft.shifts
                .filter((s) => s.enabled)
                .map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code}（{s.name}）
                  </option>
                ))}
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
                    onDutyShift: e.target.value as ShiftType,
                  },
                }))
              }
              className="mt-1 w-full border rounded-lg px-3 py-2"
            >
              {ALL_SHIFT_CODES.filter((c) => c !== "X").map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
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
                    offDutyShift: e.target.value as ShiftType,
                  },
                }))
              }
              className="mt-1 w-full border rounded-lg px-3 py-2"
            >
              {ALL_SHIFT_CODES.filter((c) => c !== "X").map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
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
