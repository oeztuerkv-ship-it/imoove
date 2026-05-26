/** Mandantenarten mit B2B-Monatsrechnung (Taxi später). */
export const MONTHLY_INVOICE_RUN_COMPANY_KINDS = [
  "hotel",
  "corporate",
  "medical",
  "insurer",
  "voucher_client",
] as const;

export type MonthlyInvoiceRunCompanyKind = (typeof MONTHLY_INVOICE_RUN_COMPANY_KINDS)[number];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDateOnly(raw: string): string | null {
  const t = String(raw ?? "").trim();
  if (!ISO_DATE.test(t)) return null;
  const d = new Date(`${t}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return t;
}

export function addCalendarDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Vormonat (Kalender): 01.–letzter Tag. */
export function previousCalendarMonthPeriod(): { periodStart: string; periodEnd: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const prevEnd = new Date(Date.UTC(y, m, 0));
  const prevStart = new Date(Date.UTC(prevEnd.getUTCFullYear(), prevEnd.getUTCMonth(), 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { periodStart: fmt(prevStart), periodEnd: fmt(prevEnd) };
}

export function validateMonthlyRunPeriod(
  periodStart: string,
  periodEnd: string,
): { ok: true } | { ok: false; error: string } {
  const start = parseIsoDateOnly(periodStart);
  const end = parseIsoDateOnly(periodEnd);
  if (!start || !end) return { ok: false, error: "invalid_period_dates" };
  if (start > end) return { ok: false, error: "period_start_after_end" };
  return { ok: true };
}
