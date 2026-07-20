"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/context/AppContext";
import { createClient } from "@/lib/supabase/client";
import {
  FLEXIBLE_PERIOD_PRESETS,
  buildOriginalScheduleSnapshot,
  buildSettlementPreview,
  type FlexibleAttendanceDay,
  type OriginalScheduleEntry,
  type PendingMakeupHours,
  type FlexiblePeriodMode,
} from "@/lib/attendance/flexibleAttendance";
import { formatCompLeaveHours } from "@/lib/attendance/compLeaveDisplay";

function mapDay(row: Record<string, unknown>): FlexibleAttendanceDay {
  const original = Array.isArray(row.original_schedule)
    ? (row.original_schedule as OriginalScheduleEntry[])
    : [];
  const expected = Array.isArray(row.expected_attendee_ids)
    ? (row.expected_attendee_ids as string[])
    : [];

  return {
    id: String(row.id),
    date: String(row.day_date).slice(0, 10),
    title: String(row.title ?? "颱風／彈性出勤日"),
    periodMode: row.period_mode as FlexiblePeriodMode,
    fromTime: row.from_time ? String(row.from_time).slice(0, 5) : undefined,
    note: row.note ? String(row.note) : undefined,
    status: row.status as FlexibleAttendanceDay["status"],
    bulletinId: row.bulletin_id ? String(row.bulletin_id) : undefined,
    originalSchedule: original,
    expectedAttendeeIds: expected,
    attendeesConfirmedAt: row.attendees_confirmed_at
      ? String(row.attendees_confirmed_at)
      : undefined,
    createdBy: String(row.created_by),
    settledAt: row.settled_at ? String(row.settled_at) : undefined,
    settledBy: row.settled_by ? String(row.settled_by) : undefined,
    createdAt: String(row.created_at),
  };
}

function mapPending(row: Record<string, unknown>): PendingMakeupHours {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    sourceDayId: String(row.source_day_id),
    sourceDate: String(row.source_date).slice(0, 10),
    hours: Number(row.hours),
    status: row.status as PendingMakeupHours["status"],
    makeupDate: row.makeup_date ? String(row.makeup_date).slice(0, 10) : undefined,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : undefined,
    resolvedBy: row.resolved_by ? String(row.resolved_by) : undefined,
    note: row.note ? String(row.note) : undefined,
    createdAt: String(row.created_at),
  };
}

type Props = {
  onScheduleChanged?: () => void;
};

export default function FlexibleAttendancePanel({ onScheduleChanged }: Props) {
  const {
    currentUser,
    employees,
    getShiftForDate,
    shiftTimeConfig,
    punchRecords,
    getCompLeaveBalance,
    loadCompLeaveLedger,
    loadBulletinItems,
  } = useApp();

  const isManager = currentUser?.role === "owner" || currentUser?.role === "manager";
  const supabase = useMemo(() => createClient(), []);

  const [days, setDays] = useState<FlexibleAttendanceDay[]>([]);
  const [pendingList, setPendingList] = useState<PendingMakeupHours[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [formDate, setFormDate] = useState("");
  const [formTitle, setFormTitle] = useState("颱風假／彈性出勤");
  const [periodMode, setPeriodMode] = useState<FlexiblePeriodMode>("from_time");
  const [fromTime, setFromTime] = useState("18:00");
  const [formNote, setFormNote] = useState("");
  const [publishBulletin, setPublishBulletin] = useState(true);

  const [confirmDayId, setConfirmDayId] = useState<string | null>(null);
  const [selectedAttendees, setSelectedAttendees] = useState<string[]>([]);
  const [settleDayId, setSettleDayId] = useState<string | null>(null);
  const [makeupDraft, setMakeupDraft] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 清除已取消殘留、跨月已結算（補休帳本保留）
      await fetch("/api/attendance/flexible-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "purge_old_settled" }),
      });
    } catch {
      // 清除失敗不阻擋列表載入
    }

    const monthStart = (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    })();

    const [daysRes, pendingRes] = await Promise.all([
      supabase
        .from("flexible_attendance_days")
        .select("*")
        .neq("status", "cancelled")
        .gte("day_date", monthStart)
        .order("day_date", { ascending: false })
        .limit(30),
      supabase
        .from("pending_makeup_hours")
        .select("*")
        .in("status", ["pending", "makeup_assigned"])
        .order("source_date", { ascending: false }),
    ]);
    if (daysRes.data) setDays(daysRes.data.map(mapDay));
    if (pendingRes.data) setPendingList(pendingRes.data.map(mapPending));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (!isManager) return null;

  const getEmpName = (id: string) => employees.find((e) => e.id === id)?.name ?? id;

  const periodLabel = (day: FlexibleAttendanceDay) =>
    day.periodMode === "full_day" ? "全日" : `${day.fromTime ?? ""} 起停班`;

  const callApi = async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/attendance/flexible-day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { error?: string; day?: { id: string } };
    if (!res.ok) throw new Error(data.error || "操作失敗");
    return data;
  };

  const openConfirm = (day: FlexibleAttendanceDay) => {
    const originallyOn = day.originalSchedule.filter((e) => e.shift !== "X").map((e) => e.userId);
    setSelectedAttendees(
      day.expectedAttendeeIds.length > 0 ? [...day.expectedAttendeeIds] : originallyOn
    );
    setConfirmDayId(day.id);
  };

  const handleCreate = async () => {
    if (!formDate) {
      alert("請選擇日期");
      return;
    }
    setBusy(true);
    try {
      const originalSchedule = buildOriginalScheduleSnapshot(
        employees,
        getShiftForDate,
        formDate
      );
      const data = await callApi({
        action: "create",
        date: formDate,
        title: formTitle,
        periodMode,
        fromTime: periodMode === "from_time" ? fromTime : undefined,
        note: formNote,
        publishBulletin,
        originalSchedule,
      });
      setShowCreate(false);
      setFormNote("");
      await loadData();
      await loadBulletinItems();
      onScheduleChanged?.();
      if (data.day?.id) {
        const created: FlexibleAttendanceDay = {
          id: data.day.id,
          date: formDate,
          title: formTitle,
          periodMode,
          fromTime: periodMode === "from_time" ? fromTime : undefined,
          note: formNote || undefined,
          status: "announced",
          originalSchedule,
          expectedAttendeeIds: originalSchedule
            .filter((e) => e.shift !== "X")
            .map((e) => e.userId),
          createdBy: currentUser!.id,
          createdAt: new Date().toISOString(),
        };
        openConfirm(created);
      }
      alert(
        "已發布颱風假公告。請接著確認「預計會來上班」的人，班表會更新顯示。"
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "設定失敗");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmAttendees = async () => {
    if (!confirmDayId) return;
    setBusy(true);
    try {
      await callApi({
        action: "confirm_attendees",
        dayId: confirmDayId,
        expectedAttendeeIds: selectedAttendees,
      });
      setConfirmDayId(null);
      await loadData();
      onScheduleChanged?.();
      alert("已更新班表：預計出勤者維持原班，無法來者改為休假（原本就休假者不動）。");
    } catch (err) {
      alert(err instanceof Error ? err.message : "確認失敗");
    } finally {
      setBusy(false);
    }
  };

  const settleTarget = days.find((d) => d.id === settleDayId) ?? null;
  const settlePreview = settleTarget
    ? buildSettlementPreview({
        employees,
        originalSchedule: settleTarget.originalSchedule,
        date: settleTarget.date,
        periodMode: settleTarget.periodMode,
        fromTime: settleTarget.fromTime,
        shiftTimeConfig,
        punchRecords,
      })
    : [];

  const handleSettle = async () => {
    if (!settleTarget) return;
    if (
      !confirm(
        `確定結算 ${settleTarget.date}？\n只處理原本有排班的人：\n• 有打卡 → 核發補休\n• 應來未到 → 待補（擇日補／扣補休）\n• 原本休假 → 完全不動`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await callApi({
        action: "settle",
        dayId: settleTarget.id,
        rows: settlePreview,
      });
      setSettleDayId(null);
      await loadData();
      await loadCompLeaveLedger();
      alert("結算完成（獎勵已依實際打卡發放）");
    } catch (err) {
      alert(err instanceof Error ? err.message : "結算失敗");
    } finally {
      setBusy(false);
    }
  };

  const resolvePending = async (
    item: PendingMakeupHours,
    resolution: "comp_leave_deducted" | "makeup_assigned" | "manually_cleared"
  ) => {
    setBusy(true);
    try {
      await callApi({
        action: "resolve_pending",
        pendingId: item.id,
        resolution,
        makeupDate: resolution === "makeup_assigned" ? makeupDraft[item.id] : undefined,
        note:
          resolution === "comp_leave_deducted"
            ? "員工選擇颱風日改扣補休"
            : resolution === "makeup_assigned"
              ? "員工選擇擇日補班"
              : "店長手動結清",
      });
      await loadData();
      await loadCompLeaveLedger();
    } catch (err) {
      alert(err instanceof Error ? err.message : "處理失敗");
    } finally {
      setBusy(false);
    }
  };

  const confirmTarget = days.find((d) => d.id === confirmDayId);
  const confirmOriginallyOn =
    confirmTarget?.originalSchedule.filter((e) => e.shift !== "X") ?? [];
  const confirmOriginallyOff =
    confirmTarget?.originalSchedule.filter((e) => e.shift === "X") ?? [];

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="p-4 border-b bg-cyan-50 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-medium text-gray-900">颱風／彈性出勤日</h3>
          <p className="text-xs text-gray-600 mt-1">
            流程：發布公告 → 確認預計出勤並更新班表 → 當日打卡後一鍵結算獎勵。原本休假者完全不受影響。
            取消後可重新設定；已結算紀錄本月保留，跨月自動清除（補休帳本仍保留）。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="px-3 py-2 bg-cyan-700 text-white text-sm rounded-lg hover:bg-cyan-800 whitespace-nowrap"
        >
          設定颱風假
        </button>
      </div>

      <div className="p-4 space-y-4">
        {loading ? (
          <p className="text-sm text-gray-500">載入中…</p>
        ) : days.length === 0 ? (
          <p className="text-sm text-gray-500">尚未設定彈性出勤日</p>
        ) : (
          <div className="space-y-2">
            {days.map((day) => {
              const onCount = day.originalSchedule.filter((e) => e.shift !== "X").length;
              return (
                <div
                  key={day.id}
                  className="flex flex-wrap items-center justify-between gap-2 border rounded-lg px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {day.date} · {day.title}
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-800">
                        颱
                      </span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {periodLabel(day)}
                      {day.note ? ` · ${day.note}` : ""}
                      {" · 原排班 "}
                      {onCount} 人
                      {day.attendeesConfirmedAt
                        ? ` · 預計出勤 ${day.expectedAttendeeIds.length} 人`
                        : " · 尚未確認預計出勤"}
                      {" · "}
                      {day.status === "announced"
                        ? "待結算"
                        : day.status === "settled"
                          ? "已結算"
                          : "已取消"}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {day.status === "announced" && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => openConfirm(day)}
                          className="px-2 py-1 bg-cyan-700 text-white rounded text-xs hover:bg-cyan-800 disabled:opacity-50"
                        >
                          確認預計出勤
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setSettleDayId(day.id)}
                          className="px-2 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700 disabled:opacity-50"
                        >
                          打卡後結算獎勵
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            if (
                              !confirm(
                                "取消此彈性出勤日？將還原班表、封存公告，並移除此設定以便重新設定。"
                              )
                            )
                              return;
                            setBusy(true);
                            try {
                              await callApi({ action: "cancel", dayId: day.id });
                              await loadData();
                              await loadBulletinItems();
                              onScheduleChanged?.();
                            } catch (err) {
                              alert(err instanceof Error ? err.message : "取消失敗");
                            } finally {
                              setBusy(false);
                            }
                          }}
                          className="px-2 py-1 border rounded text-xs hover:bg-gray-50 disabled:opacity-50"
                        >
                          取消
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {pendingList.length > 0 && (
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-2">
              待補時數（原本有排班但因颱風未到）
            </h4>
            <div className="space-y-2">
              {pendingList.map((item) => {
                const balance = getCompLeaveBalance(item.userId);
                return (
                  <div key={item.id} className="border rounded-lg p-3 text-sm space-y-2">
                    <div>
                      <p className="font-medium text-gray-900">
                        {getEmpName(item.userId)} · {item.sourceDate}
                      </p>
                      <p className="text-xs text-gray-500">
                        待補 {formatCompLeaveHours(item.hours)} 小時
                        {item.status === "makeup_assigned" && item.makeupDate
                          ? `（已指定補班 ${item.makeupDate}）`
                          : ""}
                        {" · 可用補休 "}
                        {formatCompLeaveHours(balance)} 小時
                      </p>
                    </div>
                    {item.status === "pending" && (
                      <div className="flex flex-wrap gap-2 items-center">
                        <button
                          type="button"
                          disabled={busy || balance < item.hours}
                          onClick={() => void resolvePending(item, "comp_leave_deducted")}
                          className="px-2 py-1 bg-amber-600 text-white rounded text-xs hover:bg-amber-700 disabled:opacity-50"
                        >
                          扣補休結清
                        </button>
                        <input
                          type="date"
                          value={makeupDraft[item.id] ?? ""}
                          onChange={(e) =>
                            setMakeupDraft((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          className="border rounded px-2 py-1 text-xs"
                        />
                        <button
                          type="button"
                          disabled={busy || !makeupDraft[item.id]}
                          onClick={() => void resolvePending(item, "makeup_assigned")}
                          className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                        >
                          指定補班日
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (!confirm("確定手動結清此筆待補時數？")) return;
                            void resolvePending(item, "manually_cleared");
                          }}
                          className="px-2 py-1 border rounded text-xs hover:bg-gray-50 disabled:opacity-50"
                        >
                          手動結清
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 space-y-4">
            <h3 className="font-semibold text-gray-900">設定颱風／彈性出勤日</h3>
            <p className="text-xs text-gray-500">
              發布後請詢問誰願意來，再用「確認預計出勤」更新班表。獎勵要等當天打卡後再結算。
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">日期</label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">標題</label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">停班時段</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {FLEXIBLE_PERIOD_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setPeriodMode(preset.periodMode);
                      if (preset.fromTime) setFromTime(preset.fromTime);
                    }}
                    className={`px-2 py-1 rounded text-xs border ${
                      periodMode === preset.periodMode &&
                      (preset.periodMode === "full_day" || fromTime === preset.fromTime)
                        ? "bg-cyan-700 text-white border-cyan-700"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              {periodMode === "from_time" && (
                <input
                  type="time"
                  value={fromTime}
                  onChange={(e) => setFromTime(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">備註（選填）</label>
              <textarea
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                rows={2}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="例如：縣市宣布 18:00 後停班停課"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={publishBulletin}
                onChange={(e) => setPublishBulletin(e.target.checked)}
              />
              同步發布緊急公告（請員工回覆是否出勤）
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleCreate()}
                className="flex-1 py-2 bg-cyan-700 text-white rounded-lg text-sm hover:bg-cyan-800 disabled:opacity-50"
              >
                {busy ? "處理中…" : "確認設定"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2 border rounded-lg text-sm"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="p-4 border-b">
              <h3 className="font-semibold text-gray-900">
                確認預計出勤 · {confirmTarget.date}
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                勾選「願意／預計會來」的人。未勾選且原本有排班者，班表會改為休假，結算時列入待補。
                原本就休假者不會出現在可勾選名單，也不會被改動。
              </p>
            </div>
            <div className="overflow-y-auto p-4 space-y-2">
              {confirmOriginallyOn.length === 0 ? (
                <p className="text-sm text-gray-500">當天原本沒有人排班</p>
              ) : (
                confirmOriginallyOn.map((entry) => (
                  <label
                    key={entry.userId}
                    className="flex items-center justify-between gap-2 border rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
                  >
                    <span>
                      {getEmpName(entry.userId)}
                      <span className="text-gray-400 ml-2">原班 {entry.shift}</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={selectedAttendees.includes(entry.userId)}
                      onChange={(e) => {
                        setSelectedAttendees((prev) =>
                          e.target.checked
                            ? [...prev, entry.userId]
                            : prev.filter((id) => id !== entry.userId)
                        );
                      }}
                    />
                  </label>
                ))
              )}
              {confirmOriginallyOff.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-gray-500 mb-1">原本休假（安全，不動作）</p>
                  <p className="text-xs text-gray-400">
                    {confirmOriginallyOff.map((e) => getEmpName(e.userId)).join("、")}
                  </p>
                </div>
              )}
            </div>
            <div className="p-4 border-t flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleConfirmAttendees()}
                className="flex-1 py-2 bg-cyan-700 text-white rounded-lg text-sm hover:bg-cyan-800 disabled:opacity-50"
              >
                {busy ? "更新中…" : "更新班表顯示預計出勤"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDayId(null)}
                className="flex-1 py-2 border rounded-lg text-sm"
              >
                稍後
              </button>
            </div>
          </div>
        </div>
      )}

      {settleTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="p-4 border-b">
              <h3 className="font-semibold text-gray-900">
                結算預覽 · {settleTarget.date}（{periodLabel(settleTarget)}）
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                依「發布當下原班表」結算。有打卡才發獎勵；應來未到進待補。原本休假者不在此清單。
              </p>
            </div>
            <div className="overflow-y-auto p-4">
              {settlePreview.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">
                  沒有需結算對象（當天原本都休假或時段未受影響）
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-600 border-b">
                      <th className="py-2">員工</th>
                      <th>原班</th>
                      <th>受影響</th>
                      <th>實際打卡</th>
                      <th>結果</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {settlePreview.map((row) => (
                      <tr key={row.userId}>
                        <td className="py-2 font-medium">{row.employeeName}</td>
                        <td>{row.scheduledShift}</td>
                        <td>{row.affectedHours}h</td>
                        <td>{row.actualPunchHours}h</td>
                        <td className="text-xs">
                          {row.outcome === "comp_leave_granted" ? (
                            <span className="text-emerald-700">核發補休 {row.grantHours}h</span>
                          ) : (
                            <span className="text-amber-700">待補 {row.pendingHours}h</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="p-4 border-t flex gap-2">
              <button
                type="button"
                disabled={busy || settlePreview.length === 0}
                onClick={() => void handleSettle()}
                className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? "結算中…" : "確認一鍵結算"}
              </button>
              <button
                type="button"
                onClick={() => setSettleDayId(null)}
                className="flex-1 py-2 border rounded-lg text-sm"
              >
                返回
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
