"use client";

import { useApp } from "@/lib/context/AppContext";

export default function TestPage() {
  const { currentUser, employees, loginEmployee, loginManager, logout } = useApp();

  if (!currentUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-blue-50 p-8">
        <h1 className="text-3xl font-bold mb-8">測試頁面 - 請先登入</h1>
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">員工登入</h2>
          <div className="flex flex-wrap gap-2">
            {employees.filter(e => e.role !== "owner").map(emp => (
              <button
                key={emp.id}
                onClick={() => loginEmployee(emp.id)}
                className="px-4 py-2 bg-white border rounded-lg hover:bg-blue-100"
              >
                {emp.name}
              </button>
            ))}
          </div>
          <hr className="my-4 w-full" />
          <h2 className="text-xl font-semibold">管理員登入</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => loginManager("admin", "admin123")}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              老闆 (admin/admin123)
            </button>
            <button
              onClick={() => loginManager("manager", "admin123")}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              店長 (manager/admin123)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">測試頁面 - 已登入!</h1>
          <button
            onClick={logout}
            className="px-4 py-2 bg-red-600 text-white rounded-lg"
          >
            登出
          </button>
        </div>
        <div className="bg-white p-6 rounded-xl shadow mb-6">
          <h2 className="text-xl font-semibold mb-2">目前使用者</h2>
          <p>姓名：{currentUser.name}</p>
          <p>角色：{currentUser.role === "owner" ? "老闆" : currentUser.role === "manager" ? "店長" : "員工"}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow">
          <h2 className="text-xl font-semibold mb-4">快速連結</h2>
          <div className="flex flex-wrap gap-4">
            <a href="/" className="px-4 py-2 bg-blue-600 text-white rounded-lg">前往班表頁</a>
            <a href="/login" className="px-4 py-2 border rounded-lg">前往登入頁</a>
          </div>
        </div>
      </div>
    </div>
  );
}
