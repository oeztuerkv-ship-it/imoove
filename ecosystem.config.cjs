/**
 * PM2-Produktions-Definition (Onroda).
 *
 * Pfade: an den Server-Clone anpassen (Default: /root/imoove).
 * API bleibt intern Port 3000 (siehe .env / PORT).
 * Optional getrennte Vite-Preview-Apps (nur wenn Nginx nicht auf API :3000 proxyt):
 *   - onroda-admin-panel   → admin-panel  preview:prod  127.0.0.1:3001  (base /partners/)
 *   - onroda-partner-panel → partner-panel preview:prod  127.0.0.1:3001  (nur einer pro Port!)
 * Standard (Repo-Nginx-Beispiel): panel.onroda.de + admin → proxy_pass API :3000 (kein separates Panel-PM2 nötig).
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
    {
      name: "onroda-partner-panel",
      cwd: `${root}/artifacts/partner-panel`,
      script: "pnpm",
      args: "run preview:prod",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
