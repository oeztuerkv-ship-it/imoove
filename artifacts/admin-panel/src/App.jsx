import { useState } from "react";
import Sidebar from "./components/Sidebar";

import DashboardPage from "./pages/DashboardPage";
import FaresPage from "./pages/FaresPage";
import RidesPage from "./pages/RidesPage";
import CompaniesPage from "./pages/CompaniesPage";

function Placeholder({ title, text }) {
  return (
    <div className="admin-placeholder">
      <h2 className="admin-placeholder__title">{title}</h2>
      <p className="admin-placeholder__text">{text}</p>
    </div>
  );
}

const PAGE_CONFIG = {
  dashboard: {
    title: "Plattform-Übersicht",
    subtitle: "Globale KPIs und Systemzahlen — alle Mandanten, gesamte Fahrtenlage",
    component: <DashboardPage />,
  },
  rides: {
    title: "Alle Fahrten",
    subtitle: "Plattformweite Suche und Steuerung — sämtliche Aufträge über alle Unternehmen",
    component: <RidesPage />,
  },
  companies: {
    title: "Alle Unternehmen",
    subtitle: "Mandanten, PRIO, Freigaben und Stammdaten der Plattform",
    component: <CompaniesPage />,
  },
  fares: {
    title: "Tarife & Gebiete",
    subtitle: "Zentrale Preislogik für die gesamte Plattform",
    component: <FaresPage />,
  },
  partners: {
    title: "Unternehmer-Portal",
    subtitle: "Hinweis: Kunden arbeiten unter panel.onroda.de im eigenen Arbeitsbereich",
    component: (
      <Placeholder
        title="Unternehmer-Portal (extern)"
        text="Unternehmen nutzen das eigene Panel unter https://panel.onroda.de/ — getrennte App, nur eigene Daten, API unter /api/panel/v1/. Diese Konsole hier ist die zentrale Plattformsteuerung."
      />
    ),
  },
  drivers: {
    title: "Fahrer (Plattform)",
    subtitle: "Globale Fahrerverwaltung und Dokumente",
    component: (
      <Placeholder
        title="Fahrer"
        text="Hier kommt als Nächstes Fahrer-Verwaltung mit Suche, Status und Pagination hinein."
      />
    ),
  },
  billing: {
    title: "Abrechnung (Plattform)",
    subtitle: "Gesamtumsatz, Provisionen und Auszahlungen über alle Mandanten",
    component: (
      <Placeholder
        title="Abrechnung"
        text="Hier bauen wir danach Umsatz, Provisionen und Auszahlungen sauber auf."
      />
    ),
  },
  settings: {
    title: "Systemeinstellungen",
    subtitle: "Rollen, Schalter und globale Plattform-Parameter",
    component: (
      <Placeholder
        title="Einstellungen"
        text="Hier kommen Rollen, Wartungsmodus und Systemsteuerung hinein."
      />
    ),
  },
};

export default function App() {
  const [active, setActive] = useState("dashboard");
  const [globalSearch, setGlobalSearch] = useState("");

  const current = PAGE_CONFIG[active] || PAGE_CONFIG.dashboard;

  return (
    <div className="admin-app admin-app--control">
      <div className="admin-app__sidebar-col">
        <Sidebar active={active} onChange={setActive} />
      </div>

      <div className="admin-app__main">
        <header className="admin-app__topbar">
          <div className="admin-app__topbar-left">
            <h1 className="admin-app__title">{current.title}</h1>
            <p className="admin-app__subtitle">{current.subtitle}</p>
          </div>

          <div className="admin-app__topbar-right">
            <label className="admin-search">
              <span className="admin-search__icon" aria-hidden>
                ⌕
              </span>
              <input
                className="admin-search__input"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Plattform durchsuchen (Fahrten, IDs, Firmen …)"
                type="search"
                autoComplete="off"
                aria-label="Plattform durchsuchen"
              />
            </label>

            <button type="button" className="admin-btn-cta">
              + Plattform
            </button>
          </div>
        </header>

        <main className="admin-app__content">
          <div className="admin-app__content-inner">{current.component}</div>
        </main>
      </div>
    </div>
  );
}
