#!/usr/bin/env node
/**
 * Erzeugt einen Passwort-Hash im Format der Onroda-API (`v1.<salt>.<key>`),
 * identisch zu `artifacts/api-server/src/lib/password.ts` (scrypt, maxmem 64 MiB).
 *
 * Nutzung:
 *   node scripts/hash-onroda-password.mjs 'MeinNeuesPasswort'
 *   ONRODA_PASSWORD='MeinNeuesPasswort' node scripts/hash-onroda-password.mjs
 *   node scripts/hash-onroda-password.mjs --verify 'v1.xxx.yyy' 'MeinPasswort'
 *
 * Danach z. B. (IDs/E-Mails anpassen, Hash einsetzen):
 *   UPDATE panel_users
 *     SET password_hash = '<HASH>', must_change_password = false, updated_at = now()
 *     WHERE lower(username) = lower('…');
 *   UPDATE fleet_drivers
 *     SET password_hash = '<HASH>', must_change_password = false, updated_at = now()
 *     WHERE lower(email) = lower('…');
 *
 * Keine Klartext-Passwörter committen. Hash nur in der DB setzen.
 */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const PREFIX = "v1";
const KEYLEN = 64;
const SCRYPT_OPTS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

async function hashPassword(plain) {
  const salt = randomBytes(16);
  const key = /** @type {Buffer} */ (await scryptAsync(plain, salt, KEYLEN, SCRYPT_OPTS));
  return `${PREFIX}.${salt.toString("base64url")}.${key.toString("base64url")}`;
}

async function verifyPassword(plain, stored) {
  if (!stored.startsWith(`${PREFIX}.`)) return false;
  const parts = stored.split(".");
  if (parts.length !== 3) return false;
  const [, saltB64, hashB64] = parts;
  if (!saltB64 || !hashB64) return false;
  let salt;
  let expected;
  try {
    salt = Buffer.from(saltB64, "base64url");
    expected = Buffer.from(hashB64, "base64url");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length !== KEYLEN) return false;
  let key;
  try {
    key = /** @type {Buffer} */ (await scryptAsync(plain, salt, expected.length, SCRYPT_OPTS));
  } catch {
    return false;
  }
  return key.length === expected.length && timingSafeEqual(key, expected);
}

function printUsage() {
  console.error(`Usage:
  node scripts/hash-onroda-password.mjs '<password>'
  ONRODA_PASSWORD='<password>' node scripts/hash-onroda-password.mjs
  node scripts/hash-onroda-password.mjs --verify '<v1.hash>' '<password>'`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--help" || args[0] === "-h") {
    printUsage();
    process.exit(0);
  }

  if (args[0] === "--verify") {
    const stored = String(args[1] ?? "").trim();
    const plain = String(args[2] ?? process.env.ONRODA_PASSWORD ?? "");
    if (!stored || !plain) {
      printUsage();
      process.exit(1);
    }
    const ok = await verifyPassword(plain, stored);
    console.log(ok ? "ok" : "mismatch");
    process.exit(ok ? 0 : 2);
  }

  const plain = String(args[0] ?? process.env.ONRODA_PASSWORD ?? "");
  if (!plain) {
    printUsage();
    process.exit(1);
  }
  if (plain.length < 8) {
    console.error("Warnung: Passwort kürzer als 8 Zeichen — für Produktion ungeeignet.");
  }

  const hash = await hashPassword(plain);
  console.log(hash);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
