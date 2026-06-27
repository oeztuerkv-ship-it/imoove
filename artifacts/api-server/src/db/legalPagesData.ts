import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { getDb } from "./client";
import { legalPagesTable } from "./schema";

export const LEGAL_PAGE_SLUGS = ["agb", "datenschutz", "impressum"] as const;
export type LegalPageSlug = (typeof LEGAL_PAGE_SLUGS)[number];

export type LegalPageDto = {
  slug: LegalPageSlug;
  pageTitle: string;
  standLabel: string;
  bodyHtml: string;
  updatedAt: string | null;
};

const SLUG_SET = new Set<string>(LEGAL_PAGE_SLUGS);

export function isLegalPageSlug(value: string): value is LegalPageSlug {
  return SLUG_SET.has(value);
}

function toDto(row: typeof legalPagesTable.$inferSelect): LegalPageDto {
  return {
    slug: row.slug as LegalPageSlug,
    pageTitle: row.page_title,
    standLabel: row.stand_label,
    bodyHtml: row.body_html,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

function marketingSiteDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "../../../marketing-site");
}

function staticHtmlPath(slug: LegalPageSlug): string {
  return path.join(marketingSiteDir(), `${slug}.html`);
}

/** Inhalt von `<article class="card">…</article>` aus der Marketing-Static. */
export function extractLegalArticleHtml(fullHtml: string): string {
  const match = fullHtml.match(/<article class="card">([\s\S]*?)<\/article>/i);
  return match?.[1]?.trim() ?? fullHtml.trim();
}

function parseTitleFromArticle(articleHtml: string, fallback: string): string {
  const h1 = articleHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!h1?.[1]) return fallback;
  return h1[1].replace(/<[^>]+>/g, "").trim() || fallback;
}

function parseStandFromArticle(articleHtml: string): string {
  const stand = articleHtml.match(/<p>\s*Stand:\s*([^<]+)\s*<\/p>/i);
  return stand?.[1]?.trim() ?? "";
}

function defaultSeedMeta(slug: LegalPageSlug): { pageTitle: string; standLabel: string } {
  if (slug === "agb") return { pageTitle: "AGB", standLabel: "Juni 2026" };
  if (slug === "datenschutz") return { pageTitle: "Datenschutz", standLabel: "Juni 2026" };
  return { pageTitle: "Impressum", standLabel: "" };
}

function readStaticSeed(slug: LegalPageSlug): { pageTitle: string; standLabel: string; bodyHtml: string } {
  const defaults = defaultSeedMeta(slug);
  try {
    const full = fs.readFileSync(staticHtmlPath(slug), "utf8");
    const bodyHtml = extractLegalArticleHtml(full);
    return {
      pageTitle: parseTitleFromArticle(bodyHtml, defaults.pageTitle),
      standLabel: parseStandFromArticle(bodyHtml) || defaults.standLabel,
      bodyHtml,
    };
  } catch {
    return { ...defaults, bodyHtml: `<h1>${defaults.pageTitle}</h1>` };
  }
}

/** Beim ersten Zugriff: Static-HTML aus artifacts/marketing-site/ als Startinhalt. */
export async function ensureLegalPagesSeeded(): Promise<void> {
  const db = getDb();
  for (const slug of LEGAL_PAGE_SLUGS) {
    const existing = await db.select().from(legalPagesTable).where(eq(legalPagesTable.slug, slug)).limit(1);
    if (existing.length > 0) continue;
    const seed = readStaticSeed(slug);
    await db.insert(legalPagesTable).values({
      slug,
      page_title: seed.pageTitle,
      stand_label: seed.standLabel,
      body_html: seed.bodyHtml,
    });
  }
}

export async function listLegalPagesAdmin(): Promise<LegalPageDto[]> {
  await ensureLegalPagesSeeded();
  const db = getDb();
  const rows = await db.select().from(legalPagesTable).orderBy(legalPagesTable.slug);
  return rows.map(toDto);
}

export async function getLegalPagePublic(slug: LegalPageSlug): Promise<LegalPageDto | null> {
  await ensureLegalPagesSeeded();
  const db = getDb();
  const rows = await db.select().from(legalPagesTable).where(eq(legalPagesTable.slug, slug)).limit(1);
  return rows[0] ? toDto(rows[0]) : null;
}

export async function updateLegalPageAdmin(
  slug: LegalPageSlug,
  patch: { pageTitle?: string; standLabel?: string; bodyHtml?: string },
): Promise<LegalPageDto | null> {
  await ensureLegalPagesSeeded();
  const db = getDb();
  const set: Partial<typeof legalPagesTable.$inferInsert> = { updated_at: new Date() };
  if (patch.pageTitle !== undefined) set.page_title = patch.pageTitle.trim();
  if (patch.standLabel !== undefined) set.stand_label = patch.standLabel.trim();
  if (patch.bodyHtml !== undefined) set.body_html = patch.bodyHtml;

  await db.update(legalPagesTable).set(set).where(eq(legalPagesTable.slug, slug));
  const rows = await db.select().from(legalPagesTable).where(eq(legalPagesTable.slug, slug)).limit(1);
  return rows[0] ? toDto(rows[0]) : null;
}
