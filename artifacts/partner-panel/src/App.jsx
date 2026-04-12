import { useEffect, useMemo, useState } from "react";
import { usePanelAuth } from "./context/PanelAuthContext.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import PanelShell from "./layout/PanelShell.jsx";
import { filterNavItems, firstNavKey } from "./lib/panelNavigation.js";

export default function App() {
  const { user, booting, logout } = usePanelAuth();
  const [active, setActive] = useState("overview");

  const navItems = useMemo(() => filterNavItems(user?.panelModules), [user?.panelModules]);

  useEffect(() => {
    if (!user) return;
    const allowed = new Set(navItems.map((i) => i.key));
    if (allowed.size === 0) return;
    if (!allowed.has(active)) {
      const next = firstNavKey(user.panelModules);
      if (next) setActive(next);
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
