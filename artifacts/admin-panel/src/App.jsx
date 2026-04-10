import { useState } from "react";
import Sidebar from "./components/Sidebar";

import DashboardPage from "./pages/DashboardPage";
import FaresPage from "./pages/FaresPage";
import RidesPage from "./pages/RidesPage";
import CompaniesPage from "./pages/CompaniesPage";

function Placeholder({ title, text }) {
  return (
    <div style={styles.placeholderCard}>
      <h2 style={styles.placeholderTitle}>{title}</h2>
      <p style={styles.placeholderText}>{text}</p>
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
    subtitle: "Partner- und Portalverwaltung",
    component: (
      <Placeholder
        title="Partner"
        text="Hier bauen wir als Nächstes Partner, Mitarbeiter und Dokumente ein."
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
    <div style={styles.app}>
      <div style={styles.sidebarColumn}>
        <Sidebar active={active} onChange={setActive} />
      </div>

      <div style={styles.mainColumn}>
        <header style={styles.topbar}>
          <div style={styles.topbarLeft}>
            <h1 style={styles.pageTitle}>{current.title}</h1>
            <p style={styles.pageSubtitle}>{current.subtitle}</p>
          </div>

          <div style={styles.topbarRight}>
            <div style={styles.searchWrap}>
              <span style={styles.searchIcon}>⌕</span>
              <input
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Global suchen ..."
                style={styles.searchInput}
              />
            </div>

            <button style={styles.topButton}>+ Neu</button>
          </div>
        </header>

        <main style={styles.contentArea}>
          <div style={styles.contentInner}>{current.component}</div>
        </main>
      </div>
    </div>
  );
}

const styles = {
  app: {
    display: "flex",
    minHeight: "100vh",
    width: "100%",
    background: "#131314",
    color: "#e3e3e3",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    overflow: "hidden",
  },

  sidebarColumn: {
    width: 270,
    minWidth: 270,
    maxWidth: 270,
    flexShrink: 0,
    background: "#1e1f20",
    borderRight: "1px solid rgba(255,255,255,0.05)",
  },

  mainColumn: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    background: "#131314",
    overflow: "hidden",
  },

  topbar: {
    flexShrink: 0,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    padding: "20px 28px",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    background: "#131314",
  },

  topbarLeft: {
    minWidth: 0,
  },

  pageTitle: {
    margin: 0,
    fontSize: 28,
    fontWeight: 600,
    color: "#e3e3e3",
    lineHeight: 1.1,
  },

  pageSubtitle: {
    margin: "6px 0 0 0",
    fontSize: 14,
    color: "#c4c7c5",
  },

  topbarRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },

  searchWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 280,
    height: 44,
    padding: "0 14px",
    background: "#1e1f20",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 28,
  },

  searchIcon: {
    color: "#8e918f",
    fontSize: 15,
    lineHeight: 1,
    flexShrink: 0,
  },

  searchInput: {
    width: "100%",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "#e3e3e3",
    fontSize: 14,
  },

  topButton: {
    height: 44,
    padding: "0 16px",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 28,
    background: "#282a2d",
    color: "#e3e3e3",
    fontWeight: 500,
    cursor: "pointer",
  },

  contentArea: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
    background: "#131314",
  },

  contentInner: {
    padding: 28,
    minWidth: 0,
    maxWidth: "100%",
  },

  placeholderCard: {
    background: "#1e1f20",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 20,
    padding: 24,
  },

  placeholderTitle: {
    margin: 0,
    fontSize: 24,
    fontWeight: 600,
    color: "#e3e3e3",
  },

  placeholderText: {
    margin: "10px 0 0 0",
    color: "#c4c7c5",
    lineHeight: 1.6,
  },
};
