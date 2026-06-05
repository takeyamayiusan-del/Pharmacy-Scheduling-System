"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/context/AppContext";

export default function LoginPage() {
  const [activeTab, setActiveTab] = useState<"employee" | "manager">("employee");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { loginEmployee, loginManager, currentUser, isLoading } = useApp();
  const router = useRouter();

  // 已登入則直接跳轉至上下班打卡頁面
  useEffect(() => {
    if (!isLoading && currentUser) {
      router.replace("/attendance/punch");
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
        setError("帳號或密碼錯誤");
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
        router.push("/attendance/punch");
      } else {
        setError("帳號或密碼錯誤");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "登入失敗，請重試");
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-gray-500">載入中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">耀聖藥局</h1>
          <p className="text-xl text-gray-600">智慧排班管理系統</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => { setActiveTab("employee"); setError(""); }}
              className={`flex-1 py-3 rounded-md font-medium transition-colors ${
                activeTab === "employee"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              員工登入
            </button>
            <button
              onClick={() => { setActiveTab("manager"); setError(""); }}
              className={`flex-1 py-3 rounded-md font-medium transition-colors ${
                activeTab === "manager"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              店長/老闆登入
            </button>
          </div>

          <form
            onSubmit={activeTab === "employee" ? handleEmployeeLogin : handleManagerLogin}
            className="space-y-4"
          >
            {activeTab === "employee" && (
              <p className="text-center text-gray-500 mb-2">請輸入店長為您設定的帳號與密碼</p>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">帳號</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="請輸入帳號"
                required
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">密碼</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="請輸入密碼"
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "登入中…" : "登入"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
