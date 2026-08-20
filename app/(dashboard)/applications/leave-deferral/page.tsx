"use client";

import { useCallback, useEffect, useState } from "react";
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
  rolesToNotify,
} from "@/lib/approvals/chain";
import { createClient } from "@/lib/supabase/client";

type DeferralKind = "annual" | "comp";
type DeferralRow = {
  id: string;
  user_id: string;
  leave_kind: DeferralKind;
  hours: number;
  original_expire: string | null;
  new_expire: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  approval_step?: number;
  reject_reason?: string | null;
  created_at: string;
  users?: { name?: string } | null;
};

const KIND_LABEL: Record<DeferralKind, string> = {
  annual: "特休",
  comp: "補休",
};

export default function LeaveDeferralPage() {
  const { currentUser, employees, storeConfig, activeSiteId } = useApp();
  const supabase = createClient();
  const isManager = canManageSite(currentUser?.role);
  const [rows, setRows] = useState<DeferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState<{ id: string; reason: string } | null>(
    null
  );
  const [form, setForm] = useState({
    leaveKind: "annual" as DeferralKind,
    hours: 8,
    originalExpire: "",
    newExpire: "",
    reason: "",
  });

  const approvalChain = effectiveApprovalChain(
    storeConfig.policies.approvalChain,
    employees,
    activeSiteId
  );
  const approvalMode = storeConfig.policies.approvalMode;

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("leave_deferral_requests")
      .select("*, users(name)")
      .order("created_at", { ascending: false });
    if (!isManager && currentUser) q = q.eq("user_id", currentUser.id);
    const { data, error } = await q;
    if (!error && data) setRows(data as DeferralRow[]);
    setLoading(false);
  }, [supabase, isManager, currentUser]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!storeConfig.policies.allowLeaveDeferral) {
    return (
      <div className="app-panel p-6">
        <h2 className="app-page-title">假別遞延</h2>
        <p className="text-sm text-gray-600 mt-2">本店未開放特休／補休遞延申請。</p>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!form.newExpire) {
      alert("請填新到期日");
      return;
    }
    const { data, error } = await supabase
      .from("leave_deferral_requests")
      .insert({
        user_id: currentUser.id,
        site_id: currentUser.siteId,
        leave_kind: form.leaveKind,
        hours: form.hours,
        original_expire: form.originalExpire || null,
        new_expire: form.newExpire,
        reason: form.reason,
        status: "pending",
        approval_step: 0,
      })
      .select("id")
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    const firstRole = approvalChain[0] ?? "manager";
    const nextRoles = rolesToNotify(firstRole, approvalMode);
    const recipients = employees.filter((emp) => {
      if (!nextRoles.includes(emp.role)) return false;
      if (emp.role === "owner") return true;
      return emp.siteId === activeSiteId;
    });
    if (recipients.length > 0 && data?.id) {
      await supabase.from("notifications").insert(
        recipients.map((m) => ({
          recipient_id: m.id,
          type: "leave_deferral_submitted",
          title: "新假別遞延申請",
          body: `${currentUser.name} 申請${KIND_LABEL[form.leaveKind]}遞延 ${form.hours} 小時，請審核。`,
          related_id: data.id,
          related_type: "leave_deferral",
          is_read: false,
        }))
      );
    }
    setForm({ ...form, reason: "" });
    await load();
    alert(`已送出遞延申請，${approvalPendingLabel(approvalChain, 0, approvalMode)}。`);
  };

  const review = async (
    id: string,
    status: "approved" | "rejected",
    rejectReason?: string
  ) => {
    try {
      const res = await fetch("/api/applications/leave-deferral/review", {
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
        <h2 className="app-page-title">特休／補休遞延</h2>
        <p className="app-meta mt-1">
          過期前由員工提出遞延申請，依店規關卡審核（預設店長→副店→老闆）。最後一關核准後，特休以年度調整入帳、補休另開新到期帳本。
        </p>
      </div>

      <form onSubmit={submit} className="app-panel p-6 space-y-4">
        <h3 className="font-medium text-gray-900">新申請</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-gray-700">假別</span>
            <select
              value={form.leaveKind}
              onChange={(e) =>
                setForm({ ...form, leaveKind: e.target.value as DeferralKind })
              }
              className="mt-1 w-full border rounded-lg px-3 py-2"
            >
              <option value="annual">特休</option>
              <option value="comp">補休</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">時數</span>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={form.hours}
              onChange={(e) => setForm({ ...form, hours: Number(e.target.value) || 0 })}
              className="mt-1 w-full border rounded-lg px-3 py-2"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">原到期日（選填）</span>
            <input
              type="date"
              value={form.originalExpire}
              onChange={(e) => setForm({ ...form, originalExpire: e.target.value })}
              className="mt-1 w-full border rounded-lg px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">希望延期至</span>
            <input
              type="date"
              value={form.newExpire}
              onChange={(e) => setForm({ ...form, newExpire: e.target.value })}
              className="mt-1 w-full border rounded-lg px-3 py-2"
              required
            />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-gray-700">原因</span>
          <textarea
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            className="mt-1 w-full border rounded-lg px-3 py-2"
            rows={3}
          />
        </label>
        <button type="submit" className="app-btn-primary">
          送出申請
        </button>
      </form>

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
                  <th className="px-4 py-3">假別</th>
                  <th className="px-4 py-3">時數</th>
                  <th className="px-4 py-3">原到期</th>
                  <th className="px-4 py-3">新到期</th>
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
                      <td className="px-4 py-3">{KIND_LABEL[row.leave_kind]}</td>
                      <td className="px-4 py-3">{row.hours}</td>
                      <td className="px-4 py-3">{row.original_expire ?? "—"}</td>
                      <td className="px-4 py-3">{row.new_expire}</td>
                      <td className="px-4 py-3">
                        {statusText}
                        {row.status === "rejected" && row.reject_reason ? (
                          <span className="block text-xs text-rose-700">
                            {row.reject_reason}
                          </span>
                        ) : null}
                      </td>
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
                          <button
                            type="button"
                            className="text-rose-700 hover:underline"
                            onClick={async () => {
                              if (!confirm("確定刪除這筆遞延申請？")) return;
                              try {
                                const res = await fetch("/api/applications/delete", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    type: "leave_deferral",
                                    id: row.id,
                                  }),
                                });
                                const payload = (await res.json().catch(() => ({}))) as {
                                  error?: string;
                                };
                                if (!res.ok) throw new Error(payload.error || "刪除失敗");
                                await load();
                              } catch (err) {
                                alert(err instanceof Error ? err.message : "刪除失敗");
                              }
                            }}
                          >
                            刪除
                          </button>
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
