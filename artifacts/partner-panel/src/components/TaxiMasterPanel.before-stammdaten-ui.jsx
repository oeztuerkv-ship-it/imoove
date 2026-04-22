import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";

const STORAGE_KEY = "onrodaPanelJwt";

function getPanelHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : "";
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function money(value) {
  const n = Number(value || 0);
  return `${n.toFixed(2)} €`;
}

export default function TaxiMasterPanel({ company, onLogout }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [companyData, setCompanyData] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setLoading(true);
      setError("");

      try {
        const [companyRes, metricsRes, driversRes, vehiclesRes] = await Promise.all([
          fetch(`${API_BASE}/panel/v1/company`, { headers: getPanelHeaders() }),
          fetch(`${API_BASE}/panel/v1/overview/metrics`, { headers: getPanelHeaders() }),
          fetch(`${API_BASE}/panel/v1/fleet/drivers`, { headers: getPanelHeaders() }),
          fetch(`${API_BASE}/panel/v1/fleet/vehicles`, { headers: getPanelHeaders() }),
        ]);

        const [companyJson, metricsJson, driversJson, vehiclesJson] = await Promise.all([
          companyRes.json().catch(() => ({})),
          metricsRes.json().catch(() => ({})),
          driversRes.json().catch(() => ({})),
          vehiclesRes.json().catch(() => ({})),
        ]);

        if (cancelled) return;

        if (!companyRes.ok || !companyJson?.ok) {
          throw new Error("Firmendaten konnten nicht geladen werden.");
        }
        if (!metricsRes.ok || !metricsJson?.ok) {
          throw new Error("Dashboard-Daten konnten nicht geladen werden.");
        }
        if (!driversRes.ok || !driversJson?.ok) {
          throw new Error("Fahrerdaten konnten nicht geladen werden.");
        }
        if (!vehiclesRes.ok || !vehiclesJson?.ok) {
          throw new Error("Fahrzeugdaten konnten nicht geladen werden.");
        }

        setCompanyData(companyJson.company || null);
        setMetrics(metricsJson.metrics || null);
        setDrivers(Array.isArray(driversJson.drivers) ? driversJson.drivers : []);
        setVehicles(Array.isArray(vehiclesJson.vehicles) ? vehiclesJson.vehicles : []);
      } catch (err) {
        setError(err?.message || "Panel-Daten konnten nicht geladen werden.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadAll();

    return () => {
      cancelled = true;
    };
  }, []);

  const currentCompany = companyData || company || {};
  const activeDrivers = useMemo(
    () => drivers.filter((d) => d?.isActive && d?.accessStatus === "active").length,
    [drivers],
  );
  const activeVehicles = useMemo(
    () => vehicles.filter((v) => v?.isActive).length,
    [vehicles],
  );

  const menuItems = [
    { key: "dashboard", label: "Dashboard" },
    { key: "stammdaten", label: "Stammdaten" },
    { key: "fahrer", label: "Fahrer" },
    { key: "fahrzeuge", label: "Fahrzeuge" },
  ];

  const theme = {
    yellow: "#f1c40f",
    black: "#111111",
    border: "#e5e7eb",
    soft: "#f8f9fa",
    white: "#ffffff",
    text: "#1f2937",
    muted: "#6b7280",
  };

  if (loading) {
    return <div style={{ padding: 24 }}>Taxi-Panel lädt…</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Taxi-Panel</h2>
        <p style={{ color: "#b91c1c" }}>{error}</p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        minHeight: "760px",
        background: theme.white,
        border: `1px solid ${theme.border}`,
        borderRadius: 18,
        overflow: "hidden",
      }}
    >
      <aside
        style={{
          width: 240,
          background: theme.black,
          color: theme.white,
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div
          style={{
            color: theme.yellow,
            fontWeight: 800,
            letterSpacing: 0.4,
            fontSize: 18,
            padding: "8px 10px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          TAXI PORTAL
        </div>

        {menuItems.map((item) => (
          <button
            key={item.key}
            onClick={() => setActiveTab(item.key)}
            style={{
              padding: "12px 14px",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              textAlign: "left",
              fontWeight: 700,
              background: activeTab === item.key ? theme.yellow : "transparent",
              color: activeTab === item.key ? theme.black : theme.white,
            }}
          >
            {item.label}
          </button>
        ))}

        <button
          onClick={onLogout}
          style={{
            marginTop: "auto",
            padding: "12px 14px",
            border: "none",
            borderRadius: 10,
            cursor: "pointer",
            fontWeight: 700,
            background: "#262626",
            color: "#fff",
          }}
        >
          Abmelden
        </button>
      </aside>

      <main
        style={{
          flex: 1,
          background: theme.soft,
          color: theme.text,
          padding: 24,
          overflowY: "auto",
        }}
      >
        {activeTab === "dashboard" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <h1 style={{ margin: 0, fontSize: 28 }}>Willkommen, {currentCompany?.name || "Taxi-Unternehmer"}</h1>
              <p style={{ marginTop: 8, color: theme.muted }}>
                Übersicht über Betrieb, Flotte und aktuelle Kennzahlen.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
              <Card title="Offene Fahrten" value={String(metrics?.openRides ?? 0)} />
              <Card title="Geplant heute" value={String(metrics?.scheduled?.todayCount ?? 0)} />
              <Card title="Aktive Fahrer" value={String(activeDrivers)} />
              <Card title="Aktive Fahrzeuge" value={String(activeVehicles)} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, marginTop: 16 }}>
              <Card title="Umsatz heute" value={money(metrics?.today?.revenue)} />
              <Card title="Umsatz Woche" value={money(metrics?.week?.revenue)} />
              <Card title="Umsatz Monat" value={money(metrics?.month?.revenue)} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, marginTop: 20 }}>
              <Section title="Betriebsstatus">
                <InfoRow label="Firmenstatus" value={currentCompany?.contractStatus || "-"} />
                <InfoRow label="Verifizierung" value={currentCompany?.verificationStatus || "-"} />
                <InfoRow label="Compliance" value={currentCompany?.complianceStatus || "-"} />
                <InfoRow label="Firma aktiv" value={currentCompany?.isActive ? "Ja" : "Nein"} />
                <InfoRow label="Firma gesperrt" value={currentCompany?.isBlocked ? "Ja" : "Nein"} />
              </Section>

              <Section title="Vollständigkeit">
                <InfoRow label="Gewerbenachweis" value={currentCompany?.hasComplianceGewerbe ? "Vorhanden" : "Fehlt"} />
                <InfoRow label="Versicherungsnachweis" value={currentCompany?.hasComplianceInsurance ? "Vorhanden" : "Fehlt"} />
                <InfoRow label="Bank-IBAN" value={currentCompany?.bankIban || "Nicht hinterlegt"} />
                <InfoRow label="Konzession" value={currentCompany?.concessionNumber || "Nicht hinterlegt"} />
              </Section>
            </div>
          </div>
        )}

        {activeTab === "stammdaten" && (
          <div>
            <h2>Stammdaten</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Section title="Firma">
                <InfoRow label="Firmenname" value={currentCompany?.name || "-"} />
                <InfoRow label="Unternehmensart" value={currentCompany?.companyKind || "-"} />
                <InfoRow label="Rechtsform" value={currentCompany?.legalForm || "-"} />
                <InfoRow label="Inhaber" value={currentCompany?.ownerName || "-"} />
                <InfoRow label="Konzessionsnummer" value={currentCompany?.concessionNumber || "-"} />
              </Section>

              <Section title="Kontakt">
                <InfoRow label="Ansprechpartner" value={currentCompany?.contactName || "-"} />
                <InfoRow label="E-Mail" value={currentCompany?.email || "-"} />
                <InfoRow label="Telefon" value={currentCompany?.phone || "-"} />
                <InfoRow label="Support E-Mail" value={currentCompany?.supportEmail || "-"} />
                <InfoRow label="Dispo-Telefon" value={currentCompany?.dispoPhone || "-"} />
              </Section>

              <Section title="Adresse">
                <InfoRow label="Straße" value={currentCompany?.addressLine1 || "-"} />
                <InfoRow label="Zusatz" value={currentCompany?.addressLine2 || "-"} />
                <InfoRow label="PLZ" value={currentCompany?.postalCode || "-"} />
                <InfoRow label="Ort" value={currentCompany?.city || "-"} />
                <InfoRow label="Land" value={currentCompany?.country || "-"} />
              </Section>

              <Section title="Abrechnung">
                <InfoRow label="Rechnungsname" value={currentCompany?.billingName || "-"} />
                <InfoRow label="IBAN" value={currentCompany?.bankIban || "-"} />
                <InfoRow label="BIC" value={currentCompany?.bankBic || "-"} />
                <InfoRow label="Kostenstelle" value={currentCompany?.costCenter || "-"} />
                <InfoRow label="USt-ID" value={currentCompany?.vatId || "-"} />
                <InfoRow label="Steuernummer" value={currentCompany?.taxId || "-"} />
              </Section>
            </div>
          </div>
        )}

        {activeTab === "fahrer" && (
          <div>
            <h2>Fahrer</h2>
            <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 14, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f3f4f6", textAlign: "left" }}>
                    <Th>Name</Th>
                    <Th>E-Mail</Th>
                    <Th>Telefon</Th>
                    <Th>Status</Th>
                    <Th>P-Schein bis</Th>
                    <Th>Letzte Aktivität</Th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((driver) => (
                    <tr key={driver.id} style={{ borderTop: `1px solid ${theme.border}` }}>
                      <Td>{driver.firstName} {driver.lastName}</Td>
                      <Td>{driver.email || "-"}</Td>
                      <Td>{driver.phone || "-"}</Td>
                      <Td>{driver.isActive ? driver.accessStatus : "inactive"}</Td>
                      <Td>{driver.pScheinExpiry || "-"}</Td>
                      <Td>{driver.lastHeartbeatAt || driver.lastLoginAt || "-"}</Td>
                    </tr>
                  ))}
                  {!drivers.length && (
                    <tr>
                      <Td colSpan={6}>Keine Fahrer vorhanden.</Td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "fahrzeuge" && (
          <div>
            <h2>Fahrzeuge</h2>
            <div style={{ background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 14, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f3f4f6", textAlign: "left" }}>
                    <Th>Kennzeichen</Th>
                    <Th>Modell</Th>
                    <Th>Farbe</Th>
                    <Th>Ordnungsnummer</Th>
                    <Th>Nächste Prüfung</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((vehicle) => (
                    <tr key={vehicle.id} style={{ borderTop: `1px solid ${theme.border}` }}>
                      <Td>{vehicle.licensePlate || "-"}</Td>
                      <Td>{vehicle.model || "-"}</Td>
                      <Td>{vehicle.color || "-"}</Td>
                      <Td>{vehicle.taxiOrderNumber || "-"}</Td>
                      <Td>{vehicle.nextInspectionDate || "-"}</Td>
                      <Td>{vehicle.isActive ? "aktiv" : "inaktiv"}</Td>
                    </tr>
                  ))}
                  {!vehicles.length && (
                    <tr>
                      <Td colSpan={6}>Keine Fahrzeuge vorhanden.</Td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Card({ title, value }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 18,
      }}
    >
      <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 10 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 18,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>{title}</div>
      <div style={{ display: "grid", gap: 10 }}>{children}</div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "180px 1fr",
        gap: 12,
        alignItems: "start",
      }}
    >
      <div style={{ color: "#6b7280", fontSize: 14 }}>{label}</div>
      <div style={{ fontWeight: 600, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

function Th({ children }) {
  return <th style={{ padding: "14px 16px", fontSize: 13 }}>{children}</th>;
}

function Td({ children, colSpan }) {
  return <td colSpan={colSpan} style={{ padding: "14px 16px", fontSize: 14 }}>{children}</td>;
}
