"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { CircleHelp, ChevronDown } from "lucide-react";

type HelpTipProps = {
  title?: string;
  children: ReactNode;
  className?: string;
  /** 預設收合 */
  defaultOpen?: boolean;
  /** 收合時按鈕旁的簡短提示（可選） */
  hint?: string;
  /** 若提供則記住收合狀態（localStorage key） */
  storageKey?: string;
};

/** 說明區塊：預設收合；使用者展開後可經 storageKey 記住狀態 */
export function HelpTip({
  title = "說明",
  children,
  className = "",
  defaultOpen = false,
  hint,
  storageKey,
}: HelpTipProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === "1") setOpen(true);
      if (saved === "0") setOpen(false);
    } catch {
      // ignore storage read errors
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, open ? "1" : "0");
    } catch {
      // ignore storage write errors
    }
  }, [open, storageKey]);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400 bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-900 hover:bg-sky-100 transition-colors shadow-sm"
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
        {hint && !open && <span className="text-sm text-gray-500">{hint}</span>}
      </div>
      {open && (
        <div
          id={panelId}
          className="mt-3 rounded-xl border border-sky-300 bg-sky-100 p-4 text-base text-slate-900 leading-relaxed space-y-2 shadow-sm"
        >
          {children}
        </div>
      )}
    </div>
  );
}
