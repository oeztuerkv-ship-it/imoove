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
  const override = (process.env.MARKETING_STATIC_DIR ?? "").trim();
  if (override) return override;

  const here = path.dirname(fileURLToPath(import.meta.url));
  // Gebündelt (dist/index.mjs): ../../marketing-site → artifacts/marketing-site
  // Ungebündelt (src/db): ../../../marketing-site → artifacts/marketing-site
  const candidates = [
    path.join(here, "..", "..", "marketing-site"),
    path.join(here, "..", "..", "..", "marketing-site"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "agb.html"))) return dir;
  }
  return candidates[0]!;
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
  const filePath = staticHtmlPath(slug);
  try {
    const full = fs.readFileSync(filePath, "utf8");
    const bodyHtml = extractLegalArticleHtml(full);
    if (!bodyHtml || bodyHtml.length < 80) {
      throw new Error(`extracted body too short (${bodyHtml.length} chars) from ${filePath}`);
    }
    return {
      pageTitle: parseTitleFromArticle(bodyHtml, defaults.pageTitle),
      standLabel: parseStandFromArticle(bodyHtml) || defaults.standLabel,
      bodyHtml,
    };
  } catch (err) {
    console.error(
      `[legal_pages] Static-Seed fehlgeschlagen für ${slug} (${filePath}):`,
      err instanceof Error ? err.message : err,
    );
    return { ...defaults, bodyHtml: `<h1>${defaults.pageTitle}</h1>` };
  }
}

function placeholderBodyHtml(slug: LegalPageSlug): string {
  return `<h1>${defaultSeedMeta(slug).pageTitle}</h1>`;
}

/** Erkennt fehlerhafte Erst-Seeds (Pfad-Bug im Bundle → nur Fallback-h1). */
export function isPlaceholderLegalBody(slug: LegalPageSlug, bodyHtml: string): boolean {
  const trimmed = bodyHtml.trim();
  if (trimmed === placeholderBodyHtml(slug)) return true;
  return trimmed.length < 80;
}

/** Beim ersten Zugriff: Static-HTML aus artifacts/marketing-site/ als Startinhalt. */
export async function ensureLegalPagesSeeded(): Promise<void> {
  const db = getDb();
  for (const slug of LEGAL_PAGE_SLUGS) {
    const seed = readStaticSeed(slug);
    const existing = await db.select().from(legalPagesTable).where(eq(legalPagesTable.slug, slug)).limit(1);
    if (existing.length === 0) {
      await db.insert(legalPagesTable).values({
        slug,
        page_title: seed.pageTitle,
        stand_label: seed.standLabel,
        body_html: seed.bodyHtml,
      });
      continue;
    }
    const row = existing[0]!;
    if (isPlaceholderLegalBody(slug, row.body_html) && !isPlaceholderLegalBody(slug, seed.bodyHtml)) {
      await db
        .update(legalPagesTable)
        .set({
          page_title: seed.pageTitle,
          stand_label: seed.standLabel,
          body_html: seed.bodyHtml,
          updated_at: new Date(),
        })
        .where(eq(legalPagesTable.slug, slug));
      console.info(`[legal_pages] Platzhalter für ${slug} aus Static nachgezogen (${seed.bodyHtml.length} Zeichen)`);
    }
  }
}

export async function listLegalPagesAdmin(): Promise<LegalPageDto[]> {
  await ensureLegalPagesSeeded();
  const db = getDb();
  const rows = await db.select().from(legalPagesTable).orderBy(legalPagesTable.slug);
  return rows.map(toDto);
}

export type LegalConsentVersionDto = {
  version: string;
  standLabel: string;
  updatedAt: string | null;
};

/** Versionsreferenz für Zustimmungs-Audit (stand_label + updated_at aus legal_pages). */
export function formatLegalPageVersion(
  dto: Pick<LegalPageDto, "standLabel" | "updatedAt">,
): string {
  const stand = dto.standLabel.trim();
  const updated = (dto.updatedAt ?? "").trim();
  if (stand && updated) return `${stand}|${updated}`;
  if (stand) return stand;
  if (updated) return updated;
  return "unknown";
}

export async function getLegalConsentVersions(): Promise<{
  agb: LegalConsentVersionDto;
  datenschutz: LegalConsentVersionDto;
} | null> {
  const agb = await getLegalPagePublic("agb");
  const datenschutz = await getLegalPagePublic("datenschutz");
  if (!agb || !datenschutz) return null;
  return {
    agb: {
      version: formatLegalPageVersion(agb),
      standLabel: agb.standLabel,
      updatedAt: agb.updatedAt,
    },
    datenschutz: {
      version: formatLegalPageVersion(datenschutz),
      standLabel: datenschutz.standLabel,
      updatedAt: datenschutz.updatedAt,
    },
  };
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
