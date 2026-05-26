#!/usr/bin/env node
/**
 * ONRODA API load / stress runner (isolated — no production rides).
 *
 * Default: spawns local API without DATABASE_URL (in-memory) on ephemeral port.
 * Optional: LOAD_TEST_BASE_URL=https://… (staging only; never create prod rides).
 * Optional DB: LOAD_TEST_USE_API_ENV=1 reads artifacts/api-server/.env for DATABASE_URL
 *   + fleet credentials (LOAD_TEST_FLEET_EMAIL / LOAD_TEST_FLEET_PASSWORD).
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { readFile } from "node:fs/promises";

import { runHttpLoad } from "./lib/http-load.mjs";
import { runWsLoad } from "./lib/ws-load.mjs";
import { formatMsStats } from "./lib/metrics.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const apiRoot = path.join(repoRoot, "artifacts/api-server");
const reportDir = path.join(__dirname, "reports");
const reportPath = path.join(reportDir, `load-report-${new Date().toISOString().replace(/[:.]/g, "-")}.md`);

const PORT = Number(process.env.LOAD_TEST_PORT || "29876");
const AUTH_SECRET = process.env.LOAD_TEST_AUTH_JWT_SECRET || "load-test-jwt-secret-local-only";
const LOAD_TEST_ADMIN = process.env.LOAD_TEST_ADMIN_BEARER || "load-test-admin-bearer-local-only";

function parseEnvFile(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

async function waitForHealth(base, maxAttempts = 80) {
  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      const r = await fetch(`${base}/api/healthz`);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await delay(100);
  }
  throw new Error(`API not healthy at ${base}/api/healthz`);
}

async function sampleProcessStats(pid) {
  try {
    const { execSync } = await import("node:child_process");
    const out = execSync(`ps -o %cpu=,%mem=,rss= -p ${pid}`, { encoding: "utf8" }).trim();
    const [cpu, mem, rss] = out.split(/\s+/).map((x) => Number(x));
    return { cpuPercent: cpu, memPercent: mem, rssKb: rss };
  } catch {
    return null;
  }
}

async function createIsolatedRide(base, suffix) {
  const payload = {
    customerName: "Load Test",
    passengerId: `load-test-passenger-${suffix}`,
    from: "Teststraße 1",
    fromFull: "Teststraße 1, 70173 Stuttgart",
    fromLat: 48.7784,
    fromLon: 9.18,
    to: "Hauptbahnhof 1",
    toFull: "Hauptbahnhof 1, 70173 Stuttgart",
    toLat: 48.783,
    toLon: 9.181,
    status: "searching_driver",
    pricingMode: "taxi_tariff",
  };
  const res = await fetch(`${base}/api/rides`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`create ride failed ${res.status} ${JSON.stringify(body)}`);
  return body.id ?? body.ride?.id;
}

async function patchStatus(base, rideId, status, extra = {}, adminBearer = "") {
  const headers = { "Content-Type": "application/json" };
  if (adminBearer) headers.Authorization = `Bearer ${adminBearer}`;
  const res = await fetch(`${base}/api/rides/${rideId}/status`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status, ...extra }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function runRideLifecycleBurst(base, count = 30, adminBearer = "") {
  const results = { created: 0, transitions: 0, failures: 0, okChains: 0 };
  for (let i = 0; i < count; i += 1) {
    try {
      const id = await createIsolatedRide(base, `${Date.now()}-${i}`);
      results.created += 1;
      // Ohne Postgres/Fleet-Zeile scheitert `accepted` (ride_not_assignable). Admin: offered → expired (terminal).
      const chain = [{ status: "offered" }, { status: "expired" }];
      let chainOk = true;
      for (const step of chain) {
        const { status, driverId, finalFare, cancelReason } = step;
        const extra = {
          ...(driverId ? { driverId } : {}),
          ...(finalFare != null ? { finalFare } : {}),
          ...(cancelReason ? { cancelReason } : {}),
        };
        const r = await patchStatus(base, id, status, extra, adminBearer);
        results.transitions += 1;
        if (!r.ok) {
          results.failures += 1;
          chainOk = false;
          break;
        }
      }
      if (chainOk) results.okChains += 1;
    } catch {
      results.failures += 1;
    }
  }
  return results;
}

async function runParallelStatusOnRide(base, rideId, adminBearer, concurrency = 15, durationSec = 8) {
  return runHttpLoad({
    url: `${base}/api/rides/${rideId}/status`,
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminBearer}`,
    },
    body: JSON.stringify({ status: "expired" }),
    concurrency,
    durationSec,
    name: "PATCH /rides/:id/status (contention)",
    expectedStatus: 200,
  });
}

async function tryFleetMarketRides(base, env) {
  const email = (process.env.LOAD_TEST_FLEET_EMAIL ?? env.FLEET_TEST_EMAIL ?? env.LOAD_TEST_FLEET_EMAIL ?? "").trim();
  const password = (process.env.LOAD_TEST_FLEET_PASSWORD ?? env.FLEET_TEST_PASSWORD ?? "").trim();
  if (!email || !password) {
    return { skipped: true, reason: "LOAD_TEST_FLEET_EMAIL/PASSWORD not set" };
  }
  const loginRes = await fetch(`${base}/api/fleet-auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await loginRes.json().catch(() => ({}));
  if (!loginRes.ok) {
    return { skipped: true, reason: `fleet login ${loginRes.status}`, detail: loginBody };
  }
  const token = loginBody.token;
  if (!token) return { skipped: true, reason: "no fleet token" };

  const poll = await runHttpLoad({
    url: `${base}/api/fleet-driver/v1/market-rides`,
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    concurrency: 25,
    durationSec: 20,
    name: "GET /fleet-driver/v1/market-rides",
    expectedStatus: 200,
  });
  return { skipped: false, poll, tokenPreview: `${String(token).slice(0, 12)}…` };
}

async function tryAdminFinance(base, env) {
  const bearer = (process.env.LOAD_TEST_ADMIN_BEARER ?? env.ADMIN_API_BEARER_TOKEN ?? "").trim();
  if (!bearer) return { skipped: true, reason: "ADMIN_API_BEARER_TOKEN not set" };
  const summary = await runHttpLoad({
    url: `${base}/api/admin/finance/summary`,
    method: "GET",
    headers: { Authorization: `Bearer ${bearer}` },
    concurrency: 8,
    durationSec: 12,
    name: "GET /admin/finance/summary",
    expectedStatus: 200,
  });
  return { skipped: false, summary };
}

async function main() {
  mkdirSync(reportDir, { recursive: true });

  let base = (process.env.LOAD_TEST_BASE_URL ?? "").trim().replace(/\/$/, "");
  let proc = null;
  let env = {
    ...process.env,
    NODE_ENV: "development",
    AUTH_JWT_SECRET: AUTH_SECRET,
    FLEET_DRIVER_JWT_SECRET: process.env.FLEET_DRIVER_JWT_SECRET || AUTH_SECRET,
    ADMIN_API_BEARER_TOKEN: process.env.LOAD_TEST_ADMIN_BEARER || LOAD_TEST_ADMIN,
  };

  if (process.env.LOAD_TEST_USE_API_ENV === "1") {
    try {
      const dotenv = await readFile(path.join(apiRoot, ".env"), "utf8");
      Object.assign(env, parseEnvFile(dotenv));
    } catch {
      /* no .env */
    }
  }

  const spawnLocal = !base;
  if (spawnLocal) {
    if (process.env.LOAD_TEST_USE_API_ENV !== "1") {
      delete env.DATABASE_URL;
    }
    env.PORT = String(PORT);
    base = `http://127.0.0.1:${PORT}`;
    proc = spawn("node", ["--enable-source-maps", "dist/index.mjs"], {
      cwd: apiRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    await waitForHealth(base);
  } else {
    await waitForHealth(base);
  }

  const mode = env.DATABASE_URL ? "postgres" : "in-memory";
  const lines = [];
  lines.push("# ONRODA Load-Test Report");
  lines.push("");
  lines.push(`- **Zeit:** ${new Date().toISOString()}`);
  lines.push(`- **Ziel:** \`${base}\``);
  lines.push(`- **Modus:** ${mode} (keine produktiven Fahrten; isolierte \`load-test-*\` Passenger-IDs)`);
  lines.push("");

  const memBefore = proc ? await sampleProcessStats(proc.pid) : null;

  const health = await runHttpLoad({
    url: `${base}/api/healthz`,
    concurrency: 50,
    durationSec: 20,
    name: "GET /api/healthz",
  });
  const appConfig = await runHttpLoad({
    url: `${base}/api/app/config`,
    concurrency: 40,
    durationSec: 20,
    name: "GET /api/app/config",
  });

  lines.push("## HTTP Last (öffentlich)");
  lines.push("");
  for (const r of [health, appConfig]) {
    lines.push(`### ${r.name}`);
    lines.push(`- VUs: ${r.concurrency}, Dauer: ${r.durationSec}s`);
    lines.push(`- Requests: ${r.total} (~${r.rps.toFixed(1)} RPS)`);
    lines.push(`- Fehlerrate: ${r.errorRate.toFixed(2)}%`);
    lines.push(`- Status: ${JSON.stringify(r.statusCounts)}`);
    lines.push(formatMsStats("Latenz", r.stats));
  }

  lines.push("## Ride-Lifecycle (isoliert, In-Memory/DB)");
  const adminForSpawn = spawnLocal ? LOAD_TEST_ADMIN : (env.ADMIN_API_BEARER_TOKEN ?? "").trim();
  const lifecycle = await runRideLifecycleBurst(
    base,
    Number(process.env.LOAD_TEST_RIDE_COUNT || "40"),
    adminForSpawn,
  );
  lines.push(
    `- Erstellt: ${lifecycle.created}, vollständige Ketten: ${lifecycle.okChains}, Übergänge: ${lifecycle.transitions}, Fehlschläge: ${lifecycle.failures}`,
  );
  lines.push("");

  let contentionRideId = null;
  try {
    contentionRideId = await createIsolatedRide(base, "contention");
    await patchStatus(base, contentionRideId, "offered", {}, adminForSpawn);
  } catch (e) {
    lines.push(`- Contention-Ride Setup fehlgeschlagen: ${String(e)}`);
  }
  if (contentionRideId && adminForSpawn) {
    const contention = await runParallelStatusOnRide(base, contentionRideId, adminForSpawn, 20, 10);
    lines.push("## Parallele Status-Patches (Race-/Lock-Indikator)");
    lines.push(`- Fehlerrate: ${contention.errorRate.toFixed(2)}%`);
    lines.push(`- Status-Verteilung: ${JSON.stringify(contention.statusCounts)}`);
    lines.push(formatMsStats("PATCH Latenz", contention.stats));
  }

  const fleet = await tryFleetMarketRides(base, env);
  lines.push("## Dispatch / Markt (Fahrer-Poll)");
  if (fleet.skipped) {
    lines.push(`- **Übersprungen:** ${fleet.reason}`);
    if (fleet.detail) lines.push(`- Detail: \`${JSON.stringify(fleet.detail)}\``);
  } else {
    lines.push(`- Token: ${fleet.tokenPreview}`);
    const r = fleet.poll;
    lines.push(`- Fehlerrate: ${r.errorRate.toFixed(2)}%, RPS: ${r.rps.toFixed(1)}`);
    lines.push(formatMsStats("market-rides Latenz", r.stats));
  }
  lines.push("");

  const finance = await tryAdminFinance(base, env);
  lines.push("## Finance / Snapshot (Admin)");
  if (finance.skipped) {
    lines.push(`- **Übersprungen:** ${finance.reason}`);
  } else {
    const r = finance.summary;
    lines.push(`- Fehlerrate: ${r.errorRate.toFixed(2)}%, RPS: ${r.rps.toFixed(1)}`);
    lines.push(formatMsStats("finance/summary Latenz", r.stats));
  }
  lines.push("");

  lines.push("## WebSocket (/ws)");
  if (mode === "in-memory") {
    lines.push("- **Hinweis:** WS-Join braucht gültiges Ride + Session-JWT; im reinen In-Memory-Modus eingeschränkt.");
  }
  try {
    const rideId = await createIsolatedRide(base, "ws");
    const wsResult = await runWsLoad({
      wsBase: base,
      rideId,
      token: "invalid-for-load-test",
      connections: Number(process.env.LOAD_TEST_WS_CONNECTIONS || "30"),
      messagesPerConn: 3,
    });
    lines.push(`- Verbindungen: ${wsResult.connections}`);
    if (wsResult.skipped) {
      lines.push(`- **Übersprungen:** ${wsResult.reason}`);
    } else {
      lines.push(`- Join OK/Fail: ${wsResult.joinOk}/${wsResult.joinFail}`);
      lines.push(`- Beispiel-Fehler: ${wsResult.sampleErrors.join("; ") || "—"}`);
    }
    await patchStatus(base, rideId, "cancelled_by_system", { cancelReason: "load_test_cleanup" });
  } catch (e) {
    lines.push(`- WS-Lauf Fehler: ${String(e)}`);
  }
  lines.push("");

  const memAfter = proc ? await sampleProcessStats(proc.pid) : null;
  lines.push("## Prozess (API-Node, lokal gespawnt)");
  if (memBefore && memAfter) {
    lines.push(`- CPU %: ${memBefore.cpuPercent} → ${memAfter.cpuPercent}`);
    lines.push(`- RAM %: ${memBefore.memPercent} → ${memAfter.memPercent}`);
    lines.push(`- RSS KB: ${memBefore.rssKb} → ${memAfter.rssKb}`);
  } else {
    lines.push("- Nicht gemessen (externes Ziel oder kein Child-Prozess).");
  }
  lines.push("");

  lines.push("## Architektur-Hinweise (Code-Review, statisch)");
  lines.push("");
  lines.push("1. **`GET /fleet-driver/v1/market-rides`** ruft `listRides()` → volles `SELECT * FROM rides` pro Poll — skaliert O(N) mit Gesamtfahrten.");
  lines.push("2. **Fahrer-Poll ~2,5 s** × aktive Fahrer → multipliziert DB-Last; fehlender Index/Filter auf offene Sofortfahrten.");
  lines.push("3. **`PATCH /rides/:id/status`** triggert Finance-Snapshot (`upsertRideFinancialSnapshot`) bei Cancel/Complete — teure Transaktion unter Last.");
  lines.push("4. **WebSocket-Hub** in-process (`ws` auf gleichem Node-Prozess) — keine horizontale WS-Skalierung ohne Sticky Sessions/Redis.");
  lines.push("5. **PM2 Single-Instance** (typisch `onroda-api`) — CPU-bound Express + WS auf einem Kern.");
  lines.push("6. **Nginx** TLS + Proxy ist selten der erste Engpass; Upstream-Timeouts bei langen DB-Queries relevanter.");
  lines.push("");

  lines.push("## Kapazitätsschätzung (grobe Orientierung)");
  lines.push("");
  lines.push("| Szenario | In-Memory lokal | Mit PostgreSQL (typisch) |");
  lines.push("|----------|-----------------|---------------------------|");
  lines.push(`| healthz RPS | ~${health.rps.toFixed(0)} | 500–2000+ (wenn Nginx/DB idle) |`);
  lines.push(`| app/config RPS | ~${appConfig.rps.toFixed(0)} | 50–300 (DB-Config-Read) |`);
  lines.push("| gleichzeitige Fahrer (Markt-Poll) | n/a ohne DB | **~30–80** bei 10k rides Tabelle ohne Query-Optimierung; **200+** mit Filter+Index |");
  lines.push("| gleichzeitige Kunden (aktive Fahrt) | — | WS + Status-PATCH: **~100–300** auf 1× API-Instanz |");
  lines.push("");
  lines.push("**Zuerst limitierend:** PostgreSQL (volle `listRides`), danach Node-Event-Loop, dann WS-Rooms im RAM.");
  lines.push("");

  lines.push("## Optimierungen (Priorität)");
  lines.push("");
  lines.push("| P | Maßnahme |");
  lines.push("|---|----------|");
  lines.push("| P0 | Markt-Query: nur offene Sofortfahrten + Mandant/Status-Index, **kein** Full-Table-Scan |");
  lines.push("| P0 | `listRidesForDriverMarket(companyId, capability)` statt `listRides()` |");
  lines.push("| P1 | Finance-Snapshot async/Queue bei Status-Wechseln |");
  lines.push("| P1 | Connection-Pool-Tuning + `pg_stat_statements` auf Prod-Staging |");
  lines.push("| P2 | WS: Redis Pub/Sub + zweite Instanz / Sticky Load Balancer |");
  lines.push("| P2 | Read-Replica für Markt-Poll + Admin-Reports |");
  lines.push("| P3 | CDN/Cache für `/app/config` (bereits Cache-Control 30s) |");
  lines.push("");

  writeFileSync(reportPath, lines.join("\n"), "utf8");
  console.log(`Report: ${reportPath}`);
  console.log(lines.join("\n"));

  if (proc) {
    proc.kill("SIGTERM");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
