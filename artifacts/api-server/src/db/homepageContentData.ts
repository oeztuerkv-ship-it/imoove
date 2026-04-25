import { eq } from "drizzle-orm";
import { getDb } from "./client";
import { homepageContentTable } from "./schema";

const HOMEPAGE_CONTENT_ID = "homepage-main";

export type HomepageServiceCard = {
  icon: string;
  title: string;
  body: string;
  isActive: boolean;
};

export type HomepageManifestCard = {
  num: string;
  icon: string;
  title: string;
  body: string;
  ctaText: string;
  ctaLink: string;
  isActive: boolean;
};

export type HomepageContentDto = {
  section2Title: string;
  section2Cards: Array<{
    icon: string;
    title: string;
    body: string;
    ctaText: string;
    ctaLink: string;
    isActive: boolean;
  }>;
  servicesKicker: string;
  servicesTitle: string;
  servicesSubline: string;
  servicesCards: HomepageServiceCard[];
  manifestKicker: string;
  manifestTitle: string;
  manifestSubline: string;
  manifestCards: HomepageManifestCard[];
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
  section2Title: "Für wen ist ONRODA?",
  section2Cards: [
    {
      icon: "🚕",
      title: "Für Fahrgäste",
      body: "Fahrten sofort buchen oder planen. Einfach, schnell und transparent.",
      ctaText: "Jetzt buchen",
      ctaLink: "#jetzt-buchen",
      isActive: true,
    },
    {
      icon: "🏢",
      title: "Für Unternehmen",
      body: "Fahrten digital organisieren, Codes verwalten und Abrechnung vereinfachen.",
      ctaText: "Partner werden",
      ctaLink: "#unternehmen",
      isActive: true,
    },
    {
      icon: "🏨",
      title: "Für Hotels",
      body: "Gästemobilität zentral koordinieren und Abläufe im Team entlasten.",
      ctaText: "Mehr erfahren",
      ctaLink: "#unternehmen",
      isActive: false,
    },
    {
      icon: "🏥",
      title: "Für medizinische Partner",
      body: "Organisierte Fahrten mit klaren digitalen Prozessen und verlässlicher Abwicklung.",
      ctaText: "ONRODA Care",
      ctaLink: "#care",
      isActive: false,
    },
  ],
  servicesKicker: "Leistungen",
  servicesTitle: "Unsere Services",
  servicesSubline: "Modernste Technologie für Ihre Mobilität in Stuttgart",
  servicesCards: [
    {
      icon: "⏱",
      title: "Echtzeit-Buchung",
      body: "Buchen Sie Ihr Taxi in Sekunden. Verfolgen Sie Ihren Fahrer live auf der Karte.",
      isActive: true,
    },
    {
      icon: "📅",
      title: "Vorbestellung",
      body: "Planen Sie Ihre Fahrt im Voraus. Zum Flughafen, Termin oder Meeting.",
      isActive: true,
    },
    {
      icon: "🧾",
      title: "Digitale Quittungen",
      body: "Alle Belege automatisch per E-Mail. Perfekt für Ihre Buchhaltung.",
      isActive: true,
    },
  ],
  manifestKicker: "Das ONRODA Manifest",
  manifestTitle: "Vernetzung auf allen Ebenen",
  manifestSubline: "Ein intelligentes System für Fahrgäste, Fahrer und Unternehmen",
  manifestCards: [
    {
      num: "1",
      icon: "📍",
      title: "Innovation aus der Region",
      body: "Wir kennen jeden Winkel von Stuttgart. Unsere Strategie basiert auf echter lokaler Expertise, gepaart mit modernster Technik.",
      ctaText: "Mehr erfahren →",
      ctaLink: "#manifest",
      isActive: true,
    },
    {
      num: "2",
      icon: "⚡",
      title: "Effizienz durch Digitalisierung",
      body: "Bei ONRODA gibt es kein Hin-und-Her. Wir haben Prozesse radikal entschlackt. Alles läuft digital, direkt und reibungslos.",
      ctaText: "Mehr erfahren →",
      ctaLink: "#services",
      isActive: true,
    },
    {
      num: "3",
      icon: "🤝",
      title: "Mobilität als Service-Baustein für Unternehmen, Hotels und Partnerbetriebe",
      body: "Wir verstehen uns als Partner für Hotels, Firmen und Veranstalter. ONRODA integriert Mobilität als qualitativen Mehrwert.",
      ctaText: "Mehr erfahren →",
      ctaLink: "#unternehmen",
      isActive: true,
    },
    {
      num: "4",
      icon: "🛡",
      title: "Verlässlichkeit ist unser Standard",
      body: "Wir versprechen nicht nur Mobilität, wir liefern sie. Ein Maximum an Planungssicherheit für Sie und Ihre Partner.",
      ctaText: "Mehr erfahren →",
      ctaLink: "#care",
      isActive: true,
    },
  ],
  heroHeadline: "Digitale Mobilität\nfür Fahrgäste, Unternehmen\nund Partnerbetriebe",
  heroSubline:
    "ONRODA verbindet Fahrgäste, Fahrer und Unternehmen in einem intelligenten System – für einfache Buchung und strukturierte Abläufe.",
  cta1Text: "Jetzt buchen",
  cta1Link: "#jetzt-buchen",
  cta2Text: "Mehr erfahren",
  cta2Link: "#services",
  noticeText: "",
  noticeActive: false,
};

function mapServiceCards(raw: unknown): HomepageServiceCard[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_CONTENT.servicesCards.map((c) => ({ ...c }));
  }
  return raw.map((c) => {
    const o = c as Record<string, unknown>;
    return {
      icon: String(o?.icon ?? ""),
      title: String(o?.title ?? ""),
      body: String(o?.body ?? ""),
      isActive: o?.isActive !== false,
    };
  });
}

function mapManifestCards(raw: unknown): HomepageManifestCard[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_CONTENT.manifestCards.map((c) => ({ ...c }));
  }
  return raw.map((c) => {
    const o = c as Record<string, unknown>;
    return {
      num: String(o?.num ?? "").trim(),
      icon: String(o?.icon ?? ""),
      title: String(o?.title ?? ""),
      body: String(o?.body ?? ""),
      ctaText: String(o?.ctaText ?? ""),
      ctaLink: String(o?.ctaLink ?? ""),
      isActive: o?.isActive !== false,
    };
  });
}

function toDto(row: typeof homepageContentTable.$inferSelect): HomepageContentDto {
  const cards = Array.isArray(row.section2_cards) ? row.section2_cards : [];
  return {
    section2Title: row.section2_title,
    section2Cards: cards.map((c) => ({
      icon: String(c?.icon ?? ""),
      title: String(c?.title ?? ""),
      body: String(c?.body ?? ""),
      ctaText: String(c?.ctaText ?? ""),
      ctaLink: String(c?.ctaLink ?? ""),
      isActive: c?.isActive !== false,
    })),
    servicesKicker: (row.services_kicker || "").trim() || DEFAULT_CONTENT.servicesKicker,
    servicesTitle: (row.services_title || "").trim() || DEFAULT_CONTENT.servicesTitle,
    servicesSubline: (row.services_subline || "").trim() || DEFAULT_CONTENT.servicesSubline,
    servicesCards: mapServiceCards(row.services_cards),
    manifestKicker: (row.manifest_kicker || "").trim() || DEFAULT_CONTENT.manifestKicker,
    manifestTitle: (row.manifest_title || "").trim() || DEFAULT_CONTENT.manifestTitle,
    manifestSubline: (row.manifest_subline || "").trim() || DEFAULT_CONTENT.manifestSubline,
    manifestCards: mapManifestCards(row.manifest_cards).map((c, i) => ({
      ...c,
      num: c.num || String(i + 1),
    })),
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
      section2_title: merged.section2Title,
      section2_cards: merged.section2Cards,
      services_kicker: merged.servicesKicker,
      services_title: merged.servicesTitle,
      services_subline: merged.servicesSubline,
      services_cards: merged.servicesCards,
      manifest_kicker: merged.manifestKicker,
      manifest_title: merged.manifestTitle,
      manifest_subline: merged.manifestSubline,
      manifest_cards: merged.manifestCards,
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
        section2_title: merged.section2Title,
        section2_cards: merged.section2Cards,
        services_kicker: merged.servicesKicker,
        services_title: merged.servicesTitle,
        services_subline: merged.servicesSubline,
        services_cards: merged.servicesCards,
        manifest_kicker: merged.manifestKicker,
        manifest_title: merged.manifestTitle,
        manifest_subline: merged.manifestSubline,
        manifest_cards: merged.manifestCards,
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
