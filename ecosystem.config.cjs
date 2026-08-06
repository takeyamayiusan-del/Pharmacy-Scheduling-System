const path = require("path");

/** PM2 on Windows: use wrapper script instead of CLI `-- start` or direct next binary. */
module.exports = {
  apps: [
    {
      name: "pharmacy-web",
      script: path.join(__dirname, "scripts/pm2-pharmacy-web.cjs"),
      cwd: __dirname,
      interpreter: "node",
      autorestart: true,
      max_restarts: 15,
      min_uptime: "5s",
      env: {
        NODE_ENV: "production",
        // 強制 3000，避免 shell／系統 PORT=5000（現金帳）污染排班站
        PORT: "3000",
      },
    },
  ],
};
