import { useMemo } from "react";
import { usePanelAuth } from "./context/PanelAuthContext.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import TaxiMasterPanel from "./components/TaxiMasterPanel.jsx";
import AgenturMasterPanel from "./components/AgenturMasterPanel.jsx";
import KasseMasterPanel from "./components/KasseMasterPanel.jsx";

export default function App() {
  const { user, booting, logout } = usePanelAuth();

  if (booting) {
    return <div style={{ padding: "20px" }}>System startet...</div>;
  }

  if (!user) {
    return <LoginPage />;
  }

  const company = useMemo(() => {
    const nestedCompany = user?.company;
    if (nestedCompany && typeof nestedCompany === "object") {
      return nestedCompany;
    }

    return {
      id: user?.companyId ?? "",
      name: user?.companyName ?? "",
      company_kind: user?.companyKind ?? "",
    };
  }, [user]);

  const kind = company?.company_kind;

  if (kind === "taxi") {
    return <TaxiMasterPanel company={company} onLogout={logout} />;
  }

  if (kind === "hotel" || kind === "agency" || kind === "travel") {
    return <AgenturMasterPanel company={company} onLogout={logout} />;
  }

  if (kind === "insurer" || kind === "medical") {
    return <KasseMasterPanel company={company} onLogout={logout} />;
  }

  return (
    <div style={{ padding: "40px", textAlign: "center", fontFamily: "sans-serif" }}>
      <h1>Willkommen bei Onroda!</h1>
      <p>Portal-Typ nicht erkannt.</p>
      <pre
        style={{
          marginTop: "16px",
          padding: "12px",
          textAlign: "left",
          background: "#f5f5f5",
          borderRadius: "8px",
          overflow: "auto",
        }}
      >
        {JSON.stringify(
          {
            username: user?.username,
            companyId: user?.companyId,
            companyName: user?.companyName,
            companyKind: user?.companyKind,
            company,
          },
          null,
          2,
        )}
      </pre>
      <button onClick={logout} style={{ padding: "10px", cursor: "pointer", marginTop: "16px" }}>
        Abmelden
      </button>
    </div>
  );
}
