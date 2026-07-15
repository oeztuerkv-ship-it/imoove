import { sql } from "drizzle-orm";
import { getDb } from "./client";
import {
  CUSTOMER_CANCELLATION_WINDOW_HOURS,
  CUSTOMER_CANCELLATION_THRESHOLD,
} from "../lib/customerCancellationSuspensionPolicy";
import {
  FLEET_DRIVER_CANCELLATION_THRESHOLD,
  FLEET_DRIVER_CANCELLATION_WINDOW_DAYS,
} from "./fleetDriverCancellationSuspensionData";

export type CustomerCancellationSuspensionAdminItem = {
  passengerId: string;
  name: string;
  email: string;
  authProvider: string;
  suspendedAt: string;
  suspendedUntil: string;
  reason: string;
  cancellationCountInWindow: number;
  cancellationThreshold: number;
  windowHours: number;
};

export type FleetDriverCancellationSuspensionAdminItem = {
  fleetDriverId: string;
  companyId: string;
  companyName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  suspendedAt: string;
  suspendedUntil: string;
  reason: string;
  cancellationCountInWindow: number;
  cancellationThreshold: number;
  windowDays: number;
};

export type CancellationSuspensionsAdminListResult = {
  customers: CustomerCancellationSuspensionAdminItem[];
  drivers: FleetDriverCancellationSuspensionAdminItem[];
};

type CustomerSuspensionRow = {
  passenger_id: string;
  name: string | null;
  email: string | null;
  auth_provider: string | null;
  suspended_at: Date | string;
  suspended_until: Date | string;
  reason: string | null;
  cancellation_count_in_window: number | string | null;
};

type DriverSuspensionRow = {
  fleet_driver_id: string;
  company_id: string;
  company_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  suspended_at: Date | string;
  suspended_until: Date | string;
  reason: string | null;
  cancellation_count_in_window: number | string | null;
};

function iso(v: Date | string | null | undefined): string {
  if (!v) return "";
  return v instanceof Date ? v.toISOString() : String(v);
}

function suspensionSearchSql(q: string, columns: ReturnType<typeof sql>[]) {
  const needle = q.trim();
  if (!needle) return sql``;
  const pattern = `%${needle.replace(/[%_\\]/g, "\\$&")}%`;
  return sql`AND (${sql.join(
    columns.map((col) => sql`${col} ILIKE ${pattern}`),
    sql` OR `,
  )})`;
}

export async function listActiveCancellationSuspensionsAdmin(input?: {
  q?: string;
}): Promise<CancellationSuspensionsAdminListResult> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  const q = typeof input?.q === "string" ? input.q.trim() : "";

  const customerSearch = suspensionSearchSql(q, [
    sql`COALESCE(pp.name, '')`,
    sql`COALESCE(pp.email, '')`,
    sql`s.passenger_id`,
  ]);

  const customerRows = await db.execute(sql`
    SELECT
      s.passenger_id,
      COALESCE(pp.name, '') AS name,
      COALESCE(pp.email, '') AS email,
      COALESCE(pp.auth_provider, '') AS auth_provider,
      s.suspended_at,
      s.suspended_until,
      s.reason,
      (
        COALESCE(
          NULLIF((
            SELECT COUNT(*)::int
            FROM ride_events re
            WHERE re.event_type = 'cancel_reason'
              AND re.actor_type = 'passenger'
              AND re.actor_id = s.passenger_id
              AND re.created_at >= NOW() - (${CUSTOMER_CANCELLATION_WINDOW_HOURS}::int * INTERVAL '1 hour')
          ), 0),
          (
            SELECT COUNT(*)::int
            FROM rides r
            WHERE r.passenger_id = s.passenger_id
              AND r.status = 'cancelled_by_customer'
              AND r.updated_at >= NOW() - (${CUSTOMER_CANCELLATION_WINDOW_HOURS}::int * INTERVAL '1 hour')
          )
        )
      ) AS cancellation_count_in_window
    FROM customer_cancellation_suspension s
    LEFT JOIN passenger_profiles pp ON pp.passenger_id = s.passenger_id
    WHERE s.lifted_at IS NULL
      AND s.suspended_until >= NOW()
      ${customerSearch}
    ORDER BY s.suspended_until DESC
  `);

  const driverSearch = suspensionSearchSql(q, [
    sql`COALESCE(fd.first_name, '')`,
    sql`COALESCE(fd.last_name, '')`,
    sql`COALESCE(fd.email, '')`,
    sql`COALESCE(ac.name, '')`,
    sql`s.fleet_driver_id`,
  ]);

  const driverRows = await db.execute(sql`
    SELECT
      s.fleet_driver_id,
      s.company_id,
      COALESCE(ac.name, s.company_id) AS company_name,
      COALESCE(fd.first_name, '') AS first_name,
      COALESCE(fd.last_name, '') AS last_name,
      COALESCE(fd.email, '') AS email,
      COALESCE(fd.phone, '') AS phone,
      s.suspended_at,
      s.suspended_until,
      s.reason,
      (
        COALESCE(
          NULLIF((
            SELECT COUNT(*)::int
            FROM ride_events re
            WHERE re.event_type = 'driver_post_accept_cancel'
              AND re.actor_id = s.fleet_driver_id
              AND re.created_at >= NOW() - (${FLEET_DRIVER_CANCELLATION_WINDOW_DAYS}::int * INTERVAL '1 day')
              AND COALESCE(re.payload->>'companyId', '') = s.company_id
          ), 0),
          (
            SELECT COUNT(*)::int
            FROM rides r
            WHERE r.driver_id = s.fleet_driver_id
              AND r.company_id = s.company_id
              AND r.status = 'cancelled_by_driver'
              AND r.updated_at >= NOW() - (${FLEET_DRIVER_CANCELLATION_WINDOW_DAYS}::int * INTERVAL '1 day')
          )
        )
      ) AS cancellation_count_in_window
    FROM fleet_driver_cancellation_suspension s
    JOIN fleet_drivers fd ON fd.id = s.fleet_driver_id
    LEFT JOIN admin_companies ac ON ac.id = s.company_id
    WHERE s.lifted_at IS NULL
      AND s.suspended_until >= NOW()
      ${driverSearch}
    ORDER BY s.suspended_until DESC
  `);

  const customers = (customerRows.rows as CustomerSuspensionRow[]).map((row) => ({
    passengerId: row.passenger_id,
    name: row.name ?? "",
    email: row.email ?? "",
    authProvider: row.auth_provider ?? "",
    suspendedAt: iso(row.suspended_at),
    suspendedUntil: iso(row.suspended_until),
    reason: row.reason ?? "",
    cancellationCountInWindow: Number(row.cancellation_count_in_window ?? 0),
    cancellationThreshold: CUSTOMER_CANCELLATION_THRESHOLD,
    windowHours: CUSTOMER_CANCELLATION_WINDOW_HOURS,
  }));

  const drivers = (driverRows.rows as DriverSuspensionRow[]).map((row) => ({
    fleetDriverId: row.fleet_driver_id,
    companyId: row.company_id,
    companyName: row.company_name ?? row.company_id,
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    suspendedAt: iso(row.suspended_at),
    suspendedUntil: iso(row.suspended_until),
    reason: row.reason ?? "",
    cancellationCountInWindow: Number(row.cancellation_count_in_window ?? 0),
    cancellationThreshold: FLEET_DRIVER_CANCELLATION_THRESHOLD,
    windowDays: FLEET_DRIVER_CANCELLATION_WINDOW_DAYS,
  }));

  return { customers, drivers };
}
