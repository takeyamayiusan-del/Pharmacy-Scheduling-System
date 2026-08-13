"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/lib/context/AppContext";
import {
  autoRestCellNote,
  autoRestPreviewLabel,
  countAutoRestDays,
  previewAutoRest,
} from "@/lib/schedule/autoRestPreview";
import { workHoursRegimeMeta } from "@/lib/attendance/workHoursRegime";
import { getShiftName } from "@/lib/store-config";

export function AutoRestPreviewPanel(props: {
  year: number;
  month: number;
  monthLocked: boolean;
}) {
  const { year, month, monthLocked } = props;
  const {
    employees,
    storeConfig,
    shiftTimeConfig,
    getShiftForDate,
    updateShift,
  } = useApp();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const suggestions = useMemo(
    () =>
      previewAutoRest({
        year,
        month,
        employees,
        storeConfig,
        shiftTimeConfig,
        getShiftForDate,
      }),
    [year, month, employees, storeConfig, shiftTimeConfig, getShiftForDate]
  );

  if (!storeConfig.policies.autoRestSuggestEnabled) return null;

  const days = countAutoRestDays(suggestions);

  const apply = async () => {
    if (days <= 0) return;
    if (monthLocked) {
      const ok = window.confirm(
        `本月班表已鎖定。確定仍要寫入「${autoRestPreviewLabel(suggestions)}」？不會默默改，需您確認。`
      );
      if (!ok) return;
    } else {
      const ok = window.confirm(
        `確認寫入「${autoRestPreviewLabel(suggestions)}」？會把超時日改成休假，並在格子備註播假原因（不是發補休時數）。`
      );
      if (!ok) return;
    }
    setBusy(true);
    setMessage(null);
    try {
      let written = 0;
      for (const s of suggestions) {
        const note = autoRestCellNote({
          regimeLabel: workHoursRegimeMeta(s.regime).label,
          excessHours: s.excessHours,
          baselineShiftName: getShiftName(storeConfig, s.baselineShift),
          baselineHours: s.baselineHours,
        });
        for (const d of s.suggestedDates) {
          await updateShift(d.date, s.employeeId, "X", {
            note,
            noteKind: "auto_rest",
          });
          written += 1;
        }
      }
      setMessage(`已寫入 ${written} 日休假，格子已標「播」與原因。`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "寫入失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-card p-4 border-violet-200 bg-violet-50/50">
      <h3 className="app-section-title text-violet-900 mb-1">播假預覽</h3>
      <p className="text-sm text-violet-800/80 mb-3">
        週期表定工時超過上限時，用「超時時數 ÷ 個人基準班時數」算出要播幾天假，把那些上班日改成休假。
        不是發補休時數。寫入後格子會標「播」並備註原因，比照國定假日標示。店長／副店確認即可寫入，不走請假／加班那套多關審核。
        {monthLocked ? " 本月已鎖定，不會自動改班。" : ""}
      </p>
      {days <= 0 ? (
        <p className="text-sm text-emerald-800">本月無需播假。</p>
      ) : (
        <>
          <p className="text-sm font-medium text-violet-900 mb-2">
            {autoRestPreviewLabel(suggestions)}
          </p>
          <ul className="text-sm text-slate-700 space-y-1 mb-3 max-h-48 overflow-y-auto">
            {suggestions.map((s) => (
              <li key={`${s.employeeId}-${s.cycleStart}`}>
                {s.employeeName}（{workHoursRegimeMeta(s.regime).label}{" "}
                {s.cycleStart}～{s.cycleEnd} 約 {s.cycleHours}h／上限 {s.cycleCap}h，超{" "}
                {s.excessHours}h ÷ 基準班 {getShiftName(storeConfig, s.baselineShift)}{" "}
                {s.baselineHours}h）：建議休{" "}
                {s.suggestedDates.map((d) => d.date.slice(8)).join("、")} 日
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={busy}
            onClick={() => void apply()}
            className="app-btn-primary text-sm"
          >
            {busy ? "寫入中…" : "確認寫入休假"}
          </button>
        </>
      )}
      {message && <p className="text-sm text-slate-700 mt-2">{message}</p>}
    </div>
  );
}
