/**
 * PM2 process file for the envault API.
 *
 *   pm2 start ecosystem.config.cjs
 *
 * One fork-mode instance only: SQLite is single-writer.
 */
module.exports = {
  apps: [
    {
      name: "envault-api",
      cwd: "/opt/envault/packages/backend",
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      // New files (SQLite DB/WAL/logs) inherit 0600.
      umask: 0o077,
      env: {
        NODE_ENV: "production",
      },
      out_file: "/var/log/envault/api.out.log",
      error_file: "/var/log/envault/api.err.log",
      merge_logs: true,
      time: true,
    },
  ],
};
