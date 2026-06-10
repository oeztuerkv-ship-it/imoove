import { sql } from "drizzle-orm";
import { getDb } from "./client";

export type PassengerAuthProvider = "email" | "google" | "apple";

export type CustomerAdminListItem = {
  passengerId: string;
  name: string;
  email: string;
  authProvider: PassengerAuthProvider;
  registeredAt: string;
  rideCount: number;
  cancellationCount: number;
  isSuspended: boolean;
  suspendedUntil: string | null;
  suspensionReason: string | null;
};

export type CustomerAdminListResult = {
  items: CustomerAdminListItem[];
  total: number;
  page: number;
  pageSize: number;
};

type CustomerAdminRow = {
  passenger_id: string;
  name: string;
  email: string;
  auth_provider: string | null;
  registered_at: Date | string;
  ride_count: number | string | null;
  cancellation_count: number | string | null;
  is_suspended: boolean | null;
  suspended_until: Date | string | null;
  suspension_reason: string | null;
};

function normalizeAuthProvider(raw: string | null | undefined): PassengerAuthProvider {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "email") return "email";
  if (v === "apple") return "apple";
  return "google";
}

function mapListRow(row: CustomerAdminRow): CustomerAdminListItem {
  const registeredAt =
    row.registered_at instanceof Date ? row.registered_at.toISOString() : String(row.registered_at ?? "");
  const suspendedUntilRaw = row.suspended_until;
  const suspendedUntil =
    suspendedUntilRaw instanceof Date
      ? suspendedUntilRaw.toISOString()
      : suspendedUntilRaw
        ? String(suspendedUntilRaw)
        : null;
  return {
    passengerId: row.passenger_id,
    name: row.name,
    email: row.email,
    authProvider: normalizeAuthProvider(row.auth_provider),
    registeredAt,
    rideCount: Number(row.ride_count ?? 0),
    cancellationCount: Number(row.cancellation_count ?? 0),
    isSuspended: row.is_suspended === true,
    suspendedUntil,
    suspensionReason: row.suspension_reason,
  };
}

const CUSTOMERS_ADMIN_FROM_SQL = sql`
  FROM passenger_profiles pp
  LEFT JOIN (
    SELECT
      passenger_id,
      COUNT(*)::int AS ride_count,
      COUNT(*) FILTER (WHERE status = 'cancelled_by_customer')::int AS cancellation_count
    FROM rides
    WHERE passenger_id IS NOT NULL
    GROUP BY passenger_id
  ) rs ON rs.passenger_id = pp.passenger_id
  LEFT JOIN customer_cancellation_suspension s
    ON s.passenger_id = pp.passenger_id
    AND s.lifted_at IS NULL
    AND s.suspended_until >= NOW()
`;

function customersSearchSql(q: string) {
  const needle = q.trim();
  if (!needle) return sql``;
  const pattern = `%${needle.replace(/[%_\\]/g, "\\$&")}%`;
  return sql`WHERE (
    pp.name ILIKE ${pattern}
    OR pp.email ILIKE ${pattern}
    OR pp.passenger_id ILIKE ${pattern}
  )`;
}

const CUSTOMERS_ADMIN_SELECT_SQL = sql`
  SELECT
    pp.passenger_id,
    pp.name,
    pp.email,
    pp.auth_provider,
    pp.first_seen_at AS registered_at,
    COALESCE(rs.ride_count, 0) AS ride_count,
    COALESCE(rs.cancellation_count, 0) AS cancellation_count,
    (s.passenger_id IS NOT NULL) AS is_suspended,
    s.suspended_until,
    s.reason AS suspension_reason
`;

export async function listCustomersAdmin(input: {
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<CustomerAdminListResult> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.min(Math.max(1, Math.floor(input.pageSize ?? 50)), 200);
  const offset = (page - 1) * pageSize;
  const q = (input.q ?? "").trim();
  const search = customersSearchSql(q);

  const countResult = await db.execute(sql`
    SELECT COUNT(*)::int AS c
    ${CUSTOMERS_ADMIN_FROM_SQL}
    ${search}
  `);
  const total = Number((countResult.rows[0] as { c?: number })?.c ?? 0);

  const listResult = await db.execute(sql`
    ${CUSTOMERS_ADMIN_SELECT_SQL}
    ${CUSTOMERS_ADMIN_FROM_SQL}
    ${search}
    ORDER BY pp.first_seen_at DESC
    LIMIT ${pageSize}
    OFFSET ${offset}
  `);

  return {
    items: (listResult.rows as CustomerAdminRow[]).map(mapListRow),
    total,
    page,
    pageSize,
  };
}

export async function listCustomersAdminForExport(q = "", limit = 5000): Promise<CustomerAdminListItem[]> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  const cap = Math.min(Math.max(1, limit), 10000);
  const search = customersSearchSql(q.trim());
  const listResult = await db.execute(sql`
    ${CUSTOMERS_ADMIN_SELECT_SQL}
    ${CUSTOMERS_ADMIN_FROM_SQL}
    ${search}
    ORDER BY pp.first_seen_at DESC
    LIMIT ${cap}
  `);
  return (listResult.rows as CustomerAdminRow[]).map(mapListRow);
}
