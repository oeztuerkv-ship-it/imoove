import { and, desc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { getDb } from "./client";
import {
  adminCompaniesTable,
  fleetDriversTable,
  rideFinancialsTable,
  ridesTable,
} from "./schema";
function companyIdMatchCondition(companyId: string): SQL {
  return sql`${ridesTable.company_id}::text = ${companyId}`;
}

export type PanelFinancialSettlementWindow = {
  grossAmount: number;
  commissionAmount: number;
  operatorPayoutAmount: number;
};

export type PanelPaymentPeriodStats = {
  tipTotal: number;
  cardRideCount: number;
  cashRideCount: number;
  cardGrossAmount: number;
  cashGrossAmount: number;
  failedPaymentCount: number;
  pendingPaymentCount: number;
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
): { title: string; description: string } {
  const zone = "Europe/Berlin";
  const berlin = berlinCalendarParts(now);
  const fmtMonthLong = (y: number, m: number) =>
    new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("de-DE", {
      timeZone: zone,
      month: "long",
      year: "numeric",
    });
  const stand = now.toLocaleString("de-DE", {
    timeZone: zone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  switch (query.period) {
    case "today": {
      const label = now.toLocaleDateString("de-DE", {
        timeZone: zone,
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      return {
        title: "Kalendertag",
        description: `${label} · abgeschlossene Fahrten nach Erstellungszeitpunkt (Europe/Berlin)`,
      };
    }
    case "week":
      if (query.weekMode === "calendar") {
        return {
          title: "Kalenderwoche",
          description: `Montag–Sonntag (Europe/Berlin) · Stand ${stand}`,
        };
      }
      return {
        title: "Rollierende Woche",
        description: `7×24 Stunden ab jetzt · Stand ${stand}`,
      };
    case "weekCalendar":
      return {
        title: "Kalenderwoche",
        description: `Montag–Sonntag (Europe/Berlin) · Stand ${stand}`,
      };
    case "month": {
      const y = query.year ?? berlin.year;
      const m = query.month ?? berlin.month;
      return {
        title: "Kalendermonat",
        description: `${fmtMonthLong(y, m)} · abgeschlossene Fahrten nach Erstellungszeitpunkt`,
      };
    }
    case "year": {
      const y = query.year ?? berlin.year;
      return {
        title: "Kalenderjahr",
        description: `Jahr ${y} (Europe/Berlin) · abgeschlossene Fahrten nach Erstellungszeitpunkt`,
      };
    }
    default:
      return { title: "Zeitraum", description: "Europe/Berlin" };
  }
}

export type PanelSettlementOverviewExportSnapshot = {
  period: PanelSettlementPeriodQuery;
  periodTitle: string;
  periodDescription: string;
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

  const createdAtFilter = buildPanelSettlementCreatedAtFilter(query);
  const labels = formatPanelSettlementPeriodLabels(query);
  const [stats, settlement, paymentStats, commissionRate] = await Promise.all([
    queryPanelCompletedPeriodStats(db, companyId, createdAtFilter),
    queryPanelFinancialSettlement(db, companyId, createdAtFilter),
    queryPanelPaymentStatsForPeriod(db, companyId, createdAtFilter),
    getPanelCompanyCommissionRate(companyId),
  ]);

  return {
    period: query,
    periodTitle: labels.title,
    periodDescription: labels.description,
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

export function buildPanelSettlementCreatedAtFilter(
  query: PanelSettlementPeriodQuery,
  now = new Date(),
): SQL | undefined {
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
      return and(gte(ridesTable.created_at, berlinTodayStart), lt(ridesTable.created_at, berlinTodayEnd)) as SQL;
    case "week":
      if (query.weekMode === "calendar") {
        return and(gte(ridesTable.created_at, berlinWeekStart), lt(ridesTable.created_at, berlinWeekEnd)) as SQL;
      }
      return gte(ridesTable.created_at, weekRollingStart);
    case "weekCalendar":
      return and(gte(ridesTable.created_at, berlinWeekStart), lt(ridesTable.created_at, berlinWeekEnd)) as SQL;
    case "month":
      return and(gte(ridesTable.created_at, berlinMonthStart), lt(ridesTable.created_at, berlinMonthEnd)) as SQL;
    case "year":
      return and(gte(ridesTable.created_at, berlinYearStart), lt(ridesTable.created_at, berlinYearEnd)) as SQL;
    default:
      return undefined;
  }
}

export async function queryPanelFinancialSettlement(
  db: NonNullable<ReturnType<typeof getDb>>,
  companyId: string,
  createdAtFilter?: SQL,
): Promise<PanelFinancialSettlementWindow> {
  const conditions: SQL[] = [eq(ridesTable.status, "completed"), companyIdMatchCondition(companyId)];
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

  return {
    grossAmount: Number(row?.grossAmount ?? 0),
    commissionAmount: Number(row?.commissionAmount ?? 0),
    operatorPayoutAmount: Number(row?.operatorPayoutAmount ?? 0),
  };
}

export async function queryPanelPaymentStatsForPeriod(
  db: NonNullable<ReturnType<typeof getDb>>,
  companyId: string,
  createdAtFilter?: SQL,
): Promise<PanelPaymentPeriodStats> {
  const conditions: SQL[] = [eq(ridesTable.status, "completed"), companyIdMatchCondition(companyId)];
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
): Promise<{ rides: PanelSettlementRideRow[]; period: PanelSettlementPeriodQuery }> {
  const db = getDb();
  if (!db) return { rides: [], period: query };

  const createdAtFilter = buildPanelSettlementCreatedAtFilter(query);
  const conditions: SQL[] = [eq(ridesTable.status, "completed"), companyIdMatchCondition(companyId)];
  if (createdAtFilter) conditions.push(createdAtFilter);

  const rows = await db
    .select({
      id: ridesTable.id,
      createdAt: ridesTable.created_at,
      from: ridesTable.from_label,
      to: ridesTable.to_label,
      status: ridesTable.status,
      paymentMethod: ridesTable.payment_method,
      paymentStatus: ridesTable.payment_status,
      estimatedFare: ridesTable.estimated_fare,
      finalFare: ridesTable.final_fare,
      tipAmount: sql<number | null>`coalesce(${rideFinancialsTable.tip_amount}, ${ridesTable.tip_amount})`,
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
    .orderBy(desc(ridesTable.created_at))
    .limit(Math.min(Math.max(limit, 1), 500));

  const rides: PanelSettlementRideRow[] = rows.map((r) => {
    const first = (r.driverFirst ?? "").trim();
    const last = (r.driverLast ?? "").trim();
    const driverName = [first, last].filter(Boolean).join(" ") || null;
    const hasFinancials = Boolean(r.financialId);
    return {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
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
      estimatedFare: r.estimatedFare != null ? Number(r.estimatedFare) : null,
      finalFare: r.finalFare != null ? Number(r.finalFare) : null,
      hasFinancials,
    };
  });

  return { rides, period: query };
}
