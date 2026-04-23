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

/**
 * Liest eine Panel-API-Antwort; liefert ok + Payload oder präzise Fehlmeldung (keine Dummy-Objekte).
 * @param {string} label Kurzname für Anzeige (z. B. "Firmendaten")
 * @param {() => any} getBody bei ok: (data) => parsed payload (z. B. data.company) oder rohe data
 */
async function loadPanelResource(url, label, getBody) {
  let res;
  try {
    res = await fetch(url, { headers: getPanelHeaders() });
  } catch {
    return { ok: false, error: `${label} konnten nicht geladen werden (Netzwerk).`, data: null };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const apiErr = typeof data?.error === "string" ? data.error : `HTTP ${res.status}`;
    return { ok: false, error: `${label}: ${apiErr}`, data: null };
  }
  if (!data?.ok) {
    const apiErr = typeof data?.error === "string" ? data.error : "Ungültige Antwort";
    return { ok: false, error: `${label}: ${apiErr}`, data: null };
  }
  return { ok: true, error: null, data: getBody ? getBody(data) : data };
}

function money(value) {
  const n = Number(value || 0);
  return `${n.toFixed(2)} €`;
}

function BlockError({ text }) {
  if (!text) return null;
  return (
    <p
      style={{
        color: "#b91c1c",
        margin: "0 0 14px",
        fontSize: 14,
        lineHeight: 1.5,
        maxWidth: 720,
      }}
    >
      {text}
    </p>
  );
}

export default function TaxiMasterPanel({ company, onLogout }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loadComplete, setLoadComplete] = useState(false);

  const [companyData, setCompanyData] = useState(null);
  const [companyError, setCompanyError] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [metricsError, setMetricsError] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [driversError, setDriversError] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [vehiclesError, setVehiclesError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoadComplete(false);
      setCompanyError(null);
      setMetricsError(null);
      setDriversError(null);
      setVehiclesError(null);
      setCompanyData(null);
      setMetrics(null);
      setDrivers([]);
      setVehicles([]);

      const [cRes, mRes, dRes, vRes] = await Promise.all([
        loadPanelResource(`${API_BASE}/panel/v1/company`, "Firmendaten", (d) => d.company ?? null),
        loadPanelResource(`${API_BASE}/panel/v1/overview/metrics`, "Kennzahlen", (d) => d.metrics ?? null),
        loadPanelResource(`${API_BASE}/panel/v1/fleet/drivers`, "Fahrerliste", (d) => (Array.isArray(d.drivers) ? d.drivers : [])),
        loadPanelResource(`${API_BASE}/panel/v1/fleet/vehicles`, "Fahrzeugliste", (d) => (Array.isArray(d.vehicles) ? d.vehicles : [])),
      ]);

      if (cancelled) return;

      if (cRes.ok) {
        setCompanyData(cRes.data);
      } else {
        setCompanyError(cRes.error);
      }
      if (mRes.ok) {
        setMetrics(mRes.data);
      } else {
        setMetricsError(mRes.error);
      }
      if (dRes.ok) {
        setDrivers(dRes.data);
      } else {
        setDriversError(dRes.error);
      }
      if (vRes.ok) {
        setVehicles(vRes.data);
      } else {
        setVehiclesError(vRes.error);
      }

      setLoadComplete(true);
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  const displayCompanyName = companyData?.name || company?.name || "Taxi-Unternehmer";
  const currentCompany = companyData || {};
  const activeDrivers = useMemo(
    () => drivers.filter((d) => d?.isActive && d?.accessStatus === "active").length,
    [drivers],
  );
  const activeVehicles = useMemo(() => vehicles.filter((v) => v?.isActive).length, [vehicles]);

  const menuItems = [
    { key: "dashboard", label: "Dashboard" },
    { key: "stammdaten", label: "Stammdaten" },
    { key: "fahrer", label: "Fahrer" },
    { key: "fahrzeuge", label: "Fahrzeuge" },
  ];

  const activeMenuLabel = menuItems.find((i) => i.key === activeTab)?.label ?? "";

  const theme = {
    yellow: "#f1c40f",
    black: "#111111",
    border: "#e5e7eb",
    soft: "#f8f9fa",
    white: "#ffffff",
    text: "#1f2937",
    muted: "#6b7280",
  };

  return (
    <div
      style={{
        display: "flex",
        minHeight: "760px",
        background: theme.white,
        border: `1px solid ${theme.border}`,
        borderRadius: 18,
        overflow: "hidden",
        position: "relative",
        isolation: "isolate",
      }}
    >
      <aside
        style={{
          width: 240,
          flexShrink: 0,
          background: theme.black,
          color: theme.white,
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          position: "relative",
          zIndex: 2,
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
            type="button"
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
          type="button"
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
          minWidth: 0,
          position: "relative",
          zIndex: 1,
          background: theme.soft,
          color: theme.text,
          padding: 24,
          overflowY: "auto",
        }}
      >
        {!loadComplete && (
          <p style={{ margin: 0, color: theme.muted }}>
            Taxi-Panel: Daten werden geladen{activeMenuLabel ? ` – gewählter Bereich: ${activeMenuLabel}` : ""} …
          </p>
        )}

        {loadComplete && activeTab === "dashboard" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <h1 style={{ margin: 0, fontSize: 28 }}>Willkommen, {displayCompanyName}</h1>
              <p style={{ marginTop: 8, color: theme.muted }}>
                Übersicht über Betrieb, Flotte und aktuelle Kennzahlen.
              </p>
            </div>

            {companyError ? (
              <BlockError text={companyError} />
            ) : !companyData ? (
              <BlockError text="Firmenstammdaten sind derzeit nicht verfügbar." />
            ) : null}

            {metricsError ? (
              <BlockError text={metricsError} />
            ) : !metrics ? (
              <BlockError text="Kennzahlen sind derzeit nicht verfügbar." />
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
                  <Card title="Offene Fahrten" value={String(metrics.openRides ?? 0)} />
                  <Card title="Geplant heute" value={String(metrics.scheduled?.todayCount ?? 0)} />
                  {driversError ? (
                    <div
                      style={{
                        background: "#fff",
                        border: `1px solid ${theme.border}`,
                        borderRadius: 16,
                        padding: 16,
                        fontSize: 13,
                        color: "#b91c1c",
                        lineHeight: 1.45,
                      }}
                    >
                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8, fontWeight: 700 }}>Aktive Fahrer</div>
                      {driversError}
                    </div>
                  ) : (
                    <Card title="Aktive Fahrer" value={String(activeDrivers)} />
                  )}
                  {vehiclesError ? (
                    <div
                      style={{
                        background: "#fff",
                        border: `1px solid ${theme.border}`,
                        borderRadius: 16,
                        padding: 16,
                        fontSize: 13,
                        color: "#b91c1c",
                        lineHeight: 1.45,
                      }}
                    >
                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8, fontWeight: 700 }}>Aktive Fahrzeuge</div>
                      {vehiclesError}
                    </div>
                  ) : (
                    <Card title="Aktive Fahrzeuge" value={String(activeVehicles)} />
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, marginTop: 16 }}>
                  <Card title="Umsatz heute" value={money(metrics?.today?.revenue)} />
                  <Card title="Umsatz Woche" value={money(metrics?.week?.revenue)} />
                  <Card title="Umsatz Monat" value={money(metrics?.month?.revenue)} />
                </div>
              </>
            )}

            {companyData && (
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
            )}
          </div>
        )}

        {loadComplete && activeTab === "stammdaten" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 28 }}>Stammdaten</h2>
                <p style={{ marginTop: 8, color: theme.muted, maxWidth: 760 }}>
                  Anzeige der bei Onroda hinterlegten Stammdaten. Ist das Profil gesperrt, gelten Anpassungen nur über Onroda.
                </p>
              </div>
              {companyData && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 999,
                    background: currentCompany?.profileLocked ? "#111111" : "#fff7cc",
                    color: currentCompany?.profileLocked ? "#ffffff" : "#6b5900",
                    border: currentCompany?.profileLocked ? "1px solid #111111" : "1px solid #f1c40f",
                    fontWeight: 700,
                    fontSize: 13,
                    whiteSpace: "nowrap",
                  }}
                >
                  {currentCompany?.profileLocked ? "Stammdaten gesperrt" : "Ersteinrichtung offen"}
                </div>
              )}
            </div>

            {companyError ? <BlockError text={companyError} /> : null}
            {companyData ? (
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
            ) : companyError ? null : (
              <p style={{ margin: 0, color: theme.muted, fontSize: 14 }}>Stammdaten konnten nicht geladen werden.</p>
            )}
          </div>
        )}

        {loadComplete && activeTab === "fahrer" && (
          <div>
            <h2 style={{ marginTop: 0, fontSize: 24 }}>Fahrer</h2>
            {driversError ? (
              <BlockError text={driversError} />
            ) : (
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
                        <Td>
                          {driver.firstName} {driver.lastName}
                        </Td>
                        <Td>{driver.email || "-"}</Td>
                        <Td>{driver.phone || "-"}</Td>
                        <Td>{driver.isActive ? driver.accessStatus : "inactive"}</Td>
                        <Td>{driver.pScheinExpiry || "-"}</Td>
                        <Td>{driver.lastHeartbeatAt || driver.lastLoginAt || "-"}</Td>
                      </tr>
                    ))}
                    {drivers.length === 0 && (
                      <tr>
                        <Td colSpan={6}>Keine Fahrer vorhanden.</Td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {loadComplete && activeTab === "fahrzeuge" && (
          <div>
            <h2 style={{ marginTop: 0, fontSize: 24 }}>Fahrzeuge</h2>
            {vehiclesError ? (
              <BlockError text={vehiclesError} />
            ) : (
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
                    {vehicles.length === 0 && (
                      <tr>
                        <Td colSpan={6}>Keine Fahrzeuge vorhanden.</Td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
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
