import { useCallback, useEffect, useMemo, useState } from "react";
import TaxiMasterPanel from "../components/TaxiMasterPanel.jsx";
import FleetPage from "../pages/FleetPage.jsx";
import TeamPage from "../pages/TeamPage.jsx";
import HelpPage from "../pages/HelpPage.jsx";
import TaxiStammdatenPage from "../pages/taxi/TaxiStammdatenPage.jsx";
import TaxiDocumentsPage from "../pages/taxi/TaxiDocumentsPage.jsx";
import PartnerRidesListPage from "../pages/PartnerRidesListPage.jsx";
import BillingPage from "../pages/BillingPage.jsx";
import RideCreatePage from "../pages/RideCreatePage.jsx";
import MedicalRoundTripPage from "../pages/MedicalRoundTripPage.jsx";
import AccessCodesPage from "../pages/AccessCodesPage.jsx";
import SupportShell from "../support/SupportShell.jsx";
import { hasPanelModule } from "../lib/panelNavigation.js";
import GlobalCreateMenu from "./GlobalCreateMenu.jsx";
import TaxiUserMenu from "./TaxiUserMenu.jsx";

function hasPerm(user, key) {
  return Array.isArray(user?.permissions) && user.permissions.includes(key);
}

/** Zusätzliche Ansichten ohne eigenen Haupteintrag (Plus-Menü, Profil-Menü, Deep-Link). */
const EXTRA_ROUTE_KEYS = new Set(["benutzer", "ride_neu", "medical_ride", "access_codes_hub"]);

/** Hauptnavigation — Reihenfolge wie Produktvorgabe (Bolt-Fleet-Philosophie, eigenes ONRODA-Branding). */
const TAXI_NAV_DEFS = [
  { key: "dashboard", label: "Dashboard", show: () => true },
  {
    key: "fahrten",
    label: "Fahrten",
    show: (user) => hasPanelModule(user?.panelModules, "rides_list") && hasPerm(user, "rides.read"),
  },
  {
    key: "flotte",
    label: "Flotte",
    show: (user) => hasPanelModule(user?.panelModules, "taxi_fleet") && hasPerm(user, "fleet.read"),
  },
  {
    key: "finanzen",
    label: "Finanzen",
    show: (user) => hasPanelModule(user?.panelModules, "billing") && hasPerm(user, "rides.read"),
  },
  {
    key: "dokumente",
    label: "Dokumente",
    show: (user) => hasPanelModule(user?.panelModules, "taxi_fleet") && hasPerm(user, "fleet.read"),
  },
  {
    key: "einstellungen",
    label: "Einstellungen",
    show: (user) => hasPanelModule(user?.panelModules, "company_profile") && hasPerm(user, "company.update"),
  },
];

export default function TaxiEntrepreneurShell({ user, company, onLogout }) {
  const [activeTaxiModule, setActiveTaxiModule] = useState("dashboard");
  const [supportPrefill, setSupportPrefill] = useState(null);
  /** Tab + optional Fokus auf Anlege-Bereich (Plus-Menü). */
  const [fleetIntent, setFleetIntent] = useState(null);

  const consumeFleetIntent = useCallback(() => setFleetIntent(null), []);

  const openSupportDraft = useMemo(() => {
    if (!hasPanelModule(user?.panelModules, "support") || !hasPerm(user, "support.write")) return undefined;
    return (draft) => {
      setSupportPrefill(draft);
      setActiveTaxiModule("anfragen");
    };
  }, [user]);

  const visibleNav = useMemo(() => TAXI_NAV_DEFS.filter((d) => d.show(user)), [user]);

  /** Alle definierten Bereiche (auch ohne Nav-Sichtbarkeit), damit Dashboard-CTAs / Deep-Links nicht zurückspringen. */
  const routeKeys = useMemo(() => {
    const s = new Set(EXTRA_ROUTE_KEYS);
    for (const d of TAXI_NAV_DEFS) s.add(d.key);
    s.add("anfragen");
    s.add("hilfe");
    return s;
  }, []);

  /** Ermöglicht `?taxiModule=…` für Tests; unterstützt Legacy `stammdaten` → Einstellungen. */
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      let m = u.searchParams.get("taxiModule");
      if (m === "stammdaten") m = "einstellungen";
      if (m && routeKeys.has(m)) {
        setActiveTaxiModule(m);
        u.searchParams.delete("taxiModule");
        const next = `${u.pathname}${u.search}${u.hash}`;
        window.history.replaceState({}, "", next || u.pathname);
      }
    } catch {
      /* ignore */
    }
  }, [routeKeys]);

  useEffect(() => {
    if (!routeKeys.has(activeTaxiModule)) {
      setActiveTaxiModule("dashboard");
    }
  }, [routeKeys, activeTaxiModule]);

  const userMenuLinks = useMemo(() => {
    /** @type {{ key: string; label: string; onSelect: () => void }[]} */
    const links = [];
    if (hasPanelModule(user?.panelModules, "team") && hasPerm(user, "users.read")) {
      links.push({
        key: "team",
        label: "Benutzer & Rollen",
        onSelect: () => setActiveTaxiModule("benutzer"),
      });
    }
    if (hasPanelModule(user?.panelModules, "support") && hasPerm(user, "support.read")) {
      links.push({
        key: "anfragen",
        label: "Anfragen & Support",
        onSelect: () => setActiveTaxiModule("anfragen"),
      });
    }
    if (hasPanelModule(user?.panelModules, "help")) {
      links.push({
        key: "hilfe",
        label: "Hilfe",
        onSelect: () => setActiveTaxiModule("hilfe"),
      });
    }
    return links;
  }, [user]);

  const onGlobalCreateAction = useCallback((id) => {
    switch (id) {
      case "add_driver":
        setFleetIntent({ tab: "drivers", focus: "driver" });
        setActiveTaxiModule("flotte");
        break;
      case "add_vehicle":
        setFleetIntent({ tab: "vehicles", focus: "vehicle" });
        setActiveTaxiModule("flotte");
        break;
      case "create_ride":
        setActiveTaxiModule("ride_neu");
        break;
      case "create_medical_round":
        setActiveTaxiModule("medical_ride");
        break;
      case "create_voucher_code":
        setActiveTaxiModule("access_codes_hub");
        break;
      case "add_staff":
        setActiveTaxiModule("benutzer");
        break;
      default:
        break;
    }
  }, []);

  return (
    <div className="partner-shell partner-shell--fleet">
      <header className="partner-shell__header partner-shell__header--fleet">
        <div className="partner-shell__header-inner">
          <div className="partner-shell__brand-cluster">
            <a
              className="partner-shell__logo-wordmark"
              href="https://onroda.de"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="ONRODA – zur Website"
            >
              ONRODA
            </a>
            {company?.name ? (
              <span className="partner-shell__company-chip" title={company.name}>
                {company.name}
              </span>
            ) : null}
          </div>

          <nav className="partner-shell__nav partner-shell__nav--fleet" aria-label="Hauptbereiche">
            {visibleNav.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setActiveTaxiModule(m.key)}
                className={
                  activeTaxiModule === m.key
                    ? "partner-shell__nav-link partner-shell__nav-link--active"
                    : "partner-shell__nav-link"
                }
              >
                {m.label}
              </button>
            ))}
          </nav>

          <div className="partner-shell__header-actions">
            <GlobalCreateMenu user={user} onSelectAction={onGlobalCreateAction} />
            <TaxiUserMenu user={user} onLogout={onLogout} links={userMenuLinks} />
          </div>
        </div>
      </header>

      <div className="partner-shell__body partner-shell__body--fleet">
        {activeTaxiModule === "dashboard" && (
          <TaxiMasterPanel company={company} onNavigateModule={(key) => setActiveTaxiModule(key)} />
        )}
        {activeTaxiModule === "fahrten" && <PartnerRidesListPage />}
        {activeTaxiModule === "flotte" && (
          <FleetPage fleetIntent={fleetIntent} onFleetIntentConsumed={consumeFleetIntent} />
        )}
        {activeTaxiModule === "finanzen" && <BillingPage />}
        {activeTaxiModule === "dokumente" && <TaxiDocumentsPage onOpenDocumentSupportRequest={openSupportDraft} />}
        {activeTaxiModule === "einstellungen" && (
          <TaxiStammdatenPage
            onOpenStammSupportRequest={openSupportDraft}
            onOpenDocumentSupportRequest={openSupportDraft}
            onNavigateToDocuments={() => setActiveTaxiModule("dokumente")}
          />
        )}
        {activeTaxiModule === "ride_neu" && <RideCreatePage />}
        {activeTaxiModule === "medical_ride" && <MedicalRoundTripPage />}
        {activeTaxiModule === "access_codes_hub" && <AccessCodesPage />}
        {activeTaxiModule === "anfragen" && (
          <SupportShell supportPrefill={supportPrefill} onClearSupportPrefill={() => setSupportPrefill(null)} />
        )}
        {activeTaxiModule === "hilfe" && (
          <HelpPage
            onCreateRequest={() => {
              setSupportPrefill({
                category: "help",
                title: "Hilfe: Allgemeine Frage",
                body: "",
              });
              setActiveTaxiModule("anfragen");
            }}
          />
        )}
        {activeTaxiModule === "benutzer" && (
          <TeamPage
            pageTitle="Benutzer & Rollen"
            pageLead="Zugänge nur für Ihren Mandanten: anlegen, Rolle setzen, sperren oder Passwort zurücksetzen."
          />
        )}
      </div>
    </div>
  );
}
