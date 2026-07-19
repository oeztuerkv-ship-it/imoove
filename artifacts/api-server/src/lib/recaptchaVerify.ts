/**
 * Google reCAPTCHA v3 — serverseitige Prüfung gegen siteverify.
 * Secret nur aus Env: RECAPTCHA_SECRET_KEY (nie committen).
 */

export type RecaptchaVerifyResult =
  | { ok: true; score: number; action: string | null }
  | { ok: false; reason: string };

const SITEVERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

function minScore(): number {
  const raw = (process.env.RECAPTCHA_MIN_SCORE ?? "0.5").trim();
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.5;
}

export function isRecaptchaSecretConfigured(): boolean {
  return Boolean((process.env.RECAPTCHA_SECRET_KEY ?? "").trim());
}

/**
 * Prüft ein Client-Token. Wenn kein Secret gesetzt ist: fail-closed in production,
 * sonst warn + ok (lokale Entwicklung ohne Key).
 */
export async function verifyRecaptchaV3(input: {
  token: string | undefined | null;
  remoteIp?: string | null;
  expectedAction?: string;
}): Promise<RecaptchaVerifyResult> {
  const secret = (process.env.RECAPTCHA_SECRET_KEY ?? "").trim();
  const token = typeof input.token === "string" ? input.token.trim() : "";

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "secret_not_configured" };
    }
    return { ok: true, score: 1, action: null };
  }

  if (!token) {
    return { ok: false, reason: "token_missing" };
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  const ip = (input.remoteIp ?? "").trim();
  if (ip) body.set("remoteip", ip);

  let data: {
    success?: boolean;
    score?: number;
    action?: string;
    "error-codes"?: string[];
  };
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      return { ok: false, reason: "siteverify_http_error" };
    }
    data = (await res.json()) as typeof data;
  } catch {
    return { ok: false, reason: "siteverify_unreachable" };
  }

  if (!data.success) {
    return { ok: false, reason: "siteverify_rejected" };
  }

  const score = typeof data.score === "number" ? data.score : 0;
  const threshold = minScore();
  if (score < threshold) {
    return { ok: false, reason: "score_too_low" };
  }

  const expected = (input.expectedAction ?? "").trim();
  if (expected && data.action && data.action !== expected) {
    return { ok: false, reason: "action_mismatch" };
  }

  return {
    ok: true,
    score,
    action: typeof data.action === "string" ? data.action : null,
  };
}

export const RECAPTCHA_FAIL_MESSAGE_DE =
  "Sicherheitsprüfung fehlgeschlagen, bitte erneut versuchen";
