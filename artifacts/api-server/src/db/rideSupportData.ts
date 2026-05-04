import { randomUUID } from "node:crypto";
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { parseRideSupportCategory, type RideSupportCategory } from "../domain/rideSupportCategory";
import { buildRideContextSnapshot, type RideContextSnapshotV1 } from "../lib/rideContextSnapshot";
import { adminRideRowVisibleToPrincipal, type AdminRole } from "../lib/adminConsoleRoles";
import { getDb } from "./client";
import { findRideAdminById } from "./ridesData";
import { rideSupportTicketsTable, ridesTable } from "./schema";

export const RIDE_SUPPORT_TICKET_STATUSES = ["open", "in_progress", "resolved"] as const;
export type RideSupportTicketStatus = (typeof RIDE_SUPPORT_TICKET_STATUSES)[number];

function isTicketStatus(v: string): v is RideSupportTicketStatus {
  return (RIDE_SUPPORT_TICKET_STATUSES as readonly string[]).includes(v);
}

export type RideSupportTicketRow = {
  id: string;
  rideId: string;
  passengerId: string;
  category: RideSupportCategory;
  message: string | null;
  status: RideSupportTicketStatus;
  internalNote: string | null;
  rideContextSnapshot: Record<string, unknown>;
  snapshotSchemaVersion: number;
  snapshotCapturedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type RideSupportTicketListItem = RideSupportTicketRow & {
  companyId: string | null;
  rideStatus: string | null;
};

function mapRow(
  r: typeof rideSupportTicketsTable.$inferSelect,
  extra?: { companyId?: string | null; rideStatus?: string | null },
): RideSupportTicketListItem {
  const cat = parseRideSupportCategory(r.category) ?? "other";
  return {
    id: r.id,
    rideId: r.ride_id,
    passengerId: r.passenger_id,
    category: cat,
    message: r.message,
    status: isTicketStatus(r.status) ? r.status : "open",
    internalNote: r.internal_note,
    rideContextSnapshot: (r.ride_context_snapshot as Record<string, unknown>) ?? {},
    snapshotSchemaVersion: r.snapshot_schema_version,
    snapshotCapturedAt: r.snapshot_captured_at.toISOString(),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    companyId: extra?.companyId ?? null,
    rideStatus: extra?.rideStatus ?? null,
  };
}

export async function createRideSupportTicket(input: {
  rideId: string;
  passengerId: string;
  category: RideSupportCategory;
  message: string | null;
}): Promise<RideSupportTicketRow | null> {
  const db = getDb();
  if (!db) return null;

  const snap = await buildRideContextSnapshot(input.rideId);
  if (!snap) return null;

  const id = `rst-${randomUUID()}`;
  const now = new Date();
  const snapJson = { ...snap } as unknown as Record<string, unknown>;
  const msg =
    input.message == null
      ? null
      : input.message.trim().length === 0
        ? null
        : input.message.trim().slice(0, 4000);

  await db.insert(rideSupportTicketsTable).values({
    id,
    ride_id: input.rideId,
    passenger_id: input.passengerId,
    category: input.category,
    message: msg,
    status: "open",
    internal_note: null,
    ride_context_snapshot: snapJson,
    snapshot_schema_version: 1,
    snapshot_captured_at: new Date(snap.capturedAt),
    created_at: now,
    updated_at: now,
  });

  const [row] = await db
    .select()
    .from(rideSupportTicketsTable)
    .where(eq(rideSupportTicketsTable.id, id))
    .limit(1);
  if (!row) return null;
  return mapRow(row) as RideSupportTicketRow;
}

export async function listRideSupportTicketsByRideId(rideId: string): Promise<RideSupportTicketRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(rideSupportTicketsTable)
    .where(eq(rideSupportTicketsTable.ride_id, rideId))
    .orderBy(desc(rideSupportTicketsTable.created_at));
  return rows.map((r) => mapRow(r) as RideSupportTicketRow);
}

function ticketRowVisible(
  role: AdminRole,
  scopeCompanyId: string | null | undefined,
  ride: { payerKind?: PayerKind | string | null; companyId?: string | null } | null,
): boolean {
  if (!ride) return false;
  return adminRideRowVisibleToPrincipal(role, scopeCompanyId, ride);
}

export async function getRideSupportTicketAdmin(
  id: string,
  role: AdminRole,
  scopeCompanyId: string | null | undefined,
): Promise<RideSupportTicketRow | null> {
  const db = getDb();
  if (!db) return null;
  const [r] = await db.select().from(rideSupportTicketsTable).where(eq(rideSupportTicketsTable.id, id)).limit(1);
  if (!r) return null;
  const ride = await findRideAdminById(r.ride_id);
  if (!ticketRowVisible(role, scopeCompanyId, ride)) {
    return null;
  }
  return mapRow(r) as RideSupportTicketRow;
}

export async function updateRideSupportTicketAdmin(
  id: string,
  input: { status?: RideSupportTicketStatus; internalNote?: string | null },
  role: AdminRole,
  scopeCompanyId: string | null | undefined,
): Promise<RideSupportTicketRow | null> {
  const db = getDb();
  if (!db) return null;
  const [cur] = await db.select().from(rideSupportTicketsTable).where(eq(rideSupportTicketsTable.id, id)).limit(1);
  if (!cur) return null;
  const ride = await findRideAdminById(cur.ride_id);
  if (!ticketRowVisible(role, scopeCompanyId, ride)) {
    return null;
  }
  const set: Partial<typeof rideSupportTicketsTable.$inferInsert> = {
    updated_at: new Date(),
  };
  if (input.status && isTicketStatus(input.status)) {
    set.status = input.status;
  }
  if (Object.prototype.hasOwnProperty.call(input, "internalNote")) {
    set.internal_note =
      input.internalNote == null
        ? null
        : String(input.internalNote).trim().length === 0
          ? null
          : String(input.internalNote).trim().slice(0, 8000);
  }
  await db.update(rideSupportTicketsTable).set(set).where(eq(rideSupportTicketsTable.id, id));
  return getRideSupportTicketAdmin(id, role, scopeCompanyId);
}

export async function listRideSupportTicketsAdminPage(input: {
  role: AdminRole;
  scopeCompanyId: string | null;
  page: number;
  pageSize: number;
  status?: string;
  q?: string;
}): Promise<{ total: number; items: RideSupportTicketListItem[] }> {
  const db = getDb();
  if (!db) return { total: 0, items: [] };

  const { role, scopeCompanyId, page, pageSize } = input;
  if (role === "hotel" && !scopeCompanyId?.trim()) {
    return { total: 0, items: [] };
  }

  const whereParts: SQL[] = [];
  if (role === "insurance") {
    whereParts.push(eq(ridesTable.payer_kind, "insurance"));
  } else if (role === "hotel") {
    whereParts.push(eq(ridesTable.company_id, scopeCompanyId!.trim()));
  }
  if (input.status && isTicketStatus(input.status)) {
    whereParts.push(eq(rideSupportTicketsTable.status, input.status));
  }
  const q = input.q?.trim();
  if (q) {
    const p = `%${q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    whereParts.push(
      or(
        ilike(rideSupportTicketsTable.id, p),
        ilike(rideSupportTicketsTable.ride_id, p),
        ilike(rideSupportTicketsTable.passenger_id, p),
      )!,
    );
  }

  const w = whereParts.length > 0 ? and(...whereParts) : undefined;
  const joinOn = eq(rideSupportTicketsTable.ride_id, ridesTable.id);

  const [countRow] = await db
    .select({ n: count() })
    .from(rideSupportTicketsTable)
    .innerJoin(ridesTable, joinOn)
    .where(w);
  const total = Number(countRow?.n ?? 0);
  if (total === 0) {
    return { total: 0, items: [] };
  }

  const offset = (page - 1) * pageSize;
  const rows = await db
    .select({
      t: rideSupportTicketsTable,
      companyId: ridesTable.company_id,
      rideStatus: ridesTable.status,
    })
    .from(rideSupportTicketsTable)
    .innerJoin(ridesTable, joinOn)
    .where(w)
    .orderBy(desc(rideSupportTicketsTable.created_at))
    .limit(pageSize)
    .offset(offset);

  return {
    total,
    items: rows.map((x) => mapRow(x.t, { companyId: x.companyId, rideStatus: x.rideStatus })),
  };
}

/**
 * Liefert dieselbe Fahrt-Snapshot-Logik für die Vorschau (ohne Ticket) — Kund*innen-App.
 */
export { buildRideContextSnapshot, type RideContextSnapshotV1 };
