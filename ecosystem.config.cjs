/**
 * PM2-Produktions-Definition (Onroda).
 *
 * Pfade: an den Server-Clone anpassen (Default: /root/imoove).
 * - onroda-api:            API intern Port 3000 (siehe artifacts/api-server/.env / PORT)
 * - onroda-partner-panel:  Vite preview auf 127.0.0.1:3001 (Nginx panel.onroda.de)
 *
 * Admin-Panel: statisch via Nginx (/var/www/admin.onroda.de/) — kein PM2-Prozess.
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
