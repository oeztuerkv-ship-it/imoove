import { eq } from "drizzle-orm";
import { getDb } from "./client";
import { homepageContentTable } from "./schema";

const HOMEPAGE_CONTENT_ID = "homepage-main";

export type HomepageContentDto = {
  heroHeadline: string;
  heroSubline: string;
  cta1Text: string;
  cta1Link: string;
  cta2Text: string;
  cta2Link: string;
  noticeText: string;
  noticeActive: boolean;
  updatedAt: string | null;
};

const DEFAULT_CONTENT: Omit<HomepageContentDto, "updatedAt"> = {
  heroHeadline: "Digitale Mobilitaet\nfuer Fahrgaeste, Unternehmen\nund Partnerbetriebe",
  heroSubline: "ONRODA verbindet Fahrgaeste, Fahrer und Unternehmen in einem intelligenten System - fuer einfache Buchung und strukturierte Ablaeufe.",
  cta1Text: "Jetzt buchen",
  cta1Link: "#jetzt-buchen",
  cta2Text: "Mehr erfahren",
  cta2Link: "#services",
  noticeText: "",
  noticeActive: false,
};

function toDto(row: typeof homepageContentTable.$inferSelect): HomepageContentDto {
  return {
    heroHeadline: row.hero_headline,
    heroSubline: row.hero_subline,
    cta1Text: row.cta1_text,
    cta1Link: row.cta1_link,
    cta2Text: row.cta2_text,
    cta2Link: row.cta2_link,
    noticeText: row.notice_text,
    noticeActive: row.notice_active,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

export async function getHomepageContentPublic(): Promise<HomepageContentDto | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db.select().from(homepageContentTable).where(eq(homepageContentTable.id, HOMEPAGE_CONTENT_ID)).limit(1);
  if (!rows[0]) return null;
  return toDto(rows[0]);
}

export async function getHomepageContentAdmin(): Promise<HomepageContentDto> {
  const db = getDb();
  if (!db) return { ...DEFAULT_CONTENT, updatedAt: null };
  const rows = await db.select().from(homepageContentTable).where(eq(homepageContentTable.id, HOMEPAGE_CONTENT_ID)).limit(1);
  if (!rows[0]) return { ...DEFAULT_CONTENT, updatedAt: null };
  return toDto(rows[0]);
}

export async function patchHomepageContentAdmin(
  patch: Partial<Omit<HomepageContentDto, "updatedAt">>,
  actorAdminUserId?: string | null,
): Promise<HomepageContentDto | null> {
  const db = getDb();
  if (!db) return null;
  const existingRows = await db.select().from(homepageContentTable).where(eq(homepageContentTable.id, HOMEPAGE_CONTENT_ID)).limit(1);
  const existing = existingRows[0];
  const merged = {
    ...(existing ? toDto(existing) : { ...DEFAULT_CONTENT, updatedAt: null }),
    ...patch,
  };
  const now = new Date();
  if (!existing) {
    await db.insert(homepageContentTable).values({
      id: HOMEPAGE_CONTENT_ID,
      hero_headline: merged.heroHeadline,
      hero_subline: merged.heroSubline,
      cta1_text: merged.cta1Text,
      cta1_link: merged.cta1Link,
      cta2_text: merged.cta2Text,
      cta2_link: merged.cta2Link,
      notice_text: merged.noticeText,
      notice_active: merged.noticeActive,
      updated_by_admin_user_id: actorAdminUserId ?? null,
      created_at: now,
      updated_at: now,
    });
  } else {
    await db
      .update(homepageContentTable)
      .set({
        hero_headline: merged.heroHeadline,
        hero_subline: merged.heroSubline,
        cta1_text: merged.cta1Text,
        cta1_link: merged.cta1Link,
        cta2_text: merged.cta2Text,
        cta2_link: merged.cta2Link,
        notice_text: merged.noticeText,
        notice_active: merged.noticeActive,
        updated_by_admin_user_id: actorAdminUserId ?? null,
        updated_at: now,
      })
      .where(eq(homepageContentTable.id, HOMEPAGE_CONTENT_ID));
  }
  const rows = await db.select().from(homepageContentTable).where(eq(homepageContentTable.id, HOMEPAGE_CONTENT_ID)).limit(1);
  return rows[0] ? toDto(rows[0]) : null;
}
