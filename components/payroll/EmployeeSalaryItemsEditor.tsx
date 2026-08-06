"use client";

import {
  SALARY_ITEM_PRESETS,
  newDraftItem,
  type SalaryItemDraft,
  type SalaryItemPresetKey,
} from "@/lib/payroll/salaryItems";

type Props = {
  items: SalaryItemDraft[];
  onChange: (items: SalaryItemDraft[]) => void;
  fullAttendanceHint?: string | null;
};

export default function EmployeeSalaryItemsEditor({
  items,
  onChange,
  fullAttendanceHint,
}: Props) {
  const grades = items.filter((i) => i.category === "position_grade");
  const allowances = items.filter((i) => i.category === "fixed_allowance");

  const updateAt = (indexInAll: number, patch: Partial<SalaryItemDraft>) => {
    onChange(items.map((it, idx) => (idx === indexInAll ? { ...it, ...patch } : it)));
  };

  const removeAt = (indexInAll: number) => {
    onChange(items.filter((_, idx) => idx !== indexInAll));
  };

  const addPreset = (presetKey: SalaryItemPresetKey | "position_grade" | "custom") => {
    if (presetKey === "position_grade") {
      const preset = SALARY_ITEM_PRESETS.find((p) => p.category === "position_grade")!;
      onChange([...items, newDraftItem(preset, items.length)]);
      return;
    }
    if (presetKey === "custom") {
      onChange([
        ...items,
        {
          category: "fixed_allowance",
          label: "自訂固定項目",
          amount: 0,
          presetKey: null,
          countsAsWage: false,
          isEnabled: true,
          sortOrder: items.length,
        },
      ]);
      return;
    }
    const preset = SALARY_ITEM_PRESETS.find((p) => p.presetKey === presetKey);
    if (!preset) return;
    if (preset.presetKey && items.some((i) => i.presetKey === preset.presetKey)) {
      alert(`已有「${preset.label}」，請直接編輯金額。`);
      return;
    }
    onChange([...items, newDraftItem(preset, items.length)]);
  };

  const renderRow = (item: SalaryItemDraft, indexInAll: number) => (
    <div
      key={`${item.presetKey ?? item.label}-${indexInAll}`}
      className="grid grid-cols-12 gap-2 items-end border rounded-lg p-2 bg-white"
    >
      <div className="col-span-12 sm:col-span-4">
        <label className="block text-[11px] text-gray-500 mb-1">項目名稱</label>
        <input
          value={item.label}
          onChange={(e) => updateAt(indexInAll, { label: e.target.value })}
          className="w-full border rounded px-2 py-1.5 text-sm"
        />
      </div>
      <div className="col-span-6 sm:col-span-3">
        <label className="block text-[11px] text-gray-500 mb-1">金額</label>
        <input
          type="number"
          value={item.amount}
          onChange={(e) => updateAt(indexInAll, { amount: Number(e.target.value) })}
          className="w-full border rounded px-2 py-1.5 text-sm"
        />
      </div>
      <div className="col-span-6 sm:col-span-3 flex items-center gap-2 pb-1">
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={item.countsAsWage}
            onChange={(e) => updateAt(indexInAll, { countsAsWage: e.target.checked })}
          />
          屬工資（計加班基數）
        </label>
      </div>
      <div className="col-span-12 sm:col-span-2 flex justify-end pb-0.5">
        <button
          type="button"
          onClick={() => removeAt(indexInAll)}
          className="text-xs text-red-600 hover:underline"
        >
          刪除
        </button>
      </div>
      {item.presetKey === "full_attendance" && (
        <div className="col-span-12 text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1.5 leading-relaxed">
          全勤屬工資；普通病假每日最多扣 1/30（不得一次歸零）。喪假／特休／補休／其他（公假等）不扣。
          事假目前按日扣 1/30；照顧家人事假依法不得扣，請人工調整。一年內病假未滿 10
          日不得作不利處分。
          {fullAttendanceHint ? (
            <div className="mt-1 text-amber-900 font-medium">{fullAttendanceHint}</div>
          ) : null}
        </div>
      )}
    </div>
  );

  return (
    <div className="col-span-2 md:col-span-4 space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-800">合約薪資 · 職位加級</h4>
          <button
            type="button"
            onClick={() => addPreset("position_grade")}
            className="text-xs px-2 py-1 rounded border border-emerald-200 text-emerald-700 bg-emerald-50"
          >
            + 新增加級
          </button>
        </div>
        <p className="text-[11px] text-gray-500 mb-2">底薪與職位加級為合約約定應給項目。</p>
        <div className="space-y-2">
          {grades.length === 0 ? (
            <p className="text-xs text-gray-400">尚未新增職位加級</p>
          ) : (
            items.map((item, idx) =>
              item.category === "position_grade" ? renderRow(item, idx) : null
            )
          )}
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h4 className="text-sm font-semibold text-gray-800">固定津貼／獎金</h4>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => addPreset("full_attendance")}
              className="text-xs px-2 py-1 rounded border border-sky-200 text-sky-700 bg-sky-50"
            >
              + 全勤獎金
            </button>
            <button
              type="button"
              onClick={() => addPreset("shift_package")}
              className="text-xs px-2 py-1 rounded border border-sky-200 text-sky-700 bg-sky-50"
            >
              + 包班獎金
            </button>
            <button
              type="button"
              onClick={() => addPreset("custom")}
              className="text-xs px-2 py-1 rounded border text-gray-700"
            >
              + 自訂項目
            </button>
          </div>
        </div>
        <p className="text-[11px] text-gray-500 mb-2">
          可手動新增固定項目；達標／規則符合時列入本月應發（全勤依請假自動試算）。
        </p>
        <div className="space-y-2">
          {allowances.length === 0 ? (
            <p className="text-xs text-gray-400">尚未新增固定項目</p>
          ) : (
            items.map((item, idx) =>
              item.category === "fixed_allowance" ? renderRow(item, idx) : null
            )
          )}
        </div>
      </div>
    </div>
  );
}
