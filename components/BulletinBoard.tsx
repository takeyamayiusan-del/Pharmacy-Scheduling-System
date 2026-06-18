"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp, type BulletinItem } from "@/lib/context/AppContext";
import { Megaphone, MessageSquare, AlertTriangle, Trash2, Clock, Pin, PinOff, Eye, Users, ArrowRightFromLine } from "lucide-react";

export default function BulletinBoard() {
  const router = useRouter();
  const { 
    currentUser, 
    employees,
    bulletinItems, 
    addBulletinItem, 
    updateBulletinItem, 
    deleteBulletinItem,
    readBulletinItem,
    isBulletinRead,
  } = useApp();
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<{
    title: string;
    content: string;
    type: BulletinItem["type"];
    isUrgent: boolean;
    isPinned: boolean;
    targetType: "all" | "specific";
    targetIds: string[];
  }>({
    title: "",
    content: "",
    type: "announcement",
    isUrgent: false,
    isPinned: false,
    targetType: "all",
    targetIds: [],
  });

  const isManager = ["owner", "manager"].includes(currentUser?.role ?? "");

  const [isSubmitting, setIsSubmitting] = useState(false);

  // 追蹤已讀狀態的公告
  const [readBulletins, setReadBulletins] = useState<Set<string>>(new Set());

  useEffect(() => {
    // 初始化已讀狀態
    const readSet = new Set<string>();
    bulletinItems.forEach(item => {
      if (isBulletinRead(item.id)) {
        readSet.add(item.id);
      }
    });
    setReadBulletins(readSet);
  }, [bulletinItems, isBulletinRead]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      await addBulletinItem({
        authorId: currentUser.id,
        title: formData.title,
        content: formData.content,
        type: formData.type,
        status: "active",
        isUrgent: formData.isUrgent,
        isPinned: formData.isPinned,
        targetType: formData.targetType,
        targetIds: formData.targetType === "all" ? [] : formData.targetIds,
      });
      
      setFormData({ 
        title: "", 
        content: "", 
        type: "announcement", 
        isUrgent: false,
        isPinned: false,
        targetType: "all",
        targetIds: [],
      });
      setShowAddForm(false);
    } catch (error) {
      console.error("發布失敗:", error);
      alert("發布失敗，請稍後再試");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTogglePin = async (item: BulletinItem) => {
    await updateBulletinItem(item.id, { isPinned: !item.isPinned });
  };

  const handleMarkAsRead = async (item: BulletinItem) => {
    await readBulletinItem(item.id);
    setReadBulletins(prev => new Set(prev).add(item.id));
  };

  // 過濾公告：
  // 1. 只看自己或發給所有人的
  // 2. 換班需求(swap)只讓作者自己看到（讓他可追蹤自己的申請）
  const visibleItems = bulletinItems.filter(item => {
    if (item.status !== "active") return false;
    
    // 換班需求只顯示給作者本人
    if (item.type === "shift_swap_request") {
      return item.authorId === currentUser?.id;
    }
    
    if (item.targetType === "all") return true;
    return item.targetIds.includes(currentUser?.id ?? "");
  });

  // 未讀公告數量
  const unreadCount = visibleItems.filter(item => !readBulletins.has(item.id)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-blue-600" />
            店內佈告欄
          </h3>
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
              {unreadCount} 未讀
            </span>
          )}
        </div>
        <button
          onClick={() => {
            setShowAddForm(!showAddForm);
            setFormData({
              title: "",
              content: "",
              type: "announcement",
              isUrgent: false,
              isPinned: false,
              targetType: "all",
              targetIds: [],
            });
          }}
          className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {showAddForm ? "取消" : "發布公告"}
        </button>
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
              placeholder={isManager ? "例如：颱風天停班通知" : "例如：6/10 晚班求代班"}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">內容</label>
            <textarea
              required
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-24"
              placeholder={isManager ? "請輸入公告詳細內容..." : "請說明想換班的時間或原因..."}
            />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isUrgent"
                checked={formData.isUrgent}
                onChange={(e) => setFormData({ ...formData, isUrgent: e.target.checked })}
                className="rounded text-blue-600"
              />
              <label htmlFor="isUrgent" className="text-sm text-gray-700 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> 重要
              </label>
            </div>
            
            {isManager && (
              <>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isPinned"
                    checked={formData.isPinned}
                    onChange={(e) => setFormData({ ...formData, isPinned: e.target.checked })}
                    className="rounded text-blue-600"
                  />
                  <label htmlFor="isPinned" className="text-sm text-gray-700 flex items-center gap-1">
                    <Pin className="h-4 w-4 text-blue-500" /> 釘選置頂
                  </label>
                </div>
                
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-gray-500" />
                  <select
                    value={formData.targetType}
                    onChange={(e) => setFormData({ ...formData, targetType: e.target.value as "all" | "specific", targetIds: [] })}
                    className="text-sm border rounded px-2 py-1 outline-none"
                  >
                    <option value="all">發送給所有人</option>
                    <option value="specific">發送給特定人</option>
                  </select>
                </div>
              </>
            )}
            
            <div className="flex items-center gap-2">
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as BulletinItem["type"] })}
                className="text-sm border rounded px-2 py-1 outline-none"
              >
                <option value="announcement">一般公告</option>
                <option value="shift_handoff">交班留言</option>
                <option value="shift_swap_request">換班/代班需求</option>
              </select>
            </div>
          </div>
          
          {isManager && formData.targetType === "specific" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">選擇發送對象</label>
              <div className="flex flex-wrap gap-2">
                {employees.filter(emp => emp.id !== currentUser?.id).map(emp => (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => {
                      const newIds = formData.targetIds.includes(emp.id)
                        ? formData.targetIds.filter(id => id !== emp.id)
                        : [...formData.targetIds, emp.id];
                      setFormData({ ...formData, targetIds: newIds });
                    }}
                    className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                      formData.targetIds.includes(emp.id)
                        ? "bg-blue-100 border-blue-500 text-blue-700"
                        : "bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {emp.name}
                  </button>
                ))}
              </div>
              {formData.targetIds.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">請至少選擇一位發送對象</p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || (formData.targetType === "specific" && formData.targetIds.length === 0)}
            className={`w-full py-2 text-white rounded-lg font-medium transition-colors ${
              isSubmitting || (formData.targetType === "specific" && formData.targetIds.length === 0) 
                ? "bg-gray-400 cursor-not-allowed" 
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {isSubmitting ? "發布中..." : "確認發布"}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4">
        {visibleItems.length === 0 ? (
          <div className="py-8 text-center text-gray-500 bg-gray-50 rounded-xl border-2 border-dashed">
            目前沒有新公告
          </div>
        ) : (
          visibleItems.map((item: BulletinItem) => {
            const isRead = readBulletins.has(item.id);
            const isTargeted = item.targetType === "specific";
            
            return (
              <div
                key={item.id}
                className={`app-card p-4 relative group transition-all ${
                  item.isPinned ? "border-2 border-blue-300 bg-blue-50/30" : 
                  item.isUrgent ? "border-amber-200 bg-amber-50/30" : "border-gray-100"
                } ${!isRead ? "ring-2 ring-blue-200" : ""}`}
              >
                {/* 釘選標記 */}
                {item.isPinned && (
                  <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Pin className="h-3 w-3" />
                    已釘選
                  </div>
                )}
                
                {/* 未讀標記 */}
                {!isRead && (
                  <div className="absolute -top-1 left-4 w-2 h-2 bg-blue-500 rounded-full" />
                )}
                
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {item.type === "shift_handoff" ? (
                      <ArrowRightFromLine className="h-4 w-4 text-green-600" />
                    ) : item.type === "announcement" ? (
                      <Megaphone className={`h-4 w-4 ${item.isUrgent ? "text-amber-600" : "text-blue-600"}`} />
                    ) : (
                      <MessageSquare className="h-4 w-4 text-purple-600" />
                    )}
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      item.type === "shift_handoff" ? "bg-green-100 text-green-700" :
                      item.type === "announcement" 
                        ? (item.isUrgent ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700")
                        : "bg-purple-100 text-purple-700"
                    }`}>
                      {item.type === "shift_handoff" ? "交班留言" :
                       item.type === "announcement" ? (item.isUrgent ? "重要公告" : "公告") : "換班需求"}
                    </span>
                    {isTargeted && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        特定人
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {/* 標記已讀按鈕 */}
                    {!isRead && currentUser?.id !== item.authorId && (
                      <button
                        onClick={() => handleMarkAsRead(item)}
                        className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                        title="標記為已讀"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                    {(isManager || currentUser?.id === item.authorId) && (
                      <>
                        {isManager && (
                          <button
                            onClick={() => handleTogglePin(item)}
                            className={`p-1 transition-colors ${item.isPinned ? "text-blue-600" : "text-gray-400 hover:text-blue-600"}`}
                            title={item.isPinned ? "取消釘選" : "釘選置頂"}
                          >
                            {item.isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                          </button>
                        )}
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
                
                <div className="flex items-center gap-2 text-[10px] text-gray-400 mb-1">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(item.createdAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span>發布者：{item.authorName}</span>
                  {isRead && <span className="text-green-600">✓ 已讀</span>}
                </div>
                
                <h4 className="font-bold text-gray-900 mb-1">{item.title}</h4>
                <p className="text-sm text-gray-600 whitespace-pre-wrap mb-3">{item.content}</p>
                
                {item.type === "shift_swap_request" && currentUser?.id !== item.authorId && (
                  <button
                    onClick={() => {
                      router.push(
                        `/applications/shift-swap?source=bulletin&source_note=${encodeURIComponent(
                          `來自公告欄 ${item.authorName} 的換班需求`
                        )}`
                      );
                    }}
                    className="mt-3 w-full py-1.5 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 transition-colors"
                  >
                    我可以代班 / 洽詢換班
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
