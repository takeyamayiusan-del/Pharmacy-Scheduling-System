"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/lib/context/AppContext";
import { canManageSite } from "@/lib/auth/roles";
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
  created_at: string;
  users?: { name?: string } | null;
};

const KIND_LABEL: Record<DeferralKind, string> = {
  annual: "特休",
  comp: "補休",
};

export default function LeaveDeferralPage() {
  const { currentUser, employees, storeConfig, addAnnualLeaveAdjustment } = useApp();
  const supabase = createClient();
  const isManager = canManageSite(currentUser?.role);
  const [rows, setRows] = useState<DeferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    leaveKind: "annual" as DeferralKind,
    hours: 8,
    originalExpire: "",
    newExpire: "",
    reason: "",
  });

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
    const { error } = await supabase.from("leave_deferral_requests").insert({
      user_id: currentUser.id,
      site_id: currentUser.siteId,
      leave_kind: form.leaveKind,
      hours: form.hours,
      original_expire: form.originalExpire || null,
      new_expire: form.newExpire,
      reason: form.reason,
      status: "pending",
    });
    if (error) {
      alert(error.message);
      return;
    }
    setForm({ ...form, reason: "" });
    await load();
    alert("已送出遞延申請，待店長／副店／老闆審核。");
  };

  const review = async (row: DeferralRow, status: "approved" | "rejected") => {
    const { error } = await supabase
      .from("leave_deferral_requests")
      .update({
        status,
        reviewed_by: currentUser?.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) {
      alert(error.message);
      return;
    }
    if (status === "approved") {
      if (row.leave_kind === "annual") {
        const year = Number(String(row.new_expire).slice(0, 4));
        const days = Math.round((Number(row.hours) / 8) * 100) / 100;
        try {
          await addAnnualLeaveAdjustment(
            row.user_id,
            year,
            days,
            `特休遞延核准（原到期 ${row.original_expire ?? "—"} → ${row.new_expire}）`
          );
        } catch (err) {
          alert(err instanceof Error ? err.message : "寫入特休調整失敗");
        }
      } else {
        const { error: ledgerErr } = await supabase.from("comp_leave_ledger").insert({
          user_id: row.user_id,
          hours: Number(row.hours),
          source_type: "adjustment",
          source_id: row.id,
          expires_at: new Date(`${row.new_expire}T00:00:00`).toISOString(),
          note: `補休遞延核准（原到期 ${row.original_expire ?? "—"} → ${row.new_expire}）`,
        });
        if (ledgerErr) alert(ledgerErr.message);
      }
    }
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="app-page-title">特休／補休遞延</h2>
        <p className="app-meta mt-1">
          過期前由員工提出遞延申請；核准後特休以年度調整入帳、補休另開新到期帳本。
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
                {rows.map((row) => (
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
                      {row.status === "pending"
                        ? "待審"
                        : row.status === "approved"
                          ? "已核准"
                          : "已駁回"}
                    </td>
                    {isManager && (
                      <td className="px-4 py-3 space-x-2">
                        {row.status === "pending" && (
                          <>
                            <button
                              type="button"
                              className="text-emerald-700 hover:underline"
                              onClick={() => void review(row, "approved")}
                            >
                              核准
                            </button>
                            <button
                              type="button"
                              className="text-rose-700 hover:underline"
                              onClick={() => void review(row, "rejected")}
                            >
                              駁回
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
