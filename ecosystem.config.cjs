module.exports = {
  apps: [
    {
      name: "pharmacy-web",
      cwd: "C:/Pharmacy-Scheduling-System",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      interpreter: "node",
      instances: 1,
      autorestart: true,
      max_restarts: 50,
      min_uptime: "5s",
      restart_delay: 3000,
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
  ],
};
