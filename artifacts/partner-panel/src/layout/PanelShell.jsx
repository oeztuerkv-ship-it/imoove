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
  overview: {
    title: "Ihr Überblick",
    subtitle: "Willkommen im Unternehmensbereich — nur Ihre Daten, kein Plattform-Zugriff",
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
    component: ph(
      "Meine Freigabe-Codes",
      "Hier verwalten Sie die Zugangscodes nur für Ihr Unternehmen — getrennt von der zentralen Plattform.",
    ),
  },
  "hotel-mode": {
    title: "Hotelmodus",
    subtitle: "Buchungen für Ihren Betrieb",
    component: ph("Hotelmodus", "Spezielle Optionen für Beherbergungsbetriebe — nur Ihre Buchungen."),
  },
  "company-rides": {
    title: "Meine Firmenfahrten",
    subtitle: "Auswertung für Ihr Unternehmen",
    component: ph("Meine Firmenfahrten", "Gefilterte Ansichten und Kennzahlen — Mandantenbezogen."),
  },
  recurring: {
    title: "Meine Serienfahrten",
    subtitle: "Wiederkehrende Aufträge",
    component: ph("Meine Serienfahrten", "Planung wiederkehrender Fahrten nur in Ihrem Mandanten."),
  },
  billing: {
    title: "Meine Abrechnung",
    subtitle: "Umsätze und Auswertung Ihres Unternehmens",
    component: ph("Meine Abrechnung", "Abrechnungsübersicht und Exporte — ausschließlich Ihre Daten."),
  },
};

/**
 * @param {{ active: string; onChange: (k: string) => void; user: object; onLogout: () => void; navItems: { key: string; label: string; icon: string }[] }} props
 */
export default function PanelShell({ active, onChange, user, onLogout, navItems }) {
  const current = PAGES[active] || PAGES.overview;

  return (
    <div className="panel-app panel-app--workspace">
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
