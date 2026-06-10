import { randomUUID } from "node:crypto";
import { getDb, isPostgresConfigured } from "../db/client";
import {
  findCustomerAccountByEmail,
  insertCustomerAccount,
  updateCustomerAccountPassword,
  type CustomerAccountRow,
} from "../db/customerAccountsData";
import {
  CUSTOMER_PASSWORD_RESET_PURPOSE,
  CUSTOMER_REGISTRATION_PURPOSE,
  isPlausibleRegistrationEmail,
  normalizeCustomerEmail,
} from "./emailVerificationCode";
import { verifyEmailVerificationProofJwt } from "./emailVerificationJwt";
import { hashPassword, verifyPassword } from "./password";
import { passwordsMatch, validateCustomerPassword } from "./customerPasswordPolicy";
import { touchPassengerProfileFromEmailAccount } from "../db/passengerProfilesData";
import { signSessionJwt } from "./sessionJwt";
import { rateLimitCustomerLogin } from "./customerLoginRateLimit";

export type CustomerPublicDto = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
};

function toPublicDto(row: CustomerAccountRow): CustomerPublicDto {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
  };
}

async function issueSession(row: CustomerAccountRow): Promise<string> {
  void touchPassengerProfileFromEmailAccount({
    passengerId: row.id,
    name: row.name,
    email: row.email,
  }).catch(() => undefined);
  return signSessionJwt({
    googleId: row.id,
    email: row.email,
    name: row.name,
    photoUri: null,
  });
}

export async function registerCustomerAccount(opts: {
  bodyEmail: unknown;
  bodyProofToken: unknown;
  bodyName: unknown;
  bodyPhone: unknown;
  bodyPassword: unknown;
  bodyPasswordConfirm: unknown;
}): Promise<
  | { ok: true; sessionToken: string; customer: CustomerPublicDto }
  | { ok: false; error: string; status: number }
> {
  if (!isPostgresConfigured() || !getDb()) {
    return { ok: false, error: "database_not_configured", status: 503 };
  }

  const email = normalizeCustomerEmail(typeof opts.bodyEmail === "string" ? opts.bodyEmail : "");
  const proofToken = typeof opts.bodyProofToken === "string" ? opts.bodyProofToken.trim() : "";
  const name = typeof opts.bodyName === "string" ? opts.bodyName.trim() : "";
  const phone = typeof opts.bodyPhone === "string" ? opts.bodyPhone.trim() : "";
  const password = typeof opts.bodyPassword === "string" ? opts.bodyPassword : "";
  const passwordConfirm =
    typeof opts.bodyPasswordConfirm === "string" ? opts.bodyPasswordConfirm : "";

  if (!isPlausibleRegistrationEmail(email) || !proofToken || !name || !phone) {
    return { ok: false, error: "invalid_params", status: 400 };
  }

  const pwCheck = validateCustomerPassword(password);
  if (!pwCheck.ok) {
    return { ok: false, error: pwCheck.error, status: 400 };
  }
  if (!passwordsMatch(password, passwordConfirm)) {
    return { ok: false, error: "password_mismatch", status: 400 };
  }

  const proof = await verifyEmailVerificationProofJwt(proofToken);
  if (!proof || proof.email !== email || proof.purpose !== CUSTOMER_REGISTRATION_PURPOSE) {
    return { ok: false, error: "invalid_proof_token", status: 400 };
  }

  const existing = await findCustomerAccountByEmail(email);
  if (existing) {
    return { ok: false, error: "account_exists", status: 409 };
  }

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(password);
  } catch {
    return { ok: false, error: "password_hash_failed", status: 500 };
  }

  const row = await insertCustomerAccount({
    id: randomUUID(),
    email,
    passwordHash,
    name,
    phone: phone || null,
    emailVerifiedAt: new Date(),
  });

  let sessionToken: string;
  try {
    sessionToken = await issueSession(row);
  } catch {
    return { ok: false, error: "session_token_failed", status: 503 };
  }

  return { ok: true, sessionToken, customer: toPublicDto(row) };
}

export async function loginCustomerAccount(opts: {
  bodyEmail: unknown;
  bodyPassword: unknown;
  ip: string | undefined;
}): Promise<
  | { ok: true; sessionToken: string; customer: CustomerPublicDto }
  | { ok: false; error: string; status: number; retryAfterSec?: number }
> {
  if (!isPostgresConfigured() || !getDb()) {
    return { ok: false, error: "database_not_configured", status: 503 };
  }

  const ip = (opts.ip ?? "").trim() || "unknown";
  const rl = rateLimitCustomerLogin(ip);
  if (!rl.ok) {
    return {
      ok: false,
      error: "rate_limit_ip",
      status: 429,
      retryAfterSec: rl.retryAfterSec,
    };
  }

  const email = normalizeCustomerEmail(typeof opts.bodyEmail === "string" ? opts.bodyEmail : "");
  const password = typeof opts.bodyPassword === "string" ? opts.bodyPassword : "";

  if (!isPlausibleRegistrationEmail(email) || !password) {
    return { ok: false, error: "invalid_params", status: 400 };
  }

  const row = await findCustomerAccountByEmail(email);
  if (!row) {
    return { ok: false, error: "invalid_credentials", status: 401 };
  }

  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) {
    return { ok: false, error: "invalid_credentials", status: 401 };
  }

  let sessionToken: string;
  try {
    sessionToken = await issueSession(row);
  } catch {
    return { ok: false, error: "session_token_failed", status: 503 };
  }

  return { ok: true, sessionToken, customer: toPublicDto(row) };
}

export async function confirmCustomerPasswordReset(opts: {
  bodyEmail: unknown;
  bodyProofToken: unknown;
  bodyPassword: unknown;
  bodyPasswordConfirm: unknown;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!isPostgresConfigured() || !getDb()) {
    return { ok: false, error: "database_not_configured", status: 503 };
  }

  const email = normalizeCustomerEmail(typeof opts.bodyEmail === "string" ? opts.bodyEmail : "");
  const proofToken = typeof opts.bodyProofToken === "string" ? opts.bodyProofToken.trim() : "";
  const password = typeof opts.bodyPassword === "string" ? opts.bodyPassword : "";
  const passwordConfirm =
    typeof opts.bodyPasswordConfirm === "string" ? opts.bodyPasswordConfirm : "";

  if (!isPlausibleRegistrationEmail(email) || !proofToken) {
    return { ok: false, error: "invalid_params", status: 400 };
  }

  const pwCheck = validateCustomerPassword(password);
  if (!pwCheck.ok) {
    return { ok: false, error: pwCheck.error, status: 400 };
  }
  if (!passwordsMatch(password, passwordConfirm)) {
    return { ok: false, error: "password_mismatch", status: 400 };
  }

  const proof = await verifyEmailVerificationProofJwt(proofToken);
  if (!proof || proof.email !== email || proof.purpose !== CUSTOMER_PASSWORD_RESET_PURPOSE) {
    return { ok: false, error: "invalid_proof_token", status: 400 };
  }

  const existing = await findCustomerAccountByEmail(email);
  if (!existing) {
    return { ok: false, error: "invalid_params", status: 400 };
  }

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(password);
  } catch {
    return { ok: false, error: "password_hash_failed", status: 500 };
  }

  const updated = await updateCustomerAccountPassword(email, passwordHash);
  if (!updated) {
    return { ok: false, error: "account_not_found", status: 400 };
  }

  return { ok: true };
}
