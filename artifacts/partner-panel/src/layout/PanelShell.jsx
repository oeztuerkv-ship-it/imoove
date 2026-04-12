import PanelSidebar from "./PanelSidebar.jsx";
import OverviewPage from "../pages/OverviewPage.jsx";
import PartnerRidesListPage from "../pages/PartnerRidesListPage.jsx";
import RideCreatePage from "../pages/RideCreatePage.jsx";
import ProfilePage from "../pages/ProfilePage.jsx";
import TeamPage from "../pages/TeamPage.jsx";
import ModulePlaceholderPage from "../pages/ModulePlaceholderPage.jsx";

function ph(title, lead) {
  return <ModulePlaceholderPage title={title} lead={lead} />;
}

const PAGES = {
  overview: { title: "Übersicht", subtitle: "Dein Unternehmen auf einen Blick", component: <OverviewPage /> },
  "rides-mine": {
    title: "Meine Fahrten",
    subtitle: "Alle Aufträge deines Mandanten (API)",
    component: <PartnerRidesListPage variant="all" />,
  },
  "rides-new": {
    title: "Neue Fahrt",
    subtitle: "Auftrag erfassen",
    component: <RideCreatePage />,
  },
  "rides-history": {
    title: "Verlauf",
    subtitle: "Abgeschlossen, storniert, abgelehnt",
    component: <PartnerRidesListPage variant="history" />,
  },
  profile: { title: "Profil und Firma", subtitle: "Zugang und Firmendaten", component: <ProfilePage /> },
  team: { title: "Mitarbeiter", subtitle: "Zugänge und Rollen", component: <TeamPage /> },
  "access-codes": {
    title: "Freigabe-Codes",
    subtitle: "Digitale Kostenübernahme",
    component: ph("Freigabe-Codes", "Verwaltung und Übersicht der Zugangscodes für Ihren Mandanten."),
  },
  "hotel-mode": {
    title: "Hotelmodus",
    subtitle: "Hotelbuchungen",
    component: ph("Hotelmodus", "Spezielle Buchungs- und Anzeigeoptionen für Beherbergungsbetriebe."),
  },
  "company-rides": {
    title: "Firmenfahrten",
    subtitle: "Auswertung",
    component: ph("Firmenfahrten", "Gefilterte Ansichten und Kennzahlen für Firmenfahrten."),
  },
  recurring: {
    title: "Serienfahrten",
    subtitle: "Wiederkehrende Aufträge",
    component: ph("Serienfahrten", "Planung und Verwaltung wiederkehrender Fahrten."),
  },
  billing: {
    title: "Abrechnung",
    subtitle: "Umsätze und Auswertung",
    component: ph("Abrechnung", "Abrechnungsübersicht und Exporte für Ihren Mandanten."),
  },
};

/**
 * @param {{ active: string; onChange: (k: string) => void; user: object; onLogout: () => void; navItems: { key: string; label: string; icon: string }[] }} props
 */
export default function PanelShell({ active, onChange, user, onLogout, navItems }) {
  const current = PAGES[active] || PAGES.overview;

  return (
    <div className="panel-app">
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
