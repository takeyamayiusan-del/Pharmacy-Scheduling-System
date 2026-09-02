#!/usr/bin/env node
/**
 * 開啟 SOP 教學 HTML，供瀏覽器「列印 → 另存 PDF」
 * 用法：npm run sop:print
 */
import { fileURLToPath } from "url";
import path from "path";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(__dirname, "../docs/USER_SOP_家禾體系排班系統.html");

console.log("\n家禾體系排班系統 — 操作教學 SOP\n");
console.log("檔案位置：");
console.log(htmlPath);
console.log("\n列印成 PDF：");
console.log("  1. 用 Chrome / Edge 開啟上述 HTML");
console.log("  2. Ctrl+P（列印）");
console.log("  3. 目的地選「另存為 PDF」");
console.log("  4. 建議：直向、邊界「預設」、勾選「背景圖形」\n");

try {
  if (process.platform === "win32") {
    execSync(`start "" "${htmlPath}"`, { stdio: "ignore" });
  } else if (process.platform === "darwin") {
    execSync(`open "${htmlPath}"`, { stdio: "ignore" });
  } else {
    execSync(`xdg-open "${htmlPath}"`, { stdio: "ignore" });
  }
} catch {
  console.log("（無法自動開啟瀏覽器，請手動開啟檔案）\n");
}
