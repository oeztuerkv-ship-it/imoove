/** Anzeige-Helfer für versionierte Partner-Uploads (Taxi-Flotte). */

export const FLEET_VEHICLE_DOC_KIND_DE = {
  concession: "Konzession / Konzessionsnachweis",
  registration: "Fahrzeugschein / Zulassungsbescheinigung",
  insurance: "Versicherung",
  taximeter: "Eichschein / Taxameter",
  accessibility: "Rollstuhl-/Sonderausstattung",
  legacy: "Älterer Upload (ohne Dokumenttyp)",
};

export function fleetVehicleDocKindLabelDe(kind) {
  if (kind == null || kind === "") return FLEET_VEHICLE_DOC_KIND_DE.legacy;
  return FLEET_VEHICLE_DOC_KIND_DE[kind] || String(kind);
}

/**
 * Gruppiert nach kind; innerhalb chronologisch aufsteigend → Versionsnummer v1…vn (vn = aktuell).
 * @param {unknown[]} docs
 * @returns {Array<{ kindKey: string; kindLabel: string; versions: Array<Record<string, unknown> & { versionIndex: number; isLatest: boolean }> }>}
 */
export function groupFleetVehicleDocumentsForAdmin(docs) {
  if (!Array.isArray(docs)) return [];
  const m = new Map();
  for (const d of docs) {
    const raw = d && typeof d === "object" ? d : {};
    const kindKey = raw.kind != null && String(raw.kind).trim() !== "" ? String(raw.kind) : "legacy";
    if (!m.has(kindKey)) m.set(kindKey, []);
    m.get(kindKey).push(raw);
  }
  const out = [];
  for (const [kindKey, arr] of m) {
    const sorted = [...arr].sort((a, b) => {
      const ta = typeof a.uploadedAt === "string" ? a.uploadedAt : "";
      const tb = typeof b.uploadedAt === "string" ? b.uploadedAt : "";
      return ta.localeCompare(tb);
    });
    const versions = sorted.map((row, i) => ({
      ...row,
      versionIndex: i + 1,
      isLatest: i === sorted.length - 1,
    }));
    out.push({
      kindKey,
      kindLabel: fleetVehicleDocKindLabelDe(kindKey === "legacy" ? null : kindKey),
      versions,
    });
  }
  out.sort((a, b) => a.kindLabel.localeCompare(b.kindLabel, "de"));
  return out;
}
