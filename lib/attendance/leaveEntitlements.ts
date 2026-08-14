import type { LeaveType } from "@/lib/attendance/leaveHours";
import { hoursToLeaveDays } from "@/lib/payroll/salaryItems";

/** 給薪語意（薪資費率仍由店長填；此處只標示勞基預設） */
export type LeavePayKind = "paid" | "half" | "unpaid";

/** 上限計算週期。none = 不設天數上限（特休走年度配額、補休走帳本、公假依法令） */
export type LeaveLimitPeriod = "calendar_year" | "month" | "event" | "none";

export const LEAVE_PAY_KIND_LABEL: Record<LeavePayKind, string> = {
  paid: "有薪",
  half: "半薪",
  unpaid: "無薪",
};

export type StatutoryLeaveRule = {
  type: LeaveType;
  daysLimit: number | null;
  period: LeaveLimitPeriod;
  payKind: LeavePayKind;
  legalRef: string;
  summary: string;
};

/**
 * 勞基／請假規則／性工法預設（可在店家設定覆寫天數與給薪）。
 * 系統僅警示、不硬擋送出或排班。
 */
export const STATUTORY_LEAVE_RULES: Record<LeaveType, StatutoryLeaveRule> = {
  事假: {
    type: "事假",
    daysLimit: 14,
    period: "calendar_year",
    payKind: "unpaid",
    legalRef: "勞工請假規則第7條",
    summary: "一年內未滿14日，不給工資。",
  },
  病假: {
    type: "病假",
    daysLimit: 30,
    period: "calendar_year",
    payKind: "half",
    legalRef: "勞工請假規則第4條",
    summary: "普通傷病未住院一年內合計不得超過30日，工資折半；住院另有較長上限。",
  },
  特休: {
    type: "特休",
    daysLimit: null,
    period: "none",
    payKind: "paid",
    legalRef: "勞基法第38條",
    summary: "依年資給假，工資照給。未休完應排休或折算工資，不是自動作廢。",
  },
  喪假: {
    type: "喪假",
    daysLimit: 8,
    period: "event",
    payKind: "paid",
    legalRef: "勞工請假規則第3條",
    summary: "父母／配偶8日；祖父母、子女、配偶之父母6日；曾祖父母、兄弟姊妹、配偶之祖父母3日。預設以上限8日警示。",
  },
  補休假: {
    type: "補休假",
    daysLimit: null,
    period: "none",
    payKind: "paid",
    legalRef: "勞基法第32條之1",
    summary: "加班轉補休，依補休帳本；可先請後補。",
  },
  生理假: {
    type: "生理假",
    daysLimit: 1,
    period: "month",
    payKind: "half",
    legalRef: "性別工作平等法第14條",
    summary: "每月得請1日；全年未逾3日不併入病假，其餘併入有薪病假。薪資減半。",
  },
  產假: {
    type: "產假",
    daysLimit: 56,
    period: "event",
    payKind: "paid",
    legalRef: "勞基法第50條",
    summary: "分娩前後產假8週（56日）。流產週數不同天數不同，請以店規或人工調整。",
  },
  陪產檢及陪產假: {
    type: "陪產檢及陪產假",
    daysLimit: 7,
    period: "event",
    payKind: "paid",
    legalRef: "性別工作平等法第15條",
    summary: "陪產檢及陪產假合計7日，工資照給。",
  },
  家庭照顧事假: {
    type: "家庭照顧事假",
    daysLimit: 7,
    period: "calendar_year",
    payKind: "unpaid",
    legalRef: "性別工作平等法第20條",
    summary: "每年7日，併入事假計算、不給工資，不得因此扣全勤。",
  },
  婚假: {
    type: "婚假",
    daysLimit: 8,
    period: "event",
    payKind: "paid",
    legalRef: "勞工請假規則第2條",
    summary: "婚假8日，工資照給。",
  },
  公假: {
    type: "公假",
    daysLimit: null,
    period: "none",
    payKind: "paid",
    legalRef: "勞工請假規則第8條",
    summary: "依法令應給公假者，工資照給；天數依該法令，系統不預設上限。",
  },
  其他: {
    type: "其他",
    daysLimit: null,
    period: "none",
    payKind: "unpaid",
    legalRef: "店規",
    summary: "店家自訂假別。未另約定時視為無薪、不設上限。",
  },
};

export type LeaveRuleOverride = {
  daysLimit: number | null;
  payKind: LeavePayKind;
};

export type LeaveRulesMap = Partial<Record<LeaveType, LeaveRuleOverride>>;

export function statutoryLeaveRulesMap(): Record<LeaveType, LeaveRuleOverride> {
  const out = {} as Record<LeaveType, LeaveRuleOverride>;
  for (const rule of Object.values(STATUTORY_LEAVE_RULES)) {
    out[rule.type] = { daysLimit: rule.daysLimit, payKind: rule.payKind };
  }
  return out;
}

export function parseLeavePayKind(v: unknown, fallback: LeavePayKind): LeavePayKind {
  if (v === "paid" || v === "half" || v === "unpaid") return v;
  return fallback;
}

export function parseLeaveRulesMap(raw: unknown): LeaveRulesMap {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const next: LeaveRulesMap = {};
  for (const type of Object.keys(STATUTORY_LEAVE_RULES) as LeaveType[]) {
    const row = o[type];
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const statutory = STATUTORY_LEAVE_RULES[type];
    let daysLimit: number | null = statutory.daysLimit;
    if (r.daysLimit === null || r.daysLimit === "" || r.daysLimit === "null") {
      daysLimit = null;
    } else if (r.daysLimit !== undefined) {
      const n = Number(r.daysLimit);
      daysLimit = Number.isFinite(n) ? Math.max(0, Math.round(n * 10) / 10) : statutory.daysLimit;
    }
    next[type] = {
      daysLimit,
      payKind: parseLeavePayKind(r.payKind, statutory.payKind),
    };
  }
  return next;
}

export type EffectiveLeaveRule = StatutoryLeaveRule & {
  daysLimit: number | null;
  payKind: LeavePayKind;
  customized: boolean;
};

export function effectiveLeaveRule(
  type: LeaveType,
  overrides: LeaveRulesMap | undefined
): EffectiveLeaveRule {
  const statutory = STATUTORY_LEAVE_RULES[type] ?? STATUTORY_LEAVE_RULES["其他"];
  const over = overrides?.[type];
  const daysLimit = over && "daysLimit" in over ? over.daysLimit : statutory.daysLimit;
  const payKind = over?.payKind ?? statutory.payKind;
  const customized =
    daysLimit !== statutory.daysLimit || payKind !== statutory.payKind;
  return { ...statutory, daysLimit, payKind, customized };
}

export function leavePayKindLabel(kind: LeavePayKind): string {
  return LEAVE_PAY_KIND_LABEL[kind];
}

export function formatLeaveLimit(rule: EffectiveLeaveRule): string {
  if (rule.daysLimit == null) {
    if (rule.type === "特休") return "依年資配額";
    if (rule.type === "補休假") return "依補休帳本";
    return "不限";
  }
  const period =
    rule.period === "month"
      ? "／每月"
      : rule.period === "calendar_year"
        ? "／每年"
        : rule.period === "event"
          ? "／每次事由"
          : "";
  return `${rule.daysLimit} 日${period}`;
}

export type LeaveUsageRequest = {
  id?: string;
  employeeId: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  leaveHours: number;
};

function windowForPeriod(
  period: LeaveLimitPeriod,
  startDate: string
): { from: string; to: string } | null {
  if (period === "none") return null;
  const y = startDate.slice(0, 4);
  const m = startDate.slice(5, 7);
  if (period === "month") {
    const last = new Date(Number(y), Number(m), 0).getDate();
    return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(last).padStart(2, "0")}` };
  }
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

export function sumLeaveHoursInWindow(params: {
  employeeId: string;
  type: string;
  extraTypes?: string[];
  requests: LeaveUsageRequest[];
  from: string;
  to: string;
  excludeId?: string;
}): number {
  const types = new Set([params.type, ...(params.extraTypes ?? [])]);
  return params.requests
    .filter((r) => {
      if (r.employeeId !== params.employeeId) return false;
      if (!types.has(r.type)) return false;
      if (r.status !== "approved" && r.status !== "pending") return false;
      if (params.excludeId && r.id === params.excludeId) return false;
      return r.endDate >= params.from && r.startDate <= params.to;
    })
    .reduce((acc, r) => acc + (Number(r.leaveHours) || 0), 0);
}

export type LeaveLimitWarning = {
  title: string;
  detail: string;
};

/** 超過店規／勞基上限時回傳警示文字；未超過則空陣列。不硬擋。 */
export function leaveLimitWarnings(params: {
  type: LeaveType;
  employeeId: string;
  startDate: string;
  addHours: number;
  requests: LeaveUsageRequest[];
  overrides?: LeaveRulesMap;
  hoursPerDay?: number;
}): LeaveLimitWarning[] {
  const hoursPerDay = params.hoursPerDay && params.hoursPerDay > 0 ? params.hoursPerDay : 8;
  const rule = effectiveLeaveRule(params.type, params.overrides);
  const warnings: LeaveLimitWarning[] = [];
  const addDays = hoursToLeaveDays(params.addHours, hoursPerDay);

  const pushLimit = (limit: number, usedHours: number, scope: string) => {
    const usedDays = hoursToLeaveDays(usedHours, hoursPerDay);
    const after = Math.round((usedDays + addDays) * 1000) / 1000;
    if (after <= limit + 1e-9) return;
    warnings.push({
      title: `${rule.type}超過${scope}上限（僅警示，仍可送出）`,
      detail: `${rule.legalRef}：上限 ${limit} 日；已請約 ${usedDays} 日，本次 ${addDays} 日，合計約 ${after} 日。${rule.summary}`,
    });
  };

  const win = windowForPeriod(rule.period, params.startDate);
  if (rule.daysLimit != null && win) {
    const extraTypes =
      params.type === "家庭照顧事假" ? [] : undefined;
    const used = sumLeaveHoursInWindow({
      employeeId: params.employeeId,
      type: params.type,
      extraTypes,
      requests: params.requests,
      from: win.from,
      to: win.to,
    });
    const scope =
      rule.period === "month" ? "本月" : rule.period === "event" ? "本次事由／本年" : "本年";
    pushLimit(rule.daysLimit, used, scope);
  }

  if (params.type === "家庭照顧事假" || params.type === "事假") {
    const personal = STATUTORY_LEAVE_RULES["事假"];
    const mergedLimit =
      params.overrides?.["事假"]?.daysLimit !== undefined
        ? params.overrides["事假"]!.daysLimit
        : personal.daysLimit;
    if (mergedLimit != null) {
      const y = params.startDate.slice(0, 4);
      const used = sumLeaveHoursInWindow({
        employeeId: params.employeeId,
        type: "事假",
        extraTypes: ["家庭照顧事假"],
        requests: params.requests,
        from: `${y}-01-01`,
        to: `${y}-12-31`,
      });
      const usedDays = hoursToLeaveDays(used, hoursPerDay);
      const after = Math.round((usedDays + addDays) * 1000) / 1000;
      if (after > mergedLimit + 1e-9) {
        warnings.push({
          title: "事假＋家庭照顧事假合計超過一年14日（僅警示，仍可送出）",
          detail: `性工法第20條：家庭照顧事假併入事假計算。合計上限 ${mergedLimit} 日；已請約 ${usedDays} 日，本次 ${addDays} 日，合計約 ${after} 日。`,
        });
      }
    }
  }

  return warnings;
}
