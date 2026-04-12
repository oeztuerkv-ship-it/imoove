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
