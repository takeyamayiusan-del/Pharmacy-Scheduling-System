"use client";

import { useState } from "react";
import { useApp, type Employee } from "@/lib/context/AppContext";

type Role = "owner" | "manager" | "staff";

export default function EmployeesPage() {
  const { currentUser, employees, addEmployee, updateEmployee, deleteEmployee } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    role: "staff" as Role
  });
  
  // 如果是編輯模式，先加載員工數據
  const loadEmployee = (employee: Employee) => {
    setEditingId(employee.id);
    setFormData({
      name: employee.name,
      role: employee.role
    });
    setShowForm(true);
  };
  
  // 重置表單
  const resetForm = () => {
    setFormData({
      name: "",
      role: "staff"
    });
    setEditingId(null);
    setShowForm(false);
  };
  
  // 提交表單
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingId) {
      updateEmployee(editingId, formData);
      alert("員工資料已更新！");
    } else {
      addEmployee(formData);
      alert("員工已新增！");
    }
    
    resetForm();
  };
  
  // 確認刪除
  const confirmDelete = (employee: Employee) => {
    if (window.confirm(`確定要刪除員工 ${employee.name} 嗎？`)) {
      deleteEmployee(employee.id);
    }
  };
  
  // 取得角色顯示文字
  const getRoleLabel = (role: Role) => {
    switch (role) {
      case "owner": return "老闆";
      case "manager": return "店長";
      case "staff": return "員工";
    }
  };
  
  // 取得角色顏色
  const getRoleColor = (role: Role) => {
    switch (role) {
      case "owner": return "bg-purple-100 text-purple-800";
      case "manager": return "bg-blue-100 text-blue-800";
      case "staff": return "bg-green-100 text-green-800";
    }
  };
  
  // 只有老闆可以進入此頁面
  if (currentUser?.role !== "owner") {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-800 mb-2">權限不足</h2>
          <p className="text-gray-600">只有老闆可以管理員工</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* 頁頭 */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">員工管理</h2>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          新增員工
        </button>
      </div>
      
      {/* 員工統計 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h3 className="font-medium text-gray-900 mb-2">總員工數</h3>
          <p className="text-2xl font-bold text-blue-600">
            {employees.filter(e => e.role !== "owner").length}人
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h3 className="font-medium text-gray-900 mb-2">店長</h3>
          <p className="text-2xl font-bold text-purple-600">
            {employees.filter(e => e.role === "manager").length}人
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h3 className="font-medium text-gray-900 mb-2">一般員工</h3>
          <p className="text-2xl font-bold text-green-600">
            {employees.filter(e => e.role === "staff").length}人
          </p>
        </div>
      </div>
      
      {/* 員工表單 */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-medium text-gray-900 mb-4">
            {editingId ? "編輯員工" : "新增員工"}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                員工姓名
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="請輸入員工姓名"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                角色
              </label>
              <select
                value={formData.role}
                onChange={e => setFormData({ ...formData, role: e.target.value as Role })}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="staff">員工</option>
                <option value="manager">店長</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {editingId ? "確認更新" : "確認新增"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}
      
      {/* 員工列表 */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <h3 className="font-medium text-gray-900">員工列表</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">員工姓名</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">角色</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">動作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {employees.filter(e => e.role !== "owner").map(employee => (
                <tr key={employee.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {employee.name}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(employee.role)}`}>
                      {getRoleLabel(employee.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex gap-2">
                      <button
                        onClick={() => loadEmployee(employee)}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                      >
                        編輯
                      </button>
                      <button
                        onClick={() => confirmDelete(employee)}
                        className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                      >
                        刪除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
