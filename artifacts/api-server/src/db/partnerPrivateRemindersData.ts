import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "./client";
import { partnerPrivateRemindersTable } from "./schema";

export type PartnerPrivateReminderRow = {
  id: string;
  companyId: string;
  createdByPanelUserId: string | null;
  scheduledAt: string;
  fromFull: string;
  toFull: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

function mapRow(r: typeof partnerPrivateRemindersTable.$inferSelect): PartnerPrivateReminderRow {
  return {
    id: r.id,
    companyId: r.company_id,
    createdByPanelUserId: r.created_by_panel_user_id ?? null,
    scheduledAt: r.scheduled_at.toISOString(),
    fromFull: r.from_full ?? "",
    toFull: r.to_full ?? "",
    note: r.note ?? "",
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

function parseScheduledAt(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = new Date(raw.trim());
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function listPartnerPrivateReminders(
  companyId: string,
): Promise<PartnerPrivateReminderRow[]> {
  const db = getDb();
  if (!db || !companyId.trim()) return [];
  const rows = await db
    .select()
    .from(partnerPrivateRemindersTable)
    .where(eq(partnerPrivateRemindersTable.company_id, companyId))
    .orderBy(asc(partnerPrivateRemindersTable.scheduled_at));
  return rows.map(mapRow);
}

export async function getPartnerPrivateReminder(
  companyId: string,
  reminderId: string,
): Promise<PartnerPrivateReminderRow | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(partnerPrivateRemindersTable)
    .where(
      and(
        eq(partnerPrivateRemindersTable.id, reminderId),
        eq(partnerPrivateRemindersTable.company_id, companyId),
      ),
    )
    .limit(1);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createPartnerPrivateReminder(input: {
  companyId: string;
  panelUserId: string;
  scheduledAt: unknown;
  fromFull: unknown;
  toFull: unknown;
  note: unknown;
}): Promise<{ ok: true; reminder: PartnerPrivateReminderRow } | { ok: false; error: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const scheduledAt = parseScheduledAt(input.scheduledAt);
  if (!scheduledAt) return { ok: false, error: "scheduled_at_required" };
  const fromFull = typeof input.fromFull === "string" ? input.fromFull.trim() : "";
  const toFull = typeof input.toFull === "string" ? input.toFull.trim() : "";
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 2000) : "";
  if (!fromFull && !toFull && !note) {
    return { ok: false, error: "content_required" };
  }
  const id = `ppr-${randomUUID().replace(/-/g, "").slice(0, 22)}`;
  const now = new Date();
  await db.insert(partnerPrivateRemindersTable).values({
    id,
    company_id: input.companyId,
    created_by_panel_user_id: input.panelUserId,
    scheduled_at: scheduledAt,
    from_full: fromFull.slice(0, 500),
    to_full: toFull.slice(0, 500),
    note,
    created_at: now,
    updated_at: now,
  });
  const row = await getPartnerPrivateReminder(input.companyId, id);
  if (!row) return { ok: false, error: "create_failed" };
  return { ok: true, reminder: row };
}

export async function updatePartnerPrivateReminder(input: {
  companyId: string;
  reminderId: string;
  scheduledAt?: unknown;
  fromFull?: unknown;
  toFull?: unknown;
  note?: unknown;
}): Promise<{ ok: true; reminder: PartnerPrivateReminderRow } | { ok: false; error: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const existing = await getPartnerPrivateReminder(input.companyId, input.reminderId);
  if (!existing) return { ok: false, error: "not_found" };

  const patch: Partial<typeof partnerPrivateRemindersTable.$inferInsert> = {
    updated_at: new Date(),
  };
  if (input.scheduledAt !== undefined) {
    const scheduledAt = parseScheduledAt(input.scheduledAt);
    if (!scheduledAt) return { ok: false, error: "scheduled_at_invalid" };
    patch.scheduled_at = scheduledAt;
  }
  if (typeof input.fromFull === "string") patch.from_full = input.fromFull.trim().slice(0, 500);
  if (typeof input.toFull === "string") patch.to_full = input.toFull.trim().slice(0, 500);
  if (typeof input.note === "string") patch.note = input.note.trim().slice(0, 2000);

  await db
    .update(partnerPrivateRemindersTable)
    .set(patch)
    .where(
      and(
        eq(partnerPrivateRemindersTable.id, input.reminderId),
        eq(partnerPrivateRemindersTable.company_id, input.companyId),
      ),
    );
  const row = await getPartnerPrivateReminder(input.companyId, input.reminderId);
  if (!row) return { ok: false, error: "update_failed" };
  return { ok: true, reminder: row };
}

export async function deletePartnerPrivateReminder(
  companyId: string,
  reminderId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const existing = await getPartnerPrivateReminder(companyId, reminderId);
  if (!existing) return { ok: false, error: "not_found" };
  await db
    .delete(partnerPrivateRemindersTable)
    .where(
      and(
        eq(partnerPrivateRemindersTable.id, reminderId),
        eq(partnerPrivateRemindersTable.company_id, companyId),
      ),
    );
  return { ok: true };
}
