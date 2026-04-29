/** Einfaches Sliding-Window (1 h) gegen Missbrauch pro IP ohne Redis. */

const buckets = new Map<string, number[]>();

function prune(arr: number[], windowMs: number, now: number): number[] {
  return arr.filter((t) => now - t < windowMs);
}

export function throttleIpRollingHour(ipKey: string, maxHits: number, windowMs: number): { ok: true } | { ok: false; retryAfterMs: number } {
  const now = Date.now();
  const hits = prune(buckets.get(ipKey) ?? [], windowMs, now);
  if (hits.length >= maxHits) {
    const oldest = Math.min(...hits);
    const retryAfterMs = Math.max(0, windowMs - (now - oldest));
    return { ok: false, retryAfterMs };
  }
  hits.push(now);
  buckets.set(ipKey, hits);
  return { ok: true };
}
