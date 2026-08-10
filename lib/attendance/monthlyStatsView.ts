import {
  getApprovedLeaveHoursInMonth,
  type CanonicalLeaveRequest,
} from "@/lib/attendance/canonicalMonthHours";
import { formatCompLeaveHours, roundCompLeaveHours } from "@/lib/attendance/compLeaveDisplay";
import type { ScheduleShiftCode, ShiftTimeConfig } from "@/lib/context/AppContext";

export type LeaveLikeForStats = CanonicalLeaveRequest & { type: string; id?: string };

export type CompLedgerLike = {
  employeeId: string;
  hours: number;
  sourceType: string;
  sourceId?: string;
  note?: string;
  createdAt: string;
  expiresAt?: string;
};

export type OvertimeLikeForComp = {
  id: string;
  employeeId: string;
  date: string;
};

/** 台北時區 YYYY-MM-DD（帳本 createdAt 後備歸屬） */
export function toTaiwanDateString(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function isDateInYearMonth(dateStr: string, year: number, month: number): boolean {
  if (!dateStr || dateStr.length < 7) return false;
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(5, 7));
  return y === year && m === month;
}

function extractDateFromNote(note?: string): string | null {
  if (!note) return null;
  const match = note.match(/(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

/**
 * 帳本歸屬「業務日」：加班日／請假日起／備註日期／台北建立日。
 * 避免審核日在下個月卻把時數算進審核月。
 */
export function resolveCompLedgerEventDate(
  entry: CompLedgerLike,
  overtimeById?: Map<string, OvertimeLikeForComp>,
  leaveById?: Map<string, { startDate: string; endDate: string }>
): string {
  if (entry.sourceId) {
    const ot = overtimeById?.get(entry.sourceId);
    if (ot?.date) return ot.date;
    const leave = leaveById?.get(entry.sourceId);
    if (leave?.startDate) return leave.startDate;
  }
  const fromNote = extractDateFromNote(entry.note);
  if (fromNote) return fromNote;
  return toTaiwanDateString(entry.createdAt);
}

function sourceLabel(sourceType: string, hours: number): string {
  switch (sourceType) {
    case "overtime_credit":
      return "加班轉補休";
    case "typhoon_credit":
      return "颱風／彈性出勤補休";
    case "adjustment":
      return hours >= 0 ? "手動核發" : "手動扣回";
    case "leave_debit":
      return "補休假使用";
    case "typhoon_debit":
      return "颱風待補扣補休";
    case "reversal":
      return hours >= 0 ? "取消請假退回" : "取消加班沖銷";
    case "expiry":
      return "補休到期";
    default:
      return sourceType;
  }
}

const PERIOD_LABEL: Record<string, string> = {
  full_day: "全天",
  morning: "上午",
  afternoon: "下午",
  custom: "自訂",
};

export type LeaveBreakdownItem = {
  type: string;
  hours: number;
  startDate: string;
  endDate: string;
  periodLabel: string;
  startTime: string;
  endTime: string;
};

/** 本月請假名目明細：只含目前仍核准的申請（取消／駁回不列） */
export function buildLeaveBreakdownInMonth(params: {
  employeeId: string;
  year: number;
  month: number;
  leaveRequests: LeaveLikeForStats[];
  getShiftForDate: (date: string, employeeId: string) => ScheduleShiftCode;
  shiftTimeConfig: ShiftTimeConfig;
}): {
  byType: { type: string; hours: number }[];
  totalHours: number;
  items: LeaveBreakdownItem[];
} {
  const { employeeId, year, month } = params;
  const typeMap = new Map<string, number>();
  const items: LeaveBreakdownItem[] = [];

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
      periodLabel: PERIOD_LABEL[req.period] ?? String(req.period ?? "自訂"),
      startTime: req.startTime ?? "—",
      endTime: req.endTime ?? "—",
    });
  }

  items.sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.type.localeCompare(b.type)
  );

  const byType = Array.from(typeMap.entries())
    .map(([type, h]) => ({ type, hours: h }))
    .sort((a, b) => b.hours - a.hours);

  const totalHours = roundCompLeaveHours(byType.reduce((s, x) => s + x.hours, 0));
  return { byType, totalHours, items };
}

export type CompOvertimeItem = {
  date: string;
  startTime: string;
  endTime: string;
  hours: number;
};

/** 本月加班轉補休名目：只含目前仍核准、補償為補休的申請 */
export function buildApprovedCompOvertimeInMonth(params: {
  employeeId: string;
  year: number;
  month: number;
  overtimeRequests: {
    employeeId: string;
    date: string;
    startTime?: string | null;
    endTime?: string | null;
    status: string;
    compensationType: "pay" | "time_off";
  }[];
}): { totalHours: number; items: CompOvertimeItem[] } {
  const monthStr = `${params.year}-${String(params.month).padStart(2, "0")}`;
  const items = params.overtimeRequests
    .filter(
      (r) =>
        r.employeeId === params.employeeId &&
        r.status === "approved" &&
        r.compensationType === "time_off" &&
        r.date?.startsWith(monthStr) &&
        r.startTime &&
        r.endTime
    )
    .map((r) => {
      const [sh, sm] = String(r.startTime).split(":").map(Number);
      const [eh, em] = String(r.endTime).split(":").map(Number);
      const hours = roundCompLeaveHours(
        Math.max(0, eh * 60 + (em || 0) - (sh * 60 + (sm || 0))) / 60
      );
      return {
        date: r.date,
        startTime: String(r.startTime),
        endTime: String(r.endTime),
        hours,
      };
    })
    .filter((x) => x.hours > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  const totalHours = roundCompLeaveHours(items.reduce((s, x) => s + x.hours, 0));
  return { totalHours, items };
}

export type CompLeaveMonthSummary = {
  /** 真正「賺得」：加班／颱風／手動核發（不含取消請假退回） */
  earnedHours: number;
  /** 真正「使用」：補休假／颱風扣／手動扣（不含取消加班沖銷） */
  usedHours: number;
  overtimeCreditHours: number;
  typhoonCreditHours: number;
  adjustmentCreditHours: number;
  leaveDebitHours: number;
  typhoonDebitHours: number;
  adjustmentDebitHours: number;
  leaveRefundHours: number;
  overtimeReversalHours: number;
  netHours: number;
  balance: number;
  hint: string;
  lines: { label: string; hours: number; note?: string; eventDate: string }[];
};

/**
 * 本月補休進出＋目前餘額。
 * 「賺得／使用」只計實質進出，並依業務日歸月，避免與「加班轉補休申請」對不起來。
 */
export function buildCompLeaveMonthSummary(params: {
  employeeId: string;
  year: number;
  month: number;
  ledger: CompLedgerLike[];
  currentBalance: number;
  overtimeRequests?: OvertimeLikeForComp[];
  leaveRequests?: { id?: string; employeeId: string; startDate: string; endDate: string }[];
}): CompLeaveMonthSummary {
  const overtimeById = new Map(
    (params.overtimeRequests ?? [])
      .filter((r) => r.id)
      .map((r) => [r.id, r] as const)
  );
  const leaveById = new Map(
    (params.leaveRequests ?? [])
      .filter((r) => r.id)
      .map((r) => [r.id!, { startDate: r.startDate, endDate: r.endDate }] as const)
  );

  const monthEntries = params.ledger
    .filter((e) => e.employeeId === params.employeeId)
    .map((e) => ({
      entry: e,
      eventDate: resolveCompLedgerEventDate(e, overtimeById, leaveById),
    }))
    .filter(({ eventDate }) =>
      isDateInYearMonth(eventDate, params.year, params.month)
    );

  let overtimeCreditHours = 0;
  let typhoonCreditHours = 0;
  let adjustmentCreditHours = 0;
  let leaveDebitHours = 0;
  let typhoonDebitHours = 0;
  let adjustmentDebitHours = 0;
  let leaveRefundHours = 0;
  let overtimeReversalHours = 0;

  const lines: CompLeaveMonthSummary["lines"] = [];

  for (const { entry, eventDate } of monthEntries) {
    const h = entry.hours;
    const type = entry.sourceType;
    lines.push({
      label: sourceLabel(type, h),
      hours: roundCompLeaveHours(h),
      note: entry.note,
      eventDate,
    });

    if (type === "overtime_credit" && h > 0) overtimeCreditHours += h;
    else if (type === "typhoon_credit" && h > 0) typhoonCreditHours += h;
    else if (type === "adjustment" && h > 0) adjustmentCreditHours += h;
    else if (type === "leave_debit" && h < 0) leaveDebitHours += Math.abs(h);
    else if (type === "typhoon_debit" && h < 0) typhoonDebitHours += Math.abs(h);
    else if (type === "adjustment" && h < 0) adjustmentDebitHours += Math.abs(h);
    else if (type === "expiry" && h < 0) adjustmentDebitHours += Math.abs(h);
    else if (type === "reversal" && h > 0) leaveRefundHours += h;
    else if (type === "reversal" && h < 0) overtimeReversalHours += Math.abs(h);
    else if (h > 0) adjustmentCreditHours += h;
    else if (h < 0) adjustmentDebitHours += Math.abs(h);
  }

  const earnedHours = roundCompLeaveHours(
    overtimeCreditHours + typhoonCreditHours + adjustmentCreditHours
  );
  const usedHours = roundCompLeaveHours(
    leaveDebitHours + typhoonDebitHours + adjustmentDebitHours
  );
  const netHours = roundCompLeaveHours(
    earnedHours +
      leaveRefundHours -
      usedHours -
      overtimeReversalHours
  );
  const balance = roundCompLeaveHours(params.currentBalance);

  let hint = "無補休餘額";
  if (balance < 0) {
    hint = `借支 ${formatCompLeaveHours(Math.abs(balance))} 小時，請安排下月加班轉補休補回`;
  } else if (balance > 0) {
    hint = `尚有 ${formatCompLeaveHours(balance)} 小時，可安排補休假`;
  }

  return {
    earnedHours,
    usedHours,
    overtimeCreditHours: roundCompLeaveHours(overtimeCreditHours),
    typhoonCreditHours: roundCompLeaveHours(typhoonCreditHours),
    adjustmentCreditHours: roundCompLeaveHours(adjustmentCreditHours),
    leaveDebitHours: roundCompLeaveHours(leaveDebitHours),
    typhoonDebitHours: roundCompLeaveHours(typhoonDebitHours),
    adjustmentDebitHours: roundCompLeaveHours(adjustmentDebitHours),
    leaveRefundHours: roundCompLeaveHours(leaveRefundHours),
    overtimeReversalHours: roundCompLeaveHours(overtimeReversalHours),
    netHours,
    balance,
    hint,
    lines: lines.sort((a, b) => a.eventDate.localeCompare(b.eventDate)),
  };
}

export function formatLeaveBreakdownText(
  byType: { type: string; hours: number }[]
): string {
  if (byType.length === 0) return "無";
  return byType.map((x) => `${x.type} ${formatCompLeaveHours(x.hours)}h`).join("、");
}
