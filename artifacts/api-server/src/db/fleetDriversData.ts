import { randomUUID } from "node:crypto";
import { and, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { adminCompaniesTable, fleetDriversTable } from "./schema";

export type FleetDriverAccessStatus = "active" | "suspended";

export interface FleetDriverAuthRow {
  id: string;
  company_id: string;
  session_version: number;
  is_active: boolean;
  access_status: FleetDriverAccessStatus;
}

export interface FleetDriverListRow {
  id: string;
  companyId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  accessStatus: FleetDriverAccessStatus;
  isActive: boolean;
  mustChangePassword: boolean;
  pScheinNumber: string;
  pScheinExpiry: string | null;
  pScheinDocStorageKey: string | null;
  lastLoginAt: string | null;
  lastHeartbeatAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToList(r: typeof fleetDriversTable.$inferSelect): FleetDriverListRow {
  return {
    id: r.id,
    companyId: r.company_id,
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
    phone: r.phone,
    accessStatus: r.access_status as FleetDriverAccessStatus,
    isActive: r.is_active,
    mustChangePassword: r.must_change_password,
    pScheinNumber: r.p_schein_number,
    pScheinExpiry: r.p_schein_expiry ? String(r.p_schein_expiry) : null,
    pScheinDocStorageKey: r.p_schein_doc_storage_key,
    lastLoginAt: r.last_login_at ? r.last_login_at.toISOString() : null,
    lastHeartbeatAt: r.last_heartbeat_at ? r.last_heartbeat_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function getCompanyKind(companyId: string): Promise<string | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({ k: adminCompaniesTable.company_kind })
    .from(adminCompaniesTable)
    .where(eq(adminCompaniesTable.id, companyId))
    .limit(1);
  const k = rows[0]?.k;
  return typeof k === "string" ? k : null;
}

export async function findFleetDriverAuthRow(id: string): Promise<FleetDriverAuthRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({
      id: fleetDriversTable.id,
      company_id: fleetDriversTable.company_id,
      session_version: fleetDriversTable.session_version,
      is_active: fleetDriversTable.is_active,
      access_status: fleetDriversTable.access_status,
    })
    .from(fleetDriversTable)
    .where(eq(fleetDriversTable.id, id))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    company_id: r.company_id,
    session_version: r.session_version,
    is_active: r.is_active,
    access_status: r.access_status as FleetDriverAccessStatus,
  };
}

export async function findFleetDriverByEmailNormalized(
  email: string,
): Promise<(typeof fleetDriversTable.$inferSelect) | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const em = email.trim().toLowerCase();
  if (!em) return null;
  const rows = await db
    .select()
    .from(fleetDriversTable)
    .where(sql`lower(trim(${fleetDriversTable.email})) = ${em}`)
    .limit(1);
  return rows[0] ?? null;
}

export async function findFleetDriverInCompany(
  id: string,
  companyId: string,
): Promise<(typeof fleetDriversTable.$inferSelect) | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(fleetDriversTable)
    .where(and(eq(fleetDriversTable.id, id), eq(fleetDriversTable.company_id, companyId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listFleetDriversForCompany(companyId: string): Promise<FleetDriverListRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(fleetDriversTable)
    .where(eq(fleetDriversTable.company_id, companyId));
  return rows.map(rowToList);
}

export async function insertFleetDriver(input: {
  companyId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  passwordHash: string;
  mustChangePassword: boolean;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!isPostgresConfigured()) return { ok: false, error: "database_not_configured" };
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const email = input.email.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "email_invalid" };
  }
  const existing = await findFleetDriverByEmailNormalized(email);
  if (existing) {
    return { ok: false, error: "email_taken" };
  }
  const id = `fd-${randomUUID()}`;
  await db.insert(fleetDriversTable).values({
    id,
    company_id: input.companyId,
    email,
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    phone: input.phone.trim(),
    password_hash: input.passwordHash,
    must_change_password: input.mustChangePassword,
    is_active: true,
    access_status: "active",
    session_version: 1,
  });
  return { ok: true, id };
}

export async function patchFleetDriverProfile(
  id: string,
  companyId: string,
  patch: Partial<{
    firstName: string;
    lastName: string;
    phone: string;
    pScheinNumber: string;
    pScheinExpiry: string | null;
    pScheinDocStorageKey: string | null;
  }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cur = await findFleetDriverInCompany(id, companyId);
  if (!cur) return { ok: false, error: "not_found" };
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const set: Partial<typeof fleetDriversTable.$inferInsert> = { updated_at: new Date() };
  if (patch.firstName !== undefined) set.first_name = patch.firstName.trim();
  if (patch.lastName !== undefined) set.last_name = patch.lastName.trim();
  if (patch.phone !== undefined) set.phone = patch.phone.trim();
  if (patch.pScheinNumber !== undefined) set.p_schein_number = patch.pScheinNumber.trim();
  if (patch.pScheinExpiry !== undefined) {
    const raw = patch.pScheinExpiry?.trim();
    set.p_schein_expiry = raw ? raw : null;
  }
  if (patch.pScheinDocStorageKey !== undefined) set.p_schein_doc_storage_key = patch.pScheinDocStorageKey;
  await db.update(fleetDriversTable).set(set).where(and(eq(fleetDriversTable.id, id), eq(fleetDriversTable.company_id, companyId)));
  return { ok: true };
}

export async function updateFleetDriverPassword(
  id: string,
  companyId: string,
  passwordHash: string,
  mustChangePassword: boolean,
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const r = await db
    .update(fleetDriversTable)
    .set({
      password_hash: passwordHash,
      must_change_password: mustChangePassword,
      updated_at: new Date(),
      session_version: sql`${fleetDriversTable.session_version} + 1`,
    })
    .where(and(eq(fleetDriversTable.id, id), eq(fleetDriversTable.company_id, companyId)))
    .returning({ id: fleetDriversTable.id });
  return r.length > 0;
}

export async function suspendFleetDriver(id: string, companyId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const r = await db
    .update(fleetDriversTable)
    .set({
      access_status: "suspended",
      is_active: false,
      updated_at: new Date(),
      session_version: sql`${fleetDriversTable.session_version} + 1`,
    })
    .where(and(eq(fleetDriversTable.id, id), eq(fleetDriversTable.company_id, companyId)))
    .returning({ id: fleetDriversTable.id });
  return r.length > 0;
}

export async function activateFleetDriver(id: string, companyId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const r = await db
    .update(fleetDriversTable)
    .set({
      access_status: "active",
      is_active: true,
      updated_at: new Date(),
      session_version: sql`${fleetDriversTable.session_version} + 1`,
    })
    .where(and(eq(fleetDriversTable.id, id), eq(fleetDriversTable.company_id, companyId)))
    .returning({ id: fleetDriversTable.id });
  return r.length > 0;
}

export async function touchFleetDriverLogin(id: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .update(fleetDriversTable)
    .set({ last_login_at: new Date(), updated_at: new Date() })
    .where(eq(fleetDriversTable.id, id));
}

export async function touchFleetDriverHeartbeat(id: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .update(fleetDriversTable)
    .set({ last_heartbeat_at: new Date(), updated_at: new Date() })
    .where(eq(fleetDriversTable.id, id));
}

/** P-Schein-Datum liegt heute oder innerhalb der nächsten `withinDays` (UTC-Datum). */
export async function countFleetDriversPScheinExpiringSoon(
  companyId: string,
  withinDays: number,
): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const until = new Date(today);
  until.setUTCDate(until.getUTCDate() + withinDays);
  const todayStr = today.toISOString().slice(0, 10);
  const untilStr = until.toISOString().slice(0, 10);
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(fleetDriversTable)
    .where(
      and(
        eq(fleetDriversTable.company_id, companyId),
        isNotNull(fleetDriversTable.p_schein_expiry),
        gte(fleetDriversTable.p_schein_expiry, todayStr),
        lte(fleetDriversTable.p_schein_expiry, untilStr),
      ),
    );
  return Number(rows[0]?.n ?? 0);
}

export async function countFleetDriversOnline(companyId: string, withinSeconds: number): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const since = new Date(Date.now() - withinSeconds * 1000);
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(fleetDriversTable)
    .where(
      and(
        eq(fleetDriversTable.company_id, companyId),
        eq(fleetDriversTable.access_status, "active"),
        eq(fleetDriversTable.is_active, true),
        isNotNull(fleetDriversTable.last_heartbeat_at),
        gte(fleetDriversTable.last_heartbeat_at, since),
      ),
    );
  return Number(rows[0]?.n ?? 0);
}
