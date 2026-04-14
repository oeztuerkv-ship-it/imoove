import { useEffect, useMemo, useState } from "react";
import { usePanelAuth } from "./context/PanelAuthContext.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import PanelShell from "./layout/PanelShell.jsx";
import { filterNavItems, firstNavKey } from "./lib/panelNavigation.js";

export default function App() {
  const { user, booting, logout } = usePanelAuth();
  const [active, setActive] = useState("overview");

  const navItems = useMemo(
    () => filterNavItems(user?.panelModules, user?.permissions),
    [user?.panelModules, user?.permissions],
  );

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
