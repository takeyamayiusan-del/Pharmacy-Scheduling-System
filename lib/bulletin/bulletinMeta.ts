import type { BulletinItem } from "@/lib/context/AppContext";

export type BulletinType = BulletinItem["type"];

const COVER_DATE_PREFIX = "[COVER_DATE:";

/** 代班需求：在 content 開頭嵌入日期，供「我能代班」導向換班申請 */
export function encodeCoverDate(content: string, coverDate: string): string {
  const body = stripMetaLines(content).trim();
  return `${COVER_DATE_PREFIX}${coverDate}]\n${body}`;
}

export function parseCoverDate(content: string): string | null {
  const match = content.match(/^\[COVER_DATE:(\d{4}-\d{2}-\d{2})\]/);
  return match?.[1] ?? null;
}

export function stripMetaLines(content: string): string {
  return content.replace(/^\[COVER_DATE:\d{4}-\d{2}-\d{2}\]\n?/, "").trim();
}

export const BULLETIN_TYPE_LABELS: Record<BulletinType, string> = {
  announcement: "公告",
  cover_request: "代班需求",
  task_completed: "完成事項",
  day_off_notice: "公休公告",
  must_do_today: "今日必辦",
  shift_handoff: "交班留言",
  meal_order: "訂餐",
};

export const EMPLOYEE_BULLETIN_TYPES: BulletinType[] = [
  "cover_request",
  "task_completed",
  "shift_handoff",
  "meal_order",
];

export const MANAGER_BULLETIN_TYPES: BulletinType[] = [
  "announcement",
  "day_off_notice",
  "must_do_today",
  "shift_handoff",
  "meal_order",
];

export function getBulletinTypeLabel(type: BulletinType, isUrgent?: boolean): string {
  if (type === "announcement" && isUrgent) return "重要公告";
  return BULLETIN_TYPE_LABELS[type] ?? "公告";
}
