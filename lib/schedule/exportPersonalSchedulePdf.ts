import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

type ExportPersonalSchedulePdfParams = {
  year: number;
  month: number;
  employeeName: string;
  element: HTMLElement;
  fileName?: string;
};

/**
 * 個人班表 PDF：以 HTML → Canvas → PDF，避免 jsPDF 內建字型無法顯示中文。
 */
export async function exportPersonalSchedulePdf(
  params: ExportPersonalSchedulePdfParams
): Promise<void> {
  const { year, month, employeeName, element, fileName } = params;
  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 2,
    width: element.scrollWidth,
    height: element.scrollHeight,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
    useCORS: true,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({
    orientation: canvas.width >= canvas.height ? "landscape" : "portrait",
    unit: "pt",
    format: "a4",
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;
  const ratio = Math.min(usableWidth / canvas.width, usableHeight / canvas.height);
  const drawWidth = canvas.width * ratio;
  const drawHeight = canvas.height * ratio;

  // 多頁裁切
  const pageCanvasHeight = usableHeight / ratio;
  let offsetY = 0;
  let pageIndex = 0;
  while (offsetY < canvas.height) {
    if (pageIndex > 0) pdf.addPage();
    const sliceHeight = Math.min(pageCanvasHeight, canvas.height - offsetY);
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = sliceHeight;
    const ctx = slice.getContext("2d");
    if (!ctx) throw new Error("無法建立 PDF 畫布");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(
      canvas,
      0,
      offsetY,
      canvas.width,
      sliceHeight,
      0,
      0,
      canvas.width,
      sliceHeight
    );
    const sliceData = slice.toDataURL("image/png");
    const sliceDrawHeight = sliceHeight * ratio;
    pdf.addImage(sliceData, "PNG", margin, margin, drawWidth, sliceDrawHeight);
    offsetY += sliceHeight;
    pageIndex += 1;
  }

  // silence unused if single-page path preferred — keep imgData for fallback short pages
  if (pageIndex === 0) {
    pdf.addImage(imgData, "PNG", margin, margin, drawWidth, drawHeight);
  }

  const name = fileName
    ?? `${year}-${String(month).padStart(2, "0")}-${employeeName}-個人班表.pdf`;
  pdf.save(name);
}
