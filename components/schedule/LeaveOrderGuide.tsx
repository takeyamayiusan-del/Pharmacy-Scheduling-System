"use client";

import Link from "next/link";
import { useApp } from "@/lib/context/AppContext";
import { HelpTip } from "@/components/ui/HelpTip";

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

  const body = (
    <>
      <p>
        負責排班的同事建議：先把晚班衝突用換班談好，再來排休，比較不會互相卡班。
      </p>
      <ol className="list-decimal list-inside space-y-2">
        <li>先討論／確認大家想休的日期（尤其含晚班的日子）</li>
        <li>
          有衝突先去{" "}
          {rotationOn ? (
            <>
              <Link
                href="/wednesday-shifts"
                className="font-medium text-sky-800 underline underline-offset-2"
              >
                {menuLabel}
              </Link>
              ，或直接{" "}
            </>
          ) : null}
          <Link
            href="/applications/shift-swap"
            className="font-medium text-sky-800 underline underline-offset-2"
          >
            換班申請
          </Link>
        </li>
        <li>
          換班核准後，再到排休頁<strong>點選日期即時儲存</strong>（沒有確認鍵）
        </li>
      </ol>
      <div className="flex flex-wrap gap-2 pt-1">
        {rotationOn && (
          <Link
            href="/wednesday-shifts"
            className="inline-flex items-center px-3 py-1.5 rounded-xl border border-sky-200 bg-white text-sm text-sky-900 hover:bg-sky-50"
          >
            {menuLabel}
          </Link>
        )}
        <Link
          href="/applications/shift-swap"
          className="inline-flex items-center px-3 py-1.5 rounded-xl border border-sky-200 bg-white text-sm text-sky-900 hover:bg-sky-50"
        >
          換班申請
        </Link>
      </div>
      <p className="text-sm text-slate-500">
        不會強制鎖死順序；若已確定無晚班衝突，仍可直接排休。
      </p>
    </>
  );

  if (compact) {
    return (
      <HelpTip title="建議排休順序" className={className} hint="先換班再排休較不易撞晚班">
        {body}
      </HelpTip>
    );
  }

  return (
    <HelpTip title="建議排休順序" className={className} hint="先換班再排休較不易撞晚班">
      {body}
    </HelpTip>
  );
}
