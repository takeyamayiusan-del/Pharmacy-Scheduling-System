export type ComplianceSeverity = "soft" | "hard";

export type ComplianceRuleCode =
  | "L36_REGULAR_REST"
  | "DEFORMED_CYCLE_HOURS"
  | "DEFORMED_DAILY_HOURS";

export function severityForRule(rule: ComplianceRuleCode): ComplianceSeverity {
  switch (rule) {
    case "L36_REGULAR_REST":
      // 每七日一例假屬高風險，先標記為 hard（目前仍只警示）
      return "hard";
    case "DEFORMED_CYCLE_HOURS":
    case "DEFORMED_DAILY_HOURS":
    default:
      return "soft";
  }
}
