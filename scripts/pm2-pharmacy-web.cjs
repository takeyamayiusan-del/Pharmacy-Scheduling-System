const { spawn } = require("child_process");
const path = require("path");

const projectRoot = path.join(__dirname, "..");
const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");

// 排班站固定 3000；不可沿用現金帳或其他程序設的 PORT=5000
const child = spawn(process.execPath, [nextBin, "start", "-p", "3000"], {
  cwd: projectRoot,
  stdio: "inherit",
  windowsHide: true,
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || "production",
    PORT: "3000",
  },
});

let shuttingDown = false;

function killChildTree() {
  if (!child.pid || shuttingDown) return;
  shuttingDown = true;
  if (process.platform === "win32") {
    // Windows: PM2 殺 wrapper 時 SIGTERM 常傳不到子進程，需 taskkill /T
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    child.kill("SIGTERM");
  } catch {
    /* ignore */
  }
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(1);
    return;
  }
  process.exit(code ?? 1);
});

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    killChildTree();
    // 給子進程一點時間後再結束 wrapper
    setTimeout(() => process.exit(1), process.platform === "win32" ? 1500 : 200);
  });
}

process.on("exit", () => {
  killChildTree();
});
