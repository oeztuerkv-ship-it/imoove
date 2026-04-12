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
    title: "Dashboard",
    subtitle: "Live-Übersicht deines Onroda-Systems",
    component: <DashboardPage />,
  },
  rides: {
    title: "Fahrten",
    subtitle: "Suche, Filter und Übersicht aller Fahrten",
    component: <RidesPage />,
  },
  companies: {
    title: "Unternehmer",
    subtitle: "Unternehmer, PRIO und Firmensteuerung",
    component: <CompaniesPage />,
  },
  fares: {
    title: "Tarife",
    subtitle: "Tarifgebiete und Preislogik",
    component: <FaresPage />,
  },
  partners: {
    title: "Partner",
    subtitle: "Hinweis: Unternehmer-Login liegt unter panel.onroda.de (eigenes Portal).",
    component: (
      <Placeholder
        title="Partnerportal"
        text="Das Unternehmerportal ist unter https://panel.onroda.de/ erreichbar (eigene App, eigene API-Pfade /api/panel/v1/)."
      />
    ),
  },
  drivers: {
    title: "Fahrer",
    subtitle: "Fahrerverwaltung und Dokumente",
    component: (
      <Placeholder
        title="Fahrer"
        text="Hier kommt als Nächstes Fahrer-Verwaltung mit Suche, Status und Pagination hinein."
      />
    ),
  },
  billing: {
    title: "Abrechnung",
    subtitle: "Umsatz, Provisionen und Auszahlungen",
    component: (
      <Placeholder
        title="Abrechnung"
        text="Hier bauen wir danach Umsatz, Provisionen und Auszahlungen sauber auf."
      />
    ),
  },
  settings: {
    title: "Einstellungen",
    subtitle: "System, Rollen und globale Steuerung",
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
    <div className="admin-app">
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
                placeholder="Global suchen …"
                type="search"
                autoComplete="off"
                aria-label="Global suchen"
              />
            </label>

            <button type="button" className="admin-btn-cta">
              + Neu
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
