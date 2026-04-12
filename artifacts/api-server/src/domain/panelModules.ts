/**
 * Partner-Panel: sichtbare Menüpunkte/Kacheln pro Mandant (`admin_companies.panel_modules`).
 * `null` in der DB = alle Module (Abwärtskompatibilität).
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
] as const;

export type PanelModuleId = (typeof PANEL_MODULE_DEFINITIONS)[number]["id"];

const ID_SET = new Set<string>(PANEL_MODULE_DEFINITIONS.map((d) => d.id));

export const ALL_PANEL_MODULE_IDS: PanelModuleId[] = PANEL_MODULE_DEFINITIONS.map((d) => d.id);

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
 * Effektiv aktive Module: `null` = alle (Legacy). Leeres Array = nichts freigeschaltet (nur für Tests).
 */
export function resolveEffectivePanelModules(stored: string[] | null | undefined): PanelModuleId[] {
  if (stored == null) return [...ALL_PANEL_MODULE_IDS];
  const set = new Set(stored);
  return ALL_PANEL_MODULE_IDS.filter((id) => set.has(id));
}

export function isPanelModuleId(v: string): v is PanelModuleId {
  return ID_SET.has(v);
}
