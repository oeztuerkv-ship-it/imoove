import { createHash, randomInt } from "node:crypto";

export const EMAIL_VERIFICATION_TTL_MS = 10 * 60 * 1000;
export const EMAIL_VERIFICATION_MAX_ATTEMPTS = 5;

export const CUSTOMER_REGISTRATION_PURPOSE = "customer_registration";

const PURPOSE_SAFE = /^[a-z][a-z0-9_]{0,62}$/;

export function normalizeCustomerEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isPlausibleRegistrationEmail(normalized: string): boolean {
  if (normalized.length < 6 || normalized.length > 254) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return false;
  return true;
}

export function sanitizePurpose(raw: unknown): string {
  const s =
    typeof raw === "string"
      ? raw.trim().toLowerCase()
      : CUSTOMER_REGISTRATION_PURPOSE;
  return PURPOSE_SAFE.test(s) ? s : CUSTOMER_REGISTRATION_PURPOSE;
}

function pepper(): string {
  const p = (process.env.EMAIL_VERIFICATION_CODE_PEPPER ?? "").trim();
  if (p.length >= 16) return p;
  const j = (process.env.AUTH_JWT_SECRET ?? "").trim();
  if (j.length >= 32) return j.slice(0, 64);
  return "";
}

/** SHA-256(hex) vom Code; Klartext nur für Mail und Vergleich in RAM. */
export function hashEmailVerificationCode(normalizedEmail: string, sixDigitCode: string): string {
  const p = pepper();
  if (!p) {
    throw new Error("EMAIL_VERIFICATION_CODE_PEPPER oder AUTH_JWT_SECRET (lang) fehlt");
  }
  const digits = sixDigitCode.replace(/\D/g, "").trim();
  return createHash("sha256").update(`${p}|${normalizedEmail}|${digits}`, "utf8").digest("hex");
}

export function isPepperConfigured(): boolean {
  return pepper().length >= 16;
}

export function generateSixDigitCode(): string {
  return String(randomInt(100000, 1_000_000));
}
