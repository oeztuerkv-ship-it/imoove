import { eq } from "drizzle-orm";
import { normalizeGermanMarketingText } from "../lib/germanMarketingText";
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

export type HomepageNavPromo = {
  label: string;
  href: string;
  isActive: boolean;
  badge: string;
  highlight: boolean;
};

export type HomepageFixpreisPromoBlock = {
  icon: string;
  title: string;
  body: string;
  isActive: boolean;
};

export type HomepageFixpreisPanelItem = {
  icon: string;
  primary: string;
  secondary: string;
};

export type HomepageFixpreisPanel = {
  kind: "routes" | "list" | "text" | "highlight";
  title: string;
  subtitle: string;
  body: string;
  items: HomepageFixpreisPanelItem[];
  isActive: boolean;
};

export type HomepageFixpreisSection = {
  title: string;
  body: string;
  kicker: string;
  logoUrl: string;
  heroImageUrl: string;
  titleFontSize: "sm" | "md" | "lg" | "xl";
  bodyFontSize: "sm" | "md" | "lg";
  titleColor: string;
  bodyColor: string;
  accentColor: string;
  backgroundColor: string;
  textAlign: "left" | "center" | "right";
  ctaText: string;
  ctaLink: string;
  secondaryCtaText: string;
  secondaryCtaLink: string;
  promoBlocks: HomepageFixpreisPromoBlock[];
  contentPanels: HomepageFixpreisPanel[];
  footerNote: string;
  isActive: boolean;
};

export type HomepageSectionTheme = {
  titleFontSize: "sm" | "md" | "lg" | "xl";
  bodyFontSize: "sm" | "md" | "lg";
  titleColor: string;
  bodyColor: string;
  accentColor: string;
  backgroundColor: string;
  textAlign: "left" | "center" | "right";
};

export type HomepageSiteBranding = {
  headerLogoUrl: string;
  faviconUrl: string;
};

export type HomepageSectionThemes = {
  hero: HomepageSectionTheme;
  section2: HomepageSectionTheme;
  services: HomepageSectionTheme;
  manifest: HomepageSectionTheme;
};

export const defaultHomepageSectionTheme = (): HomepageSectionTheme => ({
  titleFontSize: "lg",
  bodyFontSize: "md",
  titleColor: "",
  bodyColor: "",
  accentColor: "",
  backgroundColor: "",
  textAlign: "center",
});

export const defaultHomepageSectionThemes = (): HomepageSectionThemes => ({
  hero: { ...defaultHomepageSectionTheme(), textAlign: "left" },
  section2: defaultHomepageSectionTheme(),
  services: defaultHomepageSectionTheme(),
  manifest: defaultHomepageSectionTheme(),
});

export const defaultHomepageSiteBranding = (): HomepageSiteBranding => ({
  headerLogoUrl: "",
  faviconUrl: "",
});

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
  aboutTitle: string;
  aboutIntro: string;
  aboutVision: string;
  aboutChallengesIntro: string;
  aboutBullets: string[];
  aboutClosing: string;
  aboutTagline: string;
  navPromo: HomepageNavPromo;
  fixpreisSection: HomepageFixpreisSection;
  siteBranding: HomepageSiteBranding;
  sectionThemes: HomepageSectionThemes;
  updatedAt: string | null;
};

const DEFAULT_CONTENT: Omit<HomepageContentDto, "updatedAt"> = {
  section2Title: "Eine Plattform für Fahrer, Fahrgäste und Unternehmen",
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
      icon: "🏥",
      title: "Krankenfahrten",
      body: "Transportschein scannen, Krankenkasse prüfen, Rollstuhl buchen — digital bis zur Abrechnung.",
      ctaText: "Mehr erfahren",
      ctaLink: "#care",
      isActive: true,
    },
    {
      icon: "💼",
      title: "Für Unternehmen",
      body: "Fahrten digital organisieren, Codes verwalten und Abrechnung vereinfachen.",
      ctaText: "Mehr erfahren",
      ctaLink: "#unternehmen",
      isActive: true,
    },
    {
      icon: "🚗",
      title: "Für Fahrer",
      body: "Mehr Aufträge, weniger Leerzeit — Aufträge, Navigation und Abrechnung in einer App.",
      ctaText: "App entdecken",
      ctaLink: "#jetzt-buchen",
      isActive: true,
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
    "Ihr Taxi- und Krankenfahrten-Service in Stuttgart, Leinfelden-Echterdingen, Filderstadt, Echterdingen und Umgebung. Jetzt Fahrt buchen oder als Taxiunternehmen Partner werden – schnell, zuverlässig, 24/7.",
  cta1Text: "Jetzt buchen",
  cta1Link: "#jetzt-buchen",
  cta2Text: "Mehr erfahren",
  cta2Link: "#services",
  noticeText: "",
  noticeActive: false,
  aboutTitle: "Mobilität neu organisiert.",
  aboutIntro:
    "Mobilität ohne Papierchaos. Ohne unnötige Rückfragen. Ohne komplizierte Abläufe.\n\nONRODA verbindet Fahrgäste, Fahrer, Unternehmen und Partner in einer gemeinsamen Plattform — von der Buchung über Live-Disposition und Krankenfahrten bis zur transparenten Abrechnung.",
  aboutVision:
    "Unsere Vision ist eine Mobilität, die einfacher funktioniert. Alles digital, nachvollziehbar und schnell — für alle Beteiligten.",
  aboutChallengesIntro: "Für Fahrgäste, Fahrer, Unternehmen und Partner.",
  aboutBullets: [
    "Taxi & Alltagsmobilität — Sofortfahrten und Reservierungen, Live-Tracking, digitale Quittung",
    "Krankenfahrten & Transportscheine — digitale Verordnungserfassung, G-BA-konforme Abrechnung",
    "Unternehmen & Kostenstellen — Firmenkunden, Zugangscodes, automatische Abrechnung",
    "Hotels, Gutscheine & Partnernetzwerke — eigene Panels, Belege, Statistiken",
    "Digitale Prozesse statt Medienbrüche — alles in einem System, keine Zettelwirtschaft",
  ],
  aboutClosing:
    "Gemeinsam mit Partnerbetrieben, Hotels, Kliniken und Unternehmen bauen wir eine regionale Plattform für moderne Mobilität – persönlich, transparent und verlässlich.",
  aboutTagline: "ONRODA – Mobilität neu organisiert.",
  navPromo: {
    label: "Fixpreise",
    href: "/fixpreise/",
    isActive: true,
    badge: "",
    highlight: true,
  },
  fixpreisSection: {
    title: "Festpreis-Fahrten",
    body: "Transparente Pauschalpreise für Ihre Strecke außerhalb des Pflichtfahrgebiets — Grundgebühr plus Kilometer nach ONRODA-Tarif. In der App buchen oder Festpreis-Gutschein über Hotel und Partner.",
    kicker: "Werbung · Festpreis",
    logoUrl: "",
    heroImageUrl: "",
    titleFontSize: "lg",
    bodyFontSize: "md",
    titleColor: "",
    bodyColor: "",
    accentColor: "",
    backgroundColor: "",
    textAlign: "center",
    ctaText: "Jetzt in der App buchen",
    ctaLink: "/#jetzt-buchen",
    secondaryCtaText: "",
    secondaryCtaLink: "",
    promoBlocks: [
      {
        icon: "🎯",
        title: "Transparenter Pauschalpreis",
        body: "Grundgebühr plus Kilometer — vor der Fahrt klar erkennbar.",
        isActive: true,
      },
      {
        icon: "🎫",
        title: "Gutschein für Hotels & Partner",
        body: "Festpreis-Gutscheine für Gäste und Mitarbeitende über das Partner-Panel.",
        isActive: true,
      },
      {
        icon: "📱",
        title: "Direkt in der App",
        body: "Strecke wählen, Preis sehen, buchen — ohne Überraschungen.",
        isActive: true,
      },
    ],
    contentPanels: [],
    footerNote: "",
    isActive: true,
  },
  siteBranding: defaultHomepageSiteBranding(),
  sectionThemes: defaultHomepageSectionThemes(),
};

function normalizeNavPromoHref(href: string): string {
  const h = href.trim();
  if (!h || h === "#fixpreise" || h === "/#fixpreise") return "/fixpreise/";
  if (h === "/fixpreise") return "/fixpreise/";
  return h;
}

function mapNavPromo(raw: unknown): HomepageNavPromo {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_CONTENT.navPromo;
  const hrefRaw = String(o.href ?? d.href).trim() || d.href;
  return {
    label: String(o.label ?? d.label).trim() || d.label,
    href: normalizeNavPromoHref(hrefRaw),
    isActive: o.isActive !== false,
    badge: String(o.badge ?? d.badge).trim(),
    highlight: o.highlight !== false,
  };
}

function mapFixpreisPromoBlocks(raw: unknown): HomepageFixpreisPromoBlock[] {
  const d = DEFAULT_CONTENT.fixpreisSection.promoBlocks;
  if (!Array.isArray(raw) || raw.length === 0) {
    return d.map((b) => ({ ...b }));
  }
  return raw.slice(0, 6).map((c, idx) => {
    const o = c as Record<string, unknown>;
    const fallback = d[idx] ?? { icon: "", title: "", body: "", isActive: true };
    return {
      icon: String(o?.icon ?? fallback.icon).trim(),
      title: String(o?.title ?? fallback.title).trim(),
      body: String(o?.body ?? fallback.body).trim(),
      isActive: o?.isActive !== false,
    };
  });
}

function parseFixpreisPanelKind(raw: unknown): HomepageFixpreisPanel["kind"] {
  const v = String(raw ?? "").trim();
  if (v === "routes" || v === "list" || v === "text" || v === "highlight") return v;
  return "text";
}

function mapFixpreisPanelItems(raw: unknown): HomepageFixpreisPanelItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).map((c) => {
    const o = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
    return {
      icon: String(o.icon ?? "").trim(),
      primary: String(o.primary ?? "").trim(),
      secondary: String(o.secondary ?? "").trim(),
    };
  });
}

function mapFixpreisContentPanels(raw: unknown): HomepageFixpreisPanel[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.slice(0, 8).map((c) => {
    const o = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
    return {
      kind: parseFixpreisPanelKind(o.kind),
      title: String(o.title ?? "").trim(),
      subtitle: String(o.subtitle ?? "").trim(),
      body: String(o.body ?? "").trim(),
      items: mapFixpreisPanelItems(o.items),
      isActive: o.isActive !== false,
    };
  });
}

function parseTextAlign(raw: unknown): HomepageFixpreisSection["textAlign"] {
  const v = String(raw ?? "").trim();
  if (v === "left" || v === "center" || v === "right") return v;
  return "center";
}

function mapSectionTheme(raw: unknown, fallback: HomepageSectionTheme): HomepageSectionTheme {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const titleFs = String(o.titleFontSize ?? fallback.titleFontSize).trim();
  const bodyFs = String(o.bodyFontSize ?? fallback.bodyFontSize).trim();
  return {
    titleFontSize: titleFs === "sm" || titleFs === "md" || titleFs === "lg" || titleFs === "xl" ? titleFs : fallback.titleFontSize,
    bodyFontSize: bodyFs === "sm" || bodyFs === "md" || bodyFs === "lg" ? bodyFs : fallback.bodyFontSize,
    titleColor: String(o.titleColor ?? fallback.titleColor).trim(),
    bodyColor: String(o.bodyColor ?? fallback.bodyColor).trim(),
    accentColor: String(o.accentColor ?? fallback.accentColor).trim(),
    backgroundColor: String(o.backgroundColor ?? fallback.backgroundColor).trim(),
    textAlign: parseTextAlign(o.textAlign ?? fallback.textAlign),
  };
}

function mapSiteBranding(raw: unknown): HomepageSiteBranding {
  const d = DEFAULT_CONTENT.siteBranding;
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    headerLogoUrl: String(o.headerLogoUrl ?? d.headerLogoUrl).trim(),
    faviconUrl: String(o.faviconUrl ?? d.faviconUrl).trim(),
  };
}

function mapSectionThemes(raw: unknown): HomepageSectionThemes {
  const d = DEFAULT_CONTENT.sectionThemes;
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    hero: mapSectionTheme(o.hero, d.hero),
    section2: mapSectionTheme(o.section2, d.section2),
    services: mapSectionTheme(o.services, d.services),
    manifest: mapSectionTheme(o.manifest, d.manifest),
  };
}

function parseTitleFontSize(raw: unknown): HomepageFixpreisSection["titleFontSize"] {
  const v = String(raw ?? "").trim();
  if (v === "sm" || v === "md" || v === "lg" || v === "xl") return v;
  return DEFAULT_CONTENT.fixpreisSection.titleFontSize;
}

function parseBodyFontSize(raw: unknown): HomepageFixpreisSection["bodyFontSize"] {
  const v = String(raw ?? "").trim();
  if (v === "sm" || v === "md" || v === "lg") return v;
  return DEFAULT_CONTENT.fixpreisSection.bodyFontSize;
}

function parseFixpreisTextAlign(raw: unknown): HomepageFixpreisSection["textAlign"] {
  const v = String(raw ?? "").trim();
  if (v === "left" || v === "center" || v === "right") return v;
  return DEFAULT_CONTENT.fixpreisSection.textAlign;
}

export function parseSiteBrandingPatch(raw: unknown): HomepageSiteBranding {
  return mapSiteBranding(raw);
}

export function parseSectionThemesPatch(raw: unknown): HomepageSectionThemes {
  return mapSectionThemes(raw);
}

export function parseFixpreisSectionPatch(raw: unknown): HomepageFixpreisSection {
  return mapFixpreisSection(raw);
}

function mapFixpreisSection(raw: unknown): HomepageFixpreisSection {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_CONTENT.fixpreisSection;
  return {
    title: String(o.title ?? d.title).trim() || d.title,
    body: String(o.body ?? d.body).trim() || d.body,
    kicker: String(o.kicker ?? d.kicker).trim(),
    logoUrl: String(o.logoUrl ?? d.logoUrl).trim(),
    heroImageUrl: String(o.heroImageUrl ?? d.heroImageUrl).trim(),
    titleFontSize: parseTitleFontSize(o.titleFontSize),
    bodyFontSize: parseBodyFontSize(o.bodyFontSize),
    titleColor: String(o.titleColor ?? d.titleColor).trim(),
    bodyColor: String(o.bodyColor ?? d.bodyColor).trim(),
    accentColor: String(o.accentColor ?? d.accentColor).trim(),
    backgroundColor: String(o.backgroundColor ?? d.backgroundColor).trim(),
    textAlign: parseFixpreisTextAlign(o.textAlign),
    ctaText: String(o.ctaText ?? d.ctaText).trim() || d.ctaText,
    ctaLink: String(o.ctaLink ?? d.ctaLink).trim() || d.ctaLink,
    secondaryCtaText: String(o.secondaryCtaText ?? d.secondaryCtaText).trim(),
    secondaryCtaLink: String(o.secondaryCtaLink ?? d.secondaryCtaLink).trim(),
    promoBlocks: mapFixpreisPromoBlocks(o.promoBlocks),
    contentPanels: mapFixpreisContentPanels(o.contentPanels),
    footerNote: String(o.footerNote ?? d.footerNote).trim(),
    isActive: o.isActive !== false,
  };
}

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

function mapAboutBullets(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [...DEFAULT_CONTENT.aboutBullets];
  }
  return raw
    .slice(0, 8)
    .map((b) => String(b ?? "").trim())
    .filter((b) => b.length > 0);
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

export function normalizeHomepageContentDto(dto: HomepageContentDto): HomepageContentDto {
  return {
    ...dto,
    section2Title: normalizeGermanMarketingText(dto.section2Title),
    heroHeadline: normalizeGermanMarketingText(dto.heroHeadline),
    heroSubline: normalizeGermanMarketingText(dto.heroSubline),
    cta1Text: normalizeGermanMarketingText(dto.cta1Text),
    cta2Text: normalizeGermanMarketingText(dto.cta2Text),
    servicesKicker: normalizeGermanMarketingText(dto.servicesKicker),
    servicesTitle: normalizeGermanMarketingText(dto.servicesTitle),
    servicesSubline: normalizeGermanMarketingText(dto.servicesSubline),
    manifestKicker: normalizeGermanMarketingText(dto.manifestKicker),
    manifestTitle: normalizeGermanMarketingText(dto.manifestTitle),
    manifestSubline: normalizeGermanMarketingText(dto.manifestSubline),
    noticeText: normalizeGermanMarketingText(dto.noticeText),
    aboutTitle: normalizeGermanMarketingText(dto.aboutTitle),
    aboutIntro: normalizeGermanMarketingText(dto.aboutIntro),
    aboutVision: normalizeGermanMarketingText(dto.aboutVision),
    aboutChallengesIntro: normalizeGermanMarketingText(dto.aboutChallengesIntro),
    aboutBullets: dto.aboutBullets.map((b) => normalizeGermanMarketingText(b)),
    aboutClosing: normalizeGermanMarketingText(dto.aboutClosing),
    aboutTagline: normalizeGermanMarketingText(dto.aboutTagline),
    navPromo: {
      ...(dto.navPromo ?? DEFAULT_CONTENT.navPromo),
      label: normalizeGermanMarketingText((dto.navPromo ?? DEFAULT_CONTENT.navPromo).label),
      badge: normalizeGermanMarketingText((dto.navPromo ?? DEFAULT_CONTENT.navPromo).badge),
    },
    fixpreisSection: {
      ...(dto.fixpreisSection ?? DEFAULT_CONTENT.fixpreisSection),
      title: normalizeGermanMarketingText((dto.fixpreisSection ?? DEFAULT_CONTENT.fixpreisSection).title),
      body: normalizeGermanMarketingText((dto.fixpreisSection ?? DEFAULT_CONTENT.fixpreisSection).body),
      kicker: normalizeGermanMarketingText((dto.fixpreisSection ?? DEFAULT_CONTENT.fixpreisSection).kicker),
      ctaText: normalizeGermanMarketingText((dto.fixpreisSection ?? DEFAULT_CONTENT.fixpreisSection).ctaText),
      secondaryCtaText: normalizeGermanMarketingText((dto.fixpreisSection ?? DEFAULT_CONTENT.fixpreisSection).secondaryCtaText),
      promoBlocks: (dto.fixpreisSection?.promoBlocks ?? DEFAULT_CONTENT.fixpreisSection.promoBlocks).map((b) => ({
        ...b,
        title: normalizeGermanMarketingText(b.title),
        body: normalizeGermanMarketingText(b.body),
      })),
      contentPanels: (dto.fixpreisSection?.contentPanels ?? DEFAULT_CONTENT.fixpreisSection.contentPanels).map((p) => ({
        ...p,
        title: normalizeGermanMarketingText(p.title),
        subtitle: normalizeGermanMarketingText(p.subtitle),
        body: normalizeGermanMarketingText(p.body),
        items: p.items.map((it) => ({
          ...it,
          primary: normalizeGermanMarketingText(it.primary),
          secondary: normalizeGermanMarketingText(it.secondary),
        })),
      })),
      footerNote: normalizeGermanMarketingText((dto.fixpreisSection ?? DEFAULT_CONTENT.fixpreisSection).footerNote),
    },
    siteBranding: mapSiteBranding(dto.siteBranding),
    sectionThemes: mapSectionThemes(dto.sectionThemes),
    section2Cards: dto.section2Cards.map((c) => ({
      ...c,
      title: normalizeGermanMarketingText(c.title),
      body: normalizeGermanMarketingText(c.body),
      ctaText: normalizeGermanMarketingText(c.ctaText),
    })),
    servicesCards: dto.servicesCards.map((c) => ({
      ...c,
      title: normalizeGermanMarketingText(c.title),
      body: normalizeGermanMarketingText(c.body),
    })),
    manifestCards: dto.manifestCards.map((c) => ({
      ...c,
      title: normalizeGermanMarketingText(c.title),
      body: normalizeGermanMarketingText(c.body),
      ctaText: normalizeGermanMarketingText(c.ctaText),
    })),
  };
}

function toDto(row: typeof homepageContentTable.$inferSelect): HomepageContentDto {
  const cards = Array.isArray(row.section2_cards) ? row.section2_cards : [];
  return normalizeHomepageContentDto({
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
    aboutTitle: (row.about_title || "").trim() || DEFAULT_CONTENT.aboutTitle,
    aboutIntro: (row.about_intro || "").trim() || DEFAULT_CONTENT.aboutIntro,
    aboutVision: (row.about_vision || "").trim() || DEFAULT_CONTENT.aboutVision,
    aboutChallengesIntro: (row.about_challenges_intro || "").trim() || DEFAULT_CONTENT.aboutChallengesIntro,
    aboutBullets: mapAboutBullets(row.about_bullets),
    aboutClosing: (row.about_closing || "").trim() || DEFAULT_CONTENT.aboutClosing,
    aboutTagline: (row.about_tagline || "").trim() || DEFAULT_CONTENT.aboutTagline,
    navPromo: mapNavPromo(row.nav_promo),
    fixpreisSection: mapFixpreisSection(row.fixpreis_section),
    siteBranding: mapSiteBranding(row.site_branding),
    sectionThemes: mapSectionThemes(row.section_themes),
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  });
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
  const definedPatch = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  ) as Partial<Omit<HomepageContentDto, "updatedAt">>;
  const existingRows = await db.select().from(homepageContentTable).where(eq(homepageContentTable.id, HOMEPAGE_CONTENT_ID)).limit(1);
  const existing = existingRows[0];
  const merged = normalizeHomepageContentDto({
    ...(existing ? toDto(existing) : { ...DEFAULT_CONTENT, updatedAt: null }),
    ...definedPatch,
  });
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
      about_title: merged.aboutTitle,
      about_intro: merged.aboutIntro,
      about_vision: merged.aboutVision,
      about_challenges_intro: merged.aboutChallengesIntro,
      about_bullets: merged.aboutBullets,
      about_closing: merged.aboutClosing,
      about_tagline: merged.aboutTagline,
      nav_promo: merged.navPromo,
      fixpreis_section: merged.fixpreisSection,
      site_branding: merged.siteBranding,
      section_themes: merged.sectionThemes,
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
        about_title: merged.aboutTitle,
        about_intro: merged.aboutIntro,
        about_vision: merged.aboutVision,
        about_challenges_intro: merged.aboutChallengesIntro,
        about_bullets: merged.aboutBullets,
        about_closing: merged.aboutClosing,
        about_tagline: merged.aboutTagline,
        nav_promo: merged.navPromo,
        fixpreis_section: merged.fixpreisSection,
        site_branding: merged.siteBranding,
        section_themes: merged.sectionThemes,
        updated_by_admin_user_id: actorAdminUserId ?? null,
        updated_at: now,
      })
      .where(eq(homepageContentTable.id, HOMEPAGE_CONTENT_ID));
  }
  const rows = await db.select().from(homepageContentTable).where(eq(homepageContentTable.id, HOMEPAGE_CONTENT_ID)).limit(1);
  return rows[0] ? toDto(rows[0]) : null;
}
