/**
 * Partner-Panel: sichtbare Menüpunkte/Kacheln pro Mandant (`admin_companies.panel_modules`).
 * `null` in der DB = effektiv alle **für `company_kind` erlaubten** Module (Legacy; gleiche Whitelist wie Admin-PATCH).
 *
 * `productIntent`: fachliche Zielrichtung für Roadmap und Abstimmung (nicht nur UI-Label).
 */

export const PANEL_MODULE_DEFINITIONS = [
  {
    id: "overview",
    label: "Übersicht",
    description: "Startseite, Kennzahlen-Hinweise, eigenes Passwort",
    productIntent:
      "Einstieg pro Login: Session, Kurzüberblick, Hinweise auf freigeschaltete Module; eigenes Passwort ändern.",
  },
  {
    id: "support",
    label: "Anfragen",
    description: "Nachrichten an die Plattform (Stammdaten, Dokumente, …)",
    productIntent:
      "Chat-Threads je Mandant mit der Plattform: neue Anfrage, Verlauf, Status — getrennt von Taxi-Fachlogik.",
  },
  {
    id: "help",
    label: "Hilfe",
    description: "Schnellhilfe, FAQ und Einstieg in Support-Anfragen",
    productIntent:
      "Self-Service-Hilfe zur Reduktion wiederkehrender Support-Anfragen; klare Weiterleitung in das bestehende Anfragen-Modul.",
  },
  {
    id: "rides_list",
    label: "Fahrtenliste & Verlauf",
    description: "„Meine Fahrten“ und „Verlauf“ (gemeinsame API)",
    productIntent:
      "Alle Mandantenfahrten listen (live + Verlauf), filtern, CSV; inkl. Abrechnungs- und Code-Spuren wo vorhanden.",
  },
  {
    id: "rides_create",
    label: "Neue Fahrt",
    description: "Auftrag erfassen (POST /panel/v1/rides)",
    productIntent:
      "Manuelle oder dispositionelle Erfassung einer Fahrt für den Mandanten; optional Freigabe-Code / Referenzen gemäß weiterer Module.",
  },
  {
    id: "company_profile",
    label: "Profil / Firma",
    description: "Firmenstammdaten bearbeiten",
    productIntent:
      "Pflege von Name, Kontakt, Adresse, USt-Id — alles, was auf Rechnungen und Zuordnung erscheinen soll.",
  },
  {
    id: "team",
    label: "Mitarbeiter",
    description: "Panel-Zugänge und Rollen",
    productIntent:
      "Nutzerverwaltung für das Partner-Portal (Rollen, Aktivierung, Passwort-Reset) innerhalb des Mandanten.",
  },
  {
    id: "access_codes",
    label: "Freigabe-Codes",
    description: "Digitale Kostenübernahme: Codes verwalten und nachverfolgen",
    productIntent:
      "Lebenszyklus digitaler Freigaben: Codes anlegen, begrenzen (Zeit, Nutzungen, Mandant), in Buchungen einlösen. Verlauf: welcher Code, welche Fahrt, Zahler, Preis, Status; Nutzung/Storno/Zeitablauf nachvollziehbar (Snapshot auf der Fahrt + Code-Metadaten).",
  },
  {
    id: "hotel_mode",
    label: "Hotelmodus",
    description: "Hotel-spezifische Oberfläche und Logik",
    productIntent:
      "Voreinstellungen und Formulare für Beherbergung (Zimmer/Gast-Referenz, Concierge-Workflow, Kennzeichnung Hotel-Kostenübernahme), ohne separates System.",
  },
  {
    id: "company_rides",
    label: "Firmenfahrten",
    description: "Sicht auf Firmen- und Sachkostenfahrten",
    productIntent:
      "Gefilterte Ansichten, KPIs und Exporte für typische B2B-/Firmenfahrten (z. B. nur payerKind company, Kostenstellen, Abgleich mit Buchhaltung).",
  },
  {
    id: "recurring_rides",
    label: "Serienfahrten",
    description: "Wiederkehrende oder gebündelte Aufträge",
    productIntent:
      "Vorlagen und Serien (täglich/wöchentlich, feste Strecke oder Kunde), Erzeugung offener Fahrten aus Serien, Änderungen/Storno auf Serien-Ebene.",
  },
  {
    id: "billing",
    label: "Abrechnung",
    description: "Umsätze, Perioden, Exporte",
    productIntent:
      "Abrechnungslauf pro Mandant und Periode: abgeschlossene Fahrten, finalFare, Kostenträger, Steuern/CSV/PDF-Vorbereitung; Abgleich mit Zahlungs- und Code-Logik.",
  },
  {
    id: "taxi_fleet",
    label: "Flotte & Fahrer",
    description: "Fahrzeuge, Fahrer-Logins, Zuweisung (nur Mandant Taxi)",
    productIntent:
      "Taxi-Unternehmer: eigene PKW-Flotte, Fahrer mit Passwort/Session, P-Schein/TÜV-Felder, Compliance-Uploads; Multi-Tenancy strikt über company_id.",
  },
] as const;

export type PanelModuleId = (typeof PANEL_MODULE_DEFINITIONS)[number]["id"];

const ID_SET = new Set<string>(PANEL_MODULE_DEFINITIONS.map((d) => d.id));

export const ALL_PANEL_MODULE_IDS: PanelModuleId[] = PANEL_MODULE_DEFINITIONS.map((d) => d.id);

function asModuleIdSet(ids: readonly PanelModuleId[]): ReadonlySet<PanelModuleId> {
  return new Set(ids);
}

/** Ohne Taxi-Mandant nie `taxi_fleet` (Legacy-„alle“ für unbekannte / `general`-ähnliche Typen). */
const GENERAL_LIKE_KIND_MODULES: ReadonlySet<PanelModuleId> = asModuleIdSet(
  ALL_PANEL_MODULE_IDS.filter((id) => id !== "taxi_fleet"),
);

const PANEL_MODULES_BY_COMPANY_KIND: Record<string, ReadonlySet<PanelModuleId>> = {
  taxi: asModuleIdSet([
    "overview",
    "support",
    "help",
    "rides_list",
    "rides_create",
    "company_profile",
    "team",
    "access_codes",
    "billing",
    "taxi_fleet",
  ]),
  hotel: asModuleIdSet([
    "overview",
    "support",
    "help",
    "rides_list",
    "rides_create",
    "company_profile",
    "team",
    "access_codes",
    "hotel_mode",
    "billing",
  ]),
  insurer: asModuleIdSet([
    "overview",
    "support",
    "help",
    "rides_list",
    "rides_create",
    "company_profile",
    "team",
    "access_codes",
    "billing",
    "company_rides",
    "recurring_rides",
  ]),
  medical: asModuleIdSet([
    "overview",
    "support",
    "help",
    "rides_list",
    "rides_create",
    "company_profile",
    "team",
    "access_codes",
    "billing",
    "company_rides",
    "recurring_rides",
  ]),
  corporate: asModuleIdSet([
    "overview",
    "support",
    "help",
    "rides_list",
    "rides_create",
    "company_profile",
    "team",
    "access_codes",
    "billing",
    "company_rides",
    "recurring_rides",
  ]),
  voucher_client: asModuleIdSet([
    "overview",
    "support",
    "help",
    "rides_list",
    "rides_create",
    "company_profile",
    "team",
    "access_codes",
    "billing",
  ]),
  general: GENERAL_LIKE_KIND_MODULES,
};

/**
 * Erlaubte Panel-Modul-IDs für `admin_companies.company_kind` (Whitelist).
 * Abgleich Admin-UI: `artifacts/admin-panel/src/lib/panelModulesByCompanyKind.js`
 */
export function allowedPanelModuleIdsForCompanyKind(companyKind: string): ReadonlySet<PanelModuleId> {
  const k = (companyKind || "general").trim();
  return PANEL_MODULES_BY_COMPANY_KIND[k] ?? GENERAL_LIKE_KIND_MODULES;
}

/** Wie {@link resolveEffectivePanelModules} bei `stored === null`: Katalog-Reihenfolge, nur erlaubte IDs. */
export function getAllowedModulesForKind(companyKind: string | null | undefined): PanelModuleId[] {
  const allowed = allowedPanelModuleIdsForCompanyKind(companyKind ?? "general");
  return ALL_PANEL_MODULE_IDS.filter((id) => allowed.has(id));
}

/** Rohwert aus JSONB; ungültige Einträge werden verworfen. */
export function normalizeStoredPanelModules(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const id = x.trim();
    if (!id || seen.has(id)) continue;
    if (!ID_SET.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Katalog-Module, die bei **explizit** gespeicherter `panel_modules`-Liste nachgerüstet werden, sobald sie für
 * `companyKind` erlaubt sind. Hintergrund: ältere Mandanten hatten eine feste Checkbox-Liste ohne z. B. `support`;
 * ohne Nachrüstung erscheint ein neues Modul im Partner-Panel nicht, obwohl es fachlich vorgesehen ist.
 */
const PANEL_MODULE_IDS_AUTO_MERGE_WHEN_ALLOWED: readonly PanelModuleId[] = ["support", "help"];

/**
 * Effektiv aktive Module.
 * - `stored === null` (Legacy): alle für `companyKind` erlaubten Module (`getAllowedModulesForKind`).
 * - `stored` als Liste: gültige Katalog-IDs in Katalog-Reihenfolge, plus {@link PANEL_MODULE_IDS_AUTO_MERGE_WHEN_ALLOWED}
 *   wenn für den Mandantentyp erlaubt.
 *
 * @param companyKind `admin_companies.company_kind` — bei `stored == null` erforderlich für korrekte Whitelist;
 *   fehlt es, wird `"general"` angenommen.
 */
export function resolveEffectivePanelModules(
  stored: string[] | null | undefined,
  companyKind?: string | null,
): PanelModuleId[] {
  if (stored == null) {
    return getAllowedModulesForKind(companyKind);
  }
  const allowed = allowedPanelModuleIdsForCompanyKind(companyKind ?? "general");
  const set = new Set(stored);
  for (const id of PANEL_MODULE_IDS_AUTO_MERGE_WHEN_ALLOWED) {
    if (allowed.has(id)) set.add(id);
  }
  return ALL_PANEL_MODULE_IDS.filter((id) => set.has(id));
}

export function isPanelModuleId(v: string): v is PanelModuleId {
  return ID_SET.has(v);
}
