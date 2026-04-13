import { useEffect, useState } from "react";
import AdminApiAuthBanner from "./components/AdminApiAuthBanner.jsx";
import Sidebar from "./components/Sidebar";
import { API_BASE } from "./lib/apiBase.js";
import { adminApiHeaders, setAdminSessionToken } from "./lib/adminApiHeaders.js";

import DashboardPage from "./pages/DashboardPage";
import FaresPage from "./pages/FaresPage";
import RidesPage from "./pages/RidesPage";
import CompaniesPage from "./pages/CompaniesPage";
import PanelUsersPage from "./pages/PanelUsersPage.jsx";
import AccessCodesPage from "./pages/AccessCodesPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";

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
  settings: {
    title: "Einstellungen",
    subtitle: "Konto und Sicherheit der Plattform-Konsole",
  },
};

export default function App() {
  const [active, setActive] = useState("dashboard");
  const [authBooting, setAuthBooting] = useState(true);
  const [authUser, setAuthUser] = useState(null);
  const [authForm, setAuthForm] = useState({ username: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [ridesInitialDetailId, setRidesInitialDetailId] = useState(null);
  const [companiesInitialOpenId, setCompaniesInitialOpenId] = useState(null);

  const current = PAGE_META[active] || PAGE_META.dashboard;

  useEffect(() => {
    if (authUser?.role === "service" && active === "fares") {
      setActive("dashboard");
    }
  }, [authUser?.role, active]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/auth/me`, { headers: adminApiHeaders() });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && data?.ok && data?.user) {
          setAuthUser(data.user);
        }
      } finally {
        if (!cancelled) setAuthBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onLogin(e) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await fetch(`${API_BASE}/admin/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: authForm.username.trim(),
          password: authForm.password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || typeof data?.token !== "string") {
        setAuthError(data?.error === "invalid_credentials" ? "Benutzername oder Passwort falsch." : "Login fehlgeschlagen.");
        return;
      }
      setAdminSessionToken(data.token);
      setAuthUser(data.user ?? null);
      setAuthForm({ username: "", password: "" });
    } catch {
      setAuthError("Login fehlgeschlagen.");
    } finally {
      setAuthLoading(false);
    }
  }

  function onLogout() {
    setAdminSessionToken("");
    setAuthUser(null);
    setActive("dashboard");
  }

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
      case "settings":
        return <SettingsPage />;
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

  if (authBooting) {
    return <div className="admin-info-banner">Admin-Sitzung wird geladen …</div>;
  }

  if (!authUser) {
    return (
      <div className="admin-page" style={{ maxWidth: 460, margin: "40px auto" }}>
        <div className="admin-panel-card">
          <div className="admin-panel-card__title">Admin-Login</div>
          <form onSubmit={onLogin} className="admin-form-vertical">
            <input
              className="admin-input"
              placeholder="Benutzername"
              value={authForm.username}
              onChange={(e) => setAuthForm((p) => ({ ...p, username: e.target.value }))}
              autoComplete="username"
              required
            />
            <input
              className="admin-input"
              placeholder="Passwort"
              type="password"
              value={authForm.password}
              onChange={(e) => setAuthForm((p) => ({ ...p, password: e.target.value }))}
              autoComplete="current-password"
              required
            />
            {authError ? <div className="admin-error-banner">{authError}</div> : null}
            <button type="submit" className="admin-btn-primary" disabled={authLoading}>
              {authLoading ? "Anmeldung …" : "Anmelden"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-app">
      <div className="admin-app__sidebar-col">
        <Sidebar active={active} onChange={setActive} role={authUser?.role} />
      </div>

      <div className="admin-app__main">
        <AdminApiAuthBanner />
        <header className="admin-app__topbar">
          <div className="admin-app__topbar-left">
            <h1 className="admin-app__title">{current.title}</h1>
            <p className="admin-app__subtitle">{current.subtitle}</p>
          </div>
          <div className="admin-app__topbar-right">
            <span className="admin-table-sub">{authUser?.username} · {authUser?.role}</span>
            <button type="button" className="admin-btn-refresh" onClick={onLogout}>Abmelden</button>
          </div>
        </header>

        <main className="admin-app__content">
          <div className="admin-app__content-inner">{renderPage()}</div>
        </main>
      </div>
    </div>
  );
}
