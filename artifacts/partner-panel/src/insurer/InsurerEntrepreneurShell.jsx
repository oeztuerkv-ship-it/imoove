import { useEffect, useMemo, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { hasPanelModule } from "../lib/panelNavigation.js";
import { API_BASE } from "../lib/apiBase.js";
import InsurerDashboardPage from "./InsurerDashboardPage.jsx";
import InsurerRidesPage from "./InsurerRidesPage.jsx";
import InsurerCostCentersPage from "./InsurerCostCentersPage.jsx";
import InsurerBookingHubPage from "./InsurerBookingHubPage.jsx";
import SupportShell from "../support/SupportShell.jsx";
import HelpPage from "../pages/HelpPage.jsx";

const NAV = [
  { key: "dashboard", label: "Dashboard", needModule: "insurer_workspace" },
  { key: "rides", label: "Fahrten", needModule: "insurer_workspace" },
  { key: "costs", label: "Kostenstellen", needModule: "insurer_workspace" },
  { key: "booking", label: "Buchung H/R & Serien", needModule: "rides_create" },
  { key: "support", label: "Anfragen", needModule: "support" },
  { key: "help", label: "Hilfe", needModule: "help" },
];

/**
 * Krankenkasse (company_kind=insurer): getrennt von Taxi-Flotte und allgemeinem Partner-Panel-Layout.
 * API: /api/panel/v1/insurer/* — keine Flotten-Endpunkte, keine medizinischen Befund-Felder.
 */
export default function InsurerEntrepreneurShell({ company, onLogout }) {
  const { user, token } = usePanelAuth();
  const [view, setView] = useState("dashboard");
  const [supportPrefill, setSupportPrefill] = useState(null);

  const panelModules = user?.panelModules;

  const visibleNav = useMemo(
    () =>
      NAV.filter(
        (n) =>
          n.needModule && hasPanelModule(panelModules, n.needModule),
      ),
    [panelModules],
  );
  const visibleKeys = useMemo(() => new Set(visibleNav.map((n) => n.key)), [visibleNav]);

  useEffect(() => {
    if (!visibleKeys.has(view) && visibleNav[0]) {
      setView(visibleNav[0].key);
    }
  }, [view, visibleKeys, visibleNav]);

  if (user && !hasPanelModule(panelModules, "insurer_workspace")) {
    return (
      <div className="partner-shell" style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <h1>Krankenkassen-Portal</h1>
        <p>Für Ihren Zugang ist das Modul „Krankenkasse-Portal“ noch nicht freigeschaltet. Bitte die Plattform-Administration (ONRODA) – oder Support.</p>
        <button type="button" onClick={onLogout}>
          Abmelden
        </button>
      </div>
    );
  }

  return (
    <div className="partner-shell">
      <header className="partner-shell__header">
        <div className="partner-shell__brand" title={company?.name || "Kostenträger"}>
          <a
            className="partner-shell__onroda-wordmark"
            href="https://onroda.de"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="ONRODA – zur Website"
          >
            <span className="on">ON</span>
            <span className="roda">RODA</span>
          </a>
          <div className="partner-shell__brand-taxi-line">
            <span className="partner-shell__brand-taxi">Krankenkasse &amp; Kostenträger</span>
            {company?.name ? <span className="partner-shell__brand-subtitle">{company.name}</span> : null}
          </div>
        </div>
        <nav className="partner-shell__nav" aria-label="Bereiche">
          {visibleNav.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setView(m.key)}
              className={
                view === m.key
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
        {view === "dashboard" && <InsurerDashboardPage token={token} />}
        {view === "rides" && <InsurerRidesPage token={token} apiBase={API_BASE} />}
        {view === "costs" && <InsurerCostCentersPage token={token} apiBase={API_BASE} />}
        {view === "booking" && <InsurerBookingHubPage token={token} apiBase={API_BASE} />}
        {view === "support" && (
          <SupportShell
            supportPrefill={supportPrefill}
            onClearSupportPrefill={() => setSupportPrefill(null)}
          />
        )}
        {view === "help" && (
          <HelpPage
            onCreateRequest={() => {
              setSupportPrefill({ category: "help", title: "Hilfe: Krankenkassen-Portal", body: "" });
              setView("support");
            }}
          />
        )}
      </div>
    </div>
  );
}
