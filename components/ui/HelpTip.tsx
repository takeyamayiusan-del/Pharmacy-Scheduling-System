"use client";

import { useId, useState, type ReactNode } from "react";
import { CircleHelp, ChevronDown } from "lucide-react";

type HelpTipProps = {
  title?: string;
  children: ReactNode;
  className?: string;
  /** 預設收合；三大申請／排休等重要操作請設 true */
  defaultOpen?: boolean;
  /** 收合時按鈕旁的簡短提示（可選） */
  hint?: string;
};

/** 說明區塊：重要流程可預設展開，其餘可預設收合 */
export function HelpTip({
  title = "說明",
  children,
  className = "",
  defaultOpen = false,
  hint,
}: HelpTipProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50/90 px-3 py-1.5 text-sm font-medium text-sky-800 hover:bg-sky-100 transition-colors"
          aria-expanded={open}
          aria-controls={panelId}
        >
          <CircleHelp className="h-4 w-4 shrink-0" aria-hidden />
          {title}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        {hint && !open && <span className="text-sm text-slate-500">{hint}</span>}
      </div>
      {open && (
        <div
          id={panelId}
          className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/60 p-4 text-base text-slate-700 leading-relaxed space-y-2"
        >
          {children}
        </div>
      )}
    </div>
  );
}
