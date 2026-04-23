import { useEffect, useState } from "react";
import TaxiMasterPanel from "../components/TaxiMasterPanel.jsx";
import FleetPage from "../pages/FleetPage.jsx";
import TaxiStammdatenPage from "../pages/taxi/TaxiStammdatenPage.jsx";
import TaxiDocumentsPage from "../pages/taxi/TaxiDocumentsPage.jsx";

const MODULES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "stammdaten", label: "Stammdaten" },
  { key: "flotte", label: "Flotte" },
  { key: "dokumente", label: "Dokumente" },
];

const MODULE_KEYS = new Set(MODULES.map((m) => m.key));

/**
 * Taxi-Unternehmer: eine Modulleiste (sticky) + Inhalt – kein zweites Seitenmenü.
 */
export default function TaxiEntrepreneurShell({ company, onLogout }) {
  const [activeTaxiModule, setActiveTaxiModule] = useState("dashboard");

  /** Ermöglicht z. B. `?taxiModule=stammdaten` für Tests/Screenshots; Parameter wird danach entfernt. */
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const m = u.searchParams.get("taxiModule");
      if (m && MODULE_KEYS.has(m)) {
        setActiveTaxiModule(m);
        u.searchParams.delete("taxiModule");
        const next = `${u.pathname}${u.search}${u.hash}`;
        window.history.replaceState({}, "", next || u.pathname);
      }
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="partner-shell">
      <header className="partner-shell__header">
        <div className="partner-shell__brand" title={company?.name || ""}>
          <span className="partner-shell__brand-title">Taxi</span>
          {company?.name ? <span className="partner-shell__brand-subtitle">{company.name}</span> : null}
        </div>
        <nav className="partner-shell__nav" aria-label="Bereiche">
          {MODULES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setActiveTaxiModule(m.key)}
              className={
                activeTaxiModule === m.key
                  ? "partner-shell__nav-btn partner-shell__nav-btn--active"
                  : "partner-shell__nav-btn"
              }
            >
              {m.label}
            </button>
          ))}
        </nav>
        <button type="button" onClick={onLogout} className="partner-shell__logout">
          Abmelden
        </button>
      </header>

      <div className="partner-shell__body">
        {activeTaxiModule === "dashboard" && (
          <TaxiMasterPanel company={company} onNavigateModule={(key) => setActiveTaxiModule(key)} />
        )}
        {activeTaxiModule === "stammdaten" && <TaxiStammdatenPage />}
        {activeTaxiModule === "flotte" && <FleetPage />}
        {activeTaxiModule === "dokumente" && <TaxiDocumentsPage />}
      </div>
    </div>
  );
}
