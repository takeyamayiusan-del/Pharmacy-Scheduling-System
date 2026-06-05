"use client";

import { useState } from "react";
import { useApp, type BulletinItem } from "@/lib/context/AppContext";
import { Megaphone, MessageSquare, AlertTriangle, Trash2, CheckCircle, Clock } from "lucide-react";

export default function BulletinBoard() {
  const { currentUser, bulletinItems, addBulletinItem, updateBulletinItem, deleteBulletinItem } = useApp();
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<{
    title: string;
    content: string;
    type: BulletinItem["type"];
    isUrgent: boolean;
  }>({
    title: "",
    content: "",
    type: "announcement",
    isUrgent: false,
  });

  const isManager = currentUser?.role === "owner" || currentUser?.role === "manager";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    
    await addBulletinItem({
      authorId: currentUser.id,
      title: formData.title,
      content: formData.content,
      type: formData.type,
      status: "active",
      isUrgent: formData.isUrgent,
    });
    
    setFormData({ title: "", content: "", type: "announcement", isUrgent: false });
    setShowAddForm(false);
  };

  const handleStatusChange = async (id: string, status: BulletinItem["status"]) => {
    await updateBulletinItem(id, { status });
  };

  const activeItems = bulletinItems.filter(item => item.status === "active");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-blue-600" />
          店內佈告欄
        </h3>
        {isManager && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {showAddForm ? "取消" : "發布公告"}
          </button>
        )}
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="app-card p-4 space-y-3 bg-white border-blue-100 shadow-sm">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">標題</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="例如：颱風天停班通知"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">內容</label>
            <textarea
              required
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-24"
              placeholder="請輸入公告詳細內容..."
            />
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isUrgent"
                checked={formData.isUrgent}
                onChange={(e) => setFormData({ ...formData, isUrgent: e.target.checked })}
                className="rounded text-blue-600"
              />
              <label htmlFor="isUrgent" className="text-sm text-gray-700 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> 重要/緊急
              </label>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as BulletinItem["type"] })}
                className="text-sm border rounded px-2 py-1 outline-none"
              >
                <option value="announcement">一般公告</option>
                <option value="shift_swap_request">換班/代班需求</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            className="w-full py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
          >
            確認發布
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {activeItems.length === 0 ? (
          <div className="col-span-full py-8 text-center text-gray-500 bg-gray-50 rounded-xl border-2 border-dashed">
            目前沒有新公告
          </div>
        ) : (
          activeItems.map((item: BulletinItem) => (
            <div
              key={item.id}
              className={`app-card p-4 relative group ${
                item.isUrgent ? "border-amber-200 bg-amber-50/30" : "border-gray-100"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {item.type === "announcement" ? (
                    <Megaphone className={`h-4 w-4 ${item.isUrgent ? "text-amber-600" : "text-blue-600"}`} />
                  ) : (
                    <MessageSquare className="h-4 w-4 text-purple-600" />
                  )}
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    item.type === "announcement" 
                      ? (item.isUrgent ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700")
                      : "bg-purple-100 text-purple-700"
                  }`}>
                    {item.type === "announcement" ? (item.isUrgent ? "重要公告" : "公告") : "換班需求"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {isManager && (
                    <>
                      <button
                        onClick={() => handleStatusChange(item.id, "archived")}
                        className="p-1 text-gray-400 hover:text-emerald-600 transition-colors"
                        title="標記為已完成/存檔"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteBulletinItem(item.id)}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        title="刪除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <h4 className="font-bold text-gray-900 mb-1">{item.title}</h4>
              <p className="text-sm text-gray-600 whitespace-pre-wrap mb-3">{item.content}</p>
              <div className="flex items-center justify-between text-[10px] text-gray-400">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(item.createdAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span>發布者：{item.authorName}</span>
              </div>
              
              {item.type === "shift_swap_request" && currentUser?.id !== item.authorId && (
                <button
                  onClick={(): void => alert("功能開發中：將為您開啟與 " + item.authorName + " 的換班申請單")}
                  className="mt-3 w-full py-1.5 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 transition-colors"
                >
                  我可以代班 / 洽詢換班
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
