"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp, type BulletinItem } from "@/lib/context/AppContext";
import {
  EMPLOYEE_BULLETIN_TYPES,
  MANAGER_BULLETIN_TYPES,
  BULLETIN_TYPE_LABELS,
  encodeCoverDate,
  getBulletinTypeLabel,
  parseCoverDate,
  stripMetaLines,
} from "@/lib/bulletin/bulletinMeta";
import {
  Megaphone,
  AlertTriangle,
  Trash2,
  Clock,
  Pin,
  PinOff,
  Eye,
  Users,
  ArrowRightFromLine,
  CalendarOff,
  ListChecks,
  CheckCircle2,
  HandHelping,
} from "lucide-react";

const TYPE_STYLES: Record<
  BulletinItem["type"],
  { badge: string; icon: typeof Megaphone }
> = {
  announcement: { badge: "bg-blue-100 text-blue-700", icon: Megaphone },
  cover_request: { badge: "bg-purple-100 text-purple-700", icon: HandHelping },
  task_completed: { badge: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  day_off_notice: { badge: "bg-sky-100 text-sky-700", icon: CalendarOff },
  must_do_today: { badge: "bg-amber-100 text-amber-800", icon: ListChecks },
  shift_handoff: { badge: "bg-green-100 text-green-700", icon: ArrowRightFromLine },
};

const DEFAULT_FORM = {
  title: "",
  content: "",
  coverDate: "",
  type: "announcement" as BulletinItem["type"],
  isUrgent: false,
  isPinned: false,
  targetType: "all" as "all" | "specific",
  targetIds: [] as string[],
};

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
    activeSiteId,
    storeConfig,
  } = useApp();
  const [showAddForm, setShowAddForm] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [formData, setFormData] = useState(DEFAULT_FORM);

  const isManager = ["owner", "manager"].includes(currentUser?.role ?? "");
  const availableTypes = isManager ? MANAGER_BULLETIN_TYPES : EMPLOYEE_BULLETIN_TYPES;
  const defaultType = isManager ? "announcement" : "cover_request";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [readBulletins, setReadBulletins] = useState<Set<string>>(new Set());

  useEffect(() => {
    const readSet = new Set<string>();
    bulletinItems.forEach((item) => {
      if (isBulletinRead(item.id)) readSet.add(item.id);
    });
    setReadBulletins(readSet);
  }, [bulletinItems, isBulletinRead]);

  const resetForm = () => {
    setFormData({ ...DEFAULT_FORM, type: defaultType });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || isSubmitting) return;
    if (formData.type === "cover_request" && !formData.coverDate) {
      alert("請選擇需要代班的日期");
      return;
    }

    setIsSubmitting(true);
    try {
      const content =
        formData.type === "cover_request"
          ? encodeCoverDate(formData.content, formData.coverDate)
          : formData.content;

      await addBulletinItem({
        authorId: currentUser.id,
        title: formData.title,
        content,
        type: formData.type,
        status: "active",
        isUrgent: formData.isUrgent,
        isPinned: isManager ? formData.isPinned : false,
        targetType: isManager ? formData.targetType : "all",
        targetIds: formData.targetType === "all" ? [] : formData.targetIds,
      });

      resetForm();
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
    setReadBulletins((prev) => new Set(prev).add(item.id));
  };

  const handleVolunteerCover = (item: BulletinItem) => {
    const coverDate = parseCoverDate(item.content);
    const params = new URLSearchParams({
      source: "bulletin",
      targetEmployeeId: item.authorId,
      source_note: `回應 ${item.authorName} 的代班需求：${item.title}`,
    });
    if (coverDate) params.set("targetDate", coverDate);
    router.push(`/applications/shift-swap?${params.toString()}`);
  };

  const visibleItems = bulletinItems.filter((item) => {
    if (item.status !== "active") return false;
    if (item.targetType === "all") return true;
    return item.targetIds.includes(currentUser?.id ?? "");
  });

  const unreadCount = visibleItems.filter((item) => !readBulletins.has(item.id)).length;

  const getPlaceholder = (type: BulletinItem["type"]) => {
    switch (type) {
      case "cover_request":
        return { title: "例如：7/10 晚班求代班", content: "說明原因或班別，方便同事評估..." };
      case "task_completed":
        return { title: "例如：今日已完成事項", content: "列出今日已完成的工作項目..." };
      case "day_off_notice":
        return { title: "例如：7/15 全店公休", content: "說明公休日期與注意事項..." };
      case "must_do_today":
        return { title: "例如：今日必須完成事項", content: "列出今日務必完成的工作..." };
      case "shift_handoff":
        return { title: "例如：晚班交班重點", content: "交班注意事項、未完成事項..." };
      default:
        return { title: "例如：颱風天停班通知", content: "請輸入公告詳細內容..." };
    }
  };

  const placeholders = getPlaceholder(formData.type);

  return (
    <div className="space-y-4 app-card p-4 border-sky-200/80 bg-gradient-to-br from-sky-50 to-cyan-50/70">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-sky-700" />
            店內佈告欄
            <span className="text-xs font-semibold text-sky-900 bg-sky-100 border border-sky-300 rounded-lg px-2 py-0.5">
              {storeConfig.storeName?.trim() || (activeSiteId === "jiji" ? "集集" : "竹山")}
            </span>
          </h3>
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
              {unreadCount} 未讀
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCollapsed((v) => !v)}
            className="text-sm px-3 py-1.5 rounded-lg border border-sky-300 bg-white text-sky-800 hover:bg-sky-50 transition-colors"
          >
            {isCollapsed ? "展開公告" : "收起公告"}
          </button>
          <button
            onClick={() => {
              setShowAddForm(!showAddForm);
              resetForm();
            }}
            className="text-sm px-3 py-1.5 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors"
          >
            {showAddForm ? "取消" : "發布公告"}
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-600 -mt-2">
        僅手動發布才會出現在佈告欄。平常換班若已指定對象，請走換班申請、不會自動公告；只有公開徵求代班時才發「代班需求」。
      </p>

      {!isCollapsed && showAddForm && (
        <form onSubmit={handleSubmit} className="app-card p-4 space-y-3 bg-white border-blue-100 shadow-sm">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">公告類型</label>
            <select
              value={formData.type}
              onChange={(e) =>
                setFormData({ ...formData, type: e.target.value as BulletinItem["type"] })
              }
              className="w-full text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            >
              {availableTypes.map((type) => (
                <option key={type} value={type}>
                  {BULLETIN_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          {formData.type === "cover_request" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">需要代班的日期</label>
              <input
                type="date"
                required
                value={formData.coverDate}
                onChange={(e) => setFormData({ ...formData, coverDate: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">標題</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder={placeholders.title}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">內容</label>
            <textarea
              required
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-24"
              placeholder={placeholders.content}
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
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        targetType: e.target.value as "all" | "specific",
                        targetIds: [],
                      })
                    }
                    className="text-sm border rounded px-2 py-1 outline-none"
                  >
                    <option value="all">發送給所有人</option>
                    <option value="specific">發送給特定人</option>
                  </select>
                </div>
              </>
            )}
          </div>

          {isManager && formData.targetType === "specific" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">選擇發送對象</label>
              <div className="flex flex-wrap gap-2">
                {employees
                  .filter((emp) => emp.id !== currentUser?.id)
                  .map((emp) => (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => {
                        const newIds = formData.targetIds.includes(emp.id)
                          ? formData.targetIds.filter((id) => id !== emp.id)
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
            disabled={
              isSubmitting ||
              (formData.targetType === "specific" && formData.targetIds.length === 0)
            }
            className={`w-full py-2 text-white rounded-lg font-medium transition-colors ${
              isSubmitting ||
              (formData.targetType === "specific" && formData.targetIds.length === 0)
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {isSubmitting ? "發布中..." : "確認發布"}
          </button>
        </form>
      )}

      {!isCollapsed && <div className="grid grid-cols-1 gap-4">
        {visibleItems.length === 0 ? (
          <div className="py-8 text-center text-slate-500 bg-white/85 rounded-xl border-2 border-dashed border-sky-200">
            目前沒有新公告
          </div>
        ) : (
          visibleItems.map((item: BulletinItem) => {
            const isRead = readBulletins.has(item.id);
            const isTargeted = item.targetType === "specific";
            const style = TYPE_STYLES[item.type] ?? TYPE_STYLES.announcement;
            const Icon = style.icon;
            const displayContent = stripMetaLines(item.content);
            const coverDate = parseCoverDate(item.content);

            return (
              <div
                key={item.id}
                className={`app-card p-4 relative group transition-all ${
                  item.isPinned
                    ? "border-2 border-sky-300 bg-sky-100/80"
                    : item.isUrgent
                      ? "border-amber-300 bg-amber-50/80"
                      : "border-sky-100 bg-white/95"
                } ${!isRead ? "ring-2 ring-sky-200" : ""}`}
              >
                {item.isPinned && (
                  <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Pin className="h-3 w-3" />
                    已釘選
                  </div>
                )}

                {!isRead && (
                  <div className="absolute -top-1 left-4 w-2 h-2 bg-blue-500 rounded-full" />
                )}

                <div className="flex items-start justify-between mb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon
                      className={`h-4 w-4 ${
                        item.isUrgent && item.type === "announcement"
                          ? "text-amber-600"
                          : "text-blue-600"
                      }`}
                    />
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${style.badge}`}>
                      {getBulletinTypeLabel(item.type, item.isUrgent)}
                    </span>
                    {isTargeted && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        特定人
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
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
                    {new Date(item.createdAt).toLocaleString("zh-TW", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span>發布者：{item.authorName}</span>
                  {isRead && <span className="text-green-600">✓ 已讀</span>}
                </div>

                <h4 className="font-bold text-gray-900 mb-1">{item.title}</h4>
                {coverDate && (
                  <p className="text-xs text-purple-700 mb-1">
                    代班日期：{coverDate.replace(/-/g, "/")}
                  </p>
                )}
                <p className="text-sm text-gray-600 whitespace-pre-wrap mb-3">{displayContent}</p>

                {item.type === "cover_request" && currentUser?.id !== item.authorId && (
                  <button
                    onClick={() => handleVolunteerCover(item)}
                    className="mt-1 w-full py-1.5 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 transition-colors flex items-center justify-center gap-1"
                  >
                    <HandHelping className="h-3.5 w-3.5" />
                    我能代班 → 前往換班申請
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>}
    </div>
  );
}
