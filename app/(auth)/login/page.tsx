"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/context/AppContext";

export default function LoginPage() {
  const [activeTab, setActiveTab] = useState<"employee" | "manager">("employee");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { employees, loginEmployee, loginManager } = useApp();
  const router = useRouter();

  // 員工登入
  const handleEmployeeLogin = (employeeId: string) => {
    loginEmployee(employeeId);
    router.push("/schedule");
  };

  // 管理者登入
  const handleManagerLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    const success = loginManager(username, password);
    if (success) {
      router.push("/schedule");
    } else {
      setError("帳號或密碼錯誤");
    }
  };

  // 非管理者的員工列表
  const staffEmployees = employees.filter((e) => e.role !== "owner");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">耀聖藥局</h1>
          <p className="text-xl text-gray-600">智慧排班管理系統</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Tab 切換 */}
          <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => {
                setActiveTab("employee");
                setError("");
              }}
              className={`flex-1 py-3 rounded-md font-medium transition-colors ${
                activeTab === "employee"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              員工登入
            </button>
            <button
              onClick={() => {
                setActiveTab("manager");
                setError("");
              }}
              className={`flex-1 py-3 rounded-md font-medium transition-colors ${
                activeTab === "manager"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              管理員登入
            </button>
          </div>

          {/* 員工登入 */}
          {activeTab === "employee" && (
            <div className="space-y-4">
              <p className="text-center text-gray-500 mb-4">請選擇您的姓名進行登入</p>
              <div className="grid grid-cols-2 gap-3">
                {staffEmployees.map((emp) => (
                  <button
                    key={emp.id}
                    onClick={() => handleEmployeeLogin(emp.id)}
                    className="p-4 border border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all text-left"
                  >
                    <div className="font-medium text-gray-800">{emp.name}</div>
                    <div className="text-sm text-gray-500">
                      {emp.role === "manager" ? "店長" : "員工"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 管理者登入 */}
          {activeTab === "manager" && (
            <form onSubmit={handleManagerLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  帳號
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="請輸入帳號"
                />
                <p className="text-xs text-gray-400 mt-1">測試帳號：admin 或 manager</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  密碼
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="請輸入密碼"
                />
                <p className="text-xs text-gray-400 mt-1">測試密碼：admin123</p>
              </div>

              {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                登入
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
