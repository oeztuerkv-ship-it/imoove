#!/usr/bin/env node
/**
 * Prüft account_exists bei POST /auth/email/start (purpose=customer_registration).
 *
 * Voraussetzungen:
 *   export DATABASE_URL=postgres://…
 *   export EMAIL_VERIFICATION_E2E_URL=http://127.0.0.1:3000/api
 *   API läuft, Migration 074 angewendet.
 */
import pg from "pg";
import { randomUUID } from "node:crypto";

const baseRaw = (process.env.EMAIL_VERIFICATION_E2E_URL ?? "").trim().replace(/\/+$/, "");
const dbUrl = (process.env.DATABASE_URL ?? "").trim();

if (!baseRaw || !dbUrl) {
  console.error("Set EMAIL_VERIFICATION_E2E_URL and DATABASE_URL");
  process.exit(1);
}

const testEmail = `exists-probe-${Date.now()}@example.invalid`;
const purpose = "customer_registration";
const id = randomUUID();

const pool = new pg.Pool({ connectionString: dbUrl });

async function json(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

async function main() {
  await pool.query(
    `INSERT INTO customer_accounts (id, email, password_hash, name, phone, email_verified_at)
     VALUES ($1, $2, 'hash', 'Probe', NULL, NOW())`,
    [id, testEmail],
  );

  const start = await fetch(`${baseRaw}/auth/email/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, purpose }),
  });
  const body = await json(start);

  await pool.query("DELETE FROM customer_accounts WHERE id = $1", [id]);
  await pool.end();

  if (start.status !== 409 || body?.error !== "account_exists") {
    console.error("FAIL", { status: start.status, body });
    process.exit(1);
  }

  console.log("OK account_exists", { status: start.status, error: body.error });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
