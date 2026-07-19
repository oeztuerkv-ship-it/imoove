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
        // Google reCAPTCHA v3 — Secret nur aus Server-Umgebung / .env, nie hardcoden.
        // Auf dem Server in artifacts/api-server/.env setzen: RECAPTCHA_SECRET_KEY=…
        // Optional Score-Schwelle (Default 0.5): RECAPTCHA_MIN_SCORE=0.5
        ...(process.env.RECAPTCHA_SECRET_KEY
          ? { RECAPTCHA_SECRET_KEY: process.env.RECAPTCHA_SECRET_KEY }
          : {}),
        ...(process.env.RECAPTCHA_MIN_SCORE
          ? { RECAPTCHA_MIN_SCORE: process.env.RECAPTCHA_MIN_SCORE }
          : {}),
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
