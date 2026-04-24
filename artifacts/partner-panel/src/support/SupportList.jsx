const STATUS_DE = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  answered: "Beantwortet",
  closed: "Geschlossen",
};

const CATEGORY_DE = {
  stammdaten: "Stammdaten",
  documents: "Dokumente",
  billing: "Abrechnung",
  technical: "Technisch",
  help: "Hilfe",
  other: "Sonstiges",
};

function formatWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

export default function SupportList({ threads, selectedId, onSelect, loading }) {
  if (loading && (!threads || threads.length === 0)) {
    return (
      <div className="partner-support-list-placeholder">
        <p className="partner-support-list-placeholder__text">Lade Ihre Anfragen …</p>
      </div>
    );
  }
  if (!threads?.length) {
    return null;
  }
  return (
    <ul className="partner-support-list" aria-label="Ihre Anfragen">
      {threads.map((t) => {
        const active = t.id === selectedId;
        return (
          <li key={t.id}>
            <button
              type="button"
              className={`partner-support-list__item${active ? " partner-support-list__item--active" : ""}`}
              onClick={() => onSelect(t.id)}
            >
              <span className="partner-support-list__title">{t.title}</span>
              <span className="partner-support-list__meta">
                <span className="partner-pill partner-pill--neutral">{STATUS_DE[t.status] || t.status}</span>
                <span className="partner-support-list__cat">{CATEGORY_DE[t.category] || t.category}</span>
                <span className="partner-support-list__time">{formatWhen(t.lastMessageAt)}</span>
              </span>
              {t.lastSnippet ? <span className="partner-support-list__snippet">{t.lastSnippet}</span> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
