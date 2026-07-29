'use client';

import { CheckCircle2, Clock, Calendar, Trash2 } from 'lucide-react';
import { useApp } from '@/lib/context/AppContext';

const typeIcons = {
  leave: Calendar,
  overtime: Clock,
  swap: Clock,
  schedule: Calendar,
  default: CheckCircle2,
};

function iconForNotification(title: string, relatedType?: string) {
  const key = relatedType ?? '';
  if (key.includes('leave') || title.includes('請假')) return typeIcons.leave;
  if (key.includes('overtime') || title.includes('加班')) return typeIcons.overtime;
  if (key.includes('swap') || title.includes('換班')) return typeIcons.swap;
  if (key.includes('schedule') || title.includes('班表')) return typeIcons.schedule;
  return typeIcons.default;
}

export function NotificationList() {
  const {
    notifications,
    markNotificationRead,
    deleteNotification,
    deleteAllNotifications,
    refreshNotifications,
    isLoading,
  } = useApp();

  const markAllAsRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    for (const n of unread) {
      await markNotificationRead(n.id);
    }
    await refreshNotifications();
  };

  const handleDeleteAll = async () => {
    if (!window.confirm('確定刪除全部通知？此動作無法復原。')) return;
    try {
      await deleteAllNotifications();
      await refreshNotifications();
    } catch {
      alert('刪除失敗，請稍後再試。');
    }
  };

  const handleDeleteOne = async (id: string) => {
    try {
      await deleteNotification(id);
    } catch {
      alert('刪除失敗，請稍後再試。');
      await refreshNotifications();
    }
  };

  if (isLoading && notifications.length === 0) {
    return <div className="p-8 text-center text-gray-500">載入中...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">通知</h1>
        <div className="flex flex-wrap items-center gap-2">
          {notifications.some((n) => !n.read) && (
            <button
              type="button"
              onClick={() => void markAllAsRead()}
              className="min-h-11 px-4 py-2 text-sm text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100"
            >
              全部標示為已讀
            </button>
          )}
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={() => void handleDeleteAll()}
              className="min-h-11 px-4 py-2 text-sm text-red-700 bg-red-50 rounded-lg hover:bg-red-100 inline-flex items-center gap-1.5"
            >
              <Trash2 className="h-4 w-4" />
              一鍵刪除
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {notifications.length === 0 ? (
          <div className="text-center py-12 text-gray-500">目前沒有通知</div>
        ) : (
          notifications.map((notification) => {
            const Icon = iconForNotification(notification.title, notification.relatedType);
            return (
              <div
                key={notification.id}
                className={`p-4 rounded-lg border ${
                  notification.read
                    ? 'bg-white border-gray-200'
                    : 'bg-blue-50 border-blue-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-white/80 text-sky-600 shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left"
                    onClick={() => {
                      if (!notification.read) void markNotificationRead(notification.id);
                    }}
                  >
                    <h3 className="font-medium text-gray-900">{notification.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(notification.createdAt).toLocaleString('zh-TW')}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteOne(notification.id)}
                    className="min-h-11 min-w-11 shrink-0 px-3 py-2 text-sm text-red-600 bg-red-50 rounded-lg hover:bg-red-100"
                    aria-label="刪除此通知"
                  >
                    刪除
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
