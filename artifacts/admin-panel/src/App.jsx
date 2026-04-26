import { useCallback, useEffect, useState } from "react";
import AdminApiAuthBanner from "./components/AdminApiAuthBanner.jsx";
import TopNav from "./components/TopNav.jsx";
import {
  firstAllowedAdminPage,
  isAdminPageAllowed,
} from "./config/adminNavConfig.js";
import { API_BASE } from "./lib/apiBase.js";
import { adminApiHeaders, setAdminSessionToken } from "./lib/adminApiHeaders.js";

import DashboardPage from "./pages/DashboardPage";
import FaresPage from "./pages/FaresPage";
import RidesPage from "./pages/RidesPage";
import CompaniesPage from "./pages/CompaniesPage";
import PanelUsersPage from "./pages/PanelUsersPage.jsx";
import AccessCodesPage from "./pages/AccessCodesPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import AdminUsersPage from "./pages/AdminUsersPage.jsx";
import AdminPasswordResetPage from "./pages/AdminPasswordResetPage.jsx";
import AdminPlaceholderPage from "./pages/AdminPlaceholderPage.jsx";
import FinanceDashboardPage from "./pages/FinanceDashboardPage.jsx";
import FinanceRideFinancialsPage from "./pages/FinanceRideFinancialsPage.jsx";
import FinanceInvoicesPage from "./pages/FinanceInvoicesPage.jsx";
import FinanceAuditPage from "./pages/FinanceAuditPage.jsx";
import SupportInboxPage from "./pages/SupportInboxPage.jsx";
import FleetVehiclesReviewPage from "./pages/FleetVehiclesReviewPage.jsx";
import CompanyRegistrationQueuePage from "./pages/CompanyRegistrationQueuePage.jsx";
import InsurerOverviewPage from "./pages/InsurerOverviewPage.jsx";
import InsurerRidesPage from "./pages/InsurerRidesPage.jsx";
import InsurerExportsPage from "./pages/InsurerExportsPage.jsx";
import HomepageContentPage from "./pages/HomepageContentPage.jsx";
import HomepagePlaceholdersPage from "./pages/HomepagePlaceholdersPage.jsx";
import TaxiFleetDriversPage from "./pages/TaxiFleetDriversPage.jsx";

function isAdminPasswordResetPath() {
  if (typeof window === "undefined") return false;
  const normalized = window.location.pathname.replace(/\/+$/, "") || "/";
  return normalized.endsWith("/password-reset");
}

function roleLabelDe(r) {
  const m = {
    admin: "Plattform-Admin",
    service: "Service / Disposition",
    taxi: "Taxi / Flotte",
    insurance: "Krankenkasse",
    hotel: "Hotel",
  };
  return m[r] ?? r ?? "—";
}

/** Jede aktive Seite braucht Eintrag (Titel + Untertitel); placeholder: Kurzinfo + optionale Bullets. */
const PAGE_META = {
  dashboard: {
    title: "Dashboard",
    subtitle: "Plattform-Cockpit, offene Warteschlangen und Tagesagenda",
  },
  rides: {
    title: "Fahrten",
    subtitle: "Alle Aufträge durchsuchen, filtern, exportieren",
  },
  "ride-new": {
    title: "Neue Fahrt",
    subtitle: "Anlage einer Fahrt aus der Plattform-Konsole (Dispatch / Buchungs-API).",
    placeholder: true,
    bullets: ["Zuordnung zu Mandant und Produktlinie", "Termin- vs. Sofortfahrt", "Validierung gegen Tarif / Codes"],
  },
  "billing-invoices": {
    title: "Rechnungen",
    subtitle: "Rechnungslauf und PDF-Versand (Anbindung Buchhaltung).",
    placeholder: true,
    bullets: ["Rechnungsnummernkreis", "PDF mit Logo", "Export für Steuerberater"],
  },
  "billing-credits": {
    title: "Gutschriften",
    subtitle: "Gutschriften und Korrekturbuchungen.",
    placeholder: true,
  },
  "billing-open": {
    title: "Offene Zahlungen",
    subtitle: "Forderungsliste und Mahnstatus.",
    placeholder: true,
  },
  "billing-cycles": {
    title: "Wochen- / Monatsabrechnung",
    subtitle: "Sammelabrechnung je Mandant oder Kostenträger.",
    placeholder: true,
  },
  "billing-hotel": {
    title: "Abrechnung Hotel",
    subtitle: "Vereinfachte Sicht auf eigene Hotel-Buchungen.",
    placeholder: true,
    bullets: ["Nur eigene Fahrten (Mandanten-Scope)", "CSV-Export über „Fahrten“ möglich"],
  },
  "finance-dashboard": {
    title: "Finanzen · Dashboard",
    subtitle: "KPI-Summary für Umsatz, Forderungen, Rechnungen und Provision",
  },
  "finance-ride-financials": {
    title: "Finanzen · Ride Financials",
    subtitle: "Finanz-Snapshots je Fahrt mit Filter, Pagination und Detail",
  },
  "finance-invoices": {
    title: "Finanzen · Invoices",
    subtitle: "Rechnungslisten und Rechnungsdetail (read only)",
  },
  "finance-audit": {
    title: "Finanzen · Audit",
    subtitle: "Finance-Audit-Log mit Filter und Verlauf",
  },
  "docs-hub": {
    title: "Dokumente / PDF",
    subtitle: "Fahrt-PDF, Rechnungs-PDF, Krankenfahrt-Nachweis, Sammel-PDF.",
    placeholder: true,
    bullets: ["Logo und Footer aus Branding", "Seriendruck Tag/Monat", "CSV parallel"],
  },
  fares: {
    title: "Tarife & Gebiete",
    subtitle: "Preisregeln, Zonen und Zuschläge",
  },
  "health-overview": {
    title: "Krankenfahrten — Übersicht",
    subtitle: "Gefilterte Sicht auf Kostenträger Krankenkasse (Kennzahlen folgen).",
    placeholder: true,
    bullets: ["Nutzen Sie parallel die Fahrtenliste (gefiltert)", "Genehmigungen und Verordnungen als nächste API-Schritte"],
  },
  "health-approvals": {
    title: "Genehmigungen",
    subtitle: "Freigaben und Prüfstatus für Krankenfahrten.",
    placeholder: true,
  },
  "health-insurers": {
    title: "Krankenkassen",
    subtitle: "Stammdaten der Kostenträger.",
    placeholder: true,
  },
  "health-prescriptions": {
    title: "Verordnungen",
    subtitle: "Verordnungsdaten und Fristen.",
    placeholder: true,
  },
  "health-bulk": {
    title: "Sammelabrechnung KV",
    subtitle: "Abrechnungsläufe gegenüber Krankenkassen.",
    placeholder: true,
  },
  "insurer-overview": {
    title: "Krankenkassen · Übersicht",
    subtitle: "KPIs zu Krankenfahrt-Fahrten (Zahler Krankenkasse) — Onroda als Vermittler",
  },
  "insurer-rides": {
    title: "Krankenkassen · Fahrten",
    subtitle: "Gefilterte, datensparse Ride-Projektion — kein vollständiges Ride-Objekt",
  },
  "insurer-exports": {
    title: "Krankenkassen · Exporte",
    subtitle: "Prüfbarer CSV-Export (Schema-Version), nur mit Plattform-Bearer",
  },
  companies: {
    title: "Unternehmen",
    subtitle: "Mandanten, Module und operative Priorität",
  },
  "taxi-fleet-drivers": {
    title: "Taxi · Fahrer",
    subtitle: "Plattform-Admin: Fahrer pro Taxi-Mandant prüfen, freigeben, sperren (Audit im Mandantenkontext)",
  },
  "company-registration-requests": {
    title: "Registrierungsanfragen",
    subtitle: "Homepage-Onboarding: E-Mail-Antwort, Verlauf, Freigabe — nicht der Mandanten-Support",
  },
  "support-inbox": {
    title: "Partner-Anfragen",
    subtitle: "Support-Threads aller Mandanten: lesen, antworten, Status steuern",
  },
  "fleet-vehicles-review": {
    title: "Fahrzeuge prüfen",
    subtitle: "Gesamtsystem: einzureichende Taxi-Fahrzeuge freigeben, ablehnen oder sperren",
  },
  "drivers-overview": {
    title: "Fahrerübersicht",
    subtitle: "Alle aktiven Fahrer auf der Plattform.",
    placeholder: true,
  },
  "drivers-status": {
    title: "Fahrer-Status",
    subtitle: "Live-Status (frei / Auftrag / Pause).",
    placeholder: true,
  },
  "drivers-rides": {
    title: "Fahrten je Fahrer",
    subtitle: "Auswertung pro Fahrer.",
    placeholder: true,
    bullets: ["Filter in der Fahrtenliste nach Fahrer-ID nutzen"],
  },
  "drivers-revenue": {
    title: "Umsatz je Fahrer",
    subtitle: "Abrechnungsrelevante Kennzahlen pro Fahrer.",
    placeholder: true,
  },
  "users-admin": {
    title: "Admin-Zugänge",
    subtitle: "Plattform-Administratoren und Konsole-Rollen",
  },
  "users-panel": {
    title: "Partner-Zugänge",
    subtitle: "Zugänge zum Partner-Portal je Unternehmen",
  },
  "users-roles": {
    title: "Rollen & Rechte",
    subtitle: "Feinrechte für Konsole und Partner-Portal (RBAC).",
    placeholder: true,
    bullets: ["Rollen: Admin, Service, Taxi, Krankenkasse, Hotel", "API-Spiegel in adminConsoleRoles"],
  },
  "export-hub": {
    title: "Export",
    subtitle: "DATEV und filterbasierter Datenexport.",
    placeholder: true,
    bullets: ["CSV: Fahrten-Tabelle mit Filtern und Export-Button", "DATEV-Schnittstelle als Erweiterung"],
  },
  "access-codes": {
    title: "Zugangscodes",
    subtitle: "Digitale Freigaben und interne Zuordnung",
  },
  "homepage-placeholders": {
    title: "Homepage-Hinweise",
    subtitle: "Öffentliche Banner auf onroda.de direkt aus der Plattform-Konsole steuern",
  },
  "homepage-content": {
    title: "Homepage-Inhalte",
    subtitle: "Hero-Texte und Hinweiszeile der Marketing-Homepage ohne Codeänderung steuern",
  },
  settings: {
    title: "Einstellungen",
    subtitle: "Konto und Sicherheit der Plattform-Konsole",
  },
  "settings-api": {
    title: "API & Token",
    subtitle: "Technische Zugänge und Bearer-Konfiguration.",
    placeholder: true,
    bullets: ["ADMIN_API_BEARER_TOKEN und Panel-Secrets serverseitig in .env"],
  },
  "settings-branding": {
    title: "Branding (PDF)",
    subtitle: "Logo und Layout für PDF- und Druckvorlagen.",
    placeholder: true,
  },
  "settings-payments": {
    title: "Zahlungsarten",
    subtitle: "Konfiguration der Zahlungsoptionen in der App.",
    placeholder: true,
  },
  "settings-system": {
    title: "System",
    subtitle: "Globale Schalter und Wartungsmodus (geplant).",
    placeholder: true,
  },
};

export default function App() {
  const INACTIVITY_MS = 10 * 60 * 1000;
  const [active, setActive] = useState("dashboard");
  const [authBooting, setAuthBooting] = useState(true);
  const [authUser, setAuthUser] = useState(null);
  const [authForm, setAuthForm] = useState({ username: "", password: "" });
  const [forgotIdentity, setForgotIdentity] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [ridesInitialDetailId, setRidesInitialDetailId] = useState(null);
  const [companiesInitialOpenId, setCompaniesInitialOpenId] = useState(null);
  const [companiesListTab, setCompaniesListTab] = useState("all");
  const [mandateDetailCompanyId, setMandateDetailCompanyId] = useState(null);
  /** Nach Zurück von der Zentrale: Zeile in der Mandantenliste für Voll-Workspace (`CompanyWorkspaceForm`) aufklappen. */
  const [companiesExpandWorkspaceCompanyId, setCompaniesExpandWorkspaceCompanyId] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [narrowNav, setNarrowNav] = useState(false);

  const current =
    active === "companies" && mandateDetailCompanyId
      ? {
          title: "Mandantenzentrale",
          subtitle: "Stammdaten, Kennzahlen, Fahrten und Plattform-Verlauf (lesend).",
        }
      : PAGE_META[active] || PAGE_META.dashboard;
  const userRole = authUser?.role ?? "admin";

  const onLogout = useCallback(() => {
    setAdminSessionToken("");
    setAuthUser(null);
    setActive("dashboard");
    setMandateDetailCompanyId(null);
    setCompaniesExpandWorkspaceCompanyId(null);
  }, []);

  const handlePickPage = useCallback(
    (pageKey, opt) => {
      if (!isAdminPageAllowed(pageKey, userRole)) return;
      if (pageKey === "companies") {
        setCompaniesListTab(opt?.companiesTab != null && opt.companiesTab !== "" ? opt.companiesTab : "all");
        setMandateDetailCompanyId(null);
        setCompaniesExpandWorkspaceCompanyId(null);
      }
      setActive(pageKey);
      setMobileMenuOpen(false);
    },
    [userRole],
  );

  /** Inaktivität: `document`+capture und `wheel`, damit Scroll in Shell-`overflow:auto` zählt; Tab-Wechsel per visibility. */
  useEffect(() => {
    if (!authUser) return undefined;
    const evOpts = { capture: true, passive: true };
    let lastActivity = Date.now();
    let timer = 0;
    let didLogout = false;

    const runLogout = () => {
      if (didLogout) return;
      didLogout = true;
      onLogout();
      window.alert("Sie wurden nach 10 Minuten Inaktivität automatisch abgemeldet.");
    };

    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      if (document.visibilityState === "hidden") {
        timer = 0;
        return;
      }
      const elapsed = Date.now() - lastActivity;
      if (elapsed >= INACTIVITY_MS) {
        runLogout();
        return;
      }
      timer = window.setTimeout(runLogout, INACTIVITY_MS - elapsed);
    };

    const bump = () => {
      lastActivity = Date.now();
      schedule();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (timer) window.clearTimeout(timer);
        timer = 0;
        return;
      }
      schedule();
    };

    bump();
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"];
    events.forEach((e) => document.addEventListener(e, bump, evOpts));
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) window.clearTimeout(timer);
      events.forEach((e) => document.removeEventListener(e, bump, evOpts));
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [authUser, onLogout]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = () => setNarrowNav(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!authUser?.role) return;
    if (!isAdminPageAllowed(active, authUser.role)) {
      setActive(firstAllowedAdminPage(authUser.role));
    }
  }, [authUser?.role, active, authUser]);

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
        if (data?.error === "invalid_credentials") {
          setAuthError("Benutzername oder Passwort falsch.");
        } else if (data?.error === "auth_bootstrap_persist_failed") {
          setAuthError("Bootstrap-Login konnte nicht in die DB übernommen werden. Bitte Server-Logs prüfen.");
        } else {
          setAuthError("Login fehlgeschlagen.");
        }
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

  async function onForgotRequest(e) {
    e.preventDefault();
    setForgotBusy(true);
    setForgotMessage("");
    try {
      const res = await fetch(`${API_BASE}/admin/auth/password-reset/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity: forgotIdentity.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setForgotMessage("Reset-Anfrage konnte nicht verarbeitet werden.");
        return;
      }
      setForgotMessage(data?.message || "Wenn ein Konto existiert, wurde ein Reset gestartet.");
    } catch {
      setForgotMessage("Reset-Anfrage konnte nicht verarbeitet werden.");
    } finally {
      setForgotBusy(false);
    }
  }

  function renderPage() {
    const meta = PAGE_META[active];
    if (meta?.placeholder) {
      return (
        <AdminPlaceholderPage title={meta.title} intro={meta.subtitle} bullets={meta.bullets || []} />
      );
    }

    switch (active) {
      case "dashboard":
        return (
          <DashboardPage
            userRole={userRole}
            onNavigate={(pageKey) => {
              if (!isAdminPageAllowed(pageKey, userRole)) return;
              if (pageKey === "companies") {
                setCompaniesListTab("all");
                setMandateDetailCompanyId(null);
              }
              setActive(pageKey);
            }}
            onOpenRide={(id) => {
              setRidesInitialDetailId(id);
              setActive("rides");
            }}
            onOpenCompany={(id) => {
              setCompaniesInitialOpenId(id);
              setMandateDetailCompanyId(null);
              setActive("companies");
            }}
          />
        );
      case "rides":
        return (
          <RidesPage
            initialDetailRideId={ridesInitialDetailId}
            onInitialDetailRideConsumed={() => setRidesInitialDetailId(null)}
            userRole={userRole}
          />
        );
      case "companies":
        return (
          <CompaniesPage
            initialOpenCompanyId={companiesInitialOpenId}
            onInitialOpenCompanyConsumed={() => setCompaniesInitialOpenId(null)}
            listTab={companiesListTab}
            onListTabChange={setCompaniesListTab}
            mandateDetailCompanyId={mandateDetailCompanyId}
            onOpenMandateDetail={setMandateDetailCompanyId}
            onCloseMandateDetail={() => setMandateDetailCompanyId(null)}
            expandWorkspaceCompanyId={companiesExpandWorkspaceCompanyId}
            onExpandWorkspaceConsumed={() => setCompaniesExpandWorkspaceCompanyId(null)}
            onRequestWorkspaceForCompany={(id) => {
              setMandateDetailCompanyId(null);
              setCompaniesExpandWorkspaceCompanyId(id);
            }}
          />
        );
      case "taxi-fleet-drivers":
        return <TaxiFleetDriversPage />;
      case "support-inbox":
        return <SupportInboxPage />;
      case "fleet-vehicles-review":
        return <FleetVehiclesReviewPage />;
      case "company-registration-requests":
        return (
          <CompanyRegistrationQueuePage
            onOpenCompany={(id) => {
              setCompaniesInitialOpenId(id);
              setActive("companies");
            }}
          />
        );
      case "insurer-overview":
        return <InsurerOverviewPage />;
      case "insurer-rides":
        return <InsurerRidesPage />;
      case "insurer-exports":
        return <InsurerExportsPage />;
      case "users-panel":
        return <PanelUsersPage />;
      case "fares":
        return <FaresPage />;
      case "access-codes":
        return <AccessCodesPage />;
      case "homepage-placeholders":
        return <HomepagePlaceholdersPage />;
      case "homepage-content":
        return <HomepageContentPage />;
      case "finance-dashboard":
        return <FinanceDashboardPage />;
      case "finance-ride-financials":
        return <FinanceRideFinancialsPage />;
      case "finance-invoices":
        return <FinanceInvoicesPage />;
      case "finance-audit":
        return <FinanceAuditPage />;
      case "settings":
        return <SettingsPage />;
      case "users-admin":
        return <AdminUsersPage sessionUsername={authUser?.username ?? ""} />;
      default:
        return (
          <DashboardPage
            userRole={userRole}
            onNavigate={(pageKey) => {
              if (!isAdminPageAllowed(pageKey, userRole)) return;
              if (pageKey === "companies") {
                setCompaniesListTab("all");
                setMandateDetailCompanyId(null);
              }
              setActive(pageKey);
            }}
            onOpenRide={(id) => {
              setRidesInitialDetailId(id);
              setActive("rides");
            }}
            onOpenCompany={(id) => {
              setCompaniesInitialOpenId(id);
              setMandateDetailCompanyId(null);
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
    if (isAdminPasswordResetPath()) {
      return <AdminPasswordResetPage />;
    }
    const resetPageHref = `${import.meta.env.BASE_URL}password-reset`.replace(/([^:]\/)\/+/g, "$1");
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
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--onroda-border-subtle)" }}>
            <div className="admin-table-sub" style={{ marginBottom: 10 }}>Passwort vergessen</div>
            <p className="admin-table-sub" style={{ marginBottom: 10, lineHeight: 1.45 }}>
              Schritt 1: Zugang anfragen. Schritt 2: Mit dem Link aus der E-Mail ein neues Passwort setzen —{" "}
              <a href={resetPageHref} style={{ color: "var(--onroda-accent-strong, #0ea5e9)" }}>
                Passwort zurücksetzen
              </a>
              .
            </p>
            <form onSubmit={onForgotRequest} className="admin-form-vertical">
              <input
                className="admin-input"
                placeholder="Benutzername oder E-Mail"
                value={forgotIdentity}
                onChange={(e) => setForgotIdentity(e.target.value)}
                autoComplete="username"
                required
              />
              <button type="submit" className="admin-btn-refresh" disabled={forgotBusy}>
                {forgotBusy ? "Sende …" : "Reset anfordern"}
              </button>
            </form>
            {forgotMessage ? <div className="admin-info-banner" style={{ marginTop: 10 }}>{forgotMessage}</div> : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-app">
      <div className="admin-app__main">
        <TopNav
          active={active}
          companiesListTab={companiesListTab}
          onPickPage={handlePickPage}
          role={userRole}
          narrow={narrowNav}
          mobileOpen={mobileMenuOpen}
          onOpenMobile={() => setMobileMenuOpen(true)}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />
        <AdminApiAuthBanner />
        <header className="admin-app__topbar">
          <div className="admin-app__topbar-left">
            <h1 className="admin-app__title">{current.title}</h1>
            <p className="admin-app__subtitle">{current.subtitle}</p>
          </div>
          <div className="admin-app__topbar-right">
            <span className="admin-table-sub">
              {authUser?.username} · {roleLabelDe(authUser?.role)}
              {authUser?.scopeCompanyId ? ` · ${authUser.scopeCompanyId}` : ""}
            </span>
            <button type="button" className="admin-btn-refresh" onClick={onLogout}>
              Abmelden
            </button>
          </div>
        </header>

        <main className="admin-app__content">
          <div className="admin-app__content-inner">{renderPage()}</div>
        </main>
      </div>
    </div>
  );
}
