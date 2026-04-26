import { and, desc, eq } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { panelAuditLogTable } from "./schema";

export async function insertPanelAuditLog(input: {
  id: string;
  companyId: string;
  actorPanelUserId: string | null;
  action: string;
  subjectType?: string | null;
  subjectId?: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  if (!isPostgresConfigured()) return;
  const db = getDb();
  if (!db) return;
  await db.insert(panelAuditLogTable).values({
    id: input.id,
    company_id: input.companyId,
    actor_panel_user_id: input.actorPanelUserId,
    action: input.action,
    subject_type: input.subjectType ?? null,
    subject_id: input.subjectId ?? null,
    meta: input.meta ?? null,
  });
}

export type PanelAuditLogRow = {
  id: string;
  companyId: string;
  actorPanelUserId: string | null;
  action: string;
  subjectType: string | null;
  subjectId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

export async function listPanelAuditForCompany(
  companyId: string,
  opts?: { subjectId?: string; limit?: number },
): Promise<PanelAuditLogRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
  const subj = opts?.subjectId?.trim();
  const rows = await db
    .select()
    .from(panelAuditLogTable)
    .where(
      subj
        ? and(eq(panelAuditLogTable.company_id, companyId), eq(panelAuditLogTable.subject_id, subj))
        : eq(panelAuditLogTable.company_id, companyId),
    )
    .orderBy(desc(panelAuditLogTable.created_at))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    companyId: r.company_id,
    actorPanelUserId: r.actor_panel_user_id,
    action: r.action,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    meta: (r.meta as Record<string, unknown> | null) ?? null,
    createdAt: r.created_at.toISOString(),
  }));
}
