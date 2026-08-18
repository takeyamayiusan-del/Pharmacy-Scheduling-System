import XLSX from "xlsx-js-style";
import {
  CUSTOMER_PAYMENT_LABELS,
  formatMoney,
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
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getFullYear()}/${m}/${day} ${hh}:${mm}`;
}

function mark(on: boolean): string {
  return on ? "☑" : "☐";
}

export function exportCustomerOrdersExcel(input: {
  storeName: string;
  rows: CustomerOrder[];
  handlerName: (id: string) => string;
}): void {
  const header = [
    "登記時間",
    "客人",
    "電話",
    "商品",
    "健保碼",
    "數量",
    "單位",
    "金額",
    "付款",
    "貨到",
    "通知",
    "已拿",
    "接手人",
    "備註",
    "結單",
  ];
  const body = input.rows.map((row) => [
    formatWhen(row.createdAt),
    row.customerName,
    row.customerPhone,
    row.productName,
    row.nhiCode,
    row.quantity,
    row.unit,
    row.amount,
    CUSTOMER_PAYMENT_LABELS[row.paymentStatus],
    row.goodsArrived ? "已到貨" : "未到貨",
    row.notified ? "已通知" : "未通知",
    row.pickedUp ? "已拿" : "未拿",
    input.handlerName(row.handlerId),
    row.note,
    row.status === "closed" ? "已結單" : "待處理",
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  ws["!cols"] = header.map((_, i) => ({ wch: i === 3 || i === 13 ? 22 : 12 }));
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
      const qty = `${row.quantity}${row.unit ? ` ${escapeHtml(row.unit)}` : ""}`;
      return `<tr>
        <td>${escapeHtml(formatWhen(row.createdAt))}</td>
        <td>${escapeHtml(row.customerName)}<br/><span class="muted">${escapeHtml(row.customerPhone)}</span></td>
        <td>${escapeHtml(row.productName)}${row.nhiCode ? `<br/><span class="muted">健保碼 ${escapeHtml(row.nhiCode)}</span>` : ""}</td>
        <td class="num">${escapeHtml(qty)}</td>
        <td class="num">${escapeHtml(formatMoney(row.amount))}</td>
        <td>${escapeHtml(CUSTOMER_PAYMENT_LABELS[row.paymentStatus])}</td>
        <td class="chk">${mark(row.goodsArrived)} 到貨</td>
        <td class="chk">${mark(row.notified)} 通知</td>
        <td class="chk">${mark(row.pickedUp)} 已拿</td>
        <td>${escapeHtml(input.handlerName(row.handlerId))}</td>
        <td>${escapeHtml(row.note)}</td>
      </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <title>客訂管理表 — ${escapeHtml(input.storeName)}</title>
  <style>
    body { font-family: "Noto Sans TC", "Microsoft JhengHei", sans-serif; color: #111; padding: 16px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .meta { color: #555; font-size: 12px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #333; padding: 5px 6px; vertical-align: top; }
    th { background: #eee; }
    .muted { color: #555; font-size: 11px; }
    .num { white-space: nowrap; }
    .chk { white-space: nowrap; text-align: center; }
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
        <th>登記</th>
        <th>客人／電話</th>
        <th>商品</th>
        <th>數量</th>
        <th>金額</th>
        <th>付款</th>
        <th>貨到</th>
        <th>通知</th>
        <th>已拿</th>
        <th>接手</th>
        <th>備註</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || `<tr><td colspan="11">沒有資料</td></tr>`}
    </tbody>
  </table>
  <p class="note">紙本可再手寫勾選「到貨／通知／已拿」。系統已勾者表示目前狀態。</p>
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
