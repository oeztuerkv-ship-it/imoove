#!/usr/bin/env node
/**
 * Diagnose: Partner-Reservierungen und Dispatch-Lifecycle-Status.
 *
 * Nutzung (lokal oder auf dem Server mit DATABASE_URL):
 *   DATABASE_URL=postgres://... node scripts/check-partner-reservation-dispatch.mjs
 *   DATABASE_URL=... node scripts/check-partner-reservation-dispatch.mjs --ride-id <uuid>
 */
import pg from "pg";

const { Client } = pg;

const ACTIVATION_WINDOW_MIN = 30;
const CANCEL_NO_DRIVER_MIN = 10;
const EXPIRE_BUFFER_MIN = 45;

function parseArgs(argv) {
  const rideIdIdx = argv.indexOf("--ride-id");
  const rideId = rideIdIdx >= 0 ? (argv[rideIdIdx + 1] ?? "").trim() : "";
  const limitIdx = argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? Math.max(1, Number(argv[limitIdx + 1]) || 20) : 20;
  return { rideId, limit };
}

function fmtTs(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function minutesUntilPickup(scheduledAt, now) {
  if (!scheduledAt) return null;
  const pickup = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
  return Math.round((pickup.getTime() - now.getTime()) / 60_000);
}

function expectedNextStep(row, now) {
  const mins = minutesUntilPickup(row.scheduled_at, now);
  const status = row.status;

  if (status === "scheduled") {
    if (mins == null) return "scheduled_at fehlt";
    if (mins <= 0) return "sollte → expired (Job 3b)";
    if (mins <= CANCEL_NO_DRIVER_MIN && !row.driver_id) {
      return `sollte → cancelled_by_system (Job 1, ≤${CANCEL_NO_DRIVER_MIN} min)`;
    }
    if (mins <= ACTIVATION_WINDOW_MIN && !row.driver_id) {
      return `sollte → searching_driver (Job 4, ≤${ACTIVATION_WINDOW_MIN} min)`;
    }
    return `wartet auf Job 4 (T−${ACTIVATION_WINDOW_MIN} min) + Planer-Pool (/scheduled-rides)`;
  }

  if (status === "scheduled_assigned") {
    if (mins == null) return "scheduled_at fehlt";
    if (mins <= -EXPIRE_BUFFER_MIN) {
      return `sollte → expired (Job 3a, Abholzeit + ${EXPIRE_BUFFER_MIN} min Puffer)`;
    }
    if (mins <= ACTIVATION_WINDOW_MIN) {
      return `sollte → ready_for_dispatch (Job 4, Fahrer ${row.driver_id ?? "?"})`;
    }
    return `wartet auf Job 4 (T−${ACTIVATION_WINDOW_MIN} min) + Planer-Pool`;
  }

  if (status === "searching_driver") return "im Sofort-Markt (OFFLINE/ONLINE)";
  if (status === "ready_for_dispatch") return `Fahrer ${row.driver_id ?? "?"} sollte aktivieren`;
  if (status === "expired") return "abgelaufen";
  if (status === "cancelled_by_system") return "vom System storniert (kein Fahrer rechtzeitig)";
  return status;
}

async function main() {
  const databaseUrl = (process.env.DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL fehlt.");
    process.exit(1);
  }

  const { rideId, limit } = parseArgs(process.argv.slice(2));
  const now = new Date();
  const client = new Client({ connectionString: databaseUrl });

  await client.connect();

  try {
    if (rideId) {
      const { rows } = await client.query(
        `SELECT id, status, scheduled_at, company_id, driver_id, created_at,
                created_by_panel_user_id, from_lat, from_lon, to_lat, to_lon,
                dispatch_tier, dispatch_tier_started_at
         FROM rides WHERE id = $1`,
        [rideId],
      );
      if (rows.length === 0) {
        console.log(`Keine Fahrt mit id=${rideId}`);
        return;
      }
      printRows(rows, now);
      return;
    }

    const { rows } = await client.query(
      `SELECT id, status, scheduled_at, company_id, driver_id, created_at,
              created_by_panel_user_id, from_lat, from_lon, to_lat, to_lon,
              dispatch_tier, dispatch_tier_started_at
       FROM rides
       WHERE created_by_panel_user_id IS NOT NULL
         AND scheduled_at IS NOT NULL
         AND created_at > now() - interval '14 days'
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );

    if (rows.length === 0) {
      console.log("Keine Panel-Reservierungen in den letzten 14 Tagen.");
      return;
    }

    printRows(rows, now);
  } finally {
    await client.end();
  }
}

function printRows(rows, now) {
  console.log(`Stand: ${now.toISOString()} (Cron Job 4 Fenster: T−${ACTIVATION_WINDOW_MIN} min)\n`);
  for (const row of rows) {
    const mins = minutesUntilPickup(row.scheduled_at, now);
    const coordsOk =
      row.from_lat != null && row.from_lon != null && row.to_lat != null && row.to_lon != null;
    console.log(`— ${row.id}`);
    console.log(`  status:              ${row.status}`);
    console.log(`  scheduled_at:        ${fmtTs(row.scheduled_at)} (${mins != null ? `${mins} min` : "?"})`);
    console.log(`  company_id:          ${row.company_id ?? "—"}`);
    console.log(`  driver_id:           ${row.driver_id ?? "—"}`);
    console.log(`  panel_user:          ${row.created_by_panel_user_id ?? "—"}`);
    console.log(`  coords (from/to):    ${coordsOk ? "ok" : "FEHLT"}`);
    console.log(`  dispatch_tier:       ${row.dispatch_tier ?? "—"} @ ${fmtTs(row.dispatch_tier_started_at)}`);
    console.log(`  created_at:          ${fmtTs(row.created_at)}`);
    console.log(`  erwarteter Schritt:  ${expectedNextStep(row, now)}`);
    console.log("");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
