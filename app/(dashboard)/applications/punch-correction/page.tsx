"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/context/AppContext";
import {
  APPROVAL_STEP_LABELS,
  canManageSite,
} from "@/lib/auth/roles";
import {
  approvalPendingLabel,
  canActOnApprovalStep,
  currentApprovalRole,
  effectiveApprovalChain,
} from "@/lib/approvals/chain";
import { createClient } from "@/lib/supabase/client";
import {
  currentMonthCreatedAtRange,
  isPunchCorrectionOverLimit,
  punchCorrectionQuotaText,
} from "@/lib/attendance/punchCorrectionLimit";

type PunchAction = "work_in" | "work_out";
type CorrectionRow = {
  id: string;
  user_id: string;
  punch_date: string;
  punch_action: PunchAction;
  segment_index: number;
  requested_time: string;
  original_record_id: string | null;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  approval_step: number;
  reject_reason: string | null;
  created_at: string;
  users?: { name?: string } | null;
};

const ACTION_LABEL: Record<PunchAction, string> = {
  work_in: "上班",
  work_out: "下班",
};

export default function PunchCorrectionPage() {
  const { currentUser, employees, storeConfig, punchRecords, activeSiteId } = useApp();
  const supabase = createClient();
  const isManager = canManageSite(currentUser?.role);
  const [rows, setRows] = useState<CorrectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rejectModal, setRejectModal] = useState<{ id: string; reason: string } | null>(
    null
  );
  const [form, setForm] = useState({
    punchDate: "",
    punchAction: "work_in" as PunchAction,
    segmentIndex: 0,
    requestedTime: "",
    originalRecordId: "",
    reason: "",
  });

  const approvalChain = effectiveApprovalChain(
    storeConfig.policies.approvalChain,
    employees,
    activeSiteId
  );
  const approvalMode = storeConfig.policies.approvalMode;
  const limit = storeConfig.policies.monthlyPunchCorrectionLimit;
  const { startIso, endIso } = currentMonthCreatedAtRange();

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("punch_correction_requests")
      .select("*, users(name)")
      .order("created_at", { ascending: false });
    if (!isManager && currentUser) q = q.eq("user_id", currentUser.id);
    const { data, error } = await q;
    if (!error && data) setRows(data as CorrectionRow[]);
    setLoading(false);
  }, [supabase, isManager, currentUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const myMonthUsed = useMemo(() => {
    if (!currentUser) return 0;
    return rows.filter(
      (r) =>
        r.user_id === currentUser.id &&
        (r.status === "pending" || r.status === "approved") &&
        r.created_at >= startIso &&
        r.created_at < endIso
    ).length;
  }, [rows, currentUser, startIso, endIso]);

  const overLimit = isPunchCorrectionOverLimit(myMonthUsed, limit);

  const dayPunches = useMemo(() => {
    if (!currentUser || !form.punchDate) return [];
    return punchRecords.filter(
      (p) => p.employeeId === currentUser.id && p.date === form.punchDate
    );
  }, [punchRecords, currentUser, form.punchDate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || submitting) return;
    if (overLimit && limit != null) {
      alert(`本月打卡補登已達 ${limit} 次上限，請改由店長在「打卡管理」代改`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/applications/punch-correction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          punchDate: form.punchDate,
          punchAction: form.punchAction,
          segmentIndex: form.segmentIndex,
          requestedTime: form.requestedTime,
          originalRecordId: form.originalRecordId || null,
          reason: form.reason,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || "送出失敗");
      }
      setForm({
        punchDate: "",
        punchAction: "work_in",
        segmentIndex: 0,
        requestedTime: "",
        originalRecordId: "",
        reason: "",
      });
      await load();
      alert("已送出打卡補登申請，待審核。");
    } catch (err) {
      alert(err instanceof Error ? err.message : "送出失敗");
    } finally {
      setSubmitting(false);
    }
  };

  const review = async (
    id: string,
    status: "approved" | "rejected" | "pending",
    rejectReason?: string
  ) => {
    try {
      const res = await fetch("/api/applications/punch-correction/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, rejectReason }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || "審核失敗");
      }
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "審核失敗");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="app-page-title">打卡補登</h2>
        <p className="app-meta mt-1">
          忘打卡或時間打錯請走這裡申請，依店規關卡審核（預設店長→副店→老闆）。
          店長在「打卡管理」直接代改不走關卡、不佔次數。
        </p>
        <p className="text-sm text-gray-600 mt-1">
          {punchCorrectionQuotaText(myMonthUsed, limit)}
        </p>
      </div>

      {currentUser?.role !== "owner" && (
        <form onSubmit={submit} className="app-panel p-6 space-y-4">
          <h3 className="font-medium text-gray-900">新申請</h3>
          {overLimit && limit != null && (
            <p className="text-sm text-rose-700">
              本月已達 {limit} 次上限，請改請店長在打卡管理代改。
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="text-gray-700">日期</span>
              <input
                type="date"
                value={form.punchDate}
                onChange={(e) =>
                  setForm({ ...form, punchDate: e.target.value, originalRecordId: "" })
                }
                className="mt-1 w-full border rounded-lg px-3 py-2"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-700">類型</span>
              <select
                value={form.punchAction}
                onChange={(e) =>
                  setForm({ ...form, punchAction: e.target.value as PunchAction })
                }
                className="mt-1 w-full border rounded-lg px-3 py-2"
              >
                <option value="work_in">上班</option>
                <option value="work_out">下班</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-gray-700">希望登記時間</span>
              <input
                type="time"
                value={form.requestedTime}
                onChange={(e) => setForm({ ...form, requestedTime: e.target.value })}
                className="mt-1 w-full border rounded-lg px-3 py-2"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-700">對應既有打卡（選填）</span>
              <select
                value={form.originalRecordId}
                onChange={(e) =>
                  setForm({ ...form, originalRecordId: e.target.value })
                }
                className="mt-1 w-full border rounded-lg px-3 py-2"
              >
                <option value="">沒有紀錄，核准後新增</option>
                {dayPunches.map((p) => (
                  <option key={p.id} value={p.id}>
                    {ACTION_LABEL[p.action]} {p.time}
                    {p.segmentIndex > 0 ? `（第 ${p.segmentIndex + 1} 段）` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-gray-700">原因</span>
            <textarea
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="mt-1 w-full border rounded-lg px-3 py-2"
              rows={3}
              placeholder="例如：忘記打卡、手機沒電"
            />
          </label>
          <button
            type="submit"
            className="app-btn-primary"
            disabled={submitting || (overLimit && limit != null)}
          >
            {submitting ? "送出中…" : "送出申請"}
          </button>
        </form>
      )}

      <div className="app-panel overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <h3 className="font-medium text-gray-900">申請紀錄</h3>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-gray-500">載入中…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">尚無申請。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600 border-b">
                  {isManager && <th className="px-4 py-3">員工</th>}
                  <th className="px-4 py-3">日期</th>
                  <th className="px-4 py-3">類型</th>
                  <th className="px-4 py-3">時間</th>
                  <th className="px-4 py-3">原因</th>
                  <th className="px-4 py-3">狀態</th>
                  {isManager && <th className="px-4 py-3">操作</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const canReview =
                    isManager &&
                    row.status === "pending" &&
                    canActOnApprovalStep(
                      currentUser?.role,
                      currentApprovalRole(approvalChain, row.approval_step ?? 0),
                      approvalMode
                    );
                  const statusText =
                    row.status === "pending"
                      ? approvalPendingLabel(approvalChain, row.approval_step ?? 0, approvalMode)
                      : row.status === "approved"
                        ? "已核准"
                        : "已駁回";
                  return (
                    <tr key={row.id} className="border-b">
                      {isManager && (
                        <td className="px-4 py-3">
                          {row.users?.name ??
                            employees.find((e) => e.id === row.user_id)?.name ??
                            "—"}
                        </td>
                      )}
                      <td className="px-4 py-3">{row.punch_date}</td>
                      <td className="px-4 py-3">
                        {ACTION_LABEL[row.punch_action]}
                        {row.segment_index > 0 ? ` 第${row.segment_index + 1}段` : ""}
                      </td>
                      <td className="px-4 py-3">
                        {String(row.requested_time).slice(0, 5)}
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate">
                        {row.reason || "—"}
                        {row.status === "rejected" && row.reject_reason ? (
                          <span className="block text-rose-700 text-xs">
                            駁回：{row.reject_reason}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">{statusText}</td>
                      {isManager && (
                        <td className="px-4 py-3 space-x-2">
                          {canReview && (
                            <>
                              <button
                                type="button"
                                className="text-emerald-700 hover:underline"
                                onClick={() => void review(row.id, "approved")}
                              >
                                核准
                              </button>
                              <button
                                type="button"
                                className="text-rose-700 hover:underline"
                                onClick={() =>
                                  setRejectModal({ id: row.id, reason: "" })
                                }
                              >
                                駁回
                              </button>
                            </>
                          )}
                          {row.status === "pending" && !canReview && (
                            <span className="text-xs text-gray-400">
                              {approvalPendingLabel(
                                approvalChain,
                                row.approval_step ?? 0,
                                approvalMode
                              )}
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rejectModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="app-panel p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-3">填寫駁回原因</h3>
            <textarea
              value={rejectModal.reason}
              onChange={(e) =>
                setRejectModal({ ...rejectModal, reason: e.target.value })
              }
              className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
              rows={3}
              placeholder="請輸入駁回原因（選填）"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  await review(rejectModal.id, "rejected", rejectModal.reason);
                  setRejectModal(null);
                }}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
              >
                確認駁回
              </button>
              <button
                type="button"
                onClick={() => setRejectModal(null)}
                className="flex-1 py-2 border rounded-lg text-sm"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
