import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminApiAuthBanner from "./components/AdminApiAuthBanner.jsx";
import TopNav from "./components/TopNav.jsx";
import {
  firstAllowedAdminPage,
  isAdminPageAllowed,
} from "./config/adminNavConfig.js";
import { API_BASE } from "./lib/apiBase.js";
import { adminApiHeaders, getAdminSessionToken, setAdminSessionToken } from "./lib/adminApiHeaders.js";
import {
  adminAppHistoryHref,
  applyAdminAppRoute,
  buildAdminAppHash,
  parseAdminAppHash,
  shouldShowAdminLoginUnauthenticated,
} from "./lib/adminAppHistory.js";

import DashboardPage from "./pages/DashboardPage";
import FaresPage from "./pages/FaresPage";
import RidesPage from "./pages/RidesPage";
import RideDetailPage from "./pages/RideDetailPage.jsx";
import CompaniesPage from "./pages/CompaniesPage";
import PanelUsersPage from "./pages/PanelUsersPage.jsx";
import AccessCodesPage from "./pages/AccessCodesPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import AdminUsersPage from "./pages/AdminUsersPage.jsx";
import AdminPasswordResetPage from "./pages/AdminPasswordResetPage.jsx";
import AdminPlaceholderPage from "./pages/AdminPlaceholderPage.jsx";
import FinanceDashboardPage from "./pages/FinanceDashboardPage.jsx";
import FinanceRideFinancialsPage from "./pages/FinanceRideFinancialsPage.jsx";
import FinancePayoutLinesPage from "./pages/FinancePayoutLinesPage.jsx";
import FailedPaymentsPage from "./pages/FailedPaymentsPage.jsx";
import FinanceInvoicesPage from "./pages/FinanceInvoicesPage.jsx";
import FinanceKrankenInvoicesPage from "./pages/FinanceKrankenInvoicesPage.jsx";
import FinanceAuditPage from "./pages/FinanceAuditPage.jsx";
import SupportInboxPage from "./pages/SupportInboxPage.jsx";
import RideSupportTicketsPage from "./pages/RideSupportTicketsPage.jsx";
import AppHelpTicketsPage from "./pages/AppHelpTicketsPage.jsx";
import FleetVehiclesReviewPage from "./pages/FleetVehiclesReviewPage.jsx";
import CompanyVehicleRequestsPage from "./pages/CompanyVehicleRequestsPage.jsx";
import CompanyRegistrationQueuePage from "./pages/CompanyRegistrationQueuePage.jsx";
import InsurerOverviewPage from "./pages/InsurerOverviewPage.jsx";
import InsurerRidesPage from "./pages/InsurerRidesPage.jsx";
import InsurerExportsPage from "./pages/InsurerExportsPage.jsx";
import HomepageContentPage from "./pages/HomepageContentPage.jsx";
import LegalPagesPage from "./pages/LegalPagesPage.jsx";
import HomepagePlaceholdersPage from "./pages/HomepagePlaceholdersPage.jsx";
import VisitorAnalyticsPage from "./pages/VisitorAnalyticsPage.jsx";
import AppOperationalTariffsPage from "./pages/AppOperationalTariffsPage.jsx";
import AppOperationalRegionsPage from "./pages/AppOperationalRegionsPage.jsx";
import AppOperationalCommissionPage from "./pages/AppOperationalCommissionPage.jsx";
import AppOperationalDispatchPage from "./pages/AppOperationalDispatchPage.jsx";
import AppOperationalFeaturesPage from "./pages/AppOperationalFeaturesPage.jsx";
import AppOperationalDriverRulesPage from "./pages/AppOperationalDriverRulesPage.jsx";
import AppOperationalBookingRulesPage from "./pages/AppOperationalBookingRulesPage.jsx";
import AppOperationalSystemPage from "./pages/AppOperationalSystemPage.jsx";
import CustomerAccountsPage from "./pages/CustomerAccountsPage.jsx";
import CustomersPage from "./pages/CustomersPage.jsx";
import AppNewsPage from "./pages/AppNewsPage.jsx";
import AppFaqPage from "./pages/AppFaqPage.jsx";
import AppSponsorsPage from "./pages/AppSponsorsPage.jsx";
import DriverMessagesPage from "./pages/DriverMessagesPage.jsx";
import PartnerMessagesPage from "./pages/PartnerMessagesPage.jsx";
import TaxiFleetDriversPage from "./pages/TaxiFleetDriversPage.jsx";
import TaxiFleetVehiclesPage from "./pages/TaxiFleetVehiclesPage.jsx";
import DriversOverviewPage from "./pages/DriversOverviewPage.jsx";
import DriversRevenuePage from "./pages/DriversRevenuePage.jsx";
import Fail2BanPage from "./pages/Fail2BanPage.jsx";
import ServerStatusPage from "./pages/ServerStatusPage.jsx";

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
  "ride-detail": {
    title: "Fahrtakte",
    subtitle: "Ereignisverlauf, Status, Audit (read-only, ride_events + Mandanten-Log)",
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
    title: "Fehlgeschlagene Zahlungen",
    subtitle: "Abgeschlossene Fahrten mit fehlgeschlagener Kartenabbuchung — Retries, Sperren, manuelle Nachverfolgung",
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
    title: "Finanzen · Fahrt-Snapshots",
    subtitle: "Finanz-Snapshots je Fahrt mit Filter und Detailansicht",
  },
  "finance-payout-lines": {
    title: "Finanzen · Unternehmer-Auszahlungen",
    subtitle: "Brutto, Stripe-Gebühr, Provision und manuelles Markieren als ausgezahlt",
  },
  "finance-invoices": {
    title: "Finanzen · Invoices",
    subtitle: "Rechnungslisten und Rechnungsdetail (read only)",
  },
  "finance-audit": {
    title: "Finanzen · Protokoll",
    subtitle: "Finanz-Änderungsprotokoll mit Filter und Verlauf",
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
  "app-op-tariffs": {
    title: "App / Betrieb — Tarife",
    subtitle: "XL & Rollstuhl-Aufschläge (plattformweit) und Taxameter-Tarif-Katalog",
  },
  "app-op-regions": {
    title: "App / Betrieb — Gebiete",
    subtitle: "Wo gefahren wird (Matching), Tarif-Zuordnung, Radius/Text; Buchung nur in aktiven Gebieten",
  },
  "app-op-commission": {
    title: "App / Betrieb — Provision",
    subtitle: "Globale Standard-Provision (MVP), Erweiterung: je Stadt, Partner, Fahrtart",
  },
  "app-op-dispatch": {
    title: "App / Betrieb — Dispatch",
    subtitle: "Eigene Fahrer, Exklusivzeit, Radius, Open Market, Weitergabe (Konfig, Server + App)",
  },
  "app-op-features": {
    title: "App / Betrieb — Funktionen",
    subtitle: "Toggles: Fahrtart, Vorbestellung, Zahlwege, Tracking; API-Validierung",
  },
  "app-op-driver-rules": {
    title: "App / Betrieb — Fahrer-Regeln",
    subtitle: "P-Schein, Fahrzeug, Dokumente, System-Override, Ablaufdaten",
  },
  "app-op-booking-rules": {
    title: "App / Betrieb — Buchungsregeln",
    subtitle: "Vorlauf, Distanz, Pflichtfelder, Krankenfahrt-Metadaten / Storno-Hinweise",
  },
  "app-op-system": {
    title: "App / Betrieb — System",
    subtitle: "Wartung, Sperrungen, globale Texte, Mindestdversion, Notabschaltung",
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
  "taxi-fleet-vehicles": {
    title: "Taxi · Fahrzeuge",
    subtitle: "Plattform-Admin: Fahrzeuge pro Taxi-Mandant prüfen, freigeben, sperren (Audit im Mandantenkontext)",
  },
  "company-registration-requests": {
    title: "Registrierungsanfragen",
    subtitle: "Homepage-Onboarding: E-Mail-Antwort, Verlauf, Freigabe — nicht der Mandanten-Support",
  },
  "support-inbox": {
    title: "Partner-Anfragen",
    subtitle: "Support-Threads aller Mandanten: lesen, antworten, Status steuern",
  },
  "ride-support": {
    title: "Fahrt-Support",
    subtitle: "Kund*innen-Meldungen je Fahrt mit unveränderbarem Kontext (Snapshot) — Plattform-Bearbeitung, keine E-Mail, kein Chat",
  },
  "app-help": {
    title: "App-Hilfe",
    subtitle: "Allgemeine Anfragen aus dem Hilfe-Tab der Kunden-App (ohne Fahrtbezug)",
  },
  "fleet-vehicles-review": {
    title: "Fahrzeuge prüfen",
    subtitle: "Gesamtsystem: einzureichende Taxi-Fahrzeuge freigeben, ablehnen oder sperren",
  },
  "company-vehicle-requests": {
    title: "Anfragen · Fahrzeuge",
    subtitle: "Taxi-Onboarding: Fahrzeuge mit Konzession und Fahrzeugschein prüfen, aktivieren, Partner antworten",
  },
  "drivers-overview": {
    title: "Fahrerübersicht",
    subtitle: "Alle Taxi-Fahrer der Plattform — suchen, filtern, sperren",
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
    title: "Tagesabrechnung Fahrer",
    subtitle: "Brutto, ONRODA-Provision und Fahrer-Auszahlung pro Tag.",
  },
  "users-admin": {
    title: "Admin-Zugänge",
    subtitle: "Plattform-Administratoren und Konsole-Rollen",
  },
  "users-panel": {
    title: "Partner-Zugänge",
    subtitle:
      "Zugänge zum Partner-Portal je Mandant — manuell anlegen, optional Nachweis hochladen und Einladungs-E-Mail mit Startpasswort (SMTP wie Partner-Freigabe)",
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
  "legal-pages": {
    title: "Rechtstexte",
    subtitle: "AGB, Datenschutz und Impressum für onroda.de — ohne Code-Deploy bearbeiten",
  },
  "visitor-analytics": {
    title: "Besucherstatistik",
    subtitle: "Anonyme Nutzung der Marketing-Homepage — ohne IP, DSGVO-freundlich vorbereitet",
  },
  "fail2ban": {
    title: "Firewall & Gesperrte IPs",
    subtitle: "Fail2Ban — gesperrte IPs einsehen und manuell entsperren oder sperren",
  },
  "server-status": {
    title: "Server-Status",
    subtitle: "CPU, RAM, Netzwerk, PostgreSQL, PM2 und Live-Kennzahlen der Plattform",
  },
  "customer-accounts": {
    title: "Kundenkonten (App)",
    subtitle: "Registrierte Endkunden per E-Mail und Passwort",
  },
  "app-news": {
    title: "App-Neuigkeiten",
    subtitle: "Dynamische Meldungen in der Kunden-App (Startseite), ohne App-Update",
  },
  "app-faq": {
    title: "App-FAQ",
    subtitle: "Häufige Fragen im Hilfe-Screen der Kunden-App — ohne App-Update",
  },
  "app-sponsors": {
    title: "Exklusive Angebote",
    subtitle: "Eigenständiger Werbe-/Partnerbereich für Mobile ohne App-Update",
  },
  "app-driver-messages": {
    title: "Fahrer-Nachrichten",
    subtitle: "Push und In-App-Nachrichten an alle oder einzelne Fahrer",
  },
  "partner-messages": {
    title: "Nachrichten an Partner",
    subtitle: "Einweg-Posteingang für Hotel- und Partner-Mandanten (Web + Mobile)",
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
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [loginRevealed, setLoginRevealed] = useState(false);
  const spacePressCountRef = useRef(0);
  const spaceResetTimerRef = useRef(0);
  const [ridesInitialDetailId, setRidesInitialDetailId] = useState(null);
  /** Volle Fahrtakte-Seite (Ziel: ride_events + Audit). */
  const [rideRecordId, setRideRecordId] = useState(null);
  const [companiesInitialOpenId, setCompaniesInitialOpenId] = useState(null);
  const [companiesListTab, setCompaniesListTab] = useState("all");
  const [mandateDetailCompanyId, setMandateDetailCompanyId] = useState(null);
  const [taxiFleetSeedCompanyId, setTaxiFleetSeedCompanyId] = useState(null);
  /** Mandant für „Partner-Zugänge“ aus Mandantenverwaltung / -zentrale (Deep-Link in PanelUsersPage). */
  const [panelUsersSeedCompanyId, setPanelUsersSeedCompanyId] = useState(null);
  /** Nach Zurück von der Zentrale: Zeile in der Mandantenliste für Voll-Workspace (`CompanyWorkspaceForm`) aufklappen. */
  const [companiesExpandWorkspaceCompanyId, setCompaniesExpandWorkspaceCompanyId] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [narrowNav, setNarrowNav] = useState(false);
  /** Verhindert pushState-Schleife nach popstate / initialem Hash-Lesen */
  const adminHistorySkipPushRef = useRef(false);
  const adminInitialRouteAppliedRef = useRef(false);

  const current =
    active === "companies" && mandateDetailCompanyId
      ? {
          title: "Mandantenzentrale",
          subtitle: "Stammdaten, Kennzahlen, Fahrten und Plattform-Verlauf (lesend).",
        }
      : active === "ride-detail" && rideRecordId
        ? { title: "Fahrtakte", subtitle: `Fahrt ${rideRecordId}` }
        : PAGE_META[active] || PAGE_META.dashboard;
  const userRole = authUser?.role ?? "admin";

  const routeSetters = useMemo(
    () => ({
      setActive,
      setRideRecordId,
      setMandateDetailCompanyId,
      setCompaniesListTab,
      setCompaniesExpandWorkspaceCompanyId,
      setCompaniesInitialOpenId,
      setPanelUsersSeedCompanyId,
      setTaxiFleetSeedCompanyId,
    }),
    [],
  );

  const syncAdminHistoryPush = useCallback(() => {
    if (typeof window === "undefined" || !authUser) return;
    const hash = buildAdminAppHash({
      active,
      rideRecordId,
      mandateDetailCompanyId,
      companiesListTab,
      panelUsersSeedCompanyId,
      taxiFleetSeedCompanyId,
      companiesExpandWorkspaceCompanyId,
    });
    if (window.location.hash === hash) return;
    window.history.pushState({ adminApp: 1 }, "", adminAppHistoryHref(hash));
  }, [
    authUser,
    active,
    rideRecordId,
    mandateDetailCompanyId,
    companiesListTab,
    panelUsersSeedCompanyId,
    taxiFleetSeedCompanyId,
    companiesExpandWorkspaceCompanyId,
  ]);

  const applyRouteFromBrowser = useCallback(
    (hash) => {
      adminHistorySkipPushRef.current = true;
      applyAdminAppRoute(parseAdminAppHash(hash, userRole), routeSetters);
    },
    [userRole, routeSetters],
  );

  const onLogout = useCallback(() => {
    setAdminSessionToken("");
    setAuthUser(null);
    setLoginRevealed(false);
    adminInitialRouteAppliedRef.current = false;
    spacePressCountRef.current = 0;
    if (spaceResetTimerRef.current) {
      window.clearTimeout(spaceResetTimerRef.current);
      spaceResetTimerRef.current = 0;
    }
    setActive("dashboard");
    setMandateDetailCompanyId(null);
    setCompaniesExpandWorkspaceCompanyId(null);
    setRideRecordId(null);
    setPanelUsersSeedCompanyId(null);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  const clearTaxiFleetSeedCompanyId = useCallback(() => setTaxiFleetSeedCompanyId(null), []);
  const clearPanelUsersSeedCompanyId = useCallback(() => setPanelUsersSeedCompanyId(null), []);

  const handlePickPage = useCallback(
    (pageKey, opt) => {
      if (!isAdminPageAllowed(pageKey, userRole)) return;
      if (pageKey === "companies") {
        setCompaniesListTab(opt?.companiesTab != null && opt.companiesTab !== "" ? opt.companiesTab : "all");
        setMandateDetailCompanyId(null);
        setCompaniesExpandWorkspaceCompanyId(null);
      }
      if (pageKey === "taxi-fleet-drivers" || pageKey === "taxi-fleet-vehicles") {
        setTaxiFleetSeedCompanyId(null);
      }
      if (pageKey !== "ride-detail") setRideRecordId(null);
      if (pageKey === "users-panel") setPanelUsersSeedCompanyId(null);
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
    if (
      mandateDetailCompanyId &&
      !isAdminPageAllowed("companies", authUser.role)
    ) {
      setMandateDetailCompanyId(null);
    }
    if (!isAdminPageAllowed(active, authUser.role)) {
      setActive(firstAllowedAdminPage(authUser.role));
    }
  }, [authUser?.role, active, authUser, mandateDetailCompanyId]);

  /** Mandanten-Deep-Link: Inhalt nur unter Seite „companies“ — sonst leerer Hauptbereich. */
  useEffect(() => {
    if (authBooting || !authUser) return;
    if (
      mandateDetailCompanyId &&
      active !== "companies" &&
      isAdminPageAllowed("companies", authUser.role)
    ) {
      setActive("companies");
    }
  }, [authBooting, authUser, mandateDetailCompanyId, active]);

  /** Erster Login / Reload: Hash lesen oder Dashboard in History setzen */
  useEffect(() => {
    if (authBooting || !authUser) return;
    if (adminInitialRouteAppliedRef.current) return;
    adminInitialRouteAppliedRef.current = true;
    const hash = window.location.hash;
    if (hash && hash !== "#") {
      applyRouteFromBrowser(hash);
    } else {
      const fallback = buildAdminAppHash({
        active: firstAllowedAdminPage(authUser.role) || "dashboard",
        companiesListTab: "all",
      });
      adminHistorySkipPushRef.current = true;
      window.history.replaceState({ adminApp: 1 }, "", adminAppHistoryHref(fallback));
      applyRouteFromBrowser(fallback);
    }
  }, [authBooting, authUser, applyRouteFromBrowser]);

  /** Interne Navigation → History-Eintrag (Browser-Zurück) */
  useEffect(() => {
    if (!authUser || authBooting) return;
    if (adminHistorySkipPushRef.current) {
      adminHistorySkipPushRef.current = false;
      return;
    }
    syncAdminHistoryPush();
  }, [authUser, authBooting, syncAdminHistoryPush]);

  /** Browser Zurück / Vorwärts */
  useEffect(() => {
    if (!authUser) return undefined;
    const onPopState = () => {
      applyRouteFromBrowser(window.location.hash);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [authUser, applyRouteFromBrowser]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/auth/me`, { headers: adminApiHeaders() });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && data?.ok && data?.user && data?.authKind === "session") {
          if (data.user.username === "api_bearer") {
            setAdminSessionToken("");
            setAuthUser(null);
          } else {
            setAuthUser(data.user);
          }
        } else if (!cancelled && (res.status === 401 || res.status === 403)) {
          setAdminSessionToken("");
          if (data?.error === "session_required" && import.meta.env.DEV) {
            console.warn("[admin] /auth/me: session_required", data);
          }
        }
      } finally {
        if (!cancelled) setAuthBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authBooting) return undefined;
    if (authUser) return undefined;
    if (isAdminPasswordResetPath()) return undefined;
    const onKeyDown = (event) => {
      if (event.code !== "Space") return;
      if (event.repeat) return;
      const next = spacePressCountRef.current + 1;
      if (next >= 2) {
        setLoginRevealed(true);
        spacePressCountRef.current = 0;
        if (spaceResetTimerRef.current) {
          window.clearTimeout(spaceResetTimerRef.current);
          spaceResetTimerRef.current = 0;
        }
        return;
      }
      spacePressCountRef.current = next;
      if (spaceResetTimerRef.current) {
        window.clearTimeout(spaceResetTimerRef.current);
      }
      spaceResetTimerRef.current = window.setTimeout(() => {
        spacePressCountRef.current = 0;
        spaceResetTimerRef.current = 0;
      }, 10_000);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (spaceResetTimerRef.current) {
        window.clearTimeout(spaceResetTimerRef.current);
        spaceResetTimerRef.current = 0;
      }
    };
  }, [authBooting, authUser]);

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
      if (!getAdminSessionToken()) {
        setAuthError("Ungültiges Admin-Token — bitte erneut anmelden.");
        return;
      }
      setAuthUser(data.user ?? null);
      setAuthForm({ username: "", password: "" });
      adminInitialRouteAppliedRef.current = false;
      const role = data.user?.role ?? "admin";
      const hash = buildAdminAppHash({
        active: firstAllowedAdminPage(role) || "dashboard",
        companiesListTab: "all",
      });
      adminHistorySkipPushRef.current = true;
      window.history.replaceState({ adminApp: 1 }, "", adminAppHistoryHref(hash));
    } catch {
      setAuthError("Login fehlgeschlagen.");
    } finally {
      setAuthLoading(false);
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
            onNavigate={(pageKey) => handlePickPage(pageKey)}
            onOpenRide={(id) => {
              setRideRecordId(id);
              setActive("ride-detail");
            }}
            onOpenCompany={(id) => {
              setCompaniesInitialOpenId(id);
              setMandateDetailCompanyId(null);
              setActive("companies");
            }}
          />
        );
      case "ride-detail": {
        const can = isAdminPageAllowed("ride-detail", userRole) && isAdminPageAllowed("rides", userRole);
        if (!can) {
          return <AdminPlaceholderPage title="Kein Zugriff" intro="Diese Seite ist für Ihre Rolle nicht freigeschaltet." bullets={[]} />;
        }
        return (
          <RideDetailPage
            rideId={rideRecordId}
            onBack={() => {
              setRideRecordId(null);
              setActive("rides");
            }}
          />
        );
      }
      case "rides":
        return (
          <RidesPage
            initialDetailRideId={ridesInitialDetailId}
            onInitialDetailRideConsumed={() => setRidesInitialDetailId(null)}
            onOpenRideRecord={(id) => {
              setRideRecordId(id);
              setActive("ride-detail");
            }}
            userRole={userRole}
          />
        );
      case "companies":
        return (
          <CompaniesPage
            userRole={userRole}
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
            onNavigateToTaxiFleetDrivers={(cid) => {
              setTaxiFleetSeedCompanyId(cid);
              setMandateDetailCompanyId(null);
              setActive("taxi-fleet-drivers");
            }}
            onNavigateToTaxiFleetVehicles={(cid) => {
              setTaxiFleetSeedCompanyId(cid);
              setMandateDetailCompanyId(null);
              setActive("taxi-fleet-vehicles");
            }}
            onOpenPanelUsersForCompany={
              isAdminPageAllowed("users-panel", userRole)
                ? (cid) => {
                    setPanelUsersSeedCompanyId(cid);
                    setMandateDetailCompanyId(null);
                    setActive("users-panel");
                  }
                : undefined
            }
          />
        );
      case "taxi-fleet-drivers":
        return (
          <TaxiFleetDriversPage
            initialCompanyId={taxiFleetSeedCompanyId}
            onInitialCompanyConsumed={clearTaxiFleetSeedCompanyId}
          />
        );
      case "drivers-overview":
        return <DriversOverviewPage userRole={userRole} />;
      case "drivers-revenue":
        return <DriversRevenuePage />;
      case "taxi-fleet-vehicles":
        return (
          <TaxiFleetVehiclesPage
            initialCompanyId={taxiFleetSeedCompanyId}
            onInitialCompanyConsumed={clearTaxiFleetSeedCompanyId}
          />
        );
      case "support-inbox":
        return <SupportInboxPage />;
      case "ride-support":
        return <RideSupportTicketsPage />;
      case "app-help":
        return <AppHelpTicketsPage />;
      case "fleet-vehicles-review":
        return <FleetVehiclesReviewPage />;
      case "company-vehicle-requests":
        return (
          <CompanyVehicleRequestsPage
            onOpenCompany={(id) => {
              setCompaniesInitialOpenId(id);
              setActive("companies");
            }}
          />
        );
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
        return (
          <PanelUsersPage
            initialCompanyId={panelUsersSeedCompanyId}
            onInitialCompanyConsumed={clearPanelUsersSeedCompanyId}
          />
        );
      case "fares":
        return <FaresPage />;
      case "access-codes":
        return <AccessCodesPage />;
      case "homepage-placeholders":
        return <HomepagePlaceholdersPage />;
      case "homepage-content":
        return <HomepageContentPage />;
      case "legal-pages":
        return <LegalPagesPage />;
      case "visitor-analytics":
        return <VisitorAnalyticsPage />;
      case "fail2ban":
        return <Fail2BanPage />;
      case "server-status":
        return <ServerStatusPage />;
      case "customer-accounts":
        return <CustomerAccountsPage />;
      case "customers":
        return <CustomersPage />;
      case "app-news":
        return <AppNewsPage />;
      case "app-faq":
        return <AppFaqPage />;
      case "app-sponsors":
        return <AppSponsorsPage />;
      case "app-driver-messages":
        return <DriverMessagesPage />;
      case "partner-messages":
        return <PartnerMessagesPage />;
      case "app-op-tariffs":
        return <AppOperationalTariffsPage />;
      case "app-op-regions":
        return <AppOperationalRegionsPage />;
      case "app-op-commission":
        return <AppOperationalCommissionPage />;
      case "app-op-dispatch":
        return <AppOperationalDispatchPage />;
      case "app-op-features":
        return <AppOperationalFeaturesPage />;
      case "app-op-driver-rules":
        return <AppOperationalDriverRulesPage />;
      case "app-op-booking-rules":
        return <AppOperationalBookingRulesPage />;
      case "app-op-system":
        return <AppOperationalSystemPage />;
      case "finance-dashboard":
        return <FinanceDashboardPage />;
      case "finance-ride-financials":
        return <FinanceRideFinancialsPage />;
      case "finance-payout-lines":
        return <FinancePayoutLinesPage />;
      case "billing-open":
        return (
          <FailedPaymentsPage
            onOpenRide={(id) => {
              setRideRecordId(id);
              setActive("ride-detail");
            }}
          />
        );
      case "finance-invoices":
        return <FinanceInvoicesPage />;
      case "finance-kranken-invoices":
        return <FinanceKrankenInvoicesPage />;
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
            onNavigate={(pageKey) => handlePickPage(pageKey)}
            onOpenRide={(id) => {
              setRideRecordId(id);
              setActive("ride-detail");
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

  if (authBooting || !authUser) {
    if (authBooting) {
      return <div className="admin-gate-blank" aria-hidden="true" />;
    }
    if (isAdminPasswordResetPath()) {
      return <AdminPasswordResetPage />;
    }
    if (
      typeof window !== "undefined" &&
      !loginRevealed &&
      !shouldShowAdminLoginUnauthenticated(window.location.hash)
    ) {
      return <div className="admin-gate-blank" aria-hidden="true" />;
    }
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
