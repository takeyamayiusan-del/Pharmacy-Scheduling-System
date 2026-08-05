const path = require("path");

/** PM2 on Windows ignores CLI args after `--`; use this file instead of `pm2 start ... -- start`. */
module.exports = {
  apps: [
    {
      name: "pharmacy-web",
      script: path.join(__dirname, "node_modules/next/dist/bin/next"),
      args: "start",
      cwd: __dirname,
      interpreter: "node",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
