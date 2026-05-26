/**
 * Concurrent HTTP load with per-request timing.
 */

import { summarizeDurationsMs } from "./metrics.mjs";

export async function runHttpLoad({
  url,
  method = "GET",
  headers = {},
  body,
  concurrency = 10,
  durationSec = 15,
  name = url,
  expectedStatus = 200,
}) {
  const endAt = Date.now() + durationSec * 1000;
  const durations = [];
  const statusCounts = new Map();
  let errors = 0;
  let total = 0;

  async function worker() {
    while (Date.now() < endAt) {
      const t0 = performance.now();
      try {
        const res = await fetch(url, {
          method,
          headers,
          body: body != null ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
        });
        const ms = performance.now() - t0;
        durations.push(ms);
        total += 1;
        const key = String(res.status);
        statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
        if (res.status !== expectedStatus) errors += 1;
        await res.arrayBuffer().catch(() => undefined);
      } catch {
        errors += 1;
        total += 1;
        durations.push(performance.now() - t0);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  const stats = summarizeDurationsMs(durations);
  const rps = total / durationSec;
  const errorRate = total ? (errors / total) * 100 : 0;

  return {
    name,
    url,
    method,
    concurrency,
    durationSec,
    total,
    rps,
    errors,
    errorRate,
    statusCounts: Object.fromEntries(statusCounts),
    stats,
  };
}
