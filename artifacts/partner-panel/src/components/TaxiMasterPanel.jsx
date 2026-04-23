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

/** Tage bis Stichtag (lokales Datum, nur für Fristen-Hinweise). */
function daysUntilIso(iso) {
  if (iso == null || iso === "") return null;
  const s = String(iso).trim();
  if (!s) return null;
  const d = new Date(s.length <= 10 ? `${s}T12:00:00` : s);
  if (Number.isNaN(d.getTime())) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(0, 0, 0, 0);
  return Math.round((end - start) / 86400000);
}

function formatComplianceKpiLabel(status) {
  const v = String(status ?? "")
    .trim()
    .toLowerCase();
  if (v === "compliant") return "In Ordnung";
  if (v === "non_compliant") return "Handlungsbedarf";
  if (v === "in_review") return "In Prüfung";
  if (v === "pending") return "Unvollständig";
  return v ? String(status) : "—";
}

function unternehmenKpiMeta(company) {
  if (!company) return { value: "—", hint: "", cls: "taxi-cockpit__kpi--muted" };
  if (company.isBlocked) {
    return { value: "Gesperrt", hint: "Kontaktieren Sie Onroda", cls: "taxi-cockpit__kpi--danger" };
  }
  if (!company.isActive) {
    return { value: "Inaktiv", hint: "Kein operativer Zugang", cls: "taxi-cockpit__kpi--warn" };
  }
  return { value: "Aktiv", hint: "Betrieb freigegeben", cls: "" };
}

/**
 * Hinweise für das Cockpit – nur aus vorhandenen Listen / Firmendaten, ohne neue API.
 * @param {Record<string, unknown> | null} company
 * @param {Array<Record<string, unknown>>} drivers
 * @param {Array<Record<string, unknown>>} vehicles
 */
function buildTaxiCockpitAlerts(company, drivers, vehicles) {
  const out = [];
  if (!company) return out;
  if (company.isBlocked) {
    out.push({
      id: "blocked",
      tone: "danger",
      text: "Ihr Unternehmenszugang ist gesperrt. Bitte wenden Sie sich an Onroda.",
    });
  }
  if (!company.hasComplianceGewerbe) {
    out.push({
      id: "doc-gw",
      tone: "warn",
      text: "Gewerbenachweis fehlt – bitte unter „Dokumente“ nachreichen.",
      cta: { label: "Zu Dokumenten", module: "dokumente" },
    });
  }
  if (!company.hasComplianceInsurance) {
    out.push({
      id: "doc-in",
      tone: "warn",
      text: "Versicherungsnachweis fehlt – bitte unter „Dokumente“ hochladen.",
      cta: { label: "Zu Dokumenten", module: "dokumente" },
    });
  }
  const pSoon = [];
  for (const d of drivers) {
    if (!d?.isActive || d?.accessStatus !== "active") continue;
    const days = daysUntilIso(d.pScheinExpiry);
    if (days != null && days >= 0 && days <= 60) {
      const name = [d.firstName, d.lastName].filter(Boolean).join(" ").trim() || String(d.email || "Fahrer");
      pSoon.push({ name, days, id: d.id });
    }
  }
  pSoon.sort((a, b) => a.days - b.days);
  for (const t of pSoon.slice(0, 2)) {
    out.push({
      id: `pschein-${t.id}`,
      tone: "caution",
      text: `P-Schein (${t.name}): läuft in ${t.days} Tagen ab.`,
      cta: { label: "Zur Flotte", module: "flotte" },
    });
  }
  if (pSoon.length > 2) {
    out.push({
      id: "pschein-more",
      tone: "caution",
      text: `Weitere ${pSoon.length - 2} Fahrer mit P-Schein-Frist in den nächsten 60 Tagen.`,
      cta: { label: "Zur Flotte", module: "flotte" },
    });
  }
  const huSoon = [];
  for (const v of vehicles) {
    if (!v?.isActive) continue;
    const days = daysUntilIso(v.nextInspectionDate);
    if (days != null && days >= 0 && days <= 60) {
      huSoon.push({ plate: v.licensePlate || "Fahrzeug", days, id: v.id });
    }
  }
  huSoon.sort((a, b) => a.days - b.days);
  if (huSoon.length) {
    const h = huSoon[0];
    out.push({
      id: "hu-0",
      tone: "caution",
      text: `Hauptuntersuchung (${h.plate}): fällig in ${h.days} Tagen.`,
      cta: { label: "Zur Flotte", module: "flotte" },
    });
  }
  if (huSoon.length > 1) {
    out.push({
      id: "hu-more",
      tone: "caution",
      text: `Weitere ${huSoon.length - 1} Fahrzeug(e) mit fälliger HU in den nächsten 60 Tagen.`,
      cta: { label: "Zur Flotte", module: "flotte" },
    });
  }
  return out;
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

export default function TaxiMasterPanel({ company, onLogout, onNavigateModule }) {
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

  const cockpitAlerts = useMemo(
    () => (loadComplete && companyData ? buildTaxiCockpitAlerts(companyData, drivers, vehicles) : []),
    [loadComplete, companyData, drivers, vehicles],
  );

  const goModule = (key) => {
    if (typeof onNavigateModule === "function") {
      onNavigateModule(key);
      return;
    }
    if (key === "flotte") setActiveTab("fahrer");
    else if (key === "stammdaten") setActiveTab("stammdaten");
  };

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
          <div className="taxi-cockpit panel-app--workspace">
            <p className="taxi-cockpit__eyebrow">Cockpit</p>
            <h1 className="taxi-cockpit__title">Guten Tag, {displayCompanyName}</h1>
            <p className="taxi-cockpit__lead">
              Überblick über Ihren Betrieb, die Flotte und offene Verpflichtungen. Details richten Sie in den
              jeweiligen Bereichen der oberen Menüleiste ein; hier nur Status und Kurznavigation.
            </p>

            {companyError ? <BlockError text={companyError} /> : null}
            {!companyData && !companyError ? <BlockError text="Firmenstammdaten sind derzeit nicht verfügbar." /> : null}

            {companyData ? (
              <>
                <div className="taxi-cockpit__kpi-row">
                  {(() => {
                    const u = unternehmenKpiMeta(currentCompany);
                    return (
                      <div className={`taxi-cockpit__kpi ${u.cls}`.trim()}>
                        <p className="taxi-cockpit__kpi-label">Unternehmen</p>
                        <p className="taxi-cockpit__kpi-value">{u.value}</p>
                        {u.hint ? <p className="taxi-cockpit__kpi-hint">{u.hint}</p> : null}
                      </div>
                    );
                  })()}
                  <div className={`taxi-cockpit__kpi${driversError ? " taxi-cockpit__kpi--warn" : ""}`.trim()}>
                    <p className="taxi-cockpit__kpi-label">Aktive Fahrer</p>
                    <p className="taxi-cockpit__kpi-value">{driversError ? "—" : String(activeDrivers)}</p>
                    {driversError ? <p className="taxi-cockpit__kpi-hint">{driversError}</p> : null}
                  </div>
                  <div className={`taxi-cockpit__kpi${vehiclesError ? " taxi-cockpit__kpi--warn" : ""}`.trim()}>
                    <p className="taxi-cockpit__kpi-label">Aktive Fahrzeuge</p>
                    <p className="taxi-cockpit__kpi-value">{vehiclesError ? "—" : String(activeVehicles)}</p>
                    {vehiclesError ? <p className="taxi-cockpit__kpi-hint">{vehiclesError}</p> : null}
                  </div>
                  <div
                    className={`taxi-cockpit__kpi${
                      String(currentCompany.complianceStatus || "")
                        .toLowerCase()
                        .includes("non")
                        ? " taxi-cockpit__kpi--warn"
                        : ""
                    }`.trim()}
                  >
                    <p className="taxi-cockpit__kpi-label">Compliance</p>
                    <p className="taxi-cockpit__kpi-value">{formatComplianceKpiLabel(currentCompany.complianceStatus)}</p>
                    <p className="taxi-cockpit__kpi-hint">Nachweise &amp; Prüfstatus</p>
                  </div>
                </div>

                {cockpitAlerts.length > 0 ? (
                  <div className="taxi-cockpit__alerts" aria-live="polite">
                    {cockpitAlerts.map((a) => (
                      <div
                        key={a.id}
                        className={`taxi-cockpit__alert taxi-cockpit__alert--${a.tone}`.trim()}
                        role="status"
                      >
                        <span>{a.text}</span>
                        {a.cta ? (
                          <button
                            type="button"
                            className="taxi-cockpit__alert-cta"
                            onClick={() => goModule(a.cta.module)}
                          >
                            {a.cta.label}
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="taxi-cockpit__actions">
                  <p className="taxi-cockpit__action-note">Schnellstart – führt in den zugehörigen Arbeitsbereich der Menüleiste.</p>
                  <button type="button" className="panel-btn-primary" onClick={() => goModule("flotte")}>
                    Fahrer &amp; Fahrzeuge
                  </button>
                  <button type="button" className="panel-btn-primary" onClick={() => goModule("dokumente")}>
                    Dokumente hochladen
                  </button>
                  <button type="button" className="panel-btn-primary" onClick={() => goModule("stammdaten")}>
                    Stammdaten ansehen
                  </button>
                </div>

                <div className="taxi-cockpit__grid">
                  <button type="button" className="taxi-cockpit__area" onClick={() => goModule("flotte")}>
                    <div className="taxi-cockpit__area-head">
                      <h2 className="taxi-cockpit__area-title">Fahrer</h2>
                      <span className="taxi-cockpit__area-chev" aria-hidden>
                        ↗
                      </span>
                    </div>
                    <p className="taxi-cockpit__area-metric">{driversError ? "—" : activeDrivers} aktiv</p>
                    <p className="taxi-cockpit__area-desc">Flotte: Zugänge, Sperrung und P-Schein-Fristen – Detailansicht über „Flotte“ oben.</p>
                  </button>
                  <button type="button" className="taxi-cockpit__area" onClick={() => goModule("flotte")}>
                    <div className="taxi-cockpit__area-head">
                      <h2 className="taxi-cockpit__area-title">Fahrzeuge</h2>
                      <span className="taxi-cockpit__area-chev" aria-hidden>
                        ↗
                      </span>
                    </div>
                    <p className="taxi-cockpit__area-metric">{vehiclesError ? "—" : activeVehicles} aktiv</p>
                    <p className="taxi-cockpit__area-desc">Bestand, Kennzeichen, Hauptuntersuchung – in der Flotte bearbeiten.</p>
                  </button>
                  <button type="button" className="taxi-cockpit__area" onClick={() => goModule("dokumente")}>
                    <div className="taxi-cockpit__area-head">
                      <h2 className="taxi-cockpit__area-title">Dokumente</h2>
                      <span className="taxi-cockpit__area-chev" aria-hidden>
                        ↗
                      </span>
                    </div>
                    <p className="taxi-cockpit__area-metric">
                      {currentCompany.hasComplianceGewerbe && currentCompany.hasComplianceInsurance
                        ? "Vollständig"
                        : "Prüfen"}
                    </p>
                    <p className="taxi-cockpit__area-desc">Gewerbe- und Versicherungsnachweise hochladen und Status einsehen.</p>
                  </button>
                </div>

                {metricsError ? (
                  <BlockError text={metricsError} />
                ) : metrics ? (
                  <div className="taxi-cockpit__ops">
                    <div className="taxi-cockpit__op">
                      <p className="taxi-cockpit__op-label">Offene Fahrten</p>
                      <p className="taxi-cockpit__op-value">{String(metrics.openRides ?? 0)}</p>
                    </div>
                    <div className="taxi-cockpit__op">
                      <p className="taxi-cockpit__op-label">Geplant heute</p>
                      <p className="taxi-cockpit__op-value">{String(metrics.scheduled?.todayCount ?? 0)}</p>
                    </div>
                    <div className="taxi-cockpit__op">
                      <p className="taxi-cockpit__op-label">Umsatz heute</p>
                      <p className="taxi-cockpit__op-value">{money(metrics?.today?.revenue)}</p>
                    </div>
                    <div className="taxi-cockpit__op">
                      <p className="taxi-cockpit__op-label">Umsatz 7 Tage / 30 Tage</p>
                      <p className="taxi-cockpit__op-value taxi-cockpit__op-value--sub">
                        {money(metrics?.week?.revenue)} · {money(metrics?.month?.revenue)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <BlockError text="Kennzahlen sind derzeit nicht verfügbar." />
                )}
              </>
            ) : null}
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
