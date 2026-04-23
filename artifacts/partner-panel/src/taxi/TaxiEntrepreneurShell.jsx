import { useState } from "react";
import TaxiMasterPanel from "../components/TaxiMasterPanel.jsx";
import FleetPage from "../pages/FleetPage.jsx";
import TaxiStammdatenPage from "../pages/taxi/TaxiStammdatenPage.jsx";
import TaxiDocumentsPage from "../pages/taxi/TaxiDocumentsPage.jsx";

const MODULES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "stammdaten", label: "Stammdaten" },
  { key: "flotte", label: "Flotte" },
  { key: "dokumente", label: "Dokumente" },
];

/**
 * Top-Level-Einstieg für Taxi-Unternehmer: horizontale Modul-Navigation (eine Leiste),
 * kein zweites linkes Menü — das read-only-Dashboard (TaxiMasterPanel) behält seine eigene Sidebar.
 */
export default function TaxiEntrepreneurShell({ company, onLogout }) {
  const [activeTaxiModule, setActiveTaxiModule] = useState("dashboard");

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#f3f4f6",
      }}
    >
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          borderBottom: "1px solid #e5e7eb",
          background: "#ffffff",
        }}
      >
        <span
          style={{
            fontWeight: 800,
            fontSize: 14,
            color: "#111827",
            marginRight: 12,
            letterSpacing: 0.02,
          }}
        >
          Taxi
        </span>
        <nav style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, flex: 1 }}>
          {MODULES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setActiveTaxiModule(m.key)}
              style={{
                padding: "8px 14px",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 14,
                background: activeTaxiModule === m.key ? "#111827" : "#ffffff",
                color: activeTaxiModule === m.key ? "#ffffff" : "#1f2937",
              }}
            >
              {m.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={onLogout}
          style={{
            padding: "8px 14px",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 700,
            background: "#e5e7eb",
            color: "#111827",
          }}
        >
          Abmelden
        </button>
      </header>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {activeTaxiModule === "dashboard" && <TaxiMasterPanel company={company} onLogout={onLogout} />}
        {activeTaxiModule === "stammdaten" && <TaxiStammdatenPage />}
        {activeTaxiModule === "flotte" && <FleetPage />}
        {activeTaxiModule === "dokumente" && <TaxiDocumentsPage />}
      </div>
    </div>
  );
}
