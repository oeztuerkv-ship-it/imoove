import { and, desc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { getDb } from "./client";
import {
  adminCompaniesTable,
  fleetDriversTable,
  rideFinancialAdjustmentsTable,
  rideFinancialsTable,
  ridesTable,
} from "./schema";
import {
  defaultInvoicePrefixForCompanyKind,
  normalizeInvoicePrefix,
  resolveCompanyInvoicePrefix,
} from "../lib/invoiceNumbering";
import { sqlRideNotLinkedToKrankenInvoice, sqlRideInCashCardNettingStatuses } from "../lib/cashCardNettingScope";
import {
  mapRideFinancialAdjustmentRow,
  rideFinancialAdjustmentEffectiveAtExpr,
  sumAdjustmentsForCompany,
  type RideFinancialAdjustmentRow,
} from "./rideFinancialAdjustmentsData";

function companyIdMatchCondition(companyId: string): SQL {
  return sql`${ridesTable.company_id}::text = ${companyId}`;
}

/** Bar-/Karten-Netting: completed + billable Storno/No-Show; ohne echte KK-Rechnung. */
function cashCardNettingRideConditions(companyId: string): SQL[] {
  return [
    sqlRideInCashCardNettingStatuses(),
    companyIdMatchCondition(companyId),
    sqlRideNotLinkedToKrankenInvoice(sql`${ridesTable.id}`),
  ];
}

export type PanelFinancialSettlementWindow = {
  grossAmount: number;
  commissionAmount: number;
  operatorPayoutAmount: number;
  /** Anzahl Korrekturzeilen im Zeitraum (bereits in Beträgen eingerechnet). */
  adjustmentCount: number;
  adjustmentOperatorPayoutDelta: number;
};

export type PanelPaymentPeriodStats = {
  tipTotal: number;
  cardRideCount: number;
  cashRideCount: number;
  cardGrossAmount: number;
  cashGrossAmount: number;
  failedPaymentCount: number;
  pendingPaymentCount: number;
  /** Storno/No-Show mit Gebühr im Netting-Fenster. */
  feeRideCount: number;
  feeGrossAmount: number;
  /** Summe Stripe-Gebühren (ONRODA-Kosten, nicht Unternehmer-Anteil). */
  stripeFeeTotal: number;
};

export type PanelSettlementPeriodKey = "today" | "week" | "weekCalendar" | "month" | "year";

export type PanelSettlementPeriodQuery = {
  period: PanelSettlementPeriodKey;
  /** Nur für `period=week`: rollierend vs. Kalenderwoche (Mo–So Berlin). */
  weekMode?: "rolling" | "calendar";
  /** Kalenderjahr für `period=year` bzw. `period=month` (Default: aktuelles Jahr Berlin). */
  year?: number;
  /** Kalendermonat 1–12 für `period=month` (Default: aktueller Monat Berlin). */
  month?: number;
};

export type PanelSettlementRideRow = {
  id: string;
  createdAt: string;
  from: string;
  to: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  driverName: string | null;
  grossAmount: number | null;
  commissionAmount: number | null;
  operatorPayoutAmount: number | null;
  tipAmount: number | null;
  /** Stripe-Transaktionsgebühr (zu Lasten ONRODA); nicht im Unternehmer-Anteil. */
  stripeFeeAmount: number | null;
  estimatedFare: number | null;
  finalFare: number | null;
  hasFinancials: boolean;
};

const CARD_PM_SQL = sql`(
  lower(trim(replace(${ridesTable.payment_method}, '_', ' '))) = 'card'
  OR lower(${ridesTable.payment_method}) LIKE '%kredit%'
  OR lower(${ridesTable.payment_method}) LIKE '%credit%'
  OR lower(${ridesTable.payment_method}) LIKE '%apple%'
  OR lower(${ridesTable.payment_method}) LIKE '%google%'
)`;

const CASH_PM_SQL = sql`(
  lower(trim(${ridesTable.payment_method})) IN ('cash', 'bar')
  OR lower(${ridesTable.payment_method}) LIKE '%bar%'
)`;

export function panelSettlementAvailableYears(now = new Date()): number[] {
  const berlinYear = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric" }).format(now),
  );
  const start = berlinYear - 2;
  const end = berlinYear + 1;
  const years: number[] = [];
  for (let y = start; y <= end; y += 1) years.push(y);
  return years;
}

export function normalizePanelSettlementYear(raw: unknown, now = new Date()): number {
  const berlinYear = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric" }).format(now),
  );
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(n) || n < 2000 || n > 2100) return berlinYear;
  return Math.trunc(n);
}

export function normalizePanelSettlementMonth(raw: unknown): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(n) || n < 1 || n > 12) return undefined;
  return Math.trunc(n);
}

function berlinCalendarParts(now = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return {
    year: Number(parts.find((p) => p.type === "year")?.value ?? "1970"),
    month: Number(parts.find((p) => p.type === "month")?.value ?? "1"),
    day: Number(parts.find((p) => p.type === "day")?.value ?? "1"),
  };
}

const PANEL_SETTLEMENT_PERIOD_KEYS = new Set<PanelSettlementPeriodKey>([
  "today",
  "week",
  "weekCalendar",
  "month",
  "year",
]);

/** Query-Parser für settlement-rides / export-pdf (Partner-Panel). */
export function parsePanelSettlementPeriodQuery(
  raw: Record<string, unknown>,
  now = new Date(),
): PanelSettlementPeriodQuery {
  const periodRaw = typeof raw.period === "string" ? raw.period.trim() : "today";
  const period = PANEL_SETTLEMENT_PERIOD_KEYS.has(periodRaw as PanelSettlementPeriodKey)
    ? (periodRaw as PanelSettlementPeriodKey)
    : "today";
  const weekModeRaw = typeof raw.weekMode === "string" ? raw.weekMode.trim() : "rolling";
  const weekMode = weekModeRaw === "calendar" ? "calendar" : "rolling";
  const year = raw.year != null ? normalizePanelSettlementYear(raw.year, now) : undefined;
  const month = normalizePanelSettlementMonth(raw.month);
  return { period, weekMode, year, month };
}

export function formatPanelSettlementPeriodLabels(
  query: PanelSettlementPeriodQuery,
  now = new Date(),
): {
  kindLabel: string;
  headline: string;
  metaZeitraum: string;
  scopeNote: string;
  /** Kompatibilität (Partner-API / ältere Clients) */
  title: string;
  description: string;
} {
  const zone = "Europe/Berlin";
  const berlin = berlinCalendarParts(now);
  const fmtShortDate = (d: Date) =>
    d.toLocaleDateString("de-DE", { timeZone: zone, day: "2-digit", month: "2-digit", year: "numeric" });
  const fmtMonthLong = (y: number, m: number) =>
    new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("de-DE", {
      timeZone: zone,
      month: "long",
      year: "numeric",
    });
  const scopeNote =
    "Zeitzone Europe/Berlin. Abgeschlossene Fahrten nach Fahrtende (Abschlusszeitpunkt).";

  switch (query.period) {
    case "today": {
      const headline = now.toLocaleDateString("de-DE", {
        timeZone: zone,
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      const metaZeitraum = fmtShortDate(now);
      return {
        kindLabel: "Tagesabrechnung",
        headline,
        metaZeitraum,
        scopeNote,
        title: "Tagesabrechnung",
        description: metaZeitraum,
      };
    }
    case "week":
      if (query.weekMode === "calendar") {
        const headline = `Kalenderwoche · Stand ${fmtShortDate(now)}`;
        return {
          kindLabel: "Wochenabrechnung",
          headline,
          metaZeitraum: "Montag–Sonntag",
          scopeNote,
          title: "Wochenabrechnung",
          description: "Montag–Sonntag",
        };
      }
      return {
        kindLabel: "Wochenabrechnung (rollierend)",
        headline: `Letzte 7 Tage · Stand ${fmtShortDate(now)}`,
        metaZeitraum: "Rollierend 7×24 h",
        scopeNote,
        title: "Wochenabrechnung (rollierend)",
        description: "Rollierend 7×24 h",
      };
    case "weekCalendar": {
      const headline = `Kalenderwoche · Stand ${fmtShortDate(now)}`;
      return {
        kindLabel: "Wochenabrechnung",
        headline,
        metaZeitraum: "Montag–Sonntag",
        scopeNote,
        title: "Wochenabrechnung",
        description: "Montag–Sonntag",
      };
    }
    case "month": {
      const y = query.year ?? berlin.year;
      const m = query.month ?? berlin.month;
      const headline = fmtMonthLong(y, m);
      const metaZeitraum = `${String(m).padStart(2, "0")}/${y}`;
      return {
        kindLabel: "Monatsabrechnung",
        headline,
        metaZeitraum,
        scopeNote,
        title: "Monatsabrechnung",
        description: metaZeitraum,
      };
    }
    case "year": {
      const y = query.year ?? berlin.year;
      return {
        kindLabel: "Jahresabrechnung",
        headline: String(y),
        metaZeitraum: String(y),
        scopeNote,
        title: "Jahresabrechnung",
        description: String(y),
      };
    }
    default:
      return {
        kindLabel: "Abrechnungszeitraum",
        headline: fmtShortDate(now),
        metaZeitraum: fmtShortDate(now),
        scopeNote,
        title: "Abrechnungszeitraum",
        description: fmtShortDate(now),
      };
  }
}

/** Eindeutige Belegnummer für Steuerberater-PDF (informative Übersicht, kein DB-Settlement). */
export function formatSettlementDocumentNumber(
  invoicePrefix: string | null | undefined,
  companyKind: string,
  query: PanelSettlementPeriodQuery,
  now = new Date(),
): string {
  const prefix = resolveCompanyInvoicePrefix(
    invoicePrefix?.trim() ? normalizeInvoicePrefix(invoicePrefix) : "",
    companyKind,
  );
  const berlin = berlinCalendarParts(now);
  const y = query.year ?? berlin.year;
  const m = String(query.month ?? berlin.month).padStart(2, "0");
  const d = String(berlin.day).padStart(2, "0");

  switch (query.period) {
    case "today":
      return `ONR-ABR-${prefix}-${y}-${m}-${d}`;
    case "month":
      return `ONR-ABR-${prefix}-${y}-${m}`;
    case "year":
      return `ONR-ABR-${prefix}-${y}`;
    case "week":
    case "weekCalendar":
      return `ONR-ABR-${prefix}-${y}-${m}-${d}-W`;
    default:
      return `ONR-ABR-${prefix}-${y}-${m}-${d}`;
  }
}

async function getPanelCompanyInvoiceMeta(
  companyId: string,
): Promise<{ invoicePrefix: string; companyKind: string } | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      invoice_prefix: adminCompaniesTable.invoice_prefix,
      company_kind: adminCompaniesTable.company_kind,
    })
    .from(adminCompaniesTable)
    .where(eq(adminCompaniesTable.id, companyId))
    .limit(1);
  if (!row) return null;
  const kind = String(row.company_kind ?? "taxi").trim() || "taxi";
  return {
    invoicePrefix: row.invoice_prefix?.trim() ? row.invoice_prefix.trim() : defaultInvoicePrefixForCompanyKind(kind),
    companyKind: kind,
  };
}

export type PanelSettlementOverviewExportSnapshot = {
  period: PanelSettlementPeriodQuery;
  periodTitle: string;
  periodDescription: string;
  periodHeadline: string;
  periodKindLabel: string;
  scopeNote: string;
  documentNumber: string;
  commissionRate: number | null;
  settlement: PanelFinancialSettlementWindow;
  completedRides: number;
  paymentStats: PanelPaymentPeriodStats;
};

export async function getPanelSettlementOverviewExportSnapshot(
  companyId: string,
  query: PanelSettlementPeriodQuery,
): Promise<PanelSettlementOverviewExportSnapshot | null> {
  const db = getDb();
  if (!db) return null;

  const createdAtFilter = buildPanelSettlementCompletedAtFilter(query);
  const adjustmentFilter = buildPanelAdjustmentCreatedAtFilter(query);
  const labels = formatPanelSettlementPeriodLabels(query);
  const generatedAt = new Date();
  const [stats, settlement, paymentStats, commissionRate, invoiceMeta] = await Promise.all([
    queryPanelCompletedPeriodStats(db, companyId, createdAtFilter),
    queryPanelFinancialSettlement(db, companyId, createdAtFilter, adjustmentFilter),
    queryPanelPaymentStatsForPeriod(db, companyId, createdAtFilter),
    getPanelCompanyCommissionRate(companyId),
    getPanelCompanyInvoiceMeta(companyId),
  ]);

  const documentNumber = formatSettlementDocumentNumber(
    invoiceMeta?.invoicePrefix,
    invoiceMeta?.companyKind ?? "taxi",
    query,
    generatedAt,
  );

  return {
    period: query,
    periodTitle: labels.title,
    periodDescription: labels.description,
    periodHeadline: labels.headline,
    periodKindLabel: labels.kindLabel,
    scopeNote: labels.scopeNote,
    documentNumber,
    commissionRate,
    settlement,
    completedRides: stats.completedRides,
    paymentStats,
  };
}

export function settlementExportPdfFilename(
  companyName: string,
  query: PanelSettlementPeriodQuery,
  now = new Date(),
): string {
  const berlin = berlinCalendarParts(now);
  const safeCo = companyName.replace(/[^a-zA-Z0-9äöüÄÖÜß-]+/g, "-").replace(/-+/g, "-").slice(0, 36) || "mandant";
  let slug = query.period;
  if (query.period === "week") slug = query.weekMode === "calendar" ? "woche-kw" : "woche-roll";
  if (query.period === "month") {
    const y = query.year ?? berlin.year;
    const m = String(query.month ?? berlin.month).padStart(2, "0");
    slug = `monat-${y}-${m}`;
  } else if (query.period === "year") {
    slug = `jahr-${query.year ?? berlin.year}`;
  } else if (query.period === "today") {
    slug = `tag-${berlin.year}-${String(berlin.month).padStart(2, "0")}-${String(berlin.day).padStart(2, "0")}`;
  }
  return `Onroda-Abrechnung-${slug}-${safeCo}.pdf`;
}

export async function getPanelCompanyCommissionRate(companyId: string): Promise<number | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({ commission_rate: adminCompaniesTable.commission_rate })
    .from(adminCompaniesTable)
    .where(eq(adminCompaniesTable.id, companyId))
    .limit(1);
  const r = row?.commission_rate;
  if (typeof r !== "number" || !Number.isFinite(r)) return null;
  return Math.min(1, Math.max(0, r));
}

/** Abrechnungszeitraum: Fahrtende (completed_at), Fallback created_at für Altbestand ohne Event. */
export function panelSettlementRideCompletedAtExpr(): SQL {
  return sql`coalesce(${ridesTable.completed_at}, ${ridesTable.created_at})`;
}

/**
 * Absolutes Berlin-Datumsfenster [periodStart, periodEnd] inklusiv (Tage).
 * Ende = Mitternacht des Folgetags von periodEnd.
 */
export function buildPanelSettlementCompletedAtDateRangeFilter(
  periodStartIso: string,
  periodEndInclusiveIso: string,
): SQL {
  const settlementAt = panelSettlementRideCompletedAtExpr();
  const [ys, ms, ds] = periodStartIso.split("-").map((x) => Number(x));
  const endExclusive = (() => {
    const d = new Date(`${periodEndInclusiveIso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const [ye, me, de] = endExclusive.split("-").map((x) => Number(x));
  const startTs = sql`(make_timestamptz(${ys}, ${ms}, ${ds}, 0, 0, 0, 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')`;
  const endTs = sql`(make_timestamptz(${ye}, ${me}, ${de}, 0, 0, 0, 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')`;
  return and(gte(settlementAt, startTs), lt(settlementAt, endTs)) as SQL;
}

/** Korrekturen: gleiche Datumsgrenzen auf coalesce(approved_at, created_at). */
export function buildPanelAdjustmentEffectiveAtDateRangeFilter(
  periodStartIso: string,
  periodEndInclusiveIso: string,
): SQL {
  const effectiveAt = rideFinancialAdjustmentEffectiveAtExpr();
  const [ys, ms, ds] = periodStartIso.split("-").map((x) => Number(x));
  const endExclusive = (() => {
    const d = new Date(`${periodEndInclusiveIso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const [ye, me, de] = endExclusive.split("-").map((x) => Number(x));
  const startTs = sql`(make_timestamptz(${ys}, ${ms}, ${ds}, 0, 0, 0, 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')`;
  const endTs = sql`(make_timestamptz(${ye}, ${me}, ${de}, 0, 0, 0, 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')`;
  return and(gte(effectiveAt, startTs), lt(effectiveAt, endTs)) as SQL;
}

export function buildPanelSettlementCompletedAtFilter(
  query: PanelSettlementPeriodQuery,
  now = new Date(),
): SQL | undefined {
  const settlementAt = panelSettlementRideCompletedAtExpr();
  const year = normalizePanelSettlementYear(query.year, now);
  const berlin = berlinCalendarParts(now);
  const monthYear = query.year != null ? year : berlin.year;
  const monthNum = query.month ?? berlin.month;
  const nextMonthYear = monthNum === 12 ? monthYear + 1 : monthYear;
  const nextMonthNum = monthNum === 12 ? 1 : monthNum + 1;

  const berlinTodayStart = sql`((now() AT TIME ZONE 'Europe/Berlin')::date) AT TIME ZONE 'Europe/Berlin'`;
  const berlinTodayEnd = sql`(((now() AT TIME ZONE 'Europe/Berlin')::date + interval '1 day') AT TIME ZONE 'Europe/Berlin')`;
  const berlinMonthStart = sql`(make_timestamptz(${monthYear}, ${monthNum}, 1, 0, 0, 0, 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')`;
  const berlinMonthEnd = sql`(make_timestamptz(${nextMonthYear}, ${nextMonthNum}, 1, 0, 0, 0, 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')`;
  const berlinYearStart = sql`(make_timestamptz(${year}, 1, 1, 0, 0, 0, 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')`;
  const berlinYearEnd = sql`(make_timestamptz(${year + 1}, 1, 1, 0, 0, 0, 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')`;
  const weekRollingStart = sql`(now() - interval '7 days')`;
  const berlinWeekStart = sql`(date_trunc('week', (now() AT TIME ZONE 'Europe/Berlin')) AT TIME ZONE 'Europe/Berlin')`;
  const berlinWeekEnd = sql`((date_trunc('week', (now() AT TIME ZONE 'Europe/Berlin')) + interval '7 days') AT TIME ZONE 'Europe/Berlin')`;

  switch (query.period) {
    case "today":
      return and(gte(settlementAt, berlinTodayStart), lt(settlementAt, berlinTodayEnd)) as SQL;
    case "week":
      if (query.weekMode === "calendar") {
        return and(gte(settlementAt, berlinWeekStart), lt(settlementAt, berlinWeekEnd)) as SQL;
      }
      return gte(settlementAt, weekRollingStart);
    case "weekCalendar":
      return and(gte(settlementAt, berlinWeekStart), lt(settlementAt, berlinWeekEnd)) as SQL;
    case "month":
      return and(gte(settlementAt, berlinMonthStart), lt(settlementAt, berlinMonthEnd)) as SQL;
    case "year":
      return and(gte(settlementAt, berlinYearStart), lt(settlementAt, berlinYearEnd)) as SQL;
    default:
      return undefined;
  }
}

/** @deprecated Alias — filtert nach Fahrtende (`completed_at`), nicht Buchungsdatum. */
export const buildPanelSettlementCreatedAtFilter = buildPanelSettlementCompletedAtFilter;

/** Korrekturen nach Wirksamkeit `coalesce(approved_at, created_at)` (gleicher Perioden-Kalender). */
export function buildPanelAdjustmentCreatedAtFilter(
  query: PanelSettlementPeriodQuery,
  now = new Date(),
): SQL | undefined {
  const createdAt = rideFinancialAdjustmentEffectiveAtExpr();
  const year = normalizePanelSettlementYear(query.year, now);
  const berlin = berlinCalendarParts(now);
  const monthYear = query.year != null ? year : berlin.year;
  const monthNum = query.month ?? berlin.month;
  const nextMonthYear = monthNum === 12 ? monthYear + 1 : monthYear;
  const nextMonthNum = monthNum === 12 ? 1 : monthNum + 1;

  const berlinTodayStart = sql`((now() AT TIME ZONE 'Europe/Berlin')::date) AT TIME ZONE 'Europe/Berlin'`;
  const berlinTodayEnd = sql`(((now() AT TIME ZONE 'Europe/Berlin')::date + interval '1 day') AT TIME ZONE 'Europe/Berlin')`;
  const berlinMonthStart = sql`(make_timestamptz(${monthYear}, ${monthNum}, 1, 0, 0, 0, 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')`;
  const berlinMonthEnd = sql`(make_timestamptz(${nextMonthYear}, ${nextMonthNum}, 1, 0, 0, 0, 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')`;
  const berlinYearStart = sql`(make_timestamptz(${year}, 1, 1, 0, 0, 0, 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')`;
  const berlinYearEnd = sql`(make_timestamptz(${year + 1}, 1, 1, 0, 0, 0, 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')`;
  const weekRollingStart = sql`(now() - interval '7 days')`;
  const berlinWeekStart = sql`(date_trunc('week', (now() AT TIME ZONE 'Europe/Berlin')) AT TIME ZONE 'Europe/Berlin')`;
  const berlinWeekEnd = sql`((date_trunc('week', (now() AT TIME ZONE 'Europe/Berlin')) + interval '7 days') AT TIME ZONE 'Europe/Berlin')`;

  switch (query.period) {
    case "today":
      return and(gte(createdAt, berlinTodayStart), lt(createdAt, berlinTodayEnd)) as SQL;
    case "week":
      if (query.weekMode === "calendar") {
        return and(gte(createdAt, berlinWeekStart), lt(createdAt, berlinWeekEnd)) as SQL;
      }
      return gte(createdAt, weekRollingStart);
    case "weekCalendar":
      return and(gte(createdAt, berlinWeekStart), lt(createdAt, berlinWeekEnd)) as SQL;
    case "month":
      return and(gte(createdAt, berlinMonthStart), lt(createdAt, berlinMonthEnd)) as SQL;
    case "year":
      return and(gte(createdAt, berlinYearStart), lt(createdAt, berlinYearEnd)) as SQL;
    default:
      return undefined;
  }
}

export async function queryPanelFinancialSettlement(
  db: NonNullable<ReturnType<typeof getDb>>,
  companyId: string,
  createdAtFilter?: SQL,
  adjustmentCreatedAtFilter?: SQL,
): Promise<PanelFinancialSettlementWindow> {
  const conditions: SQL[] = cashCardNettingRideConditions(companyId);
  if (createdAtFilter) conditions.push(createdAtFilter);

  const [row] = await db
    .select({
      grossAmount: sql<string>`coalesce(sum(${rideFinancialsTable.gross_amount}), 0)`,
      commissionAmount: sql<string>`coalesce(sum(${rideFinancialsTable.commission_amount}), 0)`,
      operatorPayoutAmount: sql<string>`coalesce(sum(${rideFinancialsTable.operator_payout_amount}), 0)`,
    })
    .from(rideFinancialsTable)
    .innerJoin(ridesTable, eq(rideFinancialsTable.ride_id, ridesTable.id))
    .where(and(...conditions));

  const adj = await sumAdjustmentsForCompany(companyId, adjustmentCreatedAtFilter);

  return {
    grossAmount: Number(row?.grossAmount ?? 0) + adj.grossDelta,
    commissionAmount: Number(row?.commissionAmount ?? 0) + adj.commissionDelta,
    operatorPayoutAmount: Number(row?.operatorPayoutAmount ?? 0) + adj.operatorPayoutDelta,
    adjustmentCount: adj.count,
    adjustmentOperatorPayoutDelta: adj.operatorPayoutDelta,
  };
}

export async function queryPanelPaymentStatsForPeriod(
  db: NonNullable<ReturnType<typeof getDb>>,
  companyId: string,
  createdAtFilter?: SQL,
): Promise<PanelPaymentPeriodStats> {
  const conditions: SQL[] = cashCardNettingRideConditions(companyId);
  if (createdAtFilter) conditions.push(createdAtFilter);

  const [row] = await db
    .select({
      tipTotal: sql<string>`coalesce(sum(coalesce(${rideFinancialsTable.tip_amount}, ${ridesTable.tip_amount}, 0)), 0)`,
      cardRideCount: sql<number>`count(*) FILTER (WHERE ${CARD_PM_SQL})::int`,
      cashRideCount: sql<number>`count(*) FILTER (WHERE ${CASH_PM_SQL})::int`,
      cardGrossAmount: sql<string>`coalesce(sum(${rideFinancialsTable.gross_amount}) FILTER (WHERE ${CARD_PM_SQL}), 0)`,
      cashGrossAmount: sql<string>`coalesce(sum(${rideFinancialsTable.gross_amount}) FILTER (WHERE ${CASH_PM_SQL}), 0)`,
      failedPaymentCount: sql<number>`count(*) FILTER (WHERE ${CARD_PM_SQL} AND ${ridesTable.payment_status} = 'failed')::int`,
      pendingPaymentCount: sql<number>`count(*) FILTER (WHERE ${CARD_PM_SQL} AND ${ridesTable.payment_status} IN ('pending', 'authorized'))::int`,
      feeRideCount: sql<number>`count(*) FILTER (WHERE ${ridesTable.status} IN ('cancelled', 'cancelled_by_customer', 'cancelled_by_driver', 'no_show'))::int`,
      feeGrossAmount: sql<string>`coalesce(sum(${rideFinancialsTable.gross_amount}) FILTER (WHERE ${ridesTable.status} IN ('cancelled', 'cancelled_by_customer', 'cancelled_by_driver', 'no_show')), 0)`,
      stripeFeeTotal: sql<string>`coalesce(sum(coalesce(${rideFinancialsTable.stripe_fee_amount}, 0)), 0)`,
    })
    .from(ridesTable)
    .leftJoin(rideFinancialsTable, eq(rideFinancialsTable.ride_id, ridesTable.id))
    .where(and(...conditions));

  return {
    tipTotal: Number(row?.tipTotal ?? 0),
    cardRideCount: Number(row?.cardRideCount ?? 0),
    cashRideCount: Number(row?.cashRideCount ?? 0),
    cardGrossAmount: Number(row?.cardGrossAmount ?? 0),
    cashGrossAmount: Number(row?.cashGrossAmount ?? 0),
    failedPaymentCount: Number(row?.failedPaymentCount ?? 0),
    pendingPaymentCount: Number(row?.pendingPaymentCount ?? 0),
    feeRideCount: Number(row?.feeRideCount ?? 0),
    feeGrossAmount: Number(row?.feeGrossAmount ?? 0),
    stripeFeeTotal: Number(row?.stripeFeeTotal ?? 0),
  };
}

export async function queryPanelCompletedPeriodStats(
  db: NonNullable<ReturnType<typeof getDb>>,
  companyId: string,
  createdAtFilter?: SQL,
): Promise<{ completedRides: number; revenue: number; avgCompletedFare: number | null }> {
  const conditions: SQL[] = [eq(ridesTable.status, "completed"), companyIdMatchCondition(companyId)];
  if (createdAtFilter) conditions.push(createdAtFilter);

  const [row] = await db
    .select({
      completedRides: sql<number>`count(*)::int`,
      revenue: sql<string>`coalesce(sum(coalesce(${ridesTable.final_fare}, ${ridesTable.estimated_fare})), 0)`,
      avgCompletedFare: sql<string>`coalesce(avg(coalesce(${ridesTable.final_fare}, ${ridesTable.estimated_fare})), 0)`,
    })
    .from(ridesTable)
    .where(and(...conditions));

  const completedRides = Number(row?.completedRides ?? 0);
  return {
    completedRides,
    revenue: Number(row?.revenue ?? 0),
    avgCompletedFare: completedRides > 0 ? Number(row?.avgCompletedFare ?? 0) : null,
  };
}

export async function listPanelSettlementRides(
  companyId: string,
  query: PanelSettlementPeriodQuery,
  limit = 200,
): Promise<{
  rides: PanelSettlementRideRow[];
  adjustments: RideFinancialAdjustmentRow[];
  period: PanelSettlementPeriodQuery;
}> {
  const db = getDb();
  if (!db) return { rides: [], adjustments: [], period: query };

  const completedAtFilter = buildPanelSettlementCompletedAtFilter(query);
  const conditions: SQL[] = cashCardNettingRideConditions(companyId);
  if (completedAtFilter) conditions.push(completedAtFilter);
  const settlementAt = panelSettlementRideCompletedAtExpr();

  const rows = await db
    .select({
      id: ridesTable.id,
      settlementAt,
      from: ridesTable.from_label,
      to: ridesTable.to_label,
      status: ridesTable.status,
      paymentMethod: ridesTable.payment_method,
      paymentStatus: ridesTable.payment_status,
      estimatedFare: ridesTable.estimated_fare,
      finalFare: ridesTable.final_fare,
      tipAmount: sql<number | null>`coalesce(${rideFinancialsTable.tip_amount}, ${ridesTable.tip_amount})`,
      stripeFeeAmount: rideFinancialsTable.stripe_fee_amount,
      grossAmount: rideFinancialsTable.gross_amount,
      commissionAmount: rideFinancialsTable.commission_amount,
      operatorPayoutAmount: rideFinancialsTable.operator_payout_amount,
      financialId: rideFinancialsTable.id,
      driverFirst: fleetDriversTable.first_name,
      driverLast: fleetDriversTable.last_name,
    })
    .from(ridesTable)
    .leftJoin(rideFinancialsTable, eq(rideFinancialsTable.ride_id, ridesTable.id))
    .leftJoin(fleetDriversTable, eq(fleetDriversTable.id, ridesTable.driver_id))
    .where(and(...conditions))
    .orderBy(desc(settlementAt))
    .limit(Math.min(Math.max(limit, 1), 500));

  const rides: PanelSettlementRideRow[] = rows.map((r) => {
    const first = (r.driverFirst ?? "").trim();
    const last = (r.driverLast ?? "").trim();
    const driverName = [first, last].filter(Boolean).join(" ") || null;
    const hasFinancials = Boolean(r.financialId);
    const settlementAtIso =
      r.settlementAt instanceof Date
        ? r.settlementAt.toISOString()
        : new Date(String(r.settlementAt)).toISOString();
    return {
      id: r.id,
      createdAt: settlementAtIso,
      from: r.from ?? "",
      to: r.to ?? "",
      status: r.status,
      paymentMethod: r.paymentMethod ?? "",
      paymentStatus: r.paymentStatus ?? "pending",
      driverName,
      grossAmount: hasFinancials && r.grossAmount != null ? Number(r.grossAmount) : null,
      commissionAmount: hasFinancials && r.commissionAmount != null ? Number(r.commissionAmount) : null,
      operatorPayoutAmount:
        hasFinancials && r.operatorPayoutAmount != null ? Number(r.operatorPayoutAmount) : null,
      tipAmount: r.tipAmount != null && Number.isFinite(Number(r.tipAmount)) ? Number(r.tipAmount) : null,
      stripeFeeAmount:
        hasFinancials && r.stripeFeeAmount != null && Number.isFinite(Number(r.stripeFeeAmount))
          ? Number(r.stripeFeeAmount)
          : null,
      estimatedFare: r.estimatedFare != null ? Number(r.estimatedFare) : null,
      finalFare: r.finalFare != null ? Number(r.finalFare) : null,
      hasFinancials,
    };
  });

  const adjFilter = buildPanelAdjustmentCreatedAtFilter(query);
  const dbAdj = getDb();
  let adjAll: RideFinancialAdjustmentRow[] = [];
  if (dbAdj) {
    const adjConds = [
      eq(rideFinancialAdjustmentsTable.company_id, companyId.trim()),
      eq(rideFinancialAdjustmentsTable.approval_status, "approved"),
    ];
    if (adjFilter) adjConds.push(adjFilter);
    const adjRows = await dbAdj
      .select()
      .from(rideFinancialAdjustmentsTable)
      .where(and(...adjConds))
      .orderBy(desc(rideFinancialAdjustmentsTable.created_at))
      .limit(Math.min(Math.max(limit, 1), 500));
    adjAll = adjRows.map(mapRideFinancialAdjustmentRow);
  }

  return { rides, adjustments: adjAll, period: query };
}
