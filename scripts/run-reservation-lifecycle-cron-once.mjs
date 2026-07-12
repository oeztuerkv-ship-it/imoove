#!/usr/bin/env node
/**
 * Führt einen Reservierungs-Lifecycle-Cron-Lauf manuell aus (Job 1–4, 6–10).
 * Nutzung auf dem Server nach API-Build:
 *
 *   cd /root/imoove
 *   node scripts/run-reservation-lifecycle-cron-once.mjs
 *
 * Optional vorher: node scripts/check-partner-reservation-dispatch.mjs --ride-id <REQ-…>
 */
import { config as dotenvConfig } from "../artifacts/api-server/node_modules/dotenv/lib/main.js";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadOnrodaApiEnv() {
  const apiServerEnv = resolve(root, "artifacts/api-server/.env");
  const cwdEnv = resolve(process.cwd(), ".env");
  const loaded = new Set();
  for (const envPath of [apiServerEnv, cwdEnv]) {
    if (!existsSync(envPath)) continue;
    const resolved = resolve(envPath);
    if (loaded.has(resolved)) continue;
    loaded.add(resolved);
    dotenvConfig({ path: resolved, override: false });
  }
}

loadOnrodaApiEnv();

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("FEHLT: DATABASE_URL (artifacts/api-server/.env auf dem Server).");
  process.exit(2);
}

const cronDist = resolve(root, "artifacts/api-server/dist/jobs/reservationLifecycleCron.js");
if (!existsSync(cronDist)) {
  console.error(
    "FEHLT: API-dist — zuerst bauen: pnpm --filter @workspace/api-server run build",
  );
  console.error("Erwartet:", cronDist);
  process.exit(2);
}

const mod = await import(pathToFileURL(cronDist).href);
const run = mod.runReservationLifecycleCron;
if (typeof run !== "function") {
  console.error("runReservationLifecycleCron nicht in dist gefunden.");
  process.exit(2);
}

console.log("=== runReservationLifecycleCron (einmalig) ===");
const result = await run(new Date());
console.log(JSON.stringify(result, null, 2));

if (!result) {
  console.error("Cron lieferte null — DATABASE_URL/PostgreSQL nicht konfiguriert?");
  process.exit(1);
}

if (result.promoted > 0) {
  console.log(
    `\n→ ${result.promoted} Reservierung(en) im T−30-Fenster promoted (searching_driver / ready_for_dispatch).`,
  );
} else {
  console.log("\n→ promoted=0 (keine Fahrt im 30-Min-Aktivierungsfenster oder schon promoted).");
}
