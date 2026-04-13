/** In-Memory Rate-Limit für POST /fleet-auth/login (pro IP). */

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 25;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimitFleetLogin(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const k = ip.trim() || "unknown";
  const now = Date.now();
  let b = buckets.get(k);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(k, b);
  }
  b.count += 1;
  if (b.count > MAX_ATTEMPTS) {
    const retryAfterSec = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  return { ok: true };
}
