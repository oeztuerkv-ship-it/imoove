#!/usr/bin/env node
/**
 * Simuliert GET /fleet-driver/v1/me für einen Fahrer ohne Klartext-Passwort:
 * lädt session_version aus DB, mintet Fleet-JWT, prüft lokal, ruft die API auf.
 *
 * Auf dem Produktionsserver (nach git pull):
 *   cd /root/imoove
 *   node scripts/simulate-fleet-driver-me.mjs fd-d0ee8672-2c31-4732-b8c2-9324e5d85941
 *
 * Optional: FLEET_ME_API_BASE=https://api.onroda.de/api (Default: http://127.0.0.1:3000/api)
 */
import pg from "../artifacts/api-server/node_modules/pg/lib/index.js";
import { SignJWT, jwtVerify } from "../artifacts/api-server/node_modules/jose/dist/webapi/index.js";
import { config as dotenvConfig } from "../artifacts/api-server/node_modules/dotenv/lib/main.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

/** Gleiche Reihenfolge wie artifacts/api-server/src/loadEnv.ts */
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

const driverArg = (process.argv[2] ?? "").trim();
if (!driverArg) {
  console.error("Usage: node scripts/simulate-fleet-driver-me.mjs <fleet_driver_id|email>");
  process.exit(2);
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("FEHLT: DATABASE_URL (z. B. in artifacts/api-server/.env auf dem Server).");
  process.exit(2);
}

function resolveFleetJwtSecretMeta() {
  const fleet = (process.env.FLEET_DRIVER_JWT_SECRET ?? "").trim();
  if (fleet) return { secret: fleet, source: "FLEET_DRIVER_JWT_SECRET" };
  const panel = (process.env.PANEL_JWT_SECRET ?? "").trim();
  if (panel) return { secret: panel, source: "PANEL_JWT_SECRET" };
  const auth = (process.env.AUTH_JWT_SECRET ?? "").trim();
  if (auth) return { secret: auth, source: "AUTH_JWT_SECRET" };
  return { secret: "", source: "" };
}

const { secret, source: secretSource } = resolveFleetJwtSecretMeta();
if (!secret) {
  console.error("FEHLT: FLEET_DRIVER_JWT_SECRET oder PANEL_JWT_SECRET in API-.env.");
  process.exit(2);
}

const issuer =
  (process.env.FLEET_DRIVER_JWT_ISSUER ?? "onroda-fleet-driver").trim() || "onroda-fleet-driver";
const apiBase = (process.env.FLEET_ME_API_BASE ?? "http://127.0.0.1:3000/api").replace(/\/+$/, "");

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

const byEmail = driverArg.includes("@");
const driverRes = await client.query(
  byEmail
    ? `SELECT id, company_id, email, session_version, is_active, access_status, approval_status,
              readiness_override_system, reservation_suspended_until, dispatch_priority
       FROM fleet_drivers WHERE lower(trim(email)) = lower(trim($1)) LIMIT 1`
    : `SELECT id, company_id, email, session_version, is_active, access_status, approval_status,
              readiness_override_system, reservation_suspended_until, dispatch_priority
       FROM fleet_drivers WHERE id = $1 LIMIT 1`,
  [driverArg],
);

const driver = driverRes.rows[0];
if (!driver) {
  console.error("Fahrer nicht gefunden:", driverArg);
  await client.end();
  process.exit(1);
}

const companyRes = await client.query(
  `SELECT id, name, company_kind, is_active, is_blocked, panel_access_enabled,
          contract_status, onboarding_status,
          NULLIF(trim(concession_number), '') IS NOT NULL AS concession_present
   FROM admin_companies WHERE id = $1`,
  [driver.company_id],
);
const company = companyRes.rows[0];

const cancelRes = await client.query(
  `SELECT suspended_until, reason FROM fleet_driver_cancellation_suspension
   WHERE fleet_driver_id = $1 AND lifted_at IS NULL AND suspended_until > now()
   ORDER BY suspended_until DESC LIMIT 1`,
  [driver.id],
);

await client.end();

const sessionVersion = Math.floor(Number(driver.session_version) || 1);

const token = await new SignJWT({
  kind: "fleet_driver",
  companyId: driver.company_id,
  email: driver.email,
  sv: sessionVersion,
})
  .setProtectedHeader({ alg: "HS256" })
  .setSubject(driver.id)
  .setIssuedAt()
  .setIssuer(issuer)
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(secret));

console.log("=== JWT mint ===");
console.log(
  JSON.stringify(
    {
      secretSource,
      issuer,
      sessionVersion,
      sessionVersionDbRaw: driver.session_version,
      sessionVersionDbType: typeof driver.session_version,
    },
    null,
    2,
  ),
);

try {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    issuer,
    algorithms: ["HS256"],
  });
  console.log("Lokale jwtVerify: OK", {
    sub: payload.sub,
    companyId: payload.companyId,
    sv: payload.sv,
    kind: payload.kind,
  });
} catch (e) {
  console.error("Lokale jwtVerify: FEHLGESCHLAGEN", e instanceof Error ? e.message : e);
}

console.log("\n=== DB snapshot ===");
console.log(
  JSON.stringify(
    {
      driver: {
        id: driver.id,
        email: driver.email,
        companyId: driver.company_id,
        sessionVersion,
        isActive: driver.is_active,
        accessStatus: driver.access_status,
        approvalStatus: driver.approval_status,
        readinessOverrideSystem: driver.readiness_override_system,
        reservationSuspendedUntil: driver.reservation_suspended_until,
        dispatchPriority: driver.dispatch_priority,
      },
      company: company ?? null,
      activeCancellationSuspension: cancelRes.rows[0] ?? null,
    },
    null,
    2,
  ),
);

const meUrl = `${apiBase}/fleet-driver/v1/me`;
console.log("\n=== GET", meUrl, "===");
let meStatus = 0;
let meText = "";
try {
  const res = await fetch(meUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  meStatus = res.status;
  meText = await res.text();
  console.log("HTTP", meStatus);
  try {
    const j = JSON.parse(meText);
    console.log("Response body:", JSON.stringify(j, null, 2));
    console.log(
      JSON.stringify(
        {
          ok: j.ok,
          error: j.error ?? null,
          hint: j.hint ?? null,
          einsatzbereit: j.einsatzbereit,
          einsatzbereitType: typeof j.einsatzbereit,
          blockBannerTitle: j.blockBannerTitle,
          notFreigegebenMessage: j.notFreigegebenMessage,
          driverBlockKind: j.driverBlockKind,
          readiness: j.readiness,
          cancellationSuspension: j.cancellationSuspension,
          driver: j.driver
            ? {
                id: j.driver.id,
                approvalStatus: j.driver.approvalStatus,
                accessStatus: j.driver.accessStatus,
              }
            : null,
        },
        null,
        2,
      ),
    );
    if (meStatus === 200 && j.ok === true && j.einsatzbereit === true) {
      console.log("\n→ API sagt einsatzbereit.");
    } else if (meStatus === 200 && j.ok === true && j.einsatzbereit !== true) {
      console.log("\n→ API blockiert laut readiness (kein Auth-Problem).");
    } else if (meStatus === 401) {
      console.log(
        "\n→ Auth-Fehler auf /me:",
        j.error ?? "unbekannt",
        "— häufig: JWT-Secret/Issuer der laufenden API ≠ mint-Secret (loadEnv/PM2), oder token_revoked.",
      );
    } else if (meStatus !== 200) {
      console.log("\n→ /me schlägt fehl — Mobile-Login bleibt bei einsatzbereit:false (DriverContext).");
    }
  } catch {
    console.log(meText.slice(0, 800));
  }
} catch (e) {
  console.error("Fetch fehlgeschlagen:", e instanceof Error ? e.message : e);
  process.exit(1);
}

if (meStatus >= 500) {
  process.exit(1);
}
