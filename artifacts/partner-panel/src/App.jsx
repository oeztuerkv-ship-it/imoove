import { useEffect, useMemo, useRef, useState } from "react";
import { usePanelAuth } from "./context/PanelAuthContext.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import PanelShell from "./layout/PanelShell.jsx";
import { filterNavItems, firstNavKey } from "./lib/panelNavigation.js";

export default function App() {
  const { user, booting, logout } = usePanelAuth();
  const [active, setActive] = useState("overview");
  const INACTIVITY_MS = 10 * 60 * 1000;

  const navItems = useMemo(
    () => filterNavItems(user?.panelModules, user?.permissions),
    [user?.panelModules, user?.permissions],
  );

  const hasFleetRedirectRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    let timer = window.setTimeout(() => {
      void logout();
      window.alert("Sie wurden nach 10 Minuten Inaktivität automatisch abgemeldet.");
    }, INACTIVITY_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void logout();
        window.alert("Sie wurden nach 10 Minuten Inaktivität automatisch abgemeldet.");
      }, INACTIVITY_MS);
    };
    const events = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [user, logout]);

  useEffect(() => {
    if (!user) return;
    /** Pflicht-Passwortwechsel: immer Einstellungen — nicht mit „nur erlaubte Module“ verdrängen (sonst Ping-Pong, wenn z. B. `company_profile` nicht in `panel_modules` ist). */
    if (user.mustChangePassword) {
      if (active !== "settings") {
        queueMicrotask(() => setActive("settings"));
      }
      return;
    }
    const allowed = new Set(navItems.map((i) => i.key));
    if (allowed.size === 0) return;
    if (!allowed.has(active)) {
      const next = firstNavKey(user.panelModules, user.permissions);
      if (next) queueMicrotask(() => setActive(next));
    }
  }, [user, navItems, active]);

  useEffect(() => {
    if (!user || user.mustChangePassword) return;
    if (user.companyKind !== "taxi") return;
    if (hasFleetRedirectRef.current) return;
    if (active === "fleet") return;
    if (!navItems.some((i) => i.key === "fleet")) return;
    queueMicrotask(() => {
      setActive("fleet");
      hasFleetRedirectRef.current = true;
    });
  }, [user, active, navItems]);

  if (booting) {
    return (
      <div className="partner-login partner-login--boot">
        <p className="partner-login__lead">Sitzung wird geladen …</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (navItems.length === 0) {
    return (
      <div className="partner-login partner-login--boot">
        <p className="partner-login__lead">
          Für Ihr Unternehmen sind keine Panel-Module freigeschaltet. Bitte wenden Sie sich an die Onroda-Zentrale.
        </p>
        <button type="button" className="panel-app__session-out" onClick={() => void logout()}>
          Abmelden
        </button>
      </div>
    );
  }

  return (
    <PanelShell
      active={active}
      onChange={setActive}
      user={user}
      onLogout={logout}
      navItems={navItems}
    />
  );
}
