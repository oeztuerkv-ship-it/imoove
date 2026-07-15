#!/usr/bin/env node
/**
 * Hebt Kunden-Storno- und Zahlungs-Sperre per E-Mail auf.
 * Usage: DATABASE_URL=... node scripts/lift-customer-suspension-by-email.mjs onroda2026@gmail.com
 */
import "dotenv/config";
import pg from "pg";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/lift-customer-suspension-by-email.mjs <email>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL fehlt");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const admin = "cursor-lift-script";

try {
  const acc = await pool.query(
    "SELECT id, email FROM customer_accounts WHERE lower(email) = lower($1) LIMIT 5",
    [email],
  );
  const prof = await pool.query(
    "SELECT passenger_id, email FROM passenger_profiles WHERE lower(email) = lower($1) LIMIT 5",
    [email],
  );
  const ids = [
    ...new Set([...acc.rows.map((r) => r.id), ...prof.rows.map((r) => r.passenger_id)].filter(Boolean)),
  ];

  if (ids.length === 0) {
    console.error(`Kein Kunde mit E-Mail ${email} gefunden.`);
    process.exit(2);
  }

  console.log("Gefundene passenger_ids:", ids);

  for (const pid of ids) {
    const beforeCanc = await pool.query(
      `SELECT passenger_id, suspended_until, reason
       FROM customer_cancellation_suspension
       WHERE passenger_id = $1 AND lifted_at IS NULL AND suspended_until > NOW()`,
      [pid],
    );
    const beforePay = await pool.query(
      `SELECT passenger_id, outstanding_ride_id, reason
       FROM customer_payment_suspension
       WHERE passenger_id = $1 AND lifted_at IS NULL`,
      [pid],
    );

    const liftCanc = await pool.query(
      `UPDATE customer_cancellation_suspension
       SET lifted_at = NOW(), lifted_by_admin = $2, updated_at = NOW()
       WHERE passenger_id = $1 AND lifted_at IS NULL
       RETURNING passenger_id`,
      [pid, admin],
    );
    const liftPay = await pool.query(
      `UPDATE customer_payment_suspension
       SET lifted_at = NOW(), lifted_by_admin = $2, updated_at = NOW()
       WHERE passenger_id = $1 AND lifted_at IS NULL
       RETURNING passenger_id`,
      [pid, admin],
    );

    console.log(JSON.stringify({
      passengerId: pid,
      activeCancellationBefore: beforeCanc.rows,
      activePaymentBefore: beforePay.rows,
      liftedCancellation: liftCanc.rowCount,
      liftedPayment: liftPay.rowCount,
    }, null, 2));
  }
} finally {
  await pool.end();
}
