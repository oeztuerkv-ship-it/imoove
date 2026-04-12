import { useState } from "react";
import Sidebar from "./components/Sidebar";

import DashboardPage from "./pages/DashboardPage";
import FaresPage from "./pages/FaresPage";
import RidesPage from "./pages/RidesPage";
import CompaniesPage from "./pages/CompaniesPage";
import PanelUsersPage from "./pages/PanelUsersPage.jsx";
import AccessCodesPage from "./pages/AccessCodesPage.jsx";

const PAGE_META = {
  dashboard: {
    title: "Systemstatus",
    subtitle: "Operative Tageslage, Kennzahlen und Umsatzüberblick",
  },
  rides: {
    title: "Fahrten",
    subtitle: "Alle Aufträge über alle Unternehmen durchsuchen und bearbeiten",
  },
  companies: {
    title: "Unternehmen",
    subtitle: "Mandanten, Stammdaten und Einstellungen verwalten",
  },
  "panel-users": {
    title: "Partner-Zugänge",
    subtitle: "Zugänge zum Partner-Portal je Unternehmen anlegen und verwalten",
  },
  fares: {
    title: "Tarife & Gebiete",
    subtitle: "Preisregeln und Fahrgebiete der Plattform verwalten",
  },
  "access-codes": {
    title: "Zugangscodes",
    subtitle: "Digitale Freigaben und interne Zuordnung verwalten",
  },
};

export default function App() {
  const [active, setActive] = useState("dashboard");
  const [ridesInitialDetailId, setRidesInitialDetailId] = useState(null);
  const [companiesInitialOpenId, setCompaniesInitialOpenId] = useState(null);

  const current = PAGE_META[active] || PAGE_META.dashboard;

  function renderPage() {
    switch (active) {
      case "dashboard":
        return (
          <DashboardPage
            onOpenRide={(id) => {
              setRidesInitialDetailId(id);
              setActive("rides");
            }}
            onOpenCompany={(id) => {
              setCompaniesInitialOpenId(id);
              setActive("companies");
            }}
          />
        );
      case "rides":
        return (
          <RidesPage
            initialDetailRideId={ridesInitialDetailId}
            onInitialDetailRideConsumed={() => setRidesInitialDetailId(null)}
          />
        );
      case "companies":
        return (
          <CompaniesPage
            initialOpenCompanyId={companiesInitialOpenId}
            onInitialOpenCompanyConsumed={() => setCompaniesInitialOpenId(null)}
          />
        );
      case "panel-users":
        return <PanelUsersPage />;
      case "fares":
        return <FaresPage />;
      case "access-codes":
        return <AccessCodesPage />;
      default:
        return (
          <DashboardPage
            onOpenRide={(id) => {
              setRidesInitialDetailId(id);
              setActive("rides");
            }}
            onOpenCompany={(id) => {
              setCompaniesInitialOpenId(id);
              setActive("companies");
            }}
          />
        );
    }
  }

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
          <div className="admin-app__content-inner">{renderPage()}</div>
        </main>
      </div>
    </div>
  );
}
