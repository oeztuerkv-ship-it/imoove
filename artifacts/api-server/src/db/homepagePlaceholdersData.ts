import { and, asc, desc, eq, isNull, lte, or, gte } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "./client";
import { homepagePlaceholdersTable } from "./schema";

export type HomepageHintType = "info" | "success" | "warning" | "important";

type PlaceholderRow = typeof homepagePlaceholdersTable.$inferSelect;

/** DB-Spalte `tone`: erlaubte Werte für öffentliche/admin DTOs als `type`. */
export function normalizeHomepageHintType(raw: string | null | undefined): HomepageHintType {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (t === "success") return "success";
  if (t === "warning") return "warning";
  if (t === "important") return "important";
  return "info";
}

function rowToAdminDto(r: PlaceholderRow) {
  return {
    id: r.id,
    title: r.title,
    message: r.message,
    ctaLabel: r.cta_label,
    ctaUrl: r.cta_url,
    type: normalizeHomepageHintType(r.tone),
    isActive: r.is_active,
    sortOrder: r.sort_order,
    visibleFrom: r.visible_from ? r.visible_from.toISOString() : null,
    visibleUntil: r.visible_until ? r.visible_until.toISOString() : null,
    dismissKey: r.dismiss_key,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

function rowToPublicDto(r: PlaceholderRow) {
  return {
    id: r.id,
    title: r.title,
    message: r.message,
    ctaLabel: r.cta_label,
    ctaUrl: r.cta_url,
    type: normalizeHomepageHintType(r.tone),
    dismissKey: r.dismiss_key || r.id,
  };
}

export async function listHomepagePlaceholdersAdmin() {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(homepagePlaceholdersTable)
    .orderBy(asc(homepagePlaceholdersTable.sort_order), desc(homepagePlaceholdersTable.created_at));
  return rows.map(rowToAdminDto);
}

/**
 * Öffentliche Hinweis-Liste: nur sichtbar wenn aktiv und (optional) im Datumsfenster.
 * - is_active = false → nie
 * - is_active = true, kein ab/bis → dauerhaft
 * - is_active = true, nur ab oder nur bis → entsprechender Teil der Range
 * - abgelaufen (now außerhalb des Fensters) → ausgeschlossen
 */
export async function listHomepagePlaceholdersPublic() {
  const db = getDb();
  if (!db) return [];
  const now = new Date();
  const rows = await db
    .select()
    .from(homepagePlaceholdersTable)
    .where(
      and(
        eq(homepagePlaceholdersTable.is_active, true),
        or(isNull(homepagePlaceholdersTable.visible_from), lte(homepagePlaceholdersTable.visible_from, now)),
        or(isNull(homepagePlaceholdersTable.visible_until), gte(homepagePlaceholdersTable.visible_until, now)),
      ),
    )
    .orderBy(asc(homepagePlaceholdersTable.sort_order), desc(homepagePlaceholdersTable.created_at));
  return rows.map(rowToPublicDto);
}

export async function createHomepagePlaceholder(input: {
  title: string;
  message: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  type: HomepageHintType;
  isActive: boolean;
  sortOrder: number;
  visibleFrom?: Date | null;
  visibleUntil?: Date | null;
  dismissKey?: string | null;
  actorAdminUserId?: string | null;
}) {
  const db = getDb();
  if (!db) return null;
  const now = new Date();
  const id = `hpb-${randomUUID()}`;
  const storedType = normalizeHomepageHintType(input.type);
  await db.insert(homepagePlaceholdersTable).values({
    id,
    title: input.title,
    message: input.message,
    cta_label: input.ctaLabel ?? null,
    cta_url: input.ctaUrl ?? null,
    tone: storedType,
    is_active: input.isActive,
    sort_order: input.sortOrder,
    visible_from: input.visibleFrom ?? null,
    visible_until: input.visibleUntil ?? null,
    dismiss_key: (input.dismissKey ?? "").trim(),
    created_by_admin_user_id: input.actorAdminUserId ?? null,
    updated_by_admin_user_id: input.actorAdminUserId ?? null,
    created_at: now,
    updated_at: now,
  });
  const rows = await db.select().from(homepagePlaceholdersTable).where(eq(homepagePlaceholdersTable.id, id)).limit(1);
  return rows[0] ? rowToAdminDto(rows[0]) : null;
}

export async function patchHomepagePlaceholder(
  id: string,
  input: {
    title?: string;
    message?: string;
    ctaLabel?: string | null;
    ctaUrl?: string | null;
    type?: HomepageHintType;
    isActive?: boolean;
    sortOrder?: number;
    visibleFrom?: Date | null;
    visibleUntil?: Date | null;
    dismissKey?: string | null;
    actorAdminUserId?: string | null;
  },
) {
  const db = getDb();
  if (!db) return null;
  const patch: Partial<typeof homepagePlaceholdersTable.$inferInsert> = {
    updated_at: new Date(),
    updated_by_admin_user_id: input.actorAdminUserId ?? null,
  };
  if (typeof input.title === "string") patch.title = input.title;
  if (typeof input.message === "string") patch.message = input.message;
  if (input.ctaLabel !== undefined) patch.cta_label = input.ctaLabel ?? null;
  if (input.ctaUrl !== undefined) patch.cta_url = input.ctaUrl ?? null;
  if (input.type !== undefined) patch.tone = normalizeHomepageHintType(input.type);
  if (typeof input.isActive === "boolean") patch.is_active = input.isActive;
  if (typeof input.sortOrder === "number") patch.sort_order = input.sortOrder;
  if (input.visibleFrom !== undefined) patch.visible_from = input.visibleFrom ?? null;
  if (input.visibleUntil !== undefined) patch.visible_until = input.visibleUntil ?? null;
  if (input.dismissKey !== undefined) patch.dismiss_key = (input.dismissKey ?? "").trim();
  await db.update(homepagePlaceholdersTable).set(patch).where(eq(homepagePlaceholdersTable.id, id));
  const rows = await db.select().from(homepagePlaceholdersTable).where(eq(homepagePlaceholdersTable.id, id)).limit(1);
  return rows[0] ? rowToAdminDto(rows[0]) : null;
}
