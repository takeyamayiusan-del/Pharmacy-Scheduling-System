"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/context/AppContext";
import { canManageSite } from "@/lib/auth/roles";
import { SYSTEM_NAME } from "@/lib/sites";

export default function LoginPage() {
  const [activeTab, setActiveTab] = useState<"employee" | "manager">("manager");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { loginEmployee, loginManager, currentUser, isLoading } = useApp();
  const router = useRouter();

  // 已登入則依角色跳轉
  useEffect(() => {
    if (!isLoading && currentUser) {
      const dest = canManageSite(currentUser.role) ? "/schedule" : "/attendance/punch";
      router.replace(dest);
    }
  }, [currentUser, isLoading, router]);

  const handleEmployeeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const success = await loginEmployee(username, password);
      if (success) {
        router.push("/attendance/punch");
      } else {
        setError(
          activeTab === "manager"
            ? "帳號或密碼錯誤（店長／副店／老闆／主任請確認已選「管理端登入」分頁）"
            : "帳號或密碼錯誤（員工請確認已選「員工登入」分頁）"
        );
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "登入失敗，請重試");
    } finally {
      setLoading(false);
    }
  };

  const handleManagerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const success = await loginManager(username, password);
      if (success) {
        router.push("/schedule");
      } else {
        setError(
          activeTab === "manager"
            ? "帳號或密碼錯誤（店長／副店／老闆／主任請確認已選「管理端登入」分頁）"
            : "帳號或密碼錯誤（員工請確認已選「員工登入」分頁）"
        );
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "登入失敗，請重試");
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center app-shell">
        <div className="app-panel px-8 py-6 text-slate-500 app-fade-in">載入中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center app-shell p-4 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 app-shell-mesh opacity-80" aria-hidden />
      <div className="w-full max-w-md relative app-rise-in">
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 mb-2">
            <span className="bg-gradient-to-r from-sky-700 via-cyan-600 to-sky-600 bg-clip-text text-transparent">
              {SYSTEM_NAME}
            </span>
          </h1>
          <p className="text-base text-slate-600">竹山／集集多分店排班</p>
        </div>

        <div className="app-panel p-7 sm:p-8">
          <div className="flex mb-6 bg-slate-100/90 rounded-xl p-1">
            <button
              onClick={() => { setActiveTab("employee"); setError(""); }}
              className={`flex-1 py-2.5 rounded-lg font-medium transition-all ${
                activeTab === "employee"
                  ? "bg-white text-sky-700 shadow-sm ring-1 ring-slate-200/80"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              員工登入
            </button>
            <button
              onClick={() => { setActiveTab("manager"); setError(""); }}
              className={`flex-1 py-2.5 rounded-lg font-medium transition-all ${
                activeTab === "manager"
                  ? "bg-white text-sky-700 shadow-sm ring-1 ring-slate-200/80"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              管理端登入
            </button>
          </div>

          <form
            onSubmit={activeTab === "employee" ? handleEmployeeLogin : handleManagerLogin}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">帳號</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white/90 outline-none"
                placeholder="請輸入帳號"
                required
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">密碼</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white/90 outline-none"
                placeholder="請輸入密碼"
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-sm border border-rose-100">{error}</div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full app-btn-primary py-3 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {loading ? "登入中…" : "登入"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
