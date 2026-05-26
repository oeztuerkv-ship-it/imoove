/**
 * Lightweight latency metrics (p50/p95/p99) without external deps.
 */

export function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedAsc.length) - 1;
  return sortedAsc[Math.max(0, Math.min(sortedAsc.length - 1, idx))];
}

export function summarizeDurationsMs(durations) {
  const sorted = [...durations].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count: sorted.length,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    avg: sorted.length ? sum / sorted.length : 0,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

export function formatMsStats(label, stats) {
  return [
    `### ${label}`,
    "",
    `| Metrik | ms |`,
    `|--------|-----|`,
    `| n | ${stats.count} |`,
    `| min | ${stats.min.toFixed(1)} |`,
    `| avg | ${stats.avg.toFixed(1)} |`,
    `| p50 | ${stats.p50.toFixed(1)} |`,
    `| p95 | ${stats.p95.toFixed(1)} |`,
    `| p99 | ${stats.p99.toFixed(1)} |`,
    `| max | ${stats.max.toFixed(1)} |`,
    "",
  ].join("\n");
}
