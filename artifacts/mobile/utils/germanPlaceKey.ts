/** Einheitliche Orts-Schreibweise (ä→ae, ü→ue, ö→oe, ß→ss) — parallel API `germanPlaceKey.ts`. */
export function canonicalGermanPlaceKey(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .trim()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function haystackContainsMunicipality(
  haystack: string | null | undefined,
  municipality: string,
): boolean {
  const m = canonicalGermanPlaceKey(municipality);
  const h = canonicalGermanPlaceKey(haystack);
  if (!m || !h) return false;
  if (h === m || h.includes(m)) return true;
  return h.split(",").some((seg) => {
    const s = seg.trim().replace(/^\d{5}\s*/, "").trim();
    return s === m || canonicalGermanPlaceKey(s) === m;
  });
}
