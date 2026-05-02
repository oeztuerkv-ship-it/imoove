import { deriveMedicalOperationsStats } from "./dashboardHelpers.js";

/** @param {{ rides: Record<string, unknown>[]; ridesLoaded: boolean; series: Record<string, unknown>[]; seriesLoaded: boolean; seriesError: string | null; onNavigateModule: (k: string) => void }} props */
export default function DashboardMedicalSection({ rides, ridesLoaded, series, seriesLoaded, seriesError, onNavigateModule }) {
  const stats = ridesLoaded ? deriveMedicalOperationsStats(rides) : null;
  const activeSeries = seriesLoaded ? series.filter((s) => String(s.status ?? "").toLowerCase() === "active").length : null;

  const empty =
    !seriesError &&
    ridesLoaded &&
    seriesLoaded &&
    (stats?.medicalTotal ?? 0) === 0 &&
    (activeSeries ?? 0) === 0 &&
    stats?.muster4Open === 0 &&
    stats?.waitingBilling === 0 &&
    stats?.invoicesInReview === 0;

  return (
    <div className="partner-card partner-card--section">
      <h2 className="partner-card__title" style={{ marginTop: 0 }}>
        Krankenfahrten
      </h2>
      <p className="partner-muted" style={{ margin: "0 0 16px", maxWidth: 760, lineHeight: 1.55 }}>
        Operative Übersicht aus vorhandenen Fahrt- und Serien-Daten.{" "}
        <strong>Muster&nbsp;4</strong> und Kassenprozesse sind hier nur strukturell vorbereitet — keine neue Abrechnungs-Engine.
      </p>

      {seriesError ? (
        <p className="partner-state-error" style={{ margin: "0 0 12px" }}>
          Serien: {seriesError}
        </p>
      ) : null}

      {!ridesLoaded || !seriesLoaded ? (
        <p className="partner-muted">Laden …</p>
      ) : empty ? (
        <div className="partner-empty-hint" style={{ margin: 0 }}>
          <strong>Keine Krankenfahrten oder Serien in den aktuellen Daten.</strong> Sobald Fahrten erfasst sind, erscheinen Kennzahlen hier automatisch.
        </div>
      ) : (
        <div className="partner-dashboard-medical-grid">
          <div className="partner-dashboard-medical-stat">
            <span className="partner-dashboard-medical-stat__k">Offene Muster‑4 / Nachweise</span>
            <span className="partner-dashboard-medical-stat__v">{stats ? String(stats.muster4Open) : "—"}</span>
            <span className="partner-dashboard-medical-stat__h">Fahrten ohne bestätigte Unterschrift (vereinfacht)</span>
          </div>
          <div className="partner-dashboard-medical-stat">
            <span className="partner-dashboard-medical-stat__k">Wartende Abrechnung</span>
            <span className="partner-dashboard-medical-stat__v">{stats ? String(stats.waitingBilling) : "—"}</span>
            <span className="partner-dashboard-medical-stat__h">Noch nicht „billing-ready“</span>
          </div>
          <div className="partner-dashboard-medical-stat">
            <span className="partner-dashboard-medical-stat__k">Rechnungen in Prüfung</span>
            <span className="partner-dashboard-medical-stat__v">{stats ? String(stats.invoicesInReview) : "—"}</span>
            <span className="partner-dashboard-medical-stat__h">Status erstellt / versendet</span>
          </div>
          <div className="partner-dashboard-medical-stat">
            <span className="partner-dashboard-medical-stat__k">Serienfahrten aktiv</span>
            <span className="partner-dashboard-medical-stat__v">{activeSeries == null ? "—" : String(activeSeries)}</span>
            <span className="partner-dashboard-medical-stat__h">Aus Partner-Serienliste</span>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 12 }}>
        <button type="button" className="partner-btn-secondary partner-btn-secondary--sm" onClick={() => onNavigateModule("medical_ride")}>
          Krankenfahrt erfassen
        </button>
        <button type="button" className="partner-btn-secondary partner-btn-secondary--sm" onClick={() => onNavigateModule("finanzen")}>
          Zu Finanzen
        </button>
      </div>
    </div>
  );
}
