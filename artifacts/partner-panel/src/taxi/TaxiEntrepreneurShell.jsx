import { useEffect, useMemo, useState } from "react";
import TaxiMasterPanel from "../components/TaxiMasterPanel.jsx";
import FleetPage from "../pages/FleetPage.jsx";
import TeamPage from "../pages/TeamPage.jsx";
import HelpPage from "../pages/HelpPage.jsx";
import TaxiStammdatenPage from "../pages/taxi/TaxiStammdatenPage.jsx";
import TaxiDocumentsPage from "../pages/taxi/TaxiDocumentsPage.jsx";
import SupportShell from "../support/SupportShell.jsx";
import { hasPanelModule } from "../lib/panelNavigation.js";

function hasPerm(user, key) {
  return Array.isArray(user?.permissions) && user.permissions.includes(key);
}

/** Reihenfolge = Modulleiste. Sichtbarkeit über Mandanten-Module und Matrix-Rechte. */
const TAXI_NAV_DEFS = [
  { key: "dashboard", label: "Dashboard", show: () => true },
  {
    key: "stammdaten",
    label: "Stammdaten",
    show: (user) => hasPanelModule(user?.panelModules, "company_profile") && hasPerm(user, "company.update"),
  },
  {
    key: "flotte",
    label: "Flotte",
    show: (user) => hasPanelModule(user?.panelModules, "taxi_fleet") && hasPerm(user, "fleet.read"),
  },
  {
    key: "dokumente",
    label: "Dokumente",
    show: (user) => hasPanelModule(user?.panelModules, "taxi_fleet") && hasPerm(user, "fleet.read"),
  },
  {
    key: "anfragen",
    label: "Anfragen",
    show: (user) => hasPanelModule(user?.panelModules, "support") && hasPerm(user, "support.read"),
  },
  {
    key: "hilfe",
    label: "Hilfe",
    show: (user) => hasPanelModule(user?.panelModules, "help"),
  },
  {
    key: "benutzer",
    label: "Benutzer & Rollen",
    show: (user) => hasPanelModule(user?.panelModules, "team") && hasPerm(user, "users.read"),
  },
];

/** Taxi-Unternehmer: eine Modulleiste (sticky) + Inhalt – kein zweites Seitenmenü. */
export default function TaxiEntrepreneurShell({ user, company, onLogout }) {
  const [activeTaxiModule, setActiveTaxiModule] = useState("dashboard");
  const [supportPrefill, setSupportPrefill] = useState(null);

  const openSupportDraft = useMemo(() => {
    if (!hasPanelModule(user?.panelModules, "support") || !hasPerm(user, "support.write")) return undefined;
    return (draft) => {
      setSupportPrefill(draft);
      setActiveTaxiModule("anfragen");
    };
  }, [user]);

  const visibleNav = useMemo(() => TAXI_NAV_DEFS.filter((d) => d.show(user)), [user]);
  const visibleKeys = useMemo(() => new Set(visibleNav.map((d) => d.key)), [visibleNav]);

  /** Ermöglicht z. B. `?taxiModule=stammdaten` für Tests/Screenshots; Parameter wird danach entfernt. */
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const m = u.searchParams.get("taxiModule");
      if (m && visibleKeys.has(m)) {
        setActiveTaxiModule(m);
        u.searchParams.delete("taxiModule");
        const next = `${u.pathname}${u.search}${u.hash}`;
        window.history.replaceState({}, "", next || u.pathname);
      }
    } catch {
      /* ignore */
    }
  }, [visibleKeys]);

  useEffect(() => {
    if (!visibleKeys.has(activeTaxiModule)) {
      setActiveTaxiModule("dashboard");
    }
  }, [visibleKeys, activeTaxiModule]);

  return (
    <div className="partner-shell">
      <header className="partner-shell__header">
        <div className="partner-shell__brand" title={company?.name || "ONRODA Taxi"}>
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
            <span className="partner-shell__brand-taxi">Taxi</span>
            {company?.name ? <span className="partner-shell__brand-subtitle">{company.name}</span> : null}
          </div>
        </div>
        <nav className="partner-shell__nav" aria-label="Bereiche">
          {visibleNav.map((m) => (
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
        {activeTaxiModule === "stammdaten" && <TaxiStammdatenPage onOpenStammSupportRequest={openSupportDraft} />}
        {activeTaxiModule === "flotte" && <FleetPage />}
        {activeTaxiModule === "dokumente" && <TaxiDocumentsPage onOpenDocumentSupportRequest={openSupportDraft} />}
        {activeTaxiModule === "anfragen" && (
          <SupportShell supportPrefill={supportPrefill} onClearSupportPrefill={() => setSupportPrefill(null)} />
        )}
        {activeTaxiModule === "hilfe" && (
          <HelpPage
            onCreateRequest={() => {
              setSupportPrefill({
                category: "help",
                title: "Hilfe: Allgemeine Frage",
                body: "",
              });
              setActiveTaxiModule("anfragen");
            }}
          />
        )}
        {activeTaxiModule === "benutzer" && (
          <TeamPage
            pageTitle="Benutzer & Rollen"
            pageLead="Zugänge nur für Ihren Mandanten: anlegen, Rolle setzen, sperren oder Passwort zurücksetzen."
          />
        )}
      </div>
    </div>
  );
}
