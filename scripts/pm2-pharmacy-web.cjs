const { spawn } = require("child_process");
const path = require("path");

const projectRoot = path.join(__dirname, "..");
const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");

const child = spawn(process.execPath, [nextBin, "start"], {
  cwd: projectRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || "production",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(1);
    return;
  }
  process.exit(code ?? 1);
});

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    try {
      child.kill(sig);
    } catch {
      /* ignore */
    }
  });
}
