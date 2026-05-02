/** @param {{ onNavigateModule?: (k: string) => void }} props */
export default function DashboardActivitySection({ onNavigateModule }) {
  const rows = [
    { k: "driver", label: "Letzter Fahrer angelegt", state: "Demnächst" },
    { k: "vehicle", label: "Fahrzeug aktualisiert", state: "Demnächst" },
    { k: "doc", label: "Dokument hochgeladen", state: "Demnächst" },
    { k: "invoice", label: "Rechnung erstellt", state: "Demnächst" },
  ];

  return (
    <div className="partner-card partner-card--section partner-card--hint">
      <h2 className="partner-card__title" style={{ marginTop: 0 }}>
        Aktivität
      </h2>
      <p className="partner-muted" style={{ margin: "0 0 14px", maxWidth: 720, lineHeight: 1.5 }}>
        Zeitlicher Verlauf für Ihr Team — vorbereitet ohne neue Event-API. Aktuell keine Live-Feed-Daten.
      </p>
      <ul className="partner-dashboard-activity-placeholder">
        {rows.map((r) => (
          <li key={r.k}>
            <span className="partner-dashboard-activity-placeholder__lbl">{r.label}</span>
            <span className="partner-dashboard-activity-placeholder__pill">{r.state}</span>
          </li>
        ))}
      </ul>
      {typeof onNavigateModule === "function" ? (
        <button type="button" className="partner-link-btn" style={{ marginTop: 12 }} onClick={() => onNavigateModule("anfragen")}>
          Änderungen über Support dokumentieren
        </button>
      ) : null}
    </div>
  );
}
