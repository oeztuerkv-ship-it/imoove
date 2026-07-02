#!/usr/bin/env node
/**
 * Simuliert GET /fleet-driver/v1/me für einen Fahrer ohne Klartext-Passwort:
 * lädt session_version aus DB, mintet Fleet-JWT, ruft die API auf.
 *
 * Auf dem Produktionsserver (nach git pull):
 *   cd /root/imoove
 *   node scripts/simulate-fleet-driver-me.mjs fd-d0ee8672-2c31-4732-b8c2-9324e5d85941
 *
 * Optional: FLEET_ME_API_BASE=https://api.onroda.de/api (Default: http://127.0.0.1:3000/api)
 */
import pg from "../artifacts/api-server/node_modules/pg/lib/index.js";
import { SignJWT } from "../artifacts/api-server/node_modules/jose/dist/webapi/index.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvFromFile(rel) {
  const p = resolve(root, rel);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvFromFile("artifacts/api-server/.env");

const driverArg = (process.argv[2] ?? "").trim();
if (!driverArg) {
  console.error("Usage: node scripts/simulate-fleet-driver-me.mjs <fleet_driver_id|email>");
  process.exit(2);
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("FEHLT: DATABASE_URL (z. B. artifacts/api-server/.env auf dem Server).");
  process.exit(2);
}

function fleetJwtSecret() {
  const fleet = (process.env.FLEET_DRIVER_JWT_SECRET ?? "").trim();
  if (fleet) return fleet;
  const panel = (process.env.PANEL_JWT_SECRET ?? "").trim();
  if (panel) return panel;
  const auth = (process.env.AUTH_JWT_SECRET ?? "").trim();
  if (auth) return auth;
  return "";
}

const secret = fleetJwtSecret();
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

const token = await new SignJWT({
  kind: "fleet_driver",
  companyId: driver.company_id,
  email: driver.email,
  sv: Number(driver.session_version) || 1,
})
  .setProtectedHeader({ alg: "HS256" })
  .setSubject(driver.id)
  .setIssuedAt()
  .setIssuer(issuer)
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(secret));

console.log("=== DB snapshot ===");
console.log(
  JSON.stringify(
    {
      driver: {
        id: driver.id,
        email: driver.email,
        companyId: driver.company_id,
        sessionVersion: driver.session_version,
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
    console.log(
      JSON.stringify(
        {
          ok: j.ok,
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
      console.log("\n→ API sagt einsatzbereit. App-Blockade dann eher Client (/me nicht gemerged oder alter Build).");
    } else if (meStatus === 200 && j.ok === true && j.einsatzbereit !== true) {
      console.log("\n→ API blockiert. blockReasons prüfen (oben unter readiness).");
    } else if (meStatus !== 200) {
      console.log("\n→ /me schlägt fehl — Mobile-Login setzt einsatzbereit:false wenn /me nicht ok (siehe DriverContext).");
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
