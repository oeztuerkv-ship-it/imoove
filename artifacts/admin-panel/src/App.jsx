import { useState } from "react";
import Sidebar from "./components/Sidebar";

import DashboardPage from "./pages/DashboardPage";
import FaresPage from "./pages/FaresPage";
import RidesPage from "./pages/RidesPage";
import CompaniesPage from "./pages/CompaniesPage";
import PanelUsersPage from "./pages/PanelUsersPage.jsx";

const PAGE_CONFIG = {
  dashboard: {
    title: "Systemstatus",
    subtitle: "Kennzahlen und Auslastung der Plattform in Echtzeit",
    component: <DashboardPage />,
  },
  rides: {
    title: "Fahrten",
    subtitle: "Alle Aufträge über alle Unternehmen durchsuchen und bearbeiten",
    component: <RidesPage />,
  },
  companies: {
    title: "Unternehmen",
    subtitle: "Mandanten, Stammdaten und Einstellungen verwalten",
    component: <CompaniesPage />,
  },
  "panel-users": {
    title: "Partner-Zugänge",
    subtitle: "Zugänge zum Partner-Portal je Unternehmen anlegen und verwalten",
    component: <PanelUsersPage />,
  },
  fares: {
    title: "Tarife & Gebiete",
    subtitle: "Preisregeln und Fahrgebiete der Plattform",
    component: <FaresPage />,
  },
};

export default function App() {
  const [active, setActive] = useState("dashboard");

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
        </header>

        <main className="admin-app__content">
          <div className="admin-app__content-inner">{current.component}</div>
        </main>
      </div>
    </div>
  );
}
