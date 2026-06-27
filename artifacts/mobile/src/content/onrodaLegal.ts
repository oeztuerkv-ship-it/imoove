export type OnrodaLegalDocId = "agb" | "datenschutz";

export type LegalInlinePart = { text: string; href?: string };

export type LegalBlock =
  | { kind: "text"; parts: LegalInlinePart[] }
  | { kind: "subtitle"; text: string }
  | { kind: "bullets"; items: string[] };

export type LegalSection = {
  title: string;
  blocks: LegalBlock[];
};

export type OnrodaLegalDocument = {
  screenTitle: string;
  headline: string;
  stand: string;
  sections: LegalSection[];
};

const t = (text: string): LegalInlinePart => ({ text });
const link = (text: string, href: string): LegalInlinePart => ({ text, href });
const p = (...parts: LegalInlinePart[]): LegalBlock => ({ kind: "text", parts });
const bullets = (items: string[]): LegalBlock => ({ kind: "bullets", items });
const subtitle = (text: string): LegalBlock => ({ kind: "subtitle", text });

export const ONRODA_AGB_DOCUMENT: OnrodaLegalDocument = {
  screenTitle: "AGB",
  headline: "Allgemeine Geschäftsbedingungen (AGB)",
  stand: "Juni 2026",
  sections: [
    {
      title: "§ 1 Geltungsbereich",
      blocks: [
        p(t("Diese Allgemeinen Geschäftsbedingungen gelten für die Nutzung der ONRODA-Plattform (Website und mobile App) des Anbieters Vedat Öztürk, Oberdorfstr. 53, 70771 Leinfelden-Echterdingen (nachfolgend „ONRODA“).")),
        p(t("Mit der Registrierung oder Nutzung der Plattform akzeptiert der Nutzer diese AGB.")),
      ],
    },
    {
      title: "§ 2 Leistungsbeschreibung",
      blocks: [
        p(t("ONRODA ist eine digitale Plattform zur Vermittlung von Taxi- und Krankenfahrten sowie Mobilitätsdienstleistungen. ONRODA vermittelt Fahrten zwischen Fahrgästen und Fahrern bzw. Taxiunternehmen. ONRODA ist selbst kein Beförderungsunternehmen.")),
        p(t("Die Beförderungsleistung wird durch den jeweiligen Fahrer bzw. das jeweilige Taxiunternehmen erbracht.")),
      ],
    },
    {
      title: "§ 3 Registrierung und Nutzerkonto",
      blocks: [
        p(t("Die Nutzung erfordert eine Registrierung mit korrekten Angaben. Der Nutzer ist für die Sicherheit seiner Zugangsdaten verantwortlich. Eine Weitergabe der Zugangsdaten an Dritte ist untersagt.")),
        p(t("ONRODA behält sich vor, Konten bei Verstößen gegen diese AGB zu sperren oder zu löschen.")),
      ],
    },
    {
      title: "§ 4 Buchung und Vertragsschluss",
      blocks: [
        p(t("Mit der Buchung einer Fahrt gibt der Fahrgast ein verbindliches Angebot ab. Der Vertrag kommt mit Annahme durch einen Fahrer zustande. ONRODA übermittelt die Auftragsbestätigung in der App.")),
        p(t("Bei Sofortfahrten gilt die Fahrtannahme durch den Fahrer als Vertragsschluss. Bei Reservierungen gilt die Buchungsbestätigung.")),
      ],
    },
    {
      title: "§ 5 Preise und Zahlung",
      blocks: [
        subtitle("5.1 Preismodelle"),
        p(t("ONRODA bietet zwei Preismodelle an:")),
        bullets([
          "Taxameter: Die angezeigten Preise sind Schätzpreise auf Basis des geltenden Taxitarifs. Der tatsächliche Fahrpreis wird vom Fahrer nach Fahrtende über das Taxameter bestätigt und ist für die Abrechnung maßgeblich.",
          "Festpreis: Für Fahrten, die nicht ausschließlich innerhalb des Pflichtfahrgebiets verlaufen, kann ein verbindlicher Festpreis vor Fahrtantritt vereinbart werden. Mit Bestätigung der Festpreis-Vereinbarung in der App ist der angezeigte Betrag endgültig und unabhängig von der tatsächlich gefahrenen Strecke oder Fahrzeit.",
        ]),
        subtitle("5.2 Zahlungsarten"),
        p(t("Die Zahlung kann erfolgen:")),
        bullets([
          "Bar direkt an den Fahrer",
          "Per Kreditkarte, Apple Pay oder Google Pay über den Zahlungsdienstleister Stripe; die Abbuchung erfolgt nach Fahrtende in Höhe des endgültigen Fahrpreises",
          "Per Gutschein oder Zugangscode eines Partnerunternehmens; die Abrechnung erfolgt in diesem Fall zwischen ONRODA bzw. dem ausführenden Taxiunternehmen und dem Partnerunternehmen gemäß Partnervertrag",
        ]),
        p(t("Bei Firmenfahrten über Zugangscodes erfolgt die Abrechnung gemäß Partnervertrag.")),
        subtitle("5.3 Trinkgeld"),
        p(t("Der Fahrgast kann freiwillig ein Trinkgeld geben. Das Trinkgeld geht vollständig und ohne Abzug an den ausführenden Fahrer.")),
      ],
    },
    {
      title: "§ 6 Krankenfahrten",
      blocks: [
        p(t("Bei Krankenfahrten mit Transportschein ist der Fahrgast für die Vorlage gültiger Verordnungsunterlagen verantwortlich. ONRODA übermittelt die erforderlichen Daten an den Fahrer und ggf. an die Krankenkasse zur Abrechnung.")),
        p(t("Die medizinische Notwendigkeit der Beförderung liegt in der Verantwortung des verordnenden Arztes.")),
      ],
    },
    {
      title: "§ 7 Pflichten der Nutzer",
      blocks: [
        p(t("Fahrgäste verpflichten sich:")),
        bullets([
          "Pünktlich am vereinbarten Abholort zu erscheinen",
          "Den vereinbarten Fahrpreis zu bezahlen",
          "Die Plattform nicht missbräuchlich zu nutzen",
          "Keine falschen Angaben zu machen",
        ]),
        p(t("Fahrer verpflichten sich:")),
        bullets([
          "Alle gesetzlichen Anforderungen (Konzession, P-Schein, Fahrzeugzulassung) zu erfüllen",
          "Angenommene Fahrten zuverlässig durchzuführen",
          "Den geltenden Taxitarif bzw. die vereinbarte Festpreis-Regelung einzuhalten",
          "Korrekte Fahrtdaten zu übermitteln",
        ]),
      ],
    },
    {
      title: "§ 8 Stornierung",
      blocks: [
        p(t("Fahrgäste können Fahrten bis zur Annahme durch einen Fahrer kostenfrei stornieren. Nach Fahrtannahme kann eine Stornogebühr anfallen, sofern der Fahrer bereits zum Abholort unterwegs ist.")),
        p(t("Reservierungen können bis zu 60 Minuten vor dem geplanten Abholzeitpunkt kostenfrei storniert werden. Eine Stornierung innerhalb dieser Frist ist nicht mehr möglich.")),
      ],
    },
    {
      title: "§ 9 Widerrufsrecht",
      blocks: [
        p(t("Verträge über die Beförderung von Personen, bei denen sich der Unternehmer verpflichtet, die Leistung zu einem bestimmten Zeitpunkt oder innerhalb eines bestimmten Zeitraums zu erbringen, sind gemäß § 312g Abs. 2 Nr. 9 BGB von der Widerrufsmöglichkeit ausgenommen. Ein Widerrufsrecht besteht daher für Fahrtbuchungen über ONRODA nicht.")),
      ],
    },
    {
      title: "§ 10 Haftung",
      blocks: [
        p(t("ONRODA haftet als Vermittler nicht für die Qualität der Beförderungsleistung. Die Haftung für die Beförderung liegt beim jeweiligen Fahrer bzw. Taxiunternehmen.")),
        p(t("ONRODA haftet nicht für Schäden, die durch höhere Gewalt, Netzausfälle oder technische Störungen entstehen. Die Haftung für grobe Fahrlässigkeit und Vorsatz bleibt unberührt.")),
      ],
    },
    {
      title: "§ 11 Datenschutz",
      blocks: [
        p(t("Die Verarbeitung personenbezogener Daten erfolgt gemäß unserer Datenschutzerklärung.")),
      ],
    },
    {
      title: "§ 12 Verbraucherstreitbeilegung",
      blocks: [
        p(t("Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.")),
      ],
    },
    {
      title: "§ 13 Änderungen der AGB",
      blocks: [
        p(t("ONRODA behält sich vor, diese AGB mit angemessener Vorankündigungsfrist zu ändern. Nutzer werden über wesentliche Änderungen per E-Mail oder App-Benachrichtigung informiert. Die weitere Nutzung nach Inkrafttreten gilt als Zustimmung.")),
      ],
    },
    {
      title: "§ 14 Anwendbares Recht und Gerichtsstand",
      blocks: [
        p(t("Es gilt deutsches Recht. Gerichtsstand für Streitigkeiten mit Unternehmern ist Stuttgart.")),
      ],
    },
    {
      title: "§ 15 Kontakt",
      blocks: [
        p(t("Bei Fragen zu diesen AGB: "), link("onroda@mail.de", "mailto:onroda@mail.de")),
      ],
    },
  ],
};

export const ONRODA_DATENSCHUTZ_DOCUMENT: OnrodaLegalDocument = {
  screenTitle: "Datenschutz",
  headline: "Datenschutzerklärung",
  stand: "Juni 2026",
  sections: [
    {
      title: "1. Verantwortlicher",
      blocks: [
        p(t("Vedat Öztürk\nOberdorfstr. 53\n70771 Leinfelden-Echterdingen\nDeutschland")),
        p(t("Telefon: "), link("+49 176 84229016", "tel:+4917684229016")),
        p(t("E-Mail: "), link("onroda@mail.de", "mailto:onroda@mail.de")),
      ],
    },
    {
      title: "2. Übersicht der verarbeiteten Daten",
      blocks: [
        subtitle("2.1 Fahrgäste (App-Nutzer)"),
        bullets([
          "Name, E-Mail-Adresse bei Registrierung",
          "Telefonnummer (optional, bei Buchungsregeln erforderlich)",
          "Live-Standort bei aktiver Fahrtsuche und Fahrt (Vordergrund)",
          "Abholadresse und Zieladresse",
          "Fahrtdaten (Datum, Uhrzeit, Strecke, Preis, Fahrtdauer, Preismodus: Taxameter oder Festpreis)",
          "Zahlungsart und Zahlungsdaten (Bar, Kreditkarte, Apple Pay, Google Pay, Gutschein/Zugangscode)",
          "Zahlungsabwicklungsdaten bei Kartenzahlung (siehe Ziffer 5, Stripe)",
          "Push-Token für Fahrtbenachrichtigungen",
          "Buchungshistorie",
          "Trinkgeld-Angaben (freiwillig, geht vollständig an den Fahrer)",
        ]),
        subtitle("2.2 Fahrer"),
        bullets([
          "Name, E-Mail-Adresse, Telefonnummer",
          "Fahrzeugdaten (Kennzeichen, Fahrzeugtyp, Konzessionsnummer)",
          "Führerschein, P-Schein, Konzessionsdaten (Upload zur Verifikation)",
          "Live-Standort während aktiver Fahrten (Vorder- und Hintergrund)",
          "Fahrtdaten, Umsatzdaten, Abrechnungsdaten (Fahrpreis, Provision, Auszahlungsbetrag)",
          "Push-Token für Fahrtangebote",
          "Verfügbarkeitsstatus (Online/Offline)",
        ]),
        subtitle("2.3 Partnerunternehmen"),
        bullets([
          "Unternehmensname, Adresse, Kontaktdaten",
          "Zugangsdaten zum Partner-Panel",
          "Fahrtdaten der vermittelten Fahrten",
          "Abrechnungs- und Rechnungsdaten",
          "Zugangscodes, Gutschein-Daten und Kostenstellen",
        ]),
        subtitle("2.4 Krankenfahrten"),
        p(t("Bei der Vermittlung von Krankenfahrten werden zusätzlich verarbeitet:")),
        bullets([
          "Transportschein-Daten (Verordnungsdaten, Beförderungsart)",
          "Medizinisch erforderliche Beförderungsangaben",
          "Abrechnungsdaten gegenüber Krankenkassen",
          "Dokument-Uploads (Transportschein, Unterschrift)",
          "Automatisierte Texterkennung des Transportscheins durch einen KI-gestützten Dienst (siehe Ziffer 5, Anthropic)",
        ]),
        p(t("Rechtsgrundlage: Art. 9 Abs. 2 lit. h DSGVO (medizinische Versorgung) sowie Art. 6 Abs. 1 lit. b DSGVO.")),
        p(t("Hinweis zur Datenminimierung: ONRODA speichert keine Diagnosedaten. Nur die für die Beförderung und Abrechnung notwendigen Angaben werden verarbeitet.")),
      ],
    },
    {
      title: "3. Standortdaten",
      blocks: [
        p(t("ONRODA verarbeitet Standortdaten zur Vermittlung von Fahrten:")),
        bullets([
          "Fahrgast — Vordergrund (bei Buchung): Abholadresse bestimmen — Speicherdauer: Fahrtende",
          "Fahrer — Vordergrund + Hintergrund (aktive Fahrt): Live-Tracking, Fahrtnachweis, Streckenermittlung — Speicherdauer: 90 Tage nach Fahrt",
        ]),
        p(t("Die Hintergrund-Ortung des Fahrers ist nur während aktiver Fahrten aktiv und wird nach Fahrtende beendet. Die während der Fahrt erfassten Standortpunkte werden zur Ermittlung der tatsächlich gefahrenen Strecke (z. B. bei Reklamationen) genutzt und nach 90 Tagen automatisiert gelöscht. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.")),
      ],
    },
    {
      title: "4. Push-Benachrichtigungen",
      blocks: [
        p(t("Für Push-Benachrichtigungen verwenden wir Expo Push Notifications (Expo Inc., San Francisco, USA). Dabei werden Geräte-Push-Token gespeichert:")),
        bullets([
          "Fahrgäste: Token für Fahrtstatusbenachrichtigungen (Fahrer gefunden, Fahrer da)",
          "Fahrer: Token für Fahrtangebote und Marktbenachrichtigungen",
        ]),
        p(t("Push-Token werden getrennt gespeichert und beim Wechsel zwischen Fahrer- und Fahrgast-Rolle automatisch aktualisiert. Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO (Einwilligung).")),
      ],
    },
    {
      title: "5. Datenweitergabe und eingesetzte Dienstleister",
      blocks: [
        bullets([
          "Fahrer: erhalten Abholadresse, Zieladresse und Fahrgastname bei Fahrtannahme",
          "Partnerunternehmen: erhalten Fahrtdaten ihrer gebuchten Fahrten",
          "Krankenkassen: erhalten abrechnungsrelevante Transportdaten",
          "Hetzner Online GmbH (Deutschland): Hosting-Dienstleister (Auftragsverarbeitung gemäß Art. 28 DSGVO)",
          "Expo Inc. (USA): Push-Benachrichtigungsdienst",
          "Stripe Payments Europe, Ltd. (Irland) bzw. Stripe, Inc. (USA): Zahlungsabwicklung bei Kreditkarten-, Apple-Pay- und Google-Pay-Zahlungen",
          "Anthropic, PBC (USA): automatisierte Texterkennung (OCR) von hochgeladenen Transportscheinen",
          "Google Ireland Limited / Google LLC: Geocoding und Streckenberechnung sowie Kartendarstellung in der App",
        ]),
        p(t("Eine Weitergabe an sonstige Dritte erfolgt nicht, sofern keine gesetzliche Verpflichtung besteht. Mit allen genannten Dienstleistern bestehen, soweit erforderlich, Verträge zur Auftragsverarbeitung gemäß Art. 28 DSGVO bzw. Standardvertragsklauseln bei Datenübermittlung in Drittländer (USA).")),
      ],
    },
    {
      title: "6. Datensicherheit",
      blocks: [
        bullets([
          "Alle Datenübertragungen erfolgen verschlüsselt via HTTPS/TLS",
          "Passwörter werden mit sicheren Hash-Algorithmen gespeichert",
          "Zugriff auf Daten ist rollenbasiert eingeschränkt (Admin, Fahrer, Partner, Krankenkasse)",
          "Server-Zugriff ist durch Firewall und Zwei-Faktor-Authentifizierung gesichert",
          "Sicherheitslogs werden zur Erkennung von Angriffen und Missbrauch geführt",
          "Regelmäßige Datensicherungen auf geografisch getrennten Systemen",
        ]),
      ],
    },
    {
      title: "7. Speicherdauer",
      blocks: [
        bullets([
          "Rechnungs- und Abrechnungsdaten: 10 Jahre (gesetzliche Aufbewahrungspflicht)",
          "Vertragsdaten: Vertragslaufzeit + 3 Jahre",
          "Fahrtdaten: 3 Jahre nach Fahrtdurchführung",
          "Standortdaten (Fahrer, Tracking während der Fahrt): 90 Tage nach Fahrtende",
          "Sicherheitslogs / API-Logs: 90 Tage",
          "Push-Token: Bis zur Abmeldung oder Token-Erneuerung",
          "Dokument-Uploads (Krankenfahrt): Gesetzliche Aufbewahrungspflicht",
          "Gutschein- und Zahlungsdaten: 10 Jahre (gesetzliche Aufbewahrungspflicht)",
        ]),
      ],
    },
    {
      title: "8. Cookies und lokale Speicherung",
      blocks: [
        p(t("Unsere Website und App verwenden:")),
        bullets([
          "Technisch notwendige Session-Tokens (JWT) zur Authentifizierung",
          "Lokale Speicherung (AsyncStorage) in der App für Sitzungsdaten",
          "Keine Tracking-, Analyse- oder Werbe-Cookies",
        ]),
      ],
    },
    {
      title: "9. Ihre Rechte",
      blocks: [
        bullets([
          "Auskunft über gespeicherte Daten (Art. 15 DSGVO)",
          "Berichtigung unrichtiger Daten (Art. 16 DSGVO)",
          "Löschung Ihrer Daten (Art. 17 DSGVO)",
          "Einschränkung der Verarbeitung (Art. 18 DSGVO)",
          "Datenübertragbarkeit (Art. 20 DSGVO)",
          "Widerspruch gegen die Verarbeitung (Art. 21 DSGVO)",
          "Widerruf einer Einwilligung (Art. 7 Abs. 3 DSGVO)",
        ]),
        p(t("Zur Ausübung Ihrer Rechte oder zur Kontolöschung wenden Sie sich an: "), link("onroda@mail.de", "mailto:onroda@mail.de")),
      ],
    },
    {
      title: "10. Beschwerderecht",
      blocks: [
        p(t("Sie haben das Recht, sich bei der zuständigen Aufsichtsbehörde zu beschweren:")),
        p(
          t("Landesbeauftragter für den Datenschutz und die Informationsfreiheit Baden-Württemberg\n"),
          link("www.baden-wuerttemberg.datenschutz.de", "https://www.baden-wuerttemberg.datenschutz.de"),
        ),
      ],
    },
    {
      title: "11. Änderungen",
      blocks: [
        p(t("Wir behalten uns vor, diese Datenschutzerklärung bei Änderungen der Plattform oder der Rechtslage anzupassen. Die aktuelle Version ist stets unter onroda.de/datenschutz abrufbar.")),
      ],
    },
  ],
};

export const ONRODA_LEGAL_BY_ID: Record<OnrodaLegalDocId, OnrodaLegalDocument> = {
  agb: ONRODA_AGB_DOCUMENT,
  datenschutz: ONRODA_DATENSCHUTZ_DOCUMENT,
};

export function isOnrodaLegalDocId(value: string | undefined): value is OnrodaLegalDocId {
  return value === "agb" || value === "datenschutz";
}
