import PanelSidebar from "./PanelSidebar.jsx";
import OverviewPage from "../pages/OverviewPage.jsx";
import RidesPage from "../pages/RidesPage.jsx";
import TeamPage from "../pages/TeamPage.jsx";

const PAGES = {
  overview: { title: "Übersicht", subtitle: "Dein Unternehmen auf einen Blick", component: <OverviewPage /> },
  rides: { title: "Fahrten", subtitle: "Erfassen und nachvollziehen", component: <RidesPage /> },
  team: { title: "Mitarbeiter", subtitle: "Zugänge und Rollen", component: <TeamPage /> },
};

export default function PanelShell({ active, onChange, user, onLogout }) {
  const current = PAGES[active] || PAGES.overview;

  return (
    <div className="panel-app">
      <div className="panel-app__sidebar-col">
        <PanelSidebar active={active} onChange={onChange} />
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
