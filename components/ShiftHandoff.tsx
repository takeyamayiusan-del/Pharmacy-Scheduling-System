"use client";

import { useState, useEffect } from "react";
import { useApp } from "@/lib/context/AppContext";
import { MessageSquare, Send, CheckCircle, Trash2, Clock, ArrowRight } from "lucide-react";
import { todayDateStr } from "@/lib/attendance/punchSchedule";

export default function ShiftHandoff() {
  const { 
    currentUser, 
    getShiftForDate,
    shiftHandoffs,
    addShiftHandoff,
    completeShiftHandoff,
    deleteShiftHandoff,
    loadShiftHandoffs,
  } = useApp();
  
  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState("");
  const [targetShift, setTargetShift] = useState<"A" | "B" | "C" | "all">("all");
  const [selectedDate, setSelectedDate] = useState(todayDateStr());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"my" | "received">("my");
  
  const today = todayDateStr();
  const currentShift = currentUser ? getShiftForDate(today, currentUser.id) : "B";

  useEffect(() => {
    loadShiftHandoffs();
  }, [loadShiftHandoffs]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !content.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      await addShiftHandoff({
        date: selectedDate,
        shift: currentShift as "A" | "B" | "C",
        authorId: currentUser.id,
        targetShift,
        content: content.trim(),
      });
      setContent("");
      setShowForm(false);
    } catch (error) {
      console.error("發布失敗:", error);
      alert("發布失敗，請稍後再試");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 我發出的交班
  const myHandoffs = shiftHandoffs.filter(h => h.authorId === currentUser?.id);
  
  // 我收到的交班（指定給我這個班、或指定給 all）
  const receivedHandoffs = shiftHandoffs.filter(h => {
    if (h.authorId === currentUser?.id) return false;
    if (h.targetShift === "all") return true;
    if (h.shift === "all") return true;
    // 如果我是 B 班，收到 A 班的交班給 B 班
    if (h.targetShift === currentShift) return true;
    // 如果我今天有班，收到給特定班的
    return h.targetShift === currentShift;
  });

  // 當天的交班
  const todayHandoffs = shiftHandoffs.filter(h => h.date === today);
  const pendingToday = todayHandoffs.filter(h => !h.isCompleted && h.targetShift !== currentUser?.id);

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-TW', { 
      month: 'numeric', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const shiftLabel = (shift: string) => {
    switch (shift) {
      case "A": return "早班";
      case "B": return "午班";
      case "C": return "晚班";
      case "all": return "所有人";
      default: return shift;
    }
  };

  return (
    <div className="space-y-4">
      {/* 標題 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-blue-600" />
            交班留言
          </h3>
          {pendingToday.length > 0 && (
            <span className="bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">
              {pendingToday.length} 筆待確認
            </span>
          )}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1"
        >
          <Send className="h-4 w-4" />
          {showForm ? "取消" : "留交班訊息"}
        </button>
      </div>

      {/* 發布表單 */}
      {showForm && (
        <form onSubmit={handleSubmit} className="app-card p-4 space-y-3 bg-white border-blue-100 shadow-sm">
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">交接日期</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">我的班別</label>
              <div className="px-3 py-2 bg-gray-100 rounded-lg text-gray-700 font-medium">
                {shiftLabel(currentShift)}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">交給</label>
              <select
                value={targetShift}
                onChange={(e) => setTargetShift(e.target.value as "A" | "B" | "C" | "all")}
                className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="all">所有人（接班人）</option>
                <option value="A">早班</option>
                <option value="B">午班</option>
                <option value="C">晚班</option>
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">交接事項</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-28"
              placeholder="請輸入要交接給下一班的重要事項，例如：
- O3 客人藥物過敏
- 廠商下午會送貨
- 冰箱溫度異常，已報修
- VIP 客人明早會來"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !content.trim()}
            className={`w-full py-2 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
              isSubmitting || !content.trim() 
                ? "bg-gray-400 cursor-not-allowed" 
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            <Send className="h-4 w-4" />
            {isSubmitting ? "發布中..." : "確認發布"}
          </button>
        </form>
      )}

      {/* Tab 切換 */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab("received")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "received" 
              ? "border-blue-600 text-blue-600" 
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          收到的交班 {receivedHandoffs.filter(h => !h.isCompleted).length > 0 && (
            <span className="ml-1 bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full text-xs">
              {receivedHandoffs.filter(h => !h.isCompleted).length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("my")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "my" 
              ? "border-blue-600 text-blue-600" 
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          我發出的交班
        </button>
      </div>

      {/* 收到的交班 */}
      {activeTab === "received" && (
        <div className="space-y-3">
          {receivedHandoffs.length === 0 ? (
            <div className="py-8 text-center text-gray-500 bg-gray-50 rounded-xl border-2 border-dashed">
              沒有收到交班訊息
            </div>
          ) : (
            receivedHandoffs.map(handoff => (
              <div
                key={handoff.id}
                className={`app-card p-4 ${
                  handoff.isCompleted 
                    ? "opacity-60 bg-gray-50" 
                    : "border-l-4 border-l-amber-400"
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      handoff.shift === "A" ? "bg-green-100 text-green-700" :
                      handoff.shift === "B" ? "bg-blue-100 text-blue-700" :
                      handoff.shift === "C" ? "bg-purple-100 text-purple-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>
                      {shiftLabel(handoff.shift)} →
                    </span>
                    <span className="text-sm text-gray-600">
                      給 {shiftLabel(handoff.targetShift)}
                    </span>
                    {handoff.isCompleted && (
                      <span className="flex items-center gap-1 text-green-600 text-xs">
                        <CheckCircle className="h-3 w-3" />
                        已確認
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTime(handoff.createdAt)}
                    </span>
                    {!handoff.isCompleted && (
                      <button
                        onClick={() => completeShiftHandoff(handoff.id)}
                        className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                      >
                        確認收到
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
                  <ArrowRight className="h-3 w-3" />
                  <span>{handoff.authorName}</span>
                  <span className="text-gray-300">|</span>
                  <span>{handoff.date}</span>
                </div>
                
                <p className="text-sm text-gray-700 whitespace-pre-wrap bg-white p-3 rounded-lg border">
                  {handoff.content}
                </p>
                
                {handoff.isCompleted && handoff.completedByName && (
                  <p className="text-xs text-green-600 mt-2">
                    ✓ 已由 {handoff.completedByName} 確認
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* 我發出的交班 */}
      {activeTab === "my" && (
        <div className="space-y-3">
          {myHandoffs.length === 0 ? (
            <div className="py-8 text-center text-gray-500 bg-gray-50 rounded-xl border-2 border-dashed">
              您還沒有發出過交班訊息
            </div>
          ) : (
            myHandoffs.map(handoff => (
              <div
                key={handoff.id}
                className={`app-card p-4 ${handoff.isCompleted ? "opacity-60 bg-gray-50" : ""}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">
                      {handoff.date}
                    </span>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      handoff.shift === "A" ? "bg-green-100 text-green-700" :
                      handoff.shift === "B" ? "bg-blue-100 text-blue-700" :
                      handoff.shift === "C" ? "bg-purple-100 text-purple-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>
                      {shiftLabel(handoff.shift)}
                    </span>
                    <span className="text-sm text-gray-500">→ {shiftLabel(handoff.targetShift)}</span>
                    {handoff.isCompleted && (
                      <span className="flex items-center gap-1 text-green-600 text-xs">
                        <CheckCircle className="h-3 w-3" />
                        已確認
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                      {formatTime(handoff.createdAt)}
                    </span>
                    <button
                      onClick={() => deleteShiftHandoff(handoff.id)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      title="刪除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                
                <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">
                  {handoff.content}
                </p>
                
                {handoff.isCompleted && handoff.completedByName && (
                  <p className="text-xs text-green-600 mt-2">
                    ✓ 已由 {handoff.completedByName} 確認於 {handoff.completedAt && formatTime(handoff.completedAt)}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
