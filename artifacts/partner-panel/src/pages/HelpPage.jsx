const FAQ_SECTIONS = [
  {
    title: "Wie lege ich ein Fahrzeug an?",
    body:
      'Gehe zu "Flotte → Fahrzeug hinzufügen". Trage Kennzeichen und Konzessionsnummer ein, lade das Fahrzeug-Dokument als PDF hoch und klicke danach auf "Zur Freigabe einreichen". Das Fahrzeug wird von Onroda geprüft und anschließend freigegeben.',
  },
  {
    title: "Wie lege ich einen Fahrer an?",
    body:
      "Gehe zu Flotte → Fahrer hinzufügen. Trage alle Pflichtdaten ein (Name, E-Mail, Telefonnummer, P-Schein gültig bis), lade den P-Schein als PDF hoch und reiche den Fahrer zur Prüfung ein. Erst nach Freigabe kann der Fahrer Fahrten annehmen.",
  },
  {
    title: "Warum kann ich kein Fahrzeug oder Fahrer aktivieren?",
    body:
      'Aus Sicherheits- und Qualitätsgründen werden Fahrzeuge und Fahrer erst nach Prüfung durch Onroda freigegeben. Solange der Status "wartet auf Freigabe" ist, sind diese nicht aktiv.',
  },
  {
    title: "Was passiert nach dem Hochladen eines Dokuments?",
    body:
      "Dein Dokument wird geprüft. Status: In Prüfung = wird aktuell überprüft, Freigegeben = alles ok, Abgelehnt = bitte korrigieren und erneut hochladen.",
  },
  {
    title: "Warum wurde mein Dokument abgelehnt?",
    body:
      "Mögliche Gründe: Dokument unleserlich, falsches Dokument, abgelaufen, Daten stimmen nicht überein. Der genaue Grund wird dir im Status angezeigt.",
  },
  {
    title: "Wie bekomme ich Aufträge?",
    body:
      "Sobald dein Unternehmen aktiv ist und Fahrer online sind, werden Fahrten automatisch zugewiesen.",
  },
  {
    title: "Warum sehe ich keine Fahrten?",
    body:
      "Mögliche Ursachen: keine aktiven Fahrer, kein freigegebenes Fahrzeug, Unternehmen noch nicht vollständig freigegeben.",
  },
  {
    title: "Wo sehe ich meine Umsätze?",
    body: 'Im Dashboard unter "Betrieb & Umsatz".',
  },
  {
    title: "Kann ich meine Fahrten exportieren?",
    body: "Ja, über den CSV-Export im Dashboard.",
  },
];

export default function HelpPage({ onCreateRequest }) {
  return (
    <div className="partner-stack partner-stack--tight">
      <section className="partner-card partner-card--section">
        <label className="partner-form-field" htmlFor="help-search">
          <span>FAQ durchsuchen (bald verfuegbar)</span>
          <input
            id="help-search"
            className="partner-input"
            type="search"
            placeholder="Stichwort eingeben …"
            aria-label="FAQ durchsuchen (noch ohne Funktion)"
            disabled
          />
        </label>
      </section>

      <div className="partner-page-hero">
        <p className="partner-page-eyebrow">Hilfe</p>
        <h1 className="partner-page-title">Hilfe & FAQ</h1>
        <p className="partner-page-lead">
          Schnell Antworten finden und bei Bedarf direkt eine Anfrage an unser Team senden.
        </p>
      </div>

      <section className="partner-card partner-card--section">
        <h2 className="partner-section-h" style={{ margin: "0 0 10px" }}>
          Schnellhilfe
        </h2>
        <p className="partner-muted" style={{ margin: 0 }}>
          Für Rückfragen erreichst du uns auch per E-Mail unter{" "}
          <a href="mailto:onroda@mail.de">onroda@mail.de</a>.
        </p>
      </section>

      <section className="partner-card partner-card--section">
        <h2 className="partner-section-h" style={{ margin: "0 0 12px" }}>
          FAQ
        </h2>
        <div className="partner-help-faq">
          {FAQ_SECTIONS.map((f) => (
            <details key={f.title} className="partner-help-faq__item">
              <summary className="partner-help-faq__question">{f.title}</summary>
              <p className="partner-help-faq__answer">{f.body}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="partner-card partner-card--section">
        <h2 className="partner-section-h" style={{ margin: "0 0 10px" }}>
          Problem oder Frage?
        </h2>
        <p className="partner-muted" style={{ margin: "0 0 14px" }}>
          Klicke auf „Anfrage erstellen“ und beschreibe kurz dein Anliegen. Unser Team kuemmert sich
          schnellstmoeglich darum.
        </p>
        <button type="button" className="partner-btn-primary" onClick={() => onCreateRequest?.()}>
          Anfrage erstellen
        </button>
      </section>
    </div>
  );
}
