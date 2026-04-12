import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const PREFIX = "v1";
const KEYLEN = 64;
const SCRYPT_OPTS = {
  N: 16384,
  r: 8,
  p: 1,
  /** Node/scrypt Speicherlimit — zu niedrig → `scrypt` schlägt fehl, `verifyPassword` wirkt wie „falsches Passwort“. Nicht wieder verkleinern. */
  maxmem: 64 * 1024 * 1024,
} as const;

/** Scrypt-basiertes Passwort-Hashing (kein natives bcrypt-Modul nötig). */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scryptAsync(plain, salt, KEYLEN, SCRYPT_OPTS)) as Buffer;
  return `${PREFIX}.${salt.toString("base64url")}.${key.toString("base64url")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!stored.startsWith(`${PREFIX}.`)) return false;
  const parts = stored.split(".");
  if (parts.length !== 3) return false;
  const [, saltB64, hashB64] = parts;
  if (!saltB64 || !hashB64) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64, "base64url");
    expected = Buffer.from(hashB64, "base64url");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length !== KEYLEN) return false;
  let key: Buffer;
  try {
    key = (await scryptAsync(plain, salt, expected.length, SCRYPT_OPTS)) as Buffer;
  } catch {
    return false;
  }
  return key.length === expected.length && timingSafeEqual(key, expected);
}
