const major = parseInt(process.versions.node.split(".")[0], 10);

if (major >= 24) {
  console.error("");
  console.error("錯誤：Node.js 24 與 Next.js 14 不相容，會導致 Internal Server Error。");
  console.error("");
  console.error("請安裝 Node.js 20 LTS：https://nodejs.org/zh-tw");
  console.error("安裝後重開終端機，再執行：");
  console.error("  Remove-Item -Recurse -Force node_modules, .next");
  console.error("  npm install");
  console.error("  npm run dev");
  console.error("");
  process.exit(1);
}
