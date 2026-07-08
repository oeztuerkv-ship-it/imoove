#!/usr/bin/env node
/**
 * Diagnose: GET /fleet-driver/v1/scheduled-rides für einen Fahrer (wie simulate-fleet-driver-me.mjs).
 * Optional: eine konkrete Reservierung (--ride-id) gegen DB + API-Filter prüfen.
 *
 * Auf dem Produktionsserver (nach git pull):
 *   cd /root/imoove
 *   node scripts/simulate-fleet-driver-scheduled-rides.mjs fd-d0ee8672-2c31-4732-b8c2-9324e5d85941 \
 *     --ride-id REQ-51955ff3-202d-4361-9bfc-3d9c631c7dee
 *
 * Optional: FLEET_ME_API_BASE=https://api.onroda.de/api (Default: http://127.0.0.1:3000/api)
 */
import pg from "../artifacts/api-server/node_modules/pg/lib/index.js";
import { SignJWT } from "../artifacts/api-server/node_modules/jose/dist/webapi/index.js";
import { config as dotenvConfig } from "../artifacts/api-server/node_modules/dotenv/lib/main.js";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

function parseArgs(argv) {
  const driverArg = (argv[2] ?? "").trim();
  const rideIdx = argv.indexOf("--ride-id");
  const rideId = rideIdx >= 0 ? (argv[rideIdx + 1] ?? "").trim() : "";
  return { driverArg, rideId };
}

const { driverArg, rideId } = parseArgs(process.argv);
if (!driverArg) {
  console.error(
    "Usage: node scripts/simulate-fleet-driver-scheduled-rides.mjs <fleet_driver_id> [--ride-id <ride_id>]",
  );
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

function normalizeDispatchPriority(raw) {
  const t = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (t === "A" || t === "B" || t === "C") return t;
  return "C";
}

function driverMatchesDispatchTier(driverPriority, rideTier) {
  return driverPriority === rideTier;
}

function requiredLegalTypeForRide(ride) {
  const mode = String(ride.pricing_mode ?? "").trim().toLowerCase();
  if (mode === "fixed_price") return "taxi";
  return "taxi";
}

function isRideCompatibleWithCapability(ride, capability) {
  const requiredLegalType = requiredLegalTypeForRide(ride);
  let normalizedLegalType = capability.vehicleLegalType;
  if (normalizedLegalType === "rental_car") normalizedLegalType = "taxi";
  if (!normalizedLegalType || normalizedLegalType !== requiredLegalType) {
    return { ok: false, reason: `Fahrzeugtyp ${capability.vehicleLegalType ?? "?"} ≠ Ride ${requiredLegalType}` };
  }
  return { ok: true };
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

const driverRes = await client.query(
  `SELECT id, company_id, email, session_version, dispatch_priority, is_active, access_status, approval_status
   FROM fleet_drivers WHERE id = $1 LIMIT 1`,
  [driverArg],
);
const driver = driverRes.rows[0];
if (!driver) {
  console.error("Fahrer nicht gefunden:", driverArg);
  await client.end();
  process.exit(1);
}

const capabilityRes = await client.query(
  `SELECT fv.vehicle_legal_type, fv.vehicle_class, fv.approval_status, fv.is_active
   FROM driver_vehicle_assignments dva
   INNER JOIN fleet_vehicles fv ON fv.id = dva.vehicle_id
   WHERE dva.driver_id = $1 AND dva.company_id = $2
   ORDER BY dva.assigned_at DESC
   LIMIT 1`,
  [driver.id, driver.company_id],
);
const capabilityRow = capabilityRes.rows[0];
const capability = capabilityRow
  ? {
      vehicleLegalType: capabilityRow.vehicle_legal_type,
      vehicleClass: capabilityRow.vehicle_class,
      approvalStatus: capabilityRow.approval_status,
      isActive: capabilityRow.is_active,
    }
  : null;

let targetRide = null;
if (rideId) {
  const rideRes = await client.query(
    `SELECT id, status, scheduled_at, company_id, driver_id, dispatch_tier, dispatch_tier_started_at,
            pricing_mode, ride_kind, rejected_by, vehicle_class, payer_kind
     FROM rides WHERE id = $1`,
    [rideId],
  );
  targetRide = rideRes.rows[0] ?? null;
}

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
console.log(JSON.stringify({ secretSource, issuer, driverId: driver.id, companyId: driver.company_id }, null, 2));

if (targetRide) {
  const mins =
    targetRide.scheduled_at != null
      ? Math.round((new Date(targetRide.scheduled_at).getTime() - Date.now()) / 60_000)
      : null;
  console.log("\n=== DB ride (Ziel) ===");
  console.log(
    JSON.stringify(
      {
        id: targetRide.id,
        status: targetRide.status,
        scheduledAt: targetRide.scheduled_at,
        minutesUntilPickup: mins,
        companyId: targetRide.company_id,
        driverId: targetRide.driver_id,
        dispatchTier: targetRide.dispatch_tier,
        rideKind: targetRide.ride_kind,
        pricingMode: targetRide.pricing_mode,
        rejectedBy: targetRide.rejected_by,
      },
      null,
      2,
    ),
  );
}

console.log("\n=== Fahrzeug-Capability (DB) ===");
console.log(
  JSON.stringify(
    capability
      ? capability
      : { message: "Keine Fahrzeugzuweisung — API liefert rides:[]" },
    null,
    2,
  ),
);

const driverPriority = normalizeDispatchPriority(driver.dispatch_priority);

function simulateRideFilter(ride, fleetDriverId, companyId) {
  const steps = [];
  const fail = (step, detail) => {
    steps.push({ step, pass: false, detail });
    return { included: false, steps };
  };
  const pass = (step, detail) => steps.push({ step, pass: true, detail });

  const status = ride.status;
  if (status !== "scheduled" && status !== "scheduled_assigned") {
    return fail("status", `status=${status} (nur scheduled|scheduled_assigned)`);
  }
  pass("status", status);

  if (status === "scheduled" && ride.scheduled_at) {
    const scheduledMs = new Date(ride.scheduled_at).getTime();
    if (Number.isFinite(scheduledMs) && scheduledMs < Date.now()) {
      return fail("scheduled_in_past", `scheduled_at in der Vergangenheit`);
    }
  }
  pass("scheduled_future", ride.scheduled_at);

  if (ride.company_id && ride.company_id !== companyId) {
    return fail("company_id", `ride.company_id=${ride.company_id} ≠ driver ${companyId}`);
  }
  pass("company_id", ride.company_id ?? "(leer, ok)");

  const assignedDriverId = typeof ride.driver_id === "string" ? ride.driver_id.trim() : "";
  const isAssignedToThisDriver = assignedDriverId === fleetDriverId;
  const isAssignedToOtherDriver = assignedDriverId.length > 0 && !isAssignedToThisDriver;
  if (isAssignedToOtherDriver) {
    return fail("driver_assignment", `zugewiesen an anderen Fahrer: ${assignedDriverId}`);
  }
  pass("driver_assignment", assignedDriverId || "(offen)");

  const rejectedBy = Array.isArray(ride.rejected_by) ? ride.rejected_by : [];
  if (rejectedBy.includes(fleetDriverId)) {
    return fail("rejected_by", "Fahrer hat abgelehnt");
  }
  pass("rejected_by", "nein");

  if (ride.ride_kind === "medical") {
    steps.push({
      step: "medical",
      pass: null,
      detail: "KK-Modul/Autorisierung — nur in API geprüft, hier nicht nachgebaut",
    });
  }

  if (!capability?.vehicle_legal_type) {
    return fail("capability", "kein freigegebenes Fahrzeug");
  }
  const compat = isRideCompatibleWithCapability(
    { pricing_mode: ride.pricing_mode },
    { vehicleLegalType: capability.vehicle_legal_type },
  );
  if (!compat.ok) return fail("vehicle_compat", compat.reason);
  pass("vehicle_compat", capability.vehicle_legal_type);

  if (status === "scheduled_assigned" && isAssignedToThisDriver) {
    pass("dispatch_tier", "scheduled_assigned an diesen Fahrer — Tier-Filter übersprungen");
    return { included: true, steps };
  }
  if (status === "scheduled" && !assignedDriverId) {
    const rideTier = normalizeDispatchPriority(ride.dispatch_tier ?? "A");
    if (!driverMatchesDispatchTier(driverPriority, rideTier)) {
      return fail(
        "dispatch_tier",
        `Fahrer-Priorität ${driverPriority} ≠ Ride-Tier ${rideTier} (offene Reservierung)`,
      );
    }
    pass("dispatch_tier", `${driverPriority} = ${rideTier}`);
    return { included: true, steps };
  }

  return fail("tier_branch", `unerwarteter Zweig status=${status} driver_id=${assignedDriverId || "null"}`);
}

if (targetRide) {
  console.log("\n=== Filter-Simulation (wie fleetDriverApi scheduled-rides) ===");
  const sim = simulateRideFilter(targetRide, driver.id, driver.company_id);
  for (const s of sim.steps) {
    const mark = s.pass === true ? "✓" : s.pass === false ? "✗" : "?";
    console.log(`  ${mark} ${s.step}: ${s.detail}`);
  }
  console.log(`→ Würde in API-Pool: ${sim.included ? "JA" : "NEIN"}`);
}

const schedUrl = `${apiBase}/fleet-driver/v1/scheduled-rides`;
const meUrl = `${apiBase}/fleet-driver/v1/me`;
const headers = { Authorization: `Bearer ${token}` };

console.log("\n=== GET", meUrl, "===");
let meJson = null;
try {
  const res = await fetch(meUrl, { headers });
  const text = await res.text();
  console.log("HTTP", res.status);
  try {
    meJson = JSON.parse(text);
    console.log(
      JSON.stringify(
        {
          ok: meJson.ok,
          einsatzbereit: meJson.einsatzbereit,
          error: meJson.error ?? null,
          readinessReady: meJson.readiness?.ready ?? null,
        },
        null,
        2,
      ),
    );
  } catch {
    console.log(text.slice(0, 500));
  }
} catch (e) {
  console.error("Fetch /me fehlgeschlagen:", e instanceof Error ? e.message : e);
}

console.log("\n=== GET", schedUrl, "===");
let schedJson = null;
try {
  const res = await fetch(schedUrl, { headers, cache: "no-store" });
  const text = await res.text();
  console.log("HTTP", res.status);
  try {
    schedJson = JSON.parse(text);
    const rides = Array.isArray(schedJson.rides) ? schedJson.rides : [];
    console.log(
      JSON.stringify(
        {
          ok: schedJson.ok,
          einsatzbereit: schedJson.einsatzbereit,
          rideCount: rides.length,
          message: schedJson.message ?? null,
          readiness: schedJson.readiness ? { ready: schedJson.readiness.ready } : undefined,
        },
        null,
        2,
      ),
    );
    if (rides.length > 0) {
      console.log(
        "Ride-IDs:",
        rides.map((r) => `${r.id} (${r.status}${r.scheduledAt ? ` @ ${r.scheduledAt}` : ""})`).join("\n  "),
      );
    }
    if (rideId) {
      const found = rides.find((r) => r.id === rideId);
      console.log(
        `\n→ Ziel-Reservierung ${rideId} in API-Antwort: ${found ? "JA" : "NEIN"}`,
      );
      if (found) {
        console.log("  ", JSON.stringify({ id: found.id, status: found.status, scheduledAt: found.scheduledAt, driverId: found.driverId }, null, 2));
      } else if (schedJson.einsatzbereit === false) {
        console.log("  Grund: einsatzbereit=false — API liefert absichtlich rides:[]");
      } else if (targetRide) {
        console.log("  Siehe Filter-Simulation oben (DB) vs. tatsächliche API-Antwort.");
      }
    }
  } catch {
    console.log(text.slice(0, 800));
  }
} catch (e) {
  console.error("Fetch scheduled-rides fehlgeschlagen:", e instanceof Error ? e.message : e);
  process.exit(1);
}

console.log("\n=== Mobile-Hinweis ===");
console.log(
  "UI: /driver/dashboard → Tab „Aufträge“ → „Anfragen“ (status=scheduled) oder „Angenommene“ (scheduled_assigned).",
);
console.log(
  "Poll: RideRequestContext fetchDriverMarket → GET /fleet-driver/v1/scheduled-rides (parallel zu market-rides).",
);

if (rideId && schedJson?.ok && Array.isArray(schedJson.rides) && !schedJson.rides.some((r) => r.id === rideId)) {
  process.exit(1);
}
