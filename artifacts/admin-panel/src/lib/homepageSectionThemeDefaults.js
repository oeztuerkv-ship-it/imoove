export const defaultHomepageSectionTheme = () => ({
  titleFontSize: "lg",
  bodyFontSize: "md",
  titleColor: "",
  bodyColor: "",
  accentColor: "",
  backgroundColor: "",
  textAlign: "center",
});

export const defaultHomepageSectionThemes = () => ({
  hero: { ...defaultHomepageSectionTheme(), textAlign: "left" },
  section2: defaultHomepageSectionTheme(),
  services: defaultHomepageSectionTheme(),
  manifest: defaultHomepageSectionTheme(),
});

export const defaultHomepageSiteBranding = () => ({
  headerLogoUrl: "",
  faviconUrl: "",
});

export function mergeHomepageSectionThemes(incoming) {
  const d = defaultHomepageSectionThemes();
  const p = incoming && typeof incoming === "object" ? incoming : {};
  const pick = (key) => {
    const row = p[key] && typeof p[key] === "object" ? p[key] : {};
    const base = d[key];
    return {
      titleFontSize: ["sm", "md", "lg", "xl"].includes(row.titleFontSize) ? row.titleFontSize : base.titleFontSize,
      bodyFontSize: ["sm", "md", "lg"].includes(row.bodyFontSize) ? row.bodyFontSize : base.bodyFontSize,
      titleColor: typeof row.titleColor === "string" ? row.titleColor : base.titleColor,
      bodyColor: typeof row.bodyColor === "string" ? row.bodyColor : base.bodyColor,
      accentColor: typeof row.accentColor === "string" ? row.accentColor : base.accentColor,
      backgroundColor: typeof row.backgroundColor === "string" ? row.backgroundColor : base.backgroundColor,
      textAlign: ["left", "center", "right"].includes(row.textAlign) ? row.textAlign : base.textAlign,
    };
  };
  return {
    hero: pick("hero"),
    section2: pick("section2"),
    services: pick("services"),
    manifest: pick("manifest"),
  };
}

export function mergeHomepageSiteBranding(incoming) {
  const d = defaultHomepageSiteBranding();
  const p = incoming && typeof incoming === "object" ? incoming : {};
  return {
    headerLogoUrl: typeof p.headerLogoUrl === "string" ? p.headerLogoUrl.trim() : d.headerLogoUrl,
    faviconUrl: typeof p.faviconUrl === "string" ? p.faviconUrl.trim() : d.faviconUrl,
  };
}
