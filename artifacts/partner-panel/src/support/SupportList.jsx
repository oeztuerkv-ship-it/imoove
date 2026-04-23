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
  other: "Sonstiges",
};

function formatWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

export default function SupportList({ threads, selectedId, onSelect, loading }) {
  if (loading && (!threads || threads.length === 0)) {
    return <p className="partner-muted">Lade Anfragen…</p>;
  }
  if (!threads?.length) {
    return <p className="partner-muted">Noch keine Anfragen. Erstellen Sie über „Neue Anfrage“ einen Thread.</p>;
  }
  return (
    <ul className="partner-support-list">
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
