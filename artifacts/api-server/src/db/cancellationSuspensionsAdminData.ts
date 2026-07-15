import { sql } from "drizzle-orm";
import { getDb } from "./client";
import { countPassengerCancellationsInLast24Hours } from "./customerCancellationSuspensionData";
import {
  countFleetDriverPostAcceptCancellationsInWindow,
  FLEET_DRIVER_CANCELLATION_THRESHOLD,
  FLEET_DRIVER_CANCELLATION_WINDOW_DAYS,
} from "./fleetDriverCancellationSuspensionData";
import {
  CUSTOMER_CANCELLATION_THRESHOLD,
  CUSTOMER_CANCELLATION_WINDOW_HOURS,
} from "../lib/customerCancellationSuspensionPolicy";

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
};

function iso(v: Date | string | null | undefined): string {
  if (!v) return "";
  return v instanceof Date ? v.toISOString() : String(v);
}

function customerSearchSql(q: string) {
  const needle = q.trim();
  if (!needle) return sql``;
  const pattern = `%${needle.replace(/[%_\\]/g, "\\$&")}%`;
  return sql`AND (
    COALESCE(pp.name, '') ILIKE ${pattern}
    OR COALESCE(pp.email, '') ILIKE ${pattern}
    OR s.passenger_id ILIKE ${pattern}
  )`;
}

function driverSearchSql(q: string) {
  const needle = q.trim();
  if (!needle) return sql``;
  const pattern = `%${needle.replace(/[%_\\]/g, "\\$&")}%`;
  return sql`AND (
    COALESCE(fd.first_name, '') ILIKE ${pattern}
    OR COALESCE(fd.last_name, '') ILIKE ${pattern}
    OR COALESCE(fd.email, '') ILIKE ${pattern}
    OR COALESCE(ac.name, '') ILIKE ${pattern}
    OR s.fleet_driver_id ILIKE ${pattern}
  )`;
}

function isMissingRelationError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /relation .* does not exist|42P01/i.test(msg);
}

async function listActiveCustomerCancellationSuspensionsAdmin(
  q: string,
): Promise<CustomerCancellationSuspensionAdminItem[]> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");

  const result = await db.execute(sql`
    SELECT
      s.passenger_id,
      COALESCE(pp.name, '') AS name,
      COALESCE(pp.email, '') AS email,
      COALESCE(pp.auth_provider, '') AS auth_provider,
      s.suspended_at,
      s.suspended_until,
      s.reason
    FROM customer_cancellation_suspension s
    LEFT JOIN passenger_profiles pp ON pp.passenger_id = s.passenger_id
    WHERE s.lifted_at IS NULL
      AND s.suspended_until >= NOW()
      ${customerSearchSql(q)}
    ORDER BY s.suspended_until DESC
  `);

  const rows = result.rows as CustomerSuspensionRow[];
  return Promise.all(
    rows.map(async (row) => ({
      passengerId: row.passenger_id,
      name: row.name ?? "",
      email: row.email ?? "",
      authProvider: row.auth_provider ?? "",
      suspendedAt: iso(row.suspended_at),
      suspendedUntil: iso(row.suspended_until),
      reason: row.reason ?? "",
      cancellationCountInWindow: await countPassengerCancellationsInLast24Hours(row.passenger_id),
      cancellationThreshold: CUSTOMER_CANCELLATION_THRESHOLD,
      windowHours: CUSTOMER_CANCELLATION_WINDOW_HOURS,
    })),
  );
}

async function listActiveFleetDriverCancellationSuspensionsAdmin(
  q: string,
): Promise<FleetDriverCancellationSuspensionAdminItem[]> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");

  const result = await db.execute(sql`
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
      s.reason
    FROM fleet_driver_cancellation_suspension s
    JOIN fleet_drivers fd ON fd.id = s.fleet_driver_id
    LEFT JOIN admin_companies ac ON ac.id = s.company_id
    WHERE s.lifted_at IS NULL
      AND s.suspended_until >= NOW()
      ${driverSearchSql(q)}
    ORDER BY s.suspended_until DESC
  `);

  const rows = result.rows as DriverSuspensionRow[];
  return Promise.all(
    rows.map(async (row) => ({
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
      cancellationCountInWindow: await countFleetDriverPostAcceptCancellationsInWindow(
        row.fleet_driver_id,
        row.company_id,
      ),
      cancellationThreshold: FLEET_DRIVER_CANCELLATION_THRESHOLD,
      windowDays: FLEET_DRIVER_CANCELLATION_WINDOW_DAYS,
    })),
  );
}

export async function listActiveCancellationSuspensionsAdmin(input?: {
  q?: string;
}): Promise<CancellationSuspensionsAdminListResult> {
  const q = typeof input?.q === "string" ? input.q.trim() : "";

  let customers: CustomerCancellationSuspensionAdminItem[] = [];
  let drivers: FleetDriverCancellationSuspensionAdminItem[] = [];

  try {
    customers = await listActiveCustomerCancellationSuspensionsAdmin(q);
  } catch (e) {
    if (!isMissingRelationError(e)) throw e;
    customers = [];
  }

  try {
    drivers = await listActiveFleetDriverCancellationSuspensionsAdmin(q);
  } catch (e) {
    if (!isMissingRelationError(e)) throw e;
    drivers = [];
  }

  return { customers, drivers };
}
