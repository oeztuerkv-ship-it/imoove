#!/usr/bin/env node
/**
 * Listet aktive Auto-Storno-Sperren, bei denen die korrigierte Zählung
 * (nur Storno nach Fahrer-Annahme) unter 4 liegt — Kandidaten für Fehl-Sperre.
 *
 * Usage: DATABASE_URL=... node scripts/audit-wrongful-customer-cancellation-suspensions.mjs
 * Optional: --lift  hebt gefundene Auto-Sperren auf (lifted_by_admin = audit-script).
 */
import "dotenv/config";
import pg from "pg";

const COUNTABLE = ["accepted", "driver_arriving", "driver_waiting", "passenger_onboard", "in_progress"];
const THRESHOLD = 4;
const doLift = process.argv.includes("--lift");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL fehlt");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const active = await pool.query(
    `SELECT passenger_id, suspended_at, suspended_until, reason
     FROM customer_cancellation_suspension
     WHERE lifted_at IS NULL
       AND suspended_until > NOW()
       AND reason = 'too_many_cancellations'
     ORDER BY suspended_at DESC`,
  );

  console.log(`Aktive Auto-Sperren: ${active.rowCount}`);

  const wrongful = [];
  for (const row of active.rows) {
    const cnt = await pool.query(
      `SELECT count(*)::int AS c
       FROM ride_events
       WHERE event_type = 'cancel_reason'
         AND actor_type = 'passenger'
         AND actor_id = $1
         AND created_at >= NOW() - INTERVAL '24 hours'
         AND from_status = ANY($2::text[])
         AND to_status IN ('cancelled_by_customer', 'customer_abort_pending_fare')`,
      [row.passenger_id, COUNTABLE],
    );
    const countable = Number(cnt.rows[0]?.c ?? 0);
    if (countable < THRESHOLD) {
      wrongful.push({ ...row, countableCancelsIn24h: countable });
    }
  }

  console.log(`Vermutlich fälschlich (korrigierte Zählung < ${THRESHOLD}): ${wrongful.length}`);
  for (const w of wrongful) {
    const email = await pool.query(
      `SELECT email FROM passenger_profiles WHERE passenger_id = $1
       UNION
       SELECT email FROM customer_accounts WHERE id = $1
       LIMIT 1`,
      [w.passenger_id],
    );
    console.log(
      JSON.stringify(
        {
          passengerId: w.passenger_id,
          email: email.rows[0]?.email ?? null,
          suspendedAt: w.suspended_at,
          suspendedUntil: w.suspended_until,
          countableCancelsIn24h: w.countableCancelsIn24h,
        },
        null,
        2,
      ),
    );
  }

  if (doLift && wrongful.length > 0) {
    for (const w of wrongful) {
      const r = await pool.query(
        `UPDATE customer_cancellation_suspension
         SET lifted_at = NOW(), lifted_by_admin = $2, updated_at = NOW()
         WHERE passenger_id = $1 AND lifted_at IS NULL
         RETURNING passenger_id`,
        [w.passenger_id, "audit-wrongful-cancel-suspension"],
      );
      console.log(`lifted ${w.passenger_id}: ${r.rowCount}`);
    }
  } else if (wrongful.length > 0) {
    console.log("\nZum Entsperren: dasselbe Kommando mit --lift");
  }
} finally {
  await pool.end();
}
