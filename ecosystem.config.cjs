/**
 * PM2-Produktions-Definition (Onroda).
 *
 * Pfade: an den Server-Clone anpassen (Default: /root/imoove).
 * API bleibt intern Port 3000 (siehe .env / PORT).
 * Admin-Panel: gebaute SPA via `pnpm run preview:prod` (Vite preview) auf 127.0.0.1:3001 — Nginx proxy_pass dorthin.
 *
 * Start (einmalig):  pm2 start ecosystem.config.cjs
 * Update:             pm2 reload ecosystem.config.cjs --update-env
 */
const root = process.env.ONRODA_REPO_ROOT || "/root/imoove";

module.exports = {
  apps: [
    {
      name: "onroda-api",
      cwd: `${root}/artifacts/api-server`,
      script: "node",
      args: "--enable-source-maps ./dist/index.mjs",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "onroda-admin-panel",
      cwd: `${root}/artifacts/admin-panel`,
      script: "pnpm",
      args: "run preview:prod",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
