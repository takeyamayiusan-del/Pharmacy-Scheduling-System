import { jsPDF } from "jspdf";
import XLSX from "xlsx-js-style";
import {
  CUSTOMER_EXPORT_HEADERS,
  CUSTOMER_PAYMENT_LABELS,
  CUSTOMER_URGENCY_LABELS,
  SHOP_STATUS_LABELS,
  formatCreatedStamp,
  formatMoney,
  formatWantedArriveDate,
  toTaipeiDateKey,
  type CustomerOrder,
} from "@/lib/shop-ops/types";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  return formatCreatedStamp(iso);
}

function formatLocalDate(d: Date): string {
  return toTaipeiDateKey(d.toISOString()).replace(/-/g, "/");
}

function customerExportValues(
  row: CustomerOrder,
  handlerName: (id: string) => string
): Array<string | number> {
  const qty = `${row.quantity}${row.unit ? ` ${row.unit}` : ""}`;
  return [
    formatWhen(row.createdAt),
    CUSTOMER_URGENCY_LABELS[row.urgency],
    row.urgency === "urgent" ? formatWantedArriveDate(row.wantedArriveDate) : "",
    row.customerName,
    row.customerPhone,
    row.productName,
    row.nhiCode,
    qty,
    row.unit,
    formatMoney(row.amount),
    CUSTOMER_PAYMENT_LABELS[row.paymentStatus],
    row.ordered ? "已訂貨" : "未訂貨",
    row.goodsArrived ? "已到貨" : "未到貨",
    row.notified ? "已通知" : "未通知",
    row.pickedUp ? "已拿" : "未拿",
    handlerName(row.handlerId),
    row.note,
    SHOP_STATUS_LABELS[row.status],
  ];
}

export function exportCustomerOrdersExcel(input: {
  storeName: string;
  rows: CustomerOrder[];
  handlerName: (id: string) => string;
}): void {
  const header = [...CUSTOMER_EXPORT_HEADERS];
  const body = input.rows.map((row) => customerExportValues(row, input.handlerName));
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  ws["!cols"] = header.map((_, i) => ({ wch: i === 5 || i === 16 ? 22 : 12 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "客訂");
  const stamp = new Date();
  const y = stamp.getFullYear();
  const m = String(stamp.getMonth() + 1).padStart(2, "0");
  const d = String(stamp.getDate()).padStart(2, "0");
  XLSX.writeFile(wb, `${input.storeName}_客訂管理_${y}${m}${d}.xlsx`);
}

export function printCustomerOrdersForm(input: {
  storeName: string;
  rows: CustomerOrder[];
  handlerName: (id: string) => string;
}): void {
  if (typeof window === "undefined") return;
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1100,height=800");
  if (!printWindow) {
    alert("瀏覽器擋住列印視窗，請允許彈出視窗後再試。");
    return;
  }
  const rowsHtml = input.rows
    .map((row) => {
      const cells = customerExportValues(row, input.handlerName)
        .map((v) => `<td>${escapeHtml(String(v))}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  const headerHtml = CUSTOMER_EXPORT_HEADERS.map((h) => `<th>${escapeHtml(h)}</th>`).join("");

  const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <title>客訂管理表 — ${escapeHtml(input.storeName)}</title>
  <style>
    body { font-family: "Noto Sans TC", "Microsoft JhengHei", sans-serif; color: #111; padding: 16px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .meta { color: #555; font-size: 12px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #333; padding: 5px 6px; vertical-align: top; }
    th { background: #eee; }
    .note { margin-top: 10px; font-size: 11px; color: #444; }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(input.storeName)}　客訂管理表</h1>
  <p class="meta">列印時間 ${escapeHtml(formatWhen(new Date().toISOString()))}　共 ${input.rows.length} 筆　狀態以系統為準，紙本可再手寫勾選。</p>
  <table>
    <thead>
      <tr>
        ${headerHtml}
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || `<tr><td colspan="${CUSTOMER_EXPORT_HEADERS.length}">沒有資料</td></tr>`}
    </tbody>
  </table>
  <p class="note">紙本可再手寫勾選「訂貨／到貨／通知／已拿」。系統已勾者表示目前狀態。</p>
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

export async function exportCustomerOrdersPdf(input: {
  storeName: string;
  rows: CustomerOrder[];
  handlerName: (id: string) => string;
}): Promise<void> {
  if (typeof window === "undefined") return;
  if (input.rows.length === 0) {
    alert("沒有可匯出的資料");
    return;
  }

  const stamp = new Date();
  const exportDateText = formatLocalDate(stamp);

  const th = `border:1px solid #bbb; padding:8px 10px; background:#e8e8e8; font-size:15px; text-align:left; line-height:1.35;`;
  const td = `border:1px solid #bbb; padding:8px 10px; vertical-align:top; font-size:15px; line-height:1.35;`;

  const html = `
    <div style="font-family:'Microsoft JhengHei','Noto Sans TC',sans-serif; color:#111; padding:20px 24px; width:1600px;">
      <h1 style="font-size:22px; margin:0 0 6px; font-weight:bold;">${escapeHtml(input.storeName)}　客訂管理表</h1>
      <div style="color:#555; font-size:15px; margin-bottom:16px;">
        匯出時間：${escapeHtml(exportDateText)}　共 ${input.rows.length} 筆
      </div>
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr>
            ${CUSTOMER_EXPORT_HEADERS.map((h) => `<th style="${th}">${escapeHtml(h)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${input.rows
            .map((row) => {
              const cells = customerExportValues(row, input.handlerName)
                .map((v) => `<td style="${td}">${escapeHtml(String(v))}</td>`)
                .join("");
              return `<tr>${cells}</tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-10000px";
  wrapper.style.top = "0";
  wrapper.style.background = "#fff";
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);

  try {
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(wrapper, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
    });

    const doc = new jsPDF({ orientation: "l", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const imgWidthMm = pageWidth;

    const pageHeightPx = Math.floor((pageHeight * canvas.width) / imgWidthMm);
    const totalPages = Math.max(1, Math.ceil(canvas.height / pageHeightPx));

    for (let page = 0; page < totalPages; page += 1) {
      const startY = page * pageHeightPx;
      const sliceHeight = Math.min(pageHeightPx, canvas.height - startY);

      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeight;
      const ctx = sliceCanvas.getContext("2d");
      if (!ctx) throw new Error("canvas context 取得失敗");

      ctx.drawImage(canvas, 0, startY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
      const imgData = sliceCanvas.toDataURL("image/png");

      const sliceImgHeightMm = (sliceHeight * imgWidthMm) / canvas.width;
      if (page > 0) doc.addPage();
      doc.addImage(imgData, "PNG", 0, 0, imgWidthMm, sliceImgHeightMm);
    }

    const y = stamp.getFullYear();
    const m = String(stamp.getMonth() + 1).padStart(2, "0");
    const d = String(stamp.getDate()).padStart(2, "0");
    doc.save(`${input.storeName}_客訂管理_${y}${m}${d}.pdf`);
  } finally {
    wrapper.remove();
  }
}
