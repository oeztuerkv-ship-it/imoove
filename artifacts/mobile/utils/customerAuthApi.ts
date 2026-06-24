import { getApiBaseUrl } from "@/utils/apiBase";

const API_URL = getApiBaseUrl();

export type CustomerAuthDto = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
};

type ApiFail = { ok: false; error: string; status: number; retryAfterSeconds?: number };

export type RegisterCustomerResult =
  | { ok: true; sessionToken: string; customer: CustomerAuthDto }
  | ApiFail;

export type LoginCustomerResult =
  | { ok: true; sessionToken: string; customer: CustomerAuthDto }
  | ApiFail;

export type EmailVerificationStartResult = { ok: true } | ApiFail;

export type EmailVerificationVerifyResult =
  | { ok: true; proofToken: string | undefined }
  | ApiFail;

export type PasswordResetConfirmResult = { ok: true } | ApiFail;

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function registerCustomerWithPassword(body: {
  email: string;
  proofToken: string;
  name: string;
  password: string;
  passwordConfirm: string;
}): Promise<RegisterCustomerResult> {
  if (!API_URL?.trim()) {
    return { ok: false, error: "api_not_configured", status: 503 };
  }
  const res = await fetch(`${API_URL}/auth/customer/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: body.email.trim().toLowerCase(),
      proofToken: body.proofToken.trim(),
      name: body.name.trim(),
      password: body.password,
      passwordConfirm: body.passwordConfirm,
    }),
  });
  const data = await readJson(res);
  if (!res.ok || data?.ok === false) {
    return {
      ok: false,
      error: typeof data?.error === "string" ? data.error : "register_failed",
      status: res.status,
    };
  }
  const token = typeof data.sessionToken === "string" ? data.sessionToken.trim() : "";
  const customer = data.customer as CustomerAuthDto | undefined;
  if (!token || !customer?.id) {
    return { ok: false, error: "invalid_response", status: 502 };
  }
  return { ok: true, sessionToken: token, customer };
}

export async function loginCustomerWithPassword(body: {
  email: string;
  password: string;
}): Promise<LoginCustomerResult> {
  if (!API_URL?.trim()) {
    return { ok: false, error: "api_not_configured", status: 503 };
  }
  const res = await fetch(`${API_URL}/auth/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: body.email.trim().toLowerCase(),
      password: body.password,
    }),
  });
  const data = await readJson(res);
  if (!res.ok || data?.ok === false) {
    const retryAfterSeconds =
      typeof data.retryAfterSeconds === "number" ? data.retryAfterSeconds : undefined;
    return {
      ok: false,
      error: typeof data?.error === "string" ? data.error : "login_failed",
      status: res.status,
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    };
  }
  const token = typeof data.sessionToken === "string" ? data.sessionToken.trim() : "";
  const customer = data.customer as CustomerAuthDto | undefined;
  if (!token || !customer?.id) {
    return { ok: false, error: "invalid_response", status: 502 };
  }
  return { ok: true, sessionToken: token, customer };
}

export async function startEmailVerification(body: {
  email: string;
  purpose: string;
}): Promise<EmailVerificationStartResult> {
  if (!API_URL?.trim()) {
    return { ok: false, error: "api_not_configured", status: 503 };
  }
  const res = await fetch(`${API_URL}/auth/email/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: body.email.trim().toLowerCase(),
      purpose: body.purpose,
    }),
  });
  const data = await readJson(res);
  if (!res.ok || data?.ok === false) {
    const retryAfterSeconds =
      typeof data.retryAfterSeconds === "number" ? data.retryAfterSeconds : undefined;
    return {
      ok: false,
      error: typeof data?.error === "string" ? data.error : "email_start_failed",
      status: res.status,
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    };
  }
  return { ok: true };
}

export async function resendEmailVerification(body: {
  email: string;
  purpose: string;
}): Promise<EmailVerificationStartResult> {
  if (!API_URL?.trim()) {
    return { ok: false, error: "api_not_configured", status: 503 };
  }
  const res = await fetch(`${API_URL}/auth/email/resend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: body.email.trim().toLowerCase(),
      purpose: body.purpose,
    }),
  });
  const data = await readJson(res);
  if (!res.ok || data?.ok === false) {
    const retryAfterSeconds =
      typeof data.retryAfterSeconds === "number" ? data.retryAfterSeconds : undefined;
    return {
      ok: false,
      error: typeof data?.error === "string" ? data.error : "email_resend_failed",
      status: res.status,
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    };
  }
  return { ok: true };
}

export async function verifyEmailVerificationCode(body: {
  email: string;
  code: string;
  purpose: string;
}): Promise<EmailVerificationVerifyResult> {
  if (!API_URL?.trim()) {
    return { ok: false, error: "api_not_configured", status: 503 };
  }
  const digits = body.code.replace(/\D/g, "").slice(0, 6);
  const res = await fetch(`${API_URL}/auth/email/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: body.email.trim().toLowerCase(),
      code: digits,
      purpose: body.purpose,
    }),
  });
  const data = await readJson(res);
  if (!res.ok || data?.ok === false) {
    return {
      ok: false,
      error: typeof data?.error === "string" ? data.error : "verify_failed",
      status: res.status,
    };
  }
  const proofToken = typeof data.proofToken === "string" ? data.proofToken : undefined;
  return { ok: true, proofToken };
}

export async function confirmCustomerPasswordReset(body: {
  email: string;
  proofToken: string;
  password: string;
  passwordConfirm: string;
}): Promise<PasswordResetConfirmResult> {
  if (!API_URL?.trim()) {
    return { ok: false, error: "api_not_configured", status: 503 };
  }
  const res = await fetch(`${API_URL}/auth/customer/password-reset/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: body.email.trim().toLowerCase(),
      proofToken: body.proofToken.trim(),
      password: body.password,
      passwordConfirm: body.passwordConfirm,
    }),
  });
  const data = await readJson(res);
  if (!res.ok || data?.ok === false) {
    return {
      ok: false,
      error: typeof data?.error === "string" ? data.error : "password_reset_failed",
      status: res.status,
    };
  }
  return { ok: true };
}

export function mapCustomerAuthApiError(code: unknown): string {
  const k = typeof code === "string" ? code : "";
  if (k === "invalid_params") return "Bitte alle Felder prüfen.";
  if (k === "password_too_short") return "Passwort: mindestens 8 Zeichen.";
  if (k === "password_needs_special") return "Passwort: mindestens ein Sonderzeichen (z. B. Punkt).";
  if (k === "password_mismatch") return "Passwörter stimmen nicht überein.";
  if (k === "invalid_proof_token") return "E-Mail-Bestätigung abgelaufen — bitte Code erneut anfordern.";
  if (k === "account_exists") return "Diese E-Mail ist bereits registriert.";
  if (k === "invalid_credentials") return "E-Mail oder Passwort falsch.";
  if (k === "rate_limit_ip") return "Zu viele Anmeldeversuche — bitte kurz warten.";
  if (k === "database_not_configured" || k === "database_error") return "Server noch nicht bereit.";
  if (k === "session_token_failed") return "Anmeldung konnte nicht abgeschlossen werden.";
  if (k === "password_reset_failed") return "Passwort konnte nicht gesetzt werden.";
  return "Es ist ein Fehler aufgetreten — bitte erneut versuchen.";
}
