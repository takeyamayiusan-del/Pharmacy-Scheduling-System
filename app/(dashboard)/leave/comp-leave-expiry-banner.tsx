"use client";

import { useApp } from "@/lib/context/AppContext";
// 補休假過期提醒元件
import { AlertCircle, Clock } from "lucide-react";

export function CompLeaveExpiryBanner() {
  const { getAvailableCompLeave, user } = useApp() as any;

  if (!user) return null;

  const { balance, expiring } = getAvailableCompLeave(user.id);

  if (expiring.length === 0) return null;

  return (
    <div className="space-y-3 mb-6">
      {expiring.map((entry: any) => (
        <div
          key={entry.id}
          className={`flex items-start gap-3 p-4 rounded-lg border-l-4 ${
            entry.daysLeft <= 3
              ? "bg-red-50 border-red-400"
              : entry.daysLeft <= 7
                ? "bg-yellow-50 border-yellow-400"
                : "bg-blue-50 border-blue-400"
          }`}
        >
          <div className="flex-shrink-0 pt-0.5">
            {entry.daysLeft <= 3 ? (
              <AlertCircle className="w-5 h-5 text-red-600" />
            ) : (
              <Clock className="w-5 h-5 text-yellow-600" />
            )}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">
              {entry.daysLeft <= 3 ? "補休假即將過期" : "補休假即將過期"}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              {entry.hours} 小時補休假將在 {entry.daysLeft} 天後過期
              （{new Date(entry.created_at).toLocaleDateString("zh-TW")} 起算）
            </p>
            <p className="text-xs text-gray-500 mt-2">
              建議盡快申請使用，避免過期失效
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
