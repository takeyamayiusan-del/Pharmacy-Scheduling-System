"use client";

import Link from "next/link";
import { useApp } from "@/lib/context/AppContext";

/**
 * Soft guidance only: does not block leave selection.
 * Recommended ops order when evening/rotation coverage conflicts exist.
 */
export function LeaveOrderGuide({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const { storeConfig } = useApp();
  const rotationOn = storeConfig.features.rotationEvening;
  const menuLabel = storeConfig.rotationEvening.menuLabel;

  if (compact) {
    return (
      <div className={`text-sm text-gray-700 space-y-2 ${className}`}>
        <p className="font-medium text-gray-900">建議順序（較不易撞晚班）</p>
        <ol className="list-decimal list-inside space-y-1 text-gray-700">
          <li>先私下／群組討論誰要休哪天</li>
          <li>
            若會撞到
            <strong>晚班{rotationOn ? `／${menuLabel}` : ""}</strong>
            ，先完成{" "}
            <Link href="/applications/shift-swap" className="text-blue-700 underline">
              換班
            </Link>
            {rotationOn && (
              <>
                （必要時先看{" "}
                <Link href="/wednesday-shifts" className="text-blue-700 underline">
                  {menuLabel}
                </Link>
                ）
              </>
            )}
          </li>
          <li>
            換班談妥後，再到{" "}
            <Link href="/leave-selection" className="text-blue-700 underline">
              排休選擇
            </Link>{" "}
            勾選休假日
          </li>
        </ol>
      </div>
    );
  }

  return (
    <div className={`bg-emerald-50 border border-emerald-200 rounded-xl p-4 ${className}`}>
      <h3 className="font-medium text-emerald-900 mb-2">建議排休順序</h3>
      <p className="text-sm text-emerald-900/90 mb-3">
        負責排班的同事建議：先把晚班衝突用換班談好，再來排休，比較不會互相卡班。
      </p>
      <ol className="text-sm text-emerald-950 space-y-2 list-decimal list-inside">
        <li>先討論／確認大家想休的日期（尤其含晚班的日子）</li>
        <li>
          有衝突先去{" "}
          {rotationOn ? (
            <>
              <Link
                href="/wednesday-shifts"
                className="font-medium text-emerald-800 underline underline-offset-2"
              >
                {menuLabel}
              </Link>
              ，或直接{" "}
            </>
          ) : null}
          <Link
            href="/applications/shift-swap"
            className="font-medium text-emerald-800 underline underline-offset-2"
          >
            換班申請
          </Link>
        </li>
        <li>換班核准後，再在本頁勾選排休日（點選即儲存）</li>
      </ol>
      <div className="mt-3 flex flex-wrap gap-2">
        {rotationOn && (
          <Link
            href="/wednesday-shifts"
            className="inline-flex items-center px-3 py-1.5 rounded-lg border border-emerald-300 bg-white text-sm text-emerald-900 hover:bg-emerald-100"
          >
            {menuLabel}
          </Link>
        )}
        <Link
          href="/applications/shift-swap"
          className="inline-flex items-center px-3 py-1.5 rounded-lg border border-emerald-300 bg-white text-sm text-emerald-900 hover:bg-emerald-100"
        >
          換班申請
        </Link>
      </div>
      <p className="mt-3 text-xs text-emerald-800/80">
        說明：目前不會強制鎖死順序；若已確定無晚班衝突，仍可直接在本頁排休。
      </p>
    </div>
  );
}
