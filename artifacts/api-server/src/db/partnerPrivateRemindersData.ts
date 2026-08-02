import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "./client";
import { partnerPrivateRemindersTable } from "./schema";

export type PartnerPrivateReminderRow = {
  id: string;
  companyId: string;
  createdByPanelUserId: string | null;
  fleetDriverId: string | null;
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
    fleetDriverId: r.fleet_driver_id ?? null,
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

/** Panel-Merkliste: nur Einträge ohne fleet_driver_id (nicht Fahrer-privat). */
export async function listPartnerPrivateRemindersForPanel(
  companyId: string,
): Promise<PartnerPrivateReminderRow[]> {
  const db = getDb();
  if (!db || !companyId.trim()) return [];
  const rows = await db
    .select()
    .from(partnerPrivateRemindersTable)
    .where(
      and(
        eq(partnerPrivateRemindersTable.company_id, companyId),
        isNull(partnerPrivateRemindersTable.fleet_driver_id),
      ),
    )
    .orderBy(asc(partnerPrivateRemindersTable.scheduled_at));
  return rows.map(mapRow);
}

/** Fahrer-Merkliste: nur eigene Notizen. */
export async function listPartnerPrivateRemindersForFleetDriver(
  companyId: string,
  fleetDriverId: string,
): Promise<PartnerPrivateReminderRow[]> {
  const db = getDb();
  if (!db || !companyId.trim() || !fleetDriverId.trim()) return [];
  const rows = await db
    .select()
    .from(partnerPrivateRemindersTable)
    .where(
      and(
        eq(partnerPrivateRemindersTable.company_id, companyId),
        eq(partnerPrivateRemindersTable.fleet_driver_id, fleetDriverId),
      ),
    )
    .orderBy(asc(partnerPrivateRemindersTable.scheduled_at));
  return rows.map(mapRow);
}

/** @deprecated Alias — Panel nutzt listPartnerPrivateRemindersForPanel. */
export async function listPartnerPrivateReminders(
  companyId: string,
): Promise<PartnerPrivateReminderRow[]> {
  return listPartnerPrivateRemindersForPanel(companyId);
}

export async function getPartnerPrivateReminder(
  companyId: string,
  reminderId: string,
  scope?: { fleetDriverId: string | null },
): Promise<PartnerPrivateReminderRow | null> {
  const db = getDb();
  if (!db) return null;
  const parts = [
    eq(partnerPrivateRemindersTable.id, reminderId),
    eq(partnerPrivateRemindersTable.company_id, companyId),
  ];
  if (scope) {
    if (scope.fleetDriverId) {
      parts.push(eq(partnerPrivateRemindersTable.fleet_driver_id, scope.fleetDriverId));
    } else {
      parts.push(isNull(partnerPrivateRemindersTable.fleet_driver_id));
    }
  }
  const rows = await db
    .select()
    .from(partnerPrivateRemindersTable)
    .where(and(...parts))
    .limit(1);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createPartnerPrivateReminder(input: {
  companyId: string;
  /** Panel-User; bei Fleet-Anlage null. */
  panelUserId: string | null;
  /** Fleet-Fahrer; bei Panel-Anlage null. */
  fleetDriverId: string | null;
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
  const panelUserId =
    typeof input.panelUserId === "string" && input.panelUserId.trim()
      ? input.panelUserId.trim()
      : null;
  const fleetDriverId =
    typeof input.fleetDriverId === "string" && input.fleetDriverId.trim()
      ? input.fleetDriverId.trim()
      : null;
  await db.insert(partnerPrivateRemindersTable).values({
    id,
    company_id: input.companyId,
    created_by_panel_user_id: panelUserId,
    fleet_driver_id: fleetDriverId,
    scheduled_at: scheduledAt,
    from_full: fromFull.slice(0, 500),
    to_full: toFull.slice(0, 500),
    note,
    created_at: now,
    updated_at: now,
  });
  const row = await getPartnerPrivateReminder(input.companyId, id, { fleetDriverId });
  if (!row) return { ok: false, error: "create_failed" };
  return { ok: true, reminder: row };
}

export async function updatePartnerPrivateReminder(input: {
  companyId: string;
  reminderId: string;
  /** null = Panel-Scope; string = nur dieser Fahrer. */
  fleetDriverId: string | null;
  scheduledAt?: unknown;
  fromFull?: unknown;
  toFull?: unknown;
  note?: unknown;
}): Promise<{ ok: true; reminder: PartnerPrivateReminderRow } | { ok: false; error: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const scope = { fleetDriverId: input.fleetDriverId };
  const existing = await getPartnerPrivateReminder(input.companyId, input.reminderId, scope);
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

  const whereParts = [
    eq(partnerPrivateRemindersTable.id, input.reminderId),
    eq(partnerPrivateRemindersTable.company_id, input.companyId),
  ];
  if (input.fleetDriverId) {
    whereParts.push(eq(partnerPrivateRemindersTable.fleet_driver_id, input.fleetDriverId));
  } else {
    whereParts.push(isNull(partnerPrivateRemindersTable.fleet_driver_id));
  }

  await db
    .update(partnerPrivateRemindersTable)
    .set(patch)
    .where(and(...whereParts));
  const row = await getPartnerPrivateReminder(input.companyId, input.reminderId, scope);
  if (!row) return { ok: false, error: "update_failed" };
  return { ok: true, reminder: row };
}

export async function deletePartnerPrivateReminder(
  companyId: string,
  reminderId: string,
  fleetDriverId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const existing = await getPartnerPrivateReminder(companyId, reminderId, { fleetDriverId });
  if (!existing) return { ok: false, error: "not_found" };
  const whereParts = [
    eq(partnerPrivateRemindersTable.id, reminderId),
    eq(partnerPrivateRemindersTable.company_id, companyId),
  ];
  if (fleetDriverId) {
    whereParts.push(eq(partnerPrivateRemindersTable.fleet_driver_id, fleetDriverId));
  } else {
    whereParts.push(isNull(partnerPrivateRemindersTable.fleet_driver_id));
  }
  await db.delete(partnerPrivateRemindersTable).where(and(...whereParts));
  return { ok: true };
}
