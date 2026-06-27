import { and, count, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "../db/client";
import { fleetDriversTable, ridesTable } from "../db/schema";

export type AdminLiveBusinessSnapshot = {
  available: boolean;
  activeRides: number | null;
  onlineDrivers: number | null;
  todayCompletedRides: number | null;
  todayRevenueEur: number | null;
  currency: "EUR";
  timezone: "Europe/Berlin";
  error: string | null;
};

const ACTIVE_RIDE_STATUSES = ["searching_driver", "in_progress"] as const;
const ONLINE_DRIVER_WINDOW_SECONDS = 120;

const berlinTodayStart = sql`((now() AT TIME ZONE 'Europe/Berlin')::date) AT TIME ZONE 'Europe/Berlin'`;
const berlinTodayEnd = sql`(((now() AT TIME ZONE 'Europe/Berlin')::date + interval '1 day') AT TIME ZONE 'Europe/Berlin')`;

export async function countAllFleetDriversOnline(withinSeconds = ONLINE_DRIVER_WINDOW_SECONDS): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const since = new Date(Date.now() - withinSeconds * 1000);
  const [row] = await db
    .select({ n: count() })
    .from(fleetDriversTable)
    .where(
      and(
        eq(fleetDriversTable.access_status, "active"),
        eq(fleetDriversTable.is_active, true),
        isNotNull(fleetDriversTable.last_heartbeat_at),
        gte(fleetDriversTable.last_heartbeat_at, since),
      ),
    );
  return Number(row?.n ?? 0);
}

export async function collectAdminLiveBusinessMetrics(): Promise<AdminLiveBusinessSnapshot> {
  if (!isPostgresConfigured()) {
    return {
      available: false,
      activeRides: null,
      onlineDrivers: null,
      todayCompletedRides: null,
      todayRevenueEur: null,
      currency: "EUR",
      timezone: "Europe/Berlin",
      error: "database_not_configured",
    };
  }

  const db = getDb();
  if (!db) {
    return {
      available: false,
      activeRides: null,
      onlineDrivers: null,
      todayCompletedRides: null,
      todayRevenueEur: null,
      currency: "EUR",
      timezone: "Europe/Berlin",
      error: "database_unavailable",
    };
  }

  try {
    const [activeRow, onlineDrivers, todayRow] = await Promise.all([
      db
        .select({ n: count() })
        .from(ridesTable)
        .where(inArray(ridesTable.status, [...ACTIVE_RIDE_STATUSES])),
      countAllFleetDriversOnline(ONLINE_DRIVER_WINDOW_SECONDS),
      db
        .select({
          completedRides: count(),
          revenueSum: sql<string>`coalesce(sum(coalesce(${ridesTable.final_fare}, ${ridesTable.estimated_fare})), 0)`,
        })
        .from(ridesTable)
        .where(
          and(
            eq(ridesTable.status, "completed"),
            gte(ridesTable.created_at, berlinTodayStart),
            lt(ridesTable.created_at, berlinTodayEnd),
          ),
        ),
    ]);

    return {
      available: true,
      activeRides: Number(activeRow[0]?.n ?? 0),
      onlineDrivers,
      todayCompletedRides: Number(todayRow[0]?.completedRides ?? 0),
      todayRevenueEur: Number(todayRow[0]?.revenueSum ?? 0),
      currency: "EUR",
      timezone: "Europe/Berlin",
      error: null,
    };
  } catch (e) {
    return {
      available: false,
      activeRides: null,
      onlineDrivers: null,
      todayCompletedRides: null,
      todayRevenueEur: null,
      currency: "EUR",
      timezone: "Europe/Berlin",
      error: e instanceof Error ? e.message : "live_business_metrics_failed",
    };
  }
}
