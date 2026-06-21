#!/usr/bin/env node
/**
 * Stripe-Capture für abgeschlossene Fahrt erneut anstoßen (Operator/SSH).
 *
 * Modus HTTP (Default — API muss laufen, z. B. nach Deploy auf dem Server):
 *   ADMIN_API_BEARER_TOKEN=… node scripts/retry-ride-payment-capture.mjs REQ-1782054245360
 *   # optional: ONRODA_API_BASE=http://127.0.0.1:3000/api
 *
 * Modus direkt (DB + Stripe, kein HTTP):
 *   node scripts/retry-ride-payment-capture.mjs --direct REQ-1782054245360
 *   # cd artifacts/api-server && pnpm run build vorher, .env im api-server-Ordner
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = path.join(root, "artifacts", "api-server");

function usage() {
  console.error(`Usage:
  node scripts/retry-ride-payment-capture.mjs [--direct] <rideId>

Examples:
  ADMIN_API_BEARER_TOKEN=… node scripts/retry-ride-payment-capture.mjs REQ-1782054245360
  node scripts/retry-ride-payment-capture.mjs --direct REQ-1782054245360`);
  process.exit(1);
}

const args = process.argv.slice(2);
const direct = args[0] === "--direct";
const rideId = (direct ? args[1] : args[0])?.trim();
if (!rideId) usage();

async function viaHttp() {
  const base = (process.env.ONRODA_API_BASE ?? "http://127.0.0.1:3000/api").replace(/\/$/, "");
  const token = (process.env.ADMIN_API_BEARER_TOKEN ?? "").trim();
  if (!token) {
    console.error("ADMIN_API_BEARER_TOKEN fehlt — setzen oder --direct nutzen.");
    process.exit(1);
  }
  const url = `${base}/admin/payments/rides/${encodeURIComponent(rideId)}/capture-retry`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const body = await res.json().catch(() => ({}));
  console.log(JSON.stringify(body, null, 2));
  if (!res.ok) process.exit(1);
}

function viaDirect() {
  const build = spawnSync("pnpm", ["run", "build"], { cwd: apiRoot, stdio: "inherit", env: process.env });
  if (build.status !== 0) process.exit(build.status ?? 1);
  const run = spawnSync(
    "node",
    ["--enable-source-maps", "./dist/scripts/retryRidePaymentCapture.mjs", rideId],
    { cwd: apiRoot, stdio: "inherit", env: process.env },
  );
  process.exit(run.status ?? 1);
}

if (direct) {
  viaDirect();
} else {
  await viaHttp();
}
