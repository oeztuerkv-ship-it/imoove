import { and, desc, eq } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { companyChangeRequestsTable } from "./schema";

export interface CompanyChangeRequestRow {
  id: string;
  companyId: string;
  requestedByPanelUserId: string;
  requestType: string;
  status: "pending" | "approved" | "rejected";
  reason: string;
  payload: Record<string, unknown>;
  adminDecisionNote: string;
  decidedByAdminUserId: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapRow(r: typeof companyChangeRequestsTable.$inferSelect): CompanyChangeRequestRow {
  return {
    id: r.id,
    companyId: r.company_id,
    requestedByPanelUserId: r.requested_by_panel_user_id,
    requestType: r.request_type,
    status: r.status as "pending" | "approved" | "rejected",
    reason: r.reason,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    adminDecisionNote: r.admin_decision_note,
    decidedByAdminUserId: r.decided_by_admin_user_id ?? null,
    decidedAt: r.decided_at ? r.decided_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function insertCompanyChangeRequest(input: {
  id: string;
  companyId: string;
  requestedByPanelUserId: string;
  requestType: string;
  reason: string;
  payload: Record<string, unknown>;
}): Promise<CompanyChangeRequestRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .insert(companyChangeRequestsTable)
    .values({
      id: input.id,
      company_id: input.companyId,
      requested_by_panel_user_id: input.requestedByPanelUserId,
      request_type: input.requestType,
      reason: input.reason,
      payload: input.payload,
      status: "pending",
      admin_decision_note: "",
    })
    .returning();
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function listCompanyChangeRequestsByCompany(companyId: string): Promise<CompanyChangeRequestRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(companyChangeRequestsTable)
    .where(eq(companyChangeRequestsTable.company_id, companyId))
    .orderBy(desc(companyChangeRequestsTable.created_at));
  return rows.map(mapRow);
}

export async function listCompanyChangeRequestsAdmin(
  opts?: { status?: "pending" | "approved" | "rejected" },
): Promise<CompanyChangeRequestRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const where = opts?.status ? eq(companyChangeRequestsTable.status, opts.status) : undefined;
  const rows = where
    ? await db.select().from(companyChangeRequestsTable).where(where).orderBy(desc(companyChangeRequestsTable.created_at))
    : await db.select().from(companyChangeRequestsTable).orderBy(desc(companyChangeRequestsTable.created_at));
  return rows.map(mapRow);
}

export async function decideCompanyChangeRequest(input: {
  id: string;
  companyId?: string;
  status: "approved" | "rejected";
  adminUserId?: string | null;
  note: string;
}): Promise<CompanyChangeRequestRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const where = input.companyId
    ? and(eq(companyChangeRequestsTable.id, input.id), eq(companyChangeRequestsTable.company_id, input.companyId))
    : eq(companyChangeRequestsTable.id, input.id);
  const rows = await db
    .update(companyChangeRequestsTable)
    .set({
      status: input.status,
      admin_decision_note: input.note,
      decided_by_admin_user_id: input.adminUserId ?? null,
      decided_at: new Date(),
      updated_at: new Date(),
    })
    .where(where)
    .returning();
  return rows[0] ? mapRow(rows[0]) : null;
}
