import {
  getApprovedLeaveHoursInMonth,
  type CanonicalLeaveRequest,
} from "@/lib/attendance/canonicalMonthHours";
import { formatCompLeaveHours, roundCompLeaveHours } from "@/lib/attendance/compLeaveDisplay";
import type { ShiftTimeConfig, ShiftType } from "@/lib/context/AppContext";

export type LeaveLikeForStats = CanonicalLeaveRequest & { type: string };

export type CompLedgerLike = {
  employeeId: string;
  hours: number;
  sourceType: string;
  createdAt: string;
  expiresAt?: string;
};

function isCreatedInMonth(iso: string, year: number, month: number): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === year && d.getMonth() + 1 === month;
}

/** 本月請假：依假別彙總時數（權威：優先存檔 leaveHours） */
export function buildLeaveBreakdownInMonth(params: {
  employeeId: string;
  year: number;
  month: number;
  leaveRequests: LeaveLikeForStats[];
  getShiftForDate: (date: string, employeeId: string) => ShiftType;
  shiftTimeConfig: ShiftTimeConfig;
}): {
  byType: { type: string; hours: number }[];
  totalHours: number;
  items: { type: string; hours: number; startDate: string; endDate: string }[];
} {
  const { employeeId, year, month } = params;
  const typeMap = new Map<string, number>();
  const items: { type: string; hours: number; startDate: string; endDate: string }[] = [];

  const approved = params.leaveRequests.filter(
    (r) => r.employeeId === employeeId && r.status === "approved"
  );

  for (const req of approved) {
    const hours = getApprovedLeaveHoursInMonth({
      request: req,
      year,
      month,
      getShiftForDate: params.getShiftForDate,
      shiftTimeConfig: params.shiftTimeConfig,
    });
    if (hours <= 0) continue;
    typeMap.set(req.type, roundCompLeaveHours((typeMap.get(req.type) ?? 0) + hours));
    items.push({
      type: req.type,
      hours,
      startDate: req.startDate,
      endDate: req.endDate,
    });
  }

  const byType = Array.from(typeMap.entries())
    .map(([type, h]) => ({ type, hours: h }))
    .sort((a, b) => b.hours - a.hours);

  const totalHours = roundCompLeaveHours(byType.reduce((s, x) => s + x.hours, 0));
  return { byType, totalHours, items };
}

/** 本月補休進出＋目前餘額（含負數借支） */
export function buildCompLeaveMonthSummary(params: {
  employeeId: string;
  year: number;
  month: number;
  ledger: CompLedgerLike[];
  currentBalance: number;
}): {
  earnedHours: number;
  usedHours: number;
  netHours: number;
  balance: number;
  hint: string;
} {
  const entries = params.ledger.filter(
    (e) =>
      e.employeeId === params.employeeId &&
      isCreatedInMonth(e.createdAt, params.year, params.month)
  );

  const earnedHours = roundCompLeaveHours(
    entries.filter((e) => e.hours > 0).reduce((s, e) => s + e.hours, 0)
  );
  const usedHours = roundCompLeaveHours(
    Math.abs(entries.filter((e) => e.hours < 0).reduce((s, e) => s + e.hours, 0))
  );
  const netHours = roundCompLeaveHours(earnedHours - usedHours);
  const balance = roundCompLeaveHours(params.currentBalance);

  let hint = "無補休餘額";
  if (balance < 0) {
    hint = `借支 ${formatCompLeaveHours(Math.abs(balance))} 小時，請安排下月加班轉補休補回`;
  } else if (balance > 0) {
    hint = `尚有 ${formatCompLeaveHours(balance)} 小時，可安排補休假`;
  }

  return { earnedHours, usedHours, netHours, balance, hint };
}

export function formatLeaveBreakdownText(
  byType: { type: string; hours: number }[]
): string {
  if (byType.length === 0) return "無";
  return byType.map((x) => `${x.type} ${formatCompLeaveHours(x.hours)}h`).join("、");
}
