"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type CollapsibleCardProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  buttonClassName?: string;
};

/** 統一的可收合卡片樣式，避免各頁各自實作造成視覺不一致。 */
export function CollapsibleCard({
  title,
  subtitle,
  open,
  onToggle,
  children,
  className = "app-card p-4",
  contentClassName = "mt-3",
  buttonClassName = "",
}: CollapsibleCardProps) {
  return (
    <div className={className}>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between gap-3 text-left rounded-xl hover:bg-sky-50/60 -m-1 p-1 transition-colors ${buttonClassName}`}
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="app-section-title">{title}</div>
          {subtitle ? <div className="text-sm text-slate-500 mt-0.5">{subtitle}</div> : null}
        </div>
        <span className="inline-flex items-center gap-1 text-sm text-slate-600 shrink-0">
          {open ? "收合" : "展開"}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open ? <div className={contentClassName}>{children}</div> : null}
    </div>
  );
}
