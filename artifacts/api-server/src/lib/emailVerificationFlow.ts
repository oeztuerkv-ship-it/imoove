import { randomUUID } from "node:crypto";
import { getDb, isPostgresConfigured } from "../db/client";
import {
  countSendsInRollingHour,
  deleteUnconsumedCodesForEmailPurpose,
  deleteVerificationCodeById,
  getLatestUnconsumedRowAnyExpiry,
  getLastCreatedAtForEmail,
  incrementAttempts,
  insertVerificationCode,
  markConsumed,
} from "../db/emailVerificationCodesData";
import {
  EMAIL_VERIFICATION_MAX_ATTEMPTS,
  EMAIL_VERIFICATION_TTL_MS,
  generateSixDigitCode,
  hashEmailVerificationCode,
  isPepperConfigured,
  isPlausibleRegistrationEmail,
  normalizeCustomerEmail,
  sanitizePurpose,
} from "./emailVerificationCode";
import { sendOnrodaVerificationEmailPlain } from "./emailVerificationMail";
import { signEmailVerificationProofJwt } from "./emailVerificationJwt";
import { throttleIpRollingHour } from "./emailVerificationIpThrottle";

function maxSendsEmailPerHour(): number {
  const n = Number(process.env.EMAIL_VERIFICATION_MAX_SENDS_PER_EMAIL_HOUR ?? "5");
  return Number.isFinite(n) && n >= 1 && n <= 100 ? Math.floor(n) : 5;
}

function maxSendsIpPerHour(): number {
  const n = Number(process.env.EMAIL_VERIFICATION_MAX_SENDS_PER_IP_PER_HOUR ?? "30");
  return Number.isFinite(n) && n >= 1 && n <= 500 ? Math.floor(n) : 30;
}

function minSecondsBetweenSends(): number {
  const n = Number(process.env.EMAIL_VERIFICATION_MIN_SECONDS_BETWEEN_SENDS ?? "60");
  return Number.isFinite(n) && n >= 10 && n <= 600 ? Math.floor(n) : 60;
}

function clientIpKey(reqIp: string | undefined): string {
  return (reqIp ?? "unknown").trim() || "unknown";
}

export type EmailSendResult =
  | { ok: true }
  | { ok: false; error: string; status: number; retryAfterSeconds?: number };

export async function dispatchEmailVerificationCode(opts: {
  bodyEmail: unknown;
  bodyPurpose: unknown;
  ip: string | undefined;
}): Promise<EmailSendResult> {
  if (!isPostgresConfigured() || !getDb()) {
    return { ok: false, error: "database_not_configured", status: 503 };
  }
  if (!isPepperConfigured()) {
    return { ok: false, error: "email_verification_not_configured", status: 503 };
  }

  const normalized = normalizeCustomerEmail(typeof opts.bodyEmail === "string" ? opts.bodyEmail : "");
  const purpose = sanitizePurpose(opts.bodyPurpose);

  if (!isPlausibleRegistrationEmail(normalized)) {
    return { ok: false, error: "invalid_email", status: 400 };
  }

  const ipKey = clientIpKey(opts.ip);
  const rollingHour = 60 * 60 * 1000;
  const ipTh = throttleIpRollingHour(ipKey, maxSendsIpPerHour(), rollingHour);
  if (!ipTh.ok) {
    const sec = Math.ceil(ipTh.retryAfterMs / 1000);
    return { ok: false, error: "rate_limit_ip", status: 429, retryAfterSeconds: sec };
  }

  const nHour = await countSendsInRollingHour(normalized);
  if (nHour >= maxSendsEmailPerHour()) {
    return {
      ok: false,
      error: "rate_limit_email",
      status: 429,
      retryAfterSeconds: Math.ceil(rollingHour / 1000),
    };
  }

  const lastCreated = await getLastCreatedAtForEmail(normalized);
  if (lastCreated) {
    const deltaSec = (Date.now() - lastCreated.getTime()) / 1000;
    const minSec = minSecondsBetweenSends();
    if (deltaSec < minSec) {
      return {
        ok: false,
        error: "rate_limit_resend",
        status: 429,
        retryAfterSeconds: Math.ceil(minSec - deltaSec),
      };
    }
  }

  await deleteUnconsumedCodesForEmailPurpose(normalized, purpose);

  const plain = generateSixDigitCode();

  let codeHash: string;
  try {
    codeHash = hashEmailVerificationCode(normalized, plain);
  } catch {
    return { ok: false, error: "email_verification_not_configured", status: 503 };
  }

  const id = randomUUID();
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);

  await insertVerificationCode({
    id,
    email: normalized,
    codeHash,
    purpose,
    expiresAt,
  });

  const sent = await sendOnrodaVerificationEmailPlain(normalized, plain);
  if (!sent.ok && sent.reason === "smtp_not_configured") {
    await deleteVerificationCodeById(id).catch(() => {});
    return { ok: false, error: "smtp_not_configured", status: 503 };
  }
  if (!sent.ok) {
    await deleteVerificationCodeById(id).catch(() => {});
    return { ok: false, error: "email_send_failed", status: 502 };
  }

  return { ok: true };
}

export async function verifyEmailCode(opts: {
  bodyEmail: unknown;
  bodyCode: unknown;
  bodyPurpose: unknown;
}): Promise<
  | { ok: true; email: string; proofToken: string | null }
  | { ok: false; error: string; status: number }
> {
  if (!isPostgresConfigured() || !getDb()) {
    return { ok: false, error: "database_not_configured", status: 503 };
  }
  if (!isPepperConfigured()) {
    return { ok: false, error: "email_verification_not_configured", status: 503 };
  }

  const normalized = normalizeCustomerEmail(typeof opts.bodyEmail === "string" ? opts.bodyEmail : "");
  const purpose = sanitizePurpose(opts.bodyPurpose);
  const digits = typeof opts.bodyCode === "string" ? opts.bodyCode.replace(/\D/g, "").trim() : "";

  if (!isPlausibleRegistrationEmail(normalized) || digits.length !== 6) {
    return { ok: false, error: "invalid_params", status: 400 };
  }

  const row = await getLatestUnconsumedRowAnyExpiry(normalized, purpose);
  if (!row) {
    return { ok: false, error: "invalid_code", status: 400 };
  }

  if (row.expires_at.getTime() <= Date.now()) {
    return { ok: false, error: "code_expired", status: 400 };
  }

  if (row.attempts >= EMAIL_VERIFICATION_MAX_ATTEMPTS) {
    return { ok: false, error: "too_many_attempts", status: 400 };
  }

  let expectedHash: string;
  try {
    expectedHash = hashEmailVerificationCode(normalized, digits);
  } catch {
    return { ok: false, error: "email_verification_not_configured", status: 503 };
  }

  if (expectedHash !== row.code_hash) {
    const next = await incrementAttempts(row.id);
    if ((next ?? 0) >= EMAIL_VERIFICATION_MAX_ATTEMPTS) {
      return { ok: false, error: "too_many_attempts", status: 400 };
    }
    return { ok: false, error: "invalid_code", status: 400 };
  }

  await markConsumed(row.id);
  let proofToken: string | null = null;
  try {
    proofToken = await signEmailVerificationProofJwt(normalized, purpose);
  } catch {
    proofToken = null;
  }

  return { ok: true, email: normalized, proofToken };
}
