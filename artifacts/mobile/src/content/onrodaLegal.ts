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
  headline: "ONRODA – Allgemeine Geschäftsbedingungen (AGB)",
  stand: "Mai 2026",
  sections: [
    {
      title: "1. Anbieter",
      blocks: [
        p(t("Anbieter der Plattform ONRODA ist:")),
        p(t("Vedat Öztürk\nEinzelunternehmen")),
        p(t("E-Mail: "), link("onroda@mail.de", "mailto:onroda@mail.de")),
        p(t("Webseite: "), link("https://onroda.de", "https://onroda.de")),
        p(t("ONRODA betreibt eine digitale Vermittlungsplattform für Mobilitäts- und Transportdienstleistungen.")),
      ],
    },
    {
      title: "2. Geltungsbereich",
      blocks: [
        p(t("Diese Allgemeinen Geschäftsbedingungen gelten für alle Nutzerinnen und Nutzer der ONRODA-App sowie der zugehörigen Plattformen und Dienste.")),
        p(t("Mit Nutzung der Plattform akzeptieren Nutzer diese AGB.")),
      ],
    },
    {
      title: "3. Leistungen von ONRODA",
      blocks: [
        p(t("ONRODA vermittelt Fahrten zwischen Fahrgästen und angeschlossenen Beförderungsunternehmen bzw. Fahrern.")),
        p(t("ONRODA ist grundsätzlich selbst kein Beförderungsunternehmen, sofern nicht ausdrücklich anders angegeben.")),
        p(t("Die Leistungen umfassen insbesondere:")),
        bullets([
          "Vermittlung von Sofortfahrten",
          "Vermittlung von Vorbestellungen",
          "Krankenfahrten",
          "Rollstuhl- und Spezialfahrten",
          "digitale Fahrtenverwaltung",
          "digitale Kommunikation zwischen Fahrer und Fahrgast",
          "optionale digitale Dokumenten- und Abrechnungsprozesse",
        ]),
      ],
    },
    {
      title: "4. Registrierung und Nutzerkonto",
      blocks: [
        p(t("Für bestimmte Funktionen ist ein Nutzerkonto erforderlich.")),
        p(t("Bei der Registrierung müssen wahrheitsgemäße Angaben gemacht werden.")),
        p(t("Die Registrierung erfolgt über:")),
        bullets([
          "Telefonnummer",
          "einmalige Verifizierung",
          "Passwortvergabe",
        ]),
        p(t("Nutzer sind verpflichtet, ihre Zugangsdaten sicher aufzubewahren.")),
        p(t("Eine Weitergabe des Kontos an Dritte ist unzulässig.")),
      ],
    },
    {
      title: "5. Buchung von Fahrten",
      blocks: [
        p(t("Eine Fahrt gilt erst als angefragt bzw. vermittelt, wenn diese in der Plattform bestätigt wurde.")),
        p(t("ONRODA übernimmt keine Garantie dafür, dass jederzeit ein Fahrer verfügbar ist.")),
        p(t("Vorbestellungen sind nur mit ausreichendem zeitlichem Vorlauf möglich.")),
        p(t("Die jeweils angezeigten Preise basieren auf den aktuell gültigen Tarifen innerhalb der Plattform.")),
      ],
    },
    {
      title: "6. Preise und Zahlungsabwicklung",
      blocks: [
        p(t("Die Preisberechnung erfolgt anhand:")),
        bullets([
          "Entfernung",
          "Zeit",
          "Fahrzeugart",
          "regionalen Tarifen",
          "Zuschlägen",
          "eventuellen Sonderleistungen",
        ]),
        p(t("Der endgültige Preis kann in bestimmten Fällen von Schätzpreisen abweichen, insbesondere bei:")),
        bullets([
          "Verkehrsänderungen",
          "Wartezeiten",
          "Streckenänderungen",
          "Zusatzstopps",
        ]),
        p(t("Zahlungen können je nach Region und Verfügbarkeit bar oder digital erfolgen.")),
      ],
    },
    {
      title: "7. Krankenfahrten",
      blocks: [
        p(t("Bei Krankenfahrten können zusätzliche Angaben erforderlich sein.")),
        p(t("Dazu gehören insbesondere:")),
        bullets([
          "Genehmigungsdaten",
          "Transportscheinangaben",
          "Kostenträgerinformationen",
          "transportrelevante Mobilitätsangaben",
        ]),
        p(t("Gesundheitsdaten werden ausschließlich verarbeitet, soweit dies für die Durchführung oder Abrechnung der Fahrt erforderlich ist.")),
      ],
    },
    {
      title: "8. Pflichten der Nutzer",
      blocks: [
        p(t("Nutzer verpflichten sich insbesondere:")),
        bullets([
          "keine falschen Buchungen vorzunehmen",
          "keine rechtswidrigen Inhalte hochzuladen",
          "Fahrer oder andere Nutzer nicht zu beleidigen oder zu gefährden",
          "keine Manipulationen am System vorzunehmen",
        ]),
        p(t("ONRODA kann Konten bei Missbrauch sperren.")),
      ],
    },
    {
      title: "9. Haftung",
      blocks: [
        p(t("ONRODA haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit.")),
        p(t("Bei leichter Fahrlässigkeit haftet ONRODA nur bei Verletzung wesentlicher Vertragspflichten.")),
        p(t("ONRODA haftet nicht für:")),
        bullets([
          "Ausfälle mobiler Netzwerke",
          "GPS-Fehler",
          "Verzögerungen durch Verkehr oder höhere Gewalt",
          "Handlungen selbstständiger Beförderungsunternehmen",
        ]),
        p(t("Gesetzliche Haftungsvorschriften bleiben unberührt.")),
      ],
    },
    {
      title: "10. Verfügbarkeit",
      blocks: [
        p(t("ONRODA bemüht sich um eine möglichst hohe Verfügbarkeit der Plattform.")),
        p(t("Ein Anspruch auf permanente Verfügbarkeit besteht jedoch nicht.")),
        p(t("Wartungen, technische Störungen oder Sicherheitsmaßnahmen können zeitweise Einschränkungen verursachen.")),
      ],
    },
    {
      title: "11. Datenschutz",
      blocks: [
        p(t("Die Verarbeitung personenbezogener Daten erfolgt gemäß der Datenschutzerklärung von ONRODA.")),
      ],
    },
    {
      title: "12. Kündigung und Sperrung",
      blocks: [
        p(t("Nutzer können ihr Konto jederzeit löschen lassen.")),
        p(t("ONRODA kann Konten sperren oder kündigen, wenn:")),
        bullets([
          "gegen diese AGB verstoßen wird",
          "Missbrauch vorliegt",
          "gesetzliche Anforderungen dies erfordern",
        ]),
      ],
    },
    {
      title: "13. Änderungen der AGB",
      blocks: [
        p(t("ONRODA behält sich vor, diese AGB bei Bedarf anzupassen.")),
        p(t("Über wesentliche Änderungen werden Nutzer informiert.")),
      ],
    },
    {
      title: "14. Schlussbestimmungen",
      blocks: [
        p(t("Es gilt deutsches Recht.")),
        p(t("Sollten einzelne Bestimmungen unwirksam sein oder werden, bleibt die Wirksamkeit der übrigen Regelungen unberührt.")),
      ],
    },
  ],
};

export const ONRODA_DATENSCHUTZ_DOCUMENT: OnrodaLegalDocument = {
  screenTitle: "Datenschutz",
  headline: "Datenschutzerklärung – ONRODA",
  stand: "Mai 2026",
  sections: [
    {
      title: "1. Verantwortlicher",
      blocks: [
        p(t("Verantwortlich im Sinne der DSGVO:")),
        p(t("Vedat Öztürk\nEinzelunternehmen")),
        p(t("E-Mail: "), link("onroda@mail.de", "mailto:onroda@mail.de")),
        p(t("Webseite: "), link("https://onroda.de", "https://onroda.de")),
      ],
    },
    {
      title: "2. Welche Daten verarbeitet werden",
      blocks: [
        subtitle("Kontodaten"),
        bullets([
          "Telefonnummer",
          "Name",
          "E-Mail-Adresse",
          "Passwort (verschlüsselt gespeichert)",
        ]),
        subtitle("Fahrtdaten"),
        bullets([
          "Start- und Zielort",
          "Fahrzeit",
          "Fahrzeugart",
          "Fahrpreis",
          "Fahrerzuordnung",
        ]),
        subtitle("Standortdaten"),
        p(t("Während aktiver Fahrten können GPS-Daten verarbeitet werden, um:")),
        bullets([
          "Fahrten zu vermitteln",
          "Fahrer zu navigieren",
          "den Fahrtstatus anzuzeigen",
          "Sicherheits- und Supportfunktionen bereitzustellen",
        ]),
        subtitle("Technische Daten"),
        bullets([
          "Geräteinformationen",
          "Push-Token",
          "Betriebssystem",
          "Session-Informationen",
          "Logdaten",
        ]),
        subtitle("Krankenfahrten"),
        p(t("Bei Krankenfahrten können zusätzlich verarbeitet werden:")),
        bullets([
          "Genehmigungsdaten",
          "Kostenträgerdaten",
          "Transportscheinangaben",
          "transportrelevante Angaben zur Durchführung der Fahrt",
        ]),
        p(t("Es werden nur diejenigen Daten verarbeitet, die für Durchführung oder Abrechnung erforderlich sind.")),
      ],
    },
    {
      title: "3. Zwecke der Verarbeitung",
      blocks: [
        p(t("Die Datenverarbeitung erfolgt insbesondere für:")),
        bullets([
          "Registrierung und Login",
          "Vermittlung von Fahrten",
          "Kommunikation zwischen Fahrgast und Fahrer",
          "Abrechnung",
          "Betrugsprävention",
          "Sicherheitsmaßnahmen",
          "Supportanfragen",
          "gesetzliche Verpflichtungen",
        ]),
      ],
    },
    {
      title: "4. Rechtsgrundlagen",
      blocks: [
        p(t("Die Verarbeitung erfolgt auf Grundlage von:")),
        bullets([
          "Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung)",
          "Art. 6 Abs. 1 lit. c DSGVO (gesetzliche Pflichten)",
          "Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse)",
          "Art. 9 Abs. 2 lit. h DSGVO bei erforderlichen Gesundheitsdaten im Rahmen von Krankenfahrten",
        ]),
      ],
    },
    {
      title: "5. Weitergabe an Dritte",
      blocks: [
        p(t("Daten werden nur weitergegeben, soweit dies erforderlich ist.")),
        p(t("Mögliche Empfänger:")),
        bullets([
          "Beförderungsunternehmen und Fahrer",
          "Krankenkassen bei Krankenfahrten",
          "technische Dienstleister",
          "Hosting-Anbieter",
          "Push-Dienste",
          "Zahlungsdienstleister",
          "Behörden bei gesetzlicher Verpflichtung",
        ]),
        p(t("Eine Weitergabe zu Werbezwecken erfolgt nicht.")),
      ],
    },
    {
      title: "6. Hosting und technische Dienstleister",
      blocks: [
        p(t("Zur Bereitstellung der Plattform nutzt ONRODA technische Dienstleister und Hostinganbieter.")),
        p(t("Dabei können personenbezogene Daten im technisch erforderlichen Umfang verarbeitet werden.")),
      ],
    },
    {
      title: "7. Push-Benachrichtigungen",
      blocks: [
        p(t("Für Benachrichtigungen können Push-Dienste verwendet werden.")),
        p(t("Dabei werden Push-Tokens verarbeitet.")),
        p(t("Push-Benachrichtigungen können in den Geräteeinstellungen deaktiviert werden.")),
      ],
    },
    {
      title: "8. Speicherdauer",
      blocks: [
        p(t("Daten werden nur so lange gespeichert, wie dies erforderlich oder gesetzlich vorgeschrieben ist.")),
        p(t("Insbesondere gelten steuer- und handelsrechtliche Aufbewahrungsfristen.")),
      ],
    },
    {
      title: "9. Datensicherheit",
      blocks: [
        p(t("ONRODA nutzt technische und organisatorische Sicherheitsmaßnahmen.")),
        p(t("Dazu gehören insbesondere:")),
        bullets([
          "TLS/HTTPS-Verschlüsselung",
          "Zugriffsbeschränkungen",
          "Passwort-Hashing",
          "rollenbasierte Zugriffe",
          "Sicherheitsprotokollierung",
        ]),
      ],
    },
    {
      title: "10. Rechte der Nutzer",
      blocks: [
        p(t("Nutzer haben insbesondere folgende Rechte:")),
        bullets([
          "Auskunft",
          "Berichtigung",
          "Löschung",
          "Einschränkung der Verarbeitung",
          "Datenübertragbarkeit",
          "Widerspruch",
          "Beschwerde bei einer Datenschutzaufsichtsbehörde",
        ]),
        p(t("Zuständige Aufsichtsbehörde in Baden-Württemberg:")),
        p(
          t("Landesbeauftragter für den Datenschutz und die Informationsfreiheit Baden-Württemberg\n"),
          link("https://www.baden-wuerttemberg.datenschutz.de", "https://www.baden-wuerttemberg.datenschutz.de"),
        ),
      ],
    },
    {
      title: "11. Minderjährige",
      blocks: [
        p(t("Die Plattform richtet sich grundsätzlich an volljährige Nutzer.")),
      ],
    },
    {
      title: "12. Änderungen der Datenschutzerklärung",
      blocks: [
        p(t("ONRODA kann diese Datenschutzerklärung bei Bedarf aktualisieren.")),
        p(t("Die jeweils aktuelle Version wird über die Plattform bereitgestellt.")),
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
