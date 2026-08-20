import type { BulletinItem } from "@/lib/context/AppContext";

export type BulletinType = BulletinItem["type"];

const COVER_DATE_PREFIX = "[COVER_DATE:";
const MEAL_DATE_PREFIX = "[MEAL_DATE:";

/** 代班需求：在 content 開頭嵌入日期，供「我能代班」導向換班申請 */
export function encodeCoverDate(content: string, coverDate: string): string {
  const body = stripMetaLines(content).trim();
  return `${COVER_DATE_PREFIX}${coverDate}]\n${body}`;
}

export function parseCoverDate(content: string): string | null {
  const match = content.match(/\[COVER_DATE:(\d{4}-\d{2}-\d{2})\]/);
  return match?.[1] ?? null;
}

/** 訂餐公告：嵌入訂餐日，登入彈窗只在當天出現；公告板仍可提前顯示 */
export function encodeMealOrderDate(content: string, orderDate: string): string {
  const body = stripMetaLines(content).trim();
  return `${MEAL_DATE_PREFIX}${orderDate}]\n${body}`;
}

export function parseMealOrderDate(content: string): string | null {
  const meta = content.match(/\[MEAL_DATE:(\d{4}-\d{2}-\d{2})\]/);
  if (meta) return meta[1];
  const line = content.match(
    /訂餐日期[：:]\s*(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/
  );
  if (!line) return null;
  return `${line[1]}-${line[2].padStart(2, "0")}-${line[3].padStart(2, "0")}`;
}

export function stripMetaLines(content: string): string {
  return content
    .replace(/^\[(?:COVER_DATE|MEAL_DATE):\d{4}-\d{2}-\d{2}\]\n?/gm, "")
    .trim();
}

/** 訂餐公告可提前張貼；登入彈窗只在訂餐當天出現 */
export function shouldPopupMealOrderBulletin(
  type: string,
  content: string,
  today: string
): boolean {
  if (type !== "meal_order") return true;
  const orderDate = parseMealOrderDate(content);
  return orderDate === today;
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
];

export const MANAGER_BULLETIN_TYPES: BulletinType[] = [
  "announcement",
  "day_off_notice",
  "must_do_today",
  "shift_handoff",
];

export function getBulletinTypeLabel(type: BulletinType, isUrgent?: boolean): string {
  if (type === "announcement" && isUrgent) return "重要公告";
  return BULLETIN_TYPE_LABELS[type] ?? "公告";
}
