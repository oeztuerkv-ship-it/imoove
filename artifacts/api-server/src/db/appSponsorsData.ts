import { and, asc, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "./client";
import { appSponsorsTable } from "./schema";

export type AppSponsorAudience = "all" | "customer" | "driver";
export type AppSponsorCategory = "sponsor" | "partner" | "angebot" | "event";

type Row = typeof appSponsorsTable.$inferSelect;

const AUDIENCES: ReadonlySet<string> = new Set(["all", "customer", "driver"]);
const CATEGORIES: ReadonlySet<string> = new Set(["sponsor", "partner", "angebot", "event"]);

export function parseAppSponsorAudience(raw: string | null | undefined): AppSponsorAudience {
  const s = String(raw ?? "").trim().toLowerCase();
  if (AUDIENCES.has(s)) return s as AppSponsorAudience;
  return "all";
}

export function parseAppSponsorCategory(raw: string | null | undefined): AppSponsorCategory {
  const s = String(raw ?? "").trim().toLowerCase();
  if (CATEGORIES.has(s)) return s as AppSponsorCategory;
  return "partner";
}

function rowToPublicDto(r: Row) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    imageUrl: r.image_url,
    logoUrl: r.logo_url,
    externalUrl: r.external_url,
    buttonText: r.button_text,
    qrCodeUrl: r.qr_code_url,
    qrFromLink: r.qr_from_link,
    category: parseAppSponsorCategory(r.category),
    audience: parseAppSponsorAudience(r.audience),
    sortOrder: r.sort_order,
  };
}

function rowToAdminDto(r: Row) {
  return {
    ...rowToPublicDto(r),
    isActive: r.is_active,
    startsAt: r.starts_at ? r.starts_at.toISOString() : null,
    endsAt: r.ends_at ? r.ends_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function listAppSponsorsPublic(audience: AppSponsorAudience, limit = 10) {
  const db = getDb();
  if (!db) return [];
  const now = new Date();
  const audFilter = or(eq(appSponsorsTable.audience, "all"), eq(appSponsorsTable.audience, audience));
  const rows = await db
    .select()
    .from(appSponsorsTable)
    .where(
      and(
        eq(appSponsorsTable.is_active, true),
        audFilter,
        or(isNull(appSponsorsTable.starts_at), lte(appSponsorsTable.starts_at, now)),
        or(isNull(appSponsorsTable.ends_at), gte(appSponsorsTable.ends_at, now)),
      ),
    )
    .orderBy(asc(appSponsorsTable.sort_order), desc(appSponsorsTable.created_at))
    .limit(Math.min(20, Math.max(1, limit)));
  return rows.map(rowToPublicDto);
}

export async function listAppSponsorsAdmin() {
  const db = getDb();
  if (!db) return [];
  const rows = await db.select().from(appSponsorsTable).orderBy(asc(appSponsorsTable.sort_order), desc(appSponsorsTable.created_at));
  return rows.map(rowToAdminDto);
}

export async function findAppSponsorAdmin(id: string): Promise<ReturnType<typeof rowToAdminDto> | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db.select().from(appSponsorsTable).where(eq(appSponsorsTable.id, id)).limit(1);
  const r = rows[0];
  return r ? rowToAdminDto(r) : null;
}

export async function createAppSponsorItem(input: {
  title: string;
  description: string;
  imageUrl?: string | null;
  logoUrl?: string | null;
  externalUrl?: string | null;
  buttonText?: string | null;
  qrCodeUrl?: string | null;
  qrFromLink?: boolean;
  category: AppSponsorCategory;
  audience: AppSponsorAudience;
  sortOrder: number;
  isActive: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
}) {
  const db = getDb();
  if (!db) return null;
  const id = randomUUID();
  const now = new Date();
  await db.insert(appSponsorsTable).values({
    id,
    title: input.title,
    description: input.description,
    image_url: input.imageUrl ?? null,
    logo_url: input.logoUrl ?? null,
    external_url: input.externalUrl ?? null,
    button_text: input.buttonText ?? null,
    qr_code_url: input.qrCodeUrl ?? null,
    qr_from_link: input.qrFromLink === true,
    category: input.category,
    audience: input.audience,
    sort_order: input.sortOrder,
    is_active: input.isActive,
    starts_at: input.startsAt ?? null,
    ends_at: input.endsAt ?? null,
    created_at: now,
    updated_at: now,
  });
  return findAppSponsorAdmin(id);
}

export async function patchAppSponsorItem(
  id: string,
  patch: Partial<{
    title: string;
    description: string;
    imageUrl: string | null;
    logoUrl: string | null;
    externalUrl: string | null;
    buttonText: string | null;
    qrCodeUrl: string | null;
    qrFromLink: boolean;
    category: AppSponsorCategory;
    audience: AppSponsorAudience;
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
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.imageUrl !== undefined) row.image_url = patch.imageUrl;
  if (patch.logoUrl !== undefined) row.logo_url = patch.logoUrl;
  if (patch.externalUrl !== undefined) row.external_url = patch.externalUrl;
  if (patch.buttonText !== undefined) row.button_text = patch.buttonText;
  if (patch.qrCodeUrl !== undefined) row.qr_code_url = patch.qrCodeUrl;
  if (patch.qrFromLink !== undefined) row.qr_from_link = patch.qrFromLink;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.audience !== undefined) row.audience = patch.audience;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  if (patch.startsAt !== undefined) row.starts_at = patch.startsAt;
  if (patch.endsAt !== undefined) row.ends_at = patch.endsAt;
  await db.update(appSponsorsTable).set(row as never).where(eq(appSponsorsTable.id, id));
  return findAppSponsorAdmin(id);
}

export async function deactivateAppSponsorItem(id: string) {
  return patchAppSponsorItem(id, { isActive: false });
}
