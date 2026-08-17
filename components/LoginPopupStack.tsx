"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useApp,
  type BulletinItem,
  type Notification,
} from "@/lib/context/AppContext";
import { Megaphone, Calendar, DollarSign, X, Coffee } from "lucide-react";
import { getBulletinTypeLabel, stripMetaLines } from "@/lib/bulletin/bulletinMeta";

type PopupItem =
  | { kind: "bulletin"; id: string; bulletin: BulletinItem }
  | { kind: "payroll"; id: string; notification: Notification }
  | { kind: "leave_reminder"; id: string; year: number; month: number; nextYear: number; nextMonth: number };

function bulletinDismissKey(id: string) {
  return `bulletin_popup_dismissed_${id}`;
}

function leaveDismissKey(year: number, month: number, userId: string) {
  return `leaveReminder_dismissed_${year}_${month}_${userId}`;
}

/**
 * 登入後彈窗堆疊：
 * - 僅 active 公告會彈（已取消／封存不彈）
 * - 按 X／稍後再說：只關這次，下次仍會彈
 * - 知道了／不再顯示／前往查看：永久關閉該則
 * - 公告、薪資、排休提醒可依序疊加，互不覆蓋取消
 */
export default function LoginPopupStack() {
  const {
    currentUser,
    bulletinItems,
    notifications,
    markNotificationRead,
    getLeaveSummary,
    storeConfig,
  } = useApp();
  const router = useRouter();
  const [queue, setQueue] = useState<PopupItem[]>([]);
  const [sessionSkip, setSessionSkip] = useState<Set<string>>(new Set());

  const leaveCandidate = useMemo(() => {
    if (!currentUser || currentUser.role === "owner") return null;
    const today = new Date();
    if (today.getDate() < 20) return null;
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    if (typeof window !== "undefined") {
      if (localStorage.getItem(leaveDismissKey(year, month, currentUser.id))) return null;
    }
    const summary = getLeaveSummary(currentUser.id, nextYear, nextMonth);
    if (summary.selectedDates.length > 0) return null;
    return { year, month, nextYear, nextMonth };
  }, [currentUser, getLeaveSummary]);

  useEffect(() => {
    if (!currentUser) {
      setQueue([]);
      return;
    }

    const items: PopupItem[] = [];

    // 1) 僅 active 公告；已封存／取消不彈
    const activeBulletins = bulletinItems.filter((b) => {
      if (b.status !== "active") return false;
      if (b.targetType === "specific" && !b.targetIds.includes(currentUser.id)) return false;
      if (typeof window !== "undefined" && localStorage.getItem(bulletinDismissKey(b.id))) {
        return false;
      }
      if (sessionSkip.has(`bulletin:${b.id}`)) return false;
      return true;
    });
    const urgent = activeBulletins.filter((b) => b.isUrgent);
    const others = activeBulletins.filter((b) => !b.isUrgent);
    [...urgent, ...others].forEach((b) => {
      items.push({ kind: "bulletin", id: `bulletin:${b.id}`, bulletin: b });
    });

    // 2) 未讀薪資發布通知
    notifications
      .filter(
        (n) =>
          n.userId === currentUser.id &&
          !n.read &&
          n.relatedType === "payroll" &&
          !sessionSkip.has(`payroll:${n.id}`)
      )
      .forEach((n) => {
        items.push({ kind: "payroll", id: `payroll:${n.id}`, notification: n });
      });

    // 3) 排休提醒
    if (leaveCandidate && !sessionSkip.has("leave_reminder")) {
      items.push({
        kind: "leave_reminder",
        id: "leave_reminder",
        ...leaveCandidate,
      });
    }

    setQueue(items);
  }, [currentUser, bulletinItems, notifications, leaveCandidate, sessionSkip]);

  const current = queue[0] ?? null;

  const closeSessionOnly = () => {
    if (!current) return;
    setSessionSkip((prev) => new Set(prev).add(current.id));
  };

  const dismissPermanentBulletin = (bulletinId: string) => {
    localStorage.setItem(bulletinDismissKey(bulletinId), "1");
    setSessionSkip((prev) => new Set(prev).add(`bulletin:${bulletinId}`));
  };

  const dismissPermanentLeave = (year: number, month: number) => {
    if (!currentUser) return;
    localStorage.setItem(leaveDismissKey(year, month, currentUser.id), "1");
    setSessionSkip((prev) => new Set(prev).add("leave_reminder"));
  };

  const dismissPayroll = async (notificationId: string, goPayroll: boolean) => {
    await markNotificationRead(notificationId);
    setSessionSkip((prev) => new Set(prev).add(`payroll:${notificationId}`));
    if (goPayroll) router.push("/payroll-detail");
  };

  if (!current) return null;

  // 疊加時用較高 z-index，不影響其他頁面操作完後下一則
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      {current.kind === "bulletin" && (
        <div className="app-panel shadow-2xl p-6 max-w-sm w-full relative">
          <button
            type="button"
            onClick={closeSessionOnly}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            aria-label="關閉"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex flex-col items-center text-center">
            <div
              className={`p-3 rounded-full mb-4 ${
                current.bulletin.type === "meal_order"
                  ? "bg-orange-100"
                  : current.bulletin.isUrgent
                    ? "bg-amber-100"
                    : "bg-blue-100"
              }`}
            >
              {current.bulletin.type === "meal_order" ? (
                <Coffee className="h-8 w-8 text-orange-700" />
              ) : (
                <Megaphone
                  className={`h-8 w-8 ${
                    current.bulletin.isUrgent ? "text-amber-600" : "text-blue-600"
                  }`}
                />
              )}
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {current.bulletin.type === "meal_order"
                ? "今天有訂餐喔！"
                : "最新公告消息"}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {current.bulletin.type === "meal_order"
                ? "請看菜單後自行填寫要喝／吃什麼；也可以幫同事代點。"
                : "有新的重要公告，可稍後再說；按「知道了」後才不會再跳出。"}
            </p>
            <div className="w-full p-4 bg-gray-50 rounded-xl mb-6 text-left border border-gray-100">
              <p className="text-xs font-bold text-blue-600 mb-1">
                {getBulletinTypeLabel(current.bulletin.type, current.bulletin.isUrgent)}
                {current.bulletin.isUrgent && current.bulletin.type !== "meal_order"
                  ? "【重要】"
                  : ""}{" "}
                {current.bulletin.title}
              </p>
              <p className="text-sm text-gray-700 line-clamp-4 whitespace-pre-wrap">
                {stripMetaLines(current.bulletin.content)}
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full">
              <button
                type="button"
                onClick={() => {
                  dismissPermanentBulletin(current.bulletin.id);
                  if (current.bulletin.type === "meal_order") {
                    const q = current.bulletin.relatedId
                      ? `?orderId=${current.bulletin.relatedId}`
                      : "";
                    router.push(`/meal-order${q}`);
                  } else {
                    router.push("/schedule");
                  }
                }}
                className={`w-full py-3 px-4 text-white font-medium rounded-xl ${
                  current.bulletin.type === "meal_order"
                    ? "bg-orange-600 hover:bg-orange-700"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {current.bulletin.type === "meal_order"
                  ? "前往填寫飲料／便當"
                  : "知道了，前往查看"}
              </button>
              <button
                type="button"
                onClick={() => dismissPermanentBulletin(current.bulletin.id)}
                className="w-full py-3 px-4 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50"
              >
                知道了（不再顯示）
              </button>
              <button
                type="button"
                onClick={closeSessionOnly}
                className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                稍後再說
              </button>
            </div>
          </div>
        </div>
      )}

      {current.kind === "payroll" && (
        <div className="app-panel shadow-2xl p-6 max-w-sm w-full relative">
          <button
            type="button"
            onClick={closeSessionOnly}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            aria-label="關閉"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex flex-col items-center text-center">
            <div className="p-3 rounded-full mb-4 bg-emerald-100">
              <DollarSign className="h-8 w-8 text-emerald-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {current.notification.title || "薪資單已發布"}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {current.notification.message || "您有新的薪資單可查看。"}
            </p>
            <div className="flex flex-col gap-2 w-full">
              <button
                type="button"
                onClick={() => dismissPayroll(current.notification.id, true)}
                className="w-full py-3 px-4 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700"
              >
                前往薪資查詢
              </button>
              <button
                type="button"
                onClick={() => dismissPayroll(current.notification.id, false)}
                className="w-full py-3 px-4 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50"
              >
                知道了
              </button>
              <button
                type="button"
                onClick={closeSessionOnly}
                className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                稍後再說
              </button>
            </div>
          </div>
        </div>
      )}

      {current.kind === "leave_reminder" && (
        <div className="app-panel shadow-2xl p-6 max-w-sm w-full relative">
          <button
            type="button"
            onClick={closeSessionOnly}
            className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
            aria-label="關閉提醒"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-start gap-3 mb-4">
            <Calendar className="h-6 w-6 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-gray-900">記得安排下個月休假！</p>
              <p className="text-sm text-gray-600 mt-1">
                已到每月提醒時間，您尚未選擇下個月排休。建議依序完成：
              </p>
              <ol className="mt-2 text-sm text-gray-700 list-decimal list-inside space-y-1">
                <li>
                  先討論休假日；若撞晚班
                  {storeConfig.features.rotationEvening
                    ? `／${storeConfig.rotationEvening.menuLabel}`
                    : ""}
                  ，先換班
                </li>
                <li>再到排休選擇勾選日期</li>
              </ol>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                closeSessionOnly();
                router.push("/applications/shift-swap");
              }}
              className="w-full py-2 border border-blue-200 bg-blue-50 text-blue-800 rounded-lg text-sm hover:bg-blue-100"
            >
              先去換班（有衝突時）
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => dismissPermanentLeave(current.year, current.month)}
                className="flex-1 py-2 border rounded-lg text-gray-600 text-sm"
              >
                本月不再提醒
              </button>
              <button
                type="button"
                onClick={() => {
                  dismissPermanentLeave(current.year, current.month);
                  router.push("/leave-selection");
                }}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                前往排休選擇
              </button>
            </div>
            <button
              type="button"
              onClick={closeSessionOnly}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              稍後再說
            </button>
          </div>
        </div>
      )}

      {queue.length > 1 && (
        <p className="absolute bottom-6 text-xs text-white/90 bg-black/40 px-3 py-1 rounded-full">
          還有 {queue.length - 1} 則提醒
        </p>
      )}
    </div>
  );
}
