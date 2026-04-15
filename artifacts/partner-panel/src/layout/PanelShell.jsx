import PanelSidebar from "./PanelSidebar.jsx";
import OverviewPage from "../pages/OverviewPage.jsx";
import PartnerRidesListPage from "../pages/PartnerRidesListPage.jsx";
import RideCreatePage from "../pages/RideCreatePage.jsx";
import ProfilePage from "../pages/ProfilePage.jsx";
import TeamPage from "../pages/TeamPage.jsx";
import AccessCodesPage from "../pages/AccessCodesPage.jsx";
import HotelBookingPage from "../pages/HotelBookingPage.jsx";
import MedicalRoundTripPage from "../pages/MedicalRoundTripPage.jsx";
import MedicalSeriesPage from "../pages/MedicalSeriesPage.jsx";
import BillingPage from "../pages/BillingPage.jsx";
import CompanyRidesPage from "../pages/CompanyRidesPage.jsx";
import SettingsPage from "../pages/SettingsPage.jsx";
import FleetPage from "../pages/FleetPage.jsx";

const PAGES = {
  overview: {
    title: "Ihr Überblick",
    subtitle: "Übersicht und Schnellzugriff",
    component: <OverviewPage />,
  },
  "rides-mine": {
    title: "Meine Fahrten",
    subtitle: "Alle Aufträge Ihres Unternehmens",
    component: <PartnerRidesListPage variant="all" />,
  },
  "rides-new": {
    title: "Neue Fahrt anlegen",
    subtitle: "Auftrag für Ihr Unternehmen erfassen",
    component: <RideCreatePage />,
  },
  "rides-history": {
    title: "Mein Verlauf",
    subtitle: "Abgeschlossen, storniert, abgelehnt",
    component: <PartnerRidesListPage variant="history" />,
  },
  profile: { title: "Meine Firma & Zugang", subtitle: "Stammdaten und Anmeldedaten", component: <ProfilePage /> },
  team: { title: "Meine Mitarbeiter", subtitle: "Zugänge und Rollen in Ihrem Unternehmen", component: <TeamPage /> },
  "access-codes": {
    title: "Meine Freigabe-Codes",
    subtitle: "Digitale Kostenübernahme für Gäste und Kunden",
    component: <AccessCodesPage />,
  },
  "hotel-mode": {
    title: "Hotelmodus",
    subtitle: "Gastfahrten, Reservierung, Zimmer & Zahler",
    component: <HotelBookingPage />,
  },
  "company-rides": {
    title: "Meine Firmenfahrten",
    subtitle: "Gefilterte Liste: Zahler, Zeitraum, Status — inkl. Serienhinweis",
    component: <CompanyRidesPage />,
  },
  recurring: {
    title: "Meine Serienfahrten",
    subtitle: "KV / Praxis: Serien mit Gültigkeit und Anzahl",
    component: <MedicalSeriesPage />,
  },
  "medical-round": {
    title: "Patientenfahrt Hin- & Rück",
    subtitle: "Zwei verbundene Fahrten, Referenz & Kostenträger",
    component: <MedicalRoundTripPage />,
  },
  billing: {
    title: "Meine Abrechnung",
    subtitle: "Monatsübersicht, Filter und CSV-Export",
    component: <BillingPage />,
  },
  fleet: {
    title: "Meine Flotte & Fahrer",
    subtitle: "Fahrzeuge, Fahrer-Logins und Nachweise für Ihr Taxiunternehmen",
    component: <FleetPage />,
  },
  settings: {
    title: "Einstellungen",
    subtitle: "Persönliche Sicherheit und Konto",
    component: <SettingsPage />,
  },
};

/**
 * @param {{ active: string; onChange: (k: string) => void; user: object; onLogout: () => void; navItems: { key: string; label: string; icon: string }[] }} props
 */
export default function PanelShell({ active, onChange, user, onLogout, navItems }) {
  const current = PAGES[active] || PAGES.overview;
  const isTaxiMode = user?.companyKind === "taxi" || navItems.some((i) => i.key === "fleet");
  const modeLabel = isTaxiMode ? "Taximodus" : "Unternehmensmodus";
  const rootClass = `panel-app panel-app--workspace ${isTaxiMode ? "panel-app--taxi-mode" : "panel-app--business-mode"}`;

  return (
    <div className={rootClass}>
      <div className="panel-app__sidebar-col">
        <PanelSidebar active={active} onChange={onChange} items={navItems} />
      </div>

      <div className="panel-app__main">
        <header className="panel-app__topbar">
          <div className="panel-app__topbar-left">
            <h1 className="panel-app__title">{current.title}</h1>
            <p className="panel-app__subtitle">{current.subtitle}</p>
          </div>

          <div className="panel-app__topbar-right">
            <p className="panel-app__session" aria-live="polite">
              <span className="panel-app__session-company">{user?.companyName || "Unternehmen"}</span>
              <span className="panel-app__mode-badge">{modeLabel}</span>
              <span className="panel-app__session-user">
                {user?.username}
                {user?.role ? ` · ${user.role}` : ""}
              </span>
              <button type="button" className="panel-app__session-out" onClick={() => void onLogout()}>
                Abmelden
              </button>
            </p>
          </div>
        </header>

        <main className="panel-app__content">
          <div className="panel-app__content-inner">{current.component}</div>
        </main>
      </div>
    </div>
  );
}
