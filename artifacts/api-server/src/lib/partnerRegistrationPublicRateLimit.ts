/**
 * In-Memory Rate-Limits für öffentliche POST /panel-auth/registration-request.
 * Pro IP und pro E-Mail (normalisiert), getrennte Fenster.
 * Bei mehreren API-Instanzen ggf. durch gemeinsamen Store ersetzen.
 */

const IP_WINDOW_MS = 60 * 60 * 1000;
const IP_MAX = 20;
const EMAIL_WINDOW_MS = 60 * 60 * 1000;
const EMAIL_MAX = 5;
const LOOKUP_WINDOW_MS = 60 * 60 * 1000;
const LOOKUP_MAX = 120;

type Bucket = { count: number; resetAt: number };

const ipBuckets = new Map<string, Bucket>();
const emailBuckets = new Map<string, Bucket>();
const publicLookupBuckets = new Map<string, Bucket>();

function bump(
  buckets: Map<string, Bucket>,
  key: string,
  windowMs: number,
  max: number,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const k = key.trim() || "unknown";
  const now = Date.now();
  let b = buckets.get(k);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(k, b);
  }
  b.count += 1;
  if (b.count > max) {
    const retryAfterSec = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  return { ok: true };
}

export function rateLimitPartnerRegistrationIp(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
  return bump(ipBuckets, (ip || "").toString(), IP_WINDOW_MS, IP_MAX);
}

export function rateLimitPartnerRegistrationEmail(
  email: string,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const e = email.trim().toLowerCase();
  if (!e) return { ok: true };
  return bump(emailBuckets, e, EMAIL_WINDOW_MS, EMAIL_MAX);
}

/** GET Status / Detail-Lookup (öffentlich, E-Mail + Referenz) — pro IP. */
export function rateLimitPartnerRegistrationPublicLookup(
  ip: string,
): { ok: true } | { ok: false; retryAfterSec: number } {
  return bump(publicLookupBuckets, (ip || "").toString(), LOOKUP_WINDOW_MS, LOOKUP_MAX);
}
