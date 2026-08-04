import type { LeavePeriodMode, LeaveRequest } from "@/lib/context/AppContext";

const COMPANY_NAME = "耀聖藥局";

const PERIOD_LABELS: Record<LeavePeriodMode, string> = {
  full_day: "全天",
  morning: "上午",
  afternoon: "下午",
  custom: "自訂",
};

export type LeaveApplicationFormData = {
  employeeName: string;
  leaveType: string;
  dateRange: string;
  periodLabel: string;
  timeRange: string;
  leaveHours: number;
  reason: string;
  applicationDate: string;
  reviewedByName?: string;
  reviewedAt?: string;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateZh(isoOrDate: string): string {
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return isoOrDate;
  return d.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateRange(startDate: string, endDate: string): string {
  if (endDate === startDate) return startDate;
  return `${startDate} ～ ${endDate}`;
}

export function buildLeaveFormPrintData(
  req: LeaveRequest,
  overrides?: { reviewedByName?: string; reviewedAt?: string; leaveHours?: number }
): LeaveApplicationFormData {
  return {
    employeeName: req.employeeName,
    leaveType: req.type,
    dateRange: formatDateRange(req.startDate, req.endDate),
    periodLabel: PERIOD_LABELS[req.period] ?? "全天",
    timeRange: `${req.startTime}–${req.endTime}`,
    leaveHours: overrides?.leaveHours ?? req.leaveHours,
    reason: req.reason,
    applicationDate: formatDateZh(req.createdAt),
    reviewedByName: overrides?.reviewedByName ?? req.reviewedByName,
    reviewedAt: overrides?.reviewedAt
      ? formatDateZh(overrides.reviewedAt)
      : req.reviewedAt
        ? formatDateZh(req.reviewedAt)
        : undefined,
  };
}

function fieldRow(label: string, value: string): string {
  return `
    <tr>
      <td class="label">${escapeHtml(label)}</td>
      <td class="value">${escapeHtml(value)}</td>
    </tr>`;
}

function signatureLine(label: string): string {
  return `
    <div class="signature-row">
      <span class="signature-label">${escapeHtml(label)}</span>
      <span class="signature-line"></span>
    </div>`;
}

export function printLeaveApplicationForm(data: LeaveApplicationFormData): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("無法開啟列印視窗，請允許彈出視窗後再試。");
    return;
  }

  const reviewerSection =
    data.reviewedByName || data.reviewedAt
      ? `
    ${fieldRow("核准人", data.reviewedByName ?? "")}
    ${fieldRow("核准日期", data.reviewedAt ?? "")}`
      : "";

  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8" />
  <title>請假申請單（簽名用）</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4 portrait; margin: 18mm; }
    body {
      font-family: "Microsoft JhengHei", "Noto Sans TC", sans-serif;
      color: #111827;
      font-size: 14px;
      line-height: 1.6;
      padding: 24px;
      max-width: 210mm;
      margin: 0 auto;
    }
    .company {
      text-align: center;
      font-size: 16px;
      color: #374151;
      margin-bottom: 8px;
      letter-spacing: 2px;
    }
    .title {
      text-align: center;
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 28px;
      letter-spacing: 4px;
      border-bottom: 2px solid #1f2937;
      padding-bottom: 12px;
    }
    table.fields {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 32px;
    }
    table.fields td {
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      vertical-align: top;
    }
    table.fields td.label {
      width: 120px;
      background: #f9fafb;
      font-weight: 600;
      white-space: nowrap;
    }
    table.fields td.value {
      min-height: 40px;
    }
    .signatures {
      margin-top: 48px;
      display: flex;
      flex-direction: column;
      gap: 36px;
    }
    .signature-row {
      display: flex;
      align-items: flex-end;
      gap: 12px;
    }
    .signature-label {
      flex-shrink: 0;
      font-weight: 600;
      min-width: 100px;
    }
    .signature-line {
      flex: 1;
      border-bottom: 1px solid #111827;
      min-width: 200px;
      height: 28px;
    }
    .note {
      margin-top: 40px;
      font-size: 12px;
      color: #6b7280;
      text-align: center;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="company">${escapeHtml(COMPANY_NAME)}</div>
  <h1 class="title">請假申請單（簽名用）</h1>
  <table class="fields">
    ${fieldRow("員工姓名", data.employeeName)}
    ${fieldRow("假別", data.leaveType)}
    ${fieldRow("請假日期區間", data.dateRange)}
    ${fieldRow("時段", `${data.periodLabel}（${data.timeRange}）`)}
    ${fieldRow("請假時數", `${data.leaveHours} 小時`)}
    ${fieldRow("事由", data.reason)}
    ${fieldRow("申請日期", data.applicationDate)}
    ${reviewerSection}
  </table>
  <div class="signatures">
    ${signatureLine("申請人簽名")}
    ${signatureLine("核准人簽名")}
    ${signatureLine("日期")}
  </div>
  <p class="note">本單供員工填寫簽名留存，請列印後手寫簽署。</p>
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 300);
    });
  </script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
