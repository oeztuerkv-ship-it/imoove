/** Kalenderwoche Europe/Berlin (Mo–So) für Taxi-Netting Phase B. */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDateOnly(raw: string): string | null {
  const t = String(raw ?? "").trim();
  if (!ISO_DATE.test(t)) return null;
  const d = new Date(`${t}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return t;
}

/** Nächster Kalendertag (UTC-Noon-Trick, nur Datumsarithmetik). */
export function addIsoCalendarDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function berlinYmd(now: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return {
    y: Number(parts.find((p) => p.type === "year")?.value ?? "1970"),
    m: Number(parts.find((p) => p.type === "month")?.value ?? "1"),
    d: Number(parts.find((p) => p.type === "day")?.value ?? "1"),
  };
}

/**
 * ISO-8601-ähnliche Kalenderwoche in Berlin: Montag = Start.
 * `weeksAgo=1` → letzte abgeschlossene Woche (Mo–So vor der aktuellen).
 */
export function berlinCalendarWeekPeriod(
  weeksAgo = 1,
  now = new Date(),
): { periodStart: string; periodEnd: string } {
  const { y, m, d } = berlinYmd(now);
  // Wochentag in Berlin: 0=So … 6=Sa → Montag-Index
  const asUtcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", weekday: "short" }).format(asUtcNoon);
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const mondayOffset = map[dow] ?? 0;
  const thisMonday = new Date(asUtcNoon);
  thisMonday.setUTCDate(thisMonday.getUTCDate() - mondayOffset);
  const targetMonday = new Date(thisMonday);
  targetMonday.setUTCDate(targetMonday.getUTCDate() - 7 * Math.max(0, Math.floor(weeksAgo)));
  const periodStart = targetMonday.toISOString().slice(0, 10);
  const periodEnd = addIsoCalendarDays(periodStart, 6);
  return { periodStart, periodEnd };
}

export function validateInclusiveDatePeriod(
  periodStart: string,
  periodEnd: string,
): { ok: true; periodStart: string; periodEnd: string } | { ok: false; error: string } {
  const start = parseIsoDateOnly(periodStart);
  const end = parseIsoDateOnly(periodEnd);
  if (!start || !end) return { ok: false, error: "invalid_period_dates" };
  if (start > end) return { ok: false, error: "period_start_after_end" };
  return { ok: true, periodStart: start, periodEnd: end };
}

export function weeklyCommissionIdempotencyKey(companyId: string, periodStart: string, periodEnd: string): string {
  return `taxi-netting-week:${companyId.trim()}:${periodStart}:${periodEnd}`;
}
