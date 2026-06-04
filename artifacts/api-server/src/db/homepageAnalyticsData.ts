import { randomUUID } from "node:crypto";
import { and, count, countDistinct, desc, eq, gte, sql } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { homepageAnalyticsEventsTable } from "./schema";
import {
  type HomepageAnalyticsEventType,
  type HomepageAnalyticsRange,
  daysAgoStart,
  rangeStartDate,
  startOfToday,
} from "../lib/homepageAnalyticsPrivacy";

export type InsertHomepageAnalyticsEventInput = {
  eventType: HomepageAnalyticsEventType;
  pagePath: string;
  referrer: string | null;
  deviceType: string;
  browser: string;
  country: string | null;
  anonymousVisitorId: string;
};

export async function insertHomepageAnalyticsEvent(
  input: InsertHomepageAnalyticsEventInput,
): Promise<boolean> {
  if (!isPostgresConfigured()) return false;
  const db = getDb();
  if (!db) return false;
  await db.insert(homepageAnalyticsEventsTable).values({
    id: `hpa-${randomUUID()}`,
    event_type: input.eventType,
    page_path: input.pagePath,
    referrer: input.referrer,
    device_type: input.deviceType,
    browser: input.browser,
    country: input.country,
    anonymous_visitor_id: input.anonymousVisitorId,
  });
  return true;
}

async function countDistinctVisitorsSince(since: Date): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const rows = await db
    .select({ n: countDistinct(homepageAnalyticsEventsTable.anonymous_visitor_id) })
    .from(homepageAnalyticsEventsTable)
    .where(
      and(
        gte(homepageAnalyticsEventsTable.created_at, since),
        eq(homepageAnalyticsEventsTable.event_type, "page_view"),
      ),
    );
  return Number(rows[0]?.n ?? 0);
}

export type AdminHomepageAnalyticsSummary = {
  visitorsToday: number;
  visitors7d: number;
  visitors30d: number;
  pageViewsToday: number;
  pageViewsRange: number;
  eventsRange: number;
  range: HomepageAnalyticsRange;
  daily: Array<{ date: string; visitors: number; pageViews: number }>;
};

export async function getAdminHomepageAnalyticsSummary(
  range: HomepageAnalyticsRange,
): Promise<AdminHomepageAnalyticsSummary> {
  const now = new Date();
  const todayStart = startOfToday(now);
  const rangeStart = rangeStartDate(range, now);
  const start7 = daysAgoStart(7, now);
  const start30 = daysAgoStart(30, now);

  const [visitorsToday, visitors7d, visitors30d, pageViewsToday, pageViewsRange, eventsRange, daily] =
    await Promise.all([
      countDistinctVisitorsSince(todayStart),
      countDistinctVisitorsSince(start7),
      countDistinctVisitorsSince(start30),
      countEventsSince(todayStart, "page_view"),
      countEventsSince(rangeStart, "page_view"),
      countAllEventsSince(rangeStart),
      listDailySeries(rangeStart),
    ]);

  return {
    visitorsToday,
    visitors7d,
    visitors30d,
    pageViewsToday,
    pageViewsRange,
    eventsRange,
    range,
    daily,
  };
}

async function countEventsSince(since: Date, eventType?: HomepageAnalyticsEventType): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const cond = eventType
    ? and(gte(homepageAnalyticsEventsTable.created_at, since), eq(homepageAnalyticsEventsTable.event_type, eventType))
    : gte(homepageAnalyticsEventsTable.created_at, since);
  const rows = await db.select({ n: count() }).from(homepageAnalyticsEventsTable).where(cond);
  return Number(rows[0]?.n ?? 0);
}

async function countAllEventsSince(since: Date): Promise<number> {
  return countEventsSince(since);
}

async function listDailySeries(since: Date): Promise<Array<{ date: string; visitors: number; pageViews: number }>> {
  const db = getDb();
  if (!db) return [];
  const result = await db.execute(sql`
    SELECT
      to_char((created_at AT TIME ZONE 'Europe/Berlin')::date, 'YYYY-MM-DD') AS day,
      COUNT(DISTINCT anonymous_visitor_id) FILTER (WHERE event_type = 'page_view')::int AS visitors,
      COUNT(*) FILTER (WHERE event_type = 'page_view')::int AS page_views
    FROM homepage_analytics_events
    WHERE created_at >= ${since}
    GROUP BY 1
    ORDER BY 1 ASC
  `);
  const list = result.rows as Array<{ day: string; visitors: number; page_views: number }>;
  return list.map((r) => ({
    date: String(r.day),
    visitors: Number(r.visitors ?? 0),
    pageViews: Number(r.page_views ?? 0),
  }));
}

export type AdminHomepageAnalyticsRow = { label: string; count: number };

export async function getAdminHomepageAnalyticsPages(
  range: HomepageAnalyticsRange,
): Promise<AdminHomepageAnalyticsRow[]> {
  const db = getDb();
  if (!db) return [];
  const since = rangeStartDate(range);
  const rows = await db
    .select({
      label: homepageAnalyticsEventsTable.page_path,
      count: count(),
    })
    .from(homepageAnalyticsEventsTable)
    .where(
      and(
        gte(homepageAnalyticsEventsTable.created_at, since),
        eq(homepageAnalyticsEventsTable.event_type, "page_view"),
      ),
    )
    .groupBy(homepageAnalyticsEventsTable.page_path)
    .orderBy(desc(count()))
    .limit(20);
  return rows.map((r) => ({ label: r.label ?? "/", count: Number(r.count ?? 0) }));
}

export async function getAdminHomepageAnalyticsSources(
  range: HomepageAnalyticsRange,
): Promise<AdminHomepageAnalyticsRow[]> {
  const db = getDb();
  if (!db) return [];
  const since = rangeStartDate(range);
  const result = await db.execute(sql`
    SELECT
      COALESCE(
        NULLIF(
          regexp_replace(
            COALESCE(referrer, ''),
            '^https?://([^/]+).*$',
            E'\\1'
          ),
          ''
        ),
        '(direkt)'
      ) AS source,
      COUNT(*)::int AS cnt
    FROM homepage_analytics_events
    WHERE created_at >= ${since}
      AND event_type = 'page_view'
    GROUP BY 1
    ORDER BY cnt DESC
    LIMIT 20
  `);
  const list = result.rows as Array<{ source: string; cnt: number }>;
  return list.map((r) => ({ label: String(r.source), count: Number(r.cnt ?? 0) }));
}

export async function getAdminHomepageAnalyticsDevices(
  range: HomepageAnalyticsRange,
): Promise<{ devices: AdminHomepageAnalyticsRow[]; browsers: AdminHomepageAnalyticsRow[] }> {
  const db = getDb();
  if (!db) return { devices: [], browsers: [] };
  const since = rangeStartDate(range);
  const deviceRows = await db
    .select({
      label: homepageAnalyticsEventsTable.device_type,
      count: count(),
    })
    .from(homepageAnalyticsEventsTable)
    .where(
      and(gte(homepageAnalyticsEventsTable.created_at, since), eq(homepageAnalyticsEventsTable.event_type, "page_view")),
    )
    .groupBy(homepageAnalyticsEventsTable.device_type)
    .orderBy(desc(count()));
  const browserRows = await db
    .select({
      label: homepageAnalyticsEventsTable.browser,
      count: count(),
    })
    .from(homepageAnalyticsEventsTable)
    .where(
      and(gte(homepageAnalyticsEventsTable.created_at, since), eq(homepageAnalyticsEventsTable.event_type, "page_view")),
    )
    .groupBy(homepageAnalyticsEventsTable.browser)
    .orderBy(desc(count()));
  const deviceLabel: Record<string, string> = {
    mobile: "Mobil",
    tablet: "Tablet",
    desktop: "Desktop",
    unknown: "Unbekannt",
  };
  return {
    devices: deviceRows.map((r) => ({
      label: deviceLabel[String(r.label ?? "unknown")] ?? String(r.label ?? "Unbekannt"),
      count: Number(r.count ?? 0),
    })),
    browsers: browserRows.map((r) => ({
      label: String(r.label ?? "Unbekannt"),
      count: Number(r.count ?? 0),
    })),
  };
}
