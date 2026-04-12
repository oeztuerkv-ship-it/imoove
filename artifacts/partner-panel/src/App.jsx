import { useState } from "react";
import { usePanelAuth } from "./context/PanelAuthContext.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import PanelShell from "./layout/PanelShell.jsx";

export default function App() {
  const { user, booting, logout } = usePanelAuth();
  const [active, setActive] = useState("overview");

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

  return <PanelShell active={active} onChange={setActive} user={user} onLogout={logout} />;
}
