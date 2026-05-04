import { and, asc, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "./client";
import { appNewsItemsTable } from "./schema";

export type AppNewsTargetType = "internal_screen" | "external_url" | "none";

/** Werte wie in Admin-UI / Mobile-Query `audience`. */
export type AppNewsAudience =
  | "all"
  | "customer"
  | "driver"
  | "taxi_partner"
  | "hotel"
  | "insurer";

type Row = typeof appNewsItemsTable.$inferSelect;

const AUDIENCES: ReadonlySet<string> = new Set([
  "all",
  "customer",
  "driver",
  "taxi_partner",
  "hotel",
  "insurer",
]);

export function parseAppNewsAudience(raw: string | null | undefined): AppNewsAudience {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (AUDIENCES.has(s)) return s as AppNewsAudience;
  return "customer";
}

export function parseAppNewsTargetType(raw: string | null | undefined): AppNewsTargetType {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "internal_screen") return "internal_screen";
  if (s === "external_url") return "external_url";
  return "none";
}

function rowToPublicDto(r: Row) {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    imageUrl: r.image_url,
    buttonText: r.button_text,
    targetType: parseAppNewsTargetType(r.target_type),
    targetValue: r.target_value,
    audience: parseAppNewsAudience(r.audience),
  };
}

function rowToAdminDto(r: Row) {
  return {
    ...rowToPublicDto(r),
    sortOrder: r.sort_order,
    isActive: r.is_active,
    startsAt: r.starts_at ? r.starts_at.toISOString() : null,
    endsAt: r.ends_at ? r.ends_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

/** Öffentlich: aktiv, im Datumsfenster, Zielgruppe `all` oder angefragte Audience. Max `limit` Zeilen. */
export async function listAppNewsPublic(audience: AppNewsAudience, limit = 5) {
  const db = getDb();
  if (!db) return [];
  const now = new Date();
  const audFilter = or(eq(appNewsItemsTable.audience, "all"), eq(appNewsItemsTable.audience, audience));
  const rows = await db
    .select()
    .from(appNewsItemsTable)
    .where(
      and(
        eq(appNewsItemsTable.is_active, true),
        audFilter,
        or(isNull(appNewsItemsTable.starts_at), lte(appNewsItemsTable.starts_at, now)),
        or(isNull(appNewsItemsTable.ends_at), gte(appNewsItemsTable.ends_at, now)),
      ),
    )
    .orderBy(asc(appNewsItemsTable.sort_order), desc(appNewsItemsTable.created_at))
    .limit(Math.min(20, Math.max(1, limit)));
  return rows.map(rowToPublicDto);
}

export async function listAppNewsAdmin() {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(appNewsItemsTable)
    .orderBy(asc(appNewsItemsTable.sort_order), desc(appNewsItemsTable.created_at));
  return rows.map(rowToAdminDto);
}

export async function findAppNewsAdmin(id: string): Promise<ReturnType<typeof rowToAdminDto> | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db.select().from(appNewsItemsTable).where(eq(appNewsItemsTable.id, id)).limit(1);
  const r = rows[0];
  return r ? rowToAdminDto(r) : null;
}

export async function createAppNewsItem(input: {
  title: string;
  body: string;
  imageUrl?: string | null;
  buttonText?: string | null;
  targetType: AppNewsTargetType;
  targetValue?: string | null;
  audience: AppNewsAudience;
  sortOrder: number;
  isActive: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
}) {
  const db = getDb();
  if (!db) return null;
  const id = randomUUID();
  const now = new Date();
  await db.insert(appNewsItemsTable).values({
    id,
    title: input.title,
    body: input.body,
    image_url: input.imageUrl ?? null,
    button_text: input.buttonText ?? null,
    target_type: input.targetType,
    target_value: input.targetValue ?? null,
    audience: input.audience,
    sort_order: input.sortOrder,
    is_active: input.isActive,
    starts_at: input.startsAt ?? null,
    ends_at: input.endsAt ?? null,
    created_at: now,
    updated_at: now,
  });
  return findAppNewsAdmin(id);
}

export async function patchAppNewsItem(
  id: string,
  patch: Partial<{
    title: string;
    body: string;
    imageUrl: string | null;
    buttonText: string | null;
    targetType: AppNewsTargetType;
    targetValue: string | null;
    audience: AppNewsAudience;
    sortOrder: number;
    isActive: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
  }>,
) {
  const db = getDb();
  if (!db) return null;
  const now = new Date();
  const row: Record<string, unknown> = { updated_at: now };
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.body !== undefined) row.body = patch.body;
  if (patch.imageUrl !== undefined) row.image_url = patch.imageUrl;
  if (patch.buttonText !== undefined) row.button_text = patch.buttonText;
  if (patch.targetType !== undefined) row.target_type = patch.targetType;
  if (patch.targetValue !== undefined) row.target_value = patch.targetValue;
  if (patch.audience !== undefined) row.audience = patch.audience;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  if (patch.startsAt !== undefined) row.starts_at = patch.startsAt;
  if (patch.endsAt !== undefined) row.ends_at = patch.endsAt;
  await db.update(appNewsItemsTable).set(row as any).where(eq(appNewsItemsTable.id, id));
  return findAppNewsAdmin(id);
}

/** Deaktivieren (kein Hard-Delete). */
export async function deactivateAppNewsItem(id: string) {
  return patchAppNewsItem(id, { isActive: false });
}
