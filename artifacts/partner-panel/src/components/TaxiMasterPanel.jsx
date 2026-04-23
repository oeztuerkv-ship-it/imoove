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
  if (!company) return { value: "—", hint: "", cls: "partner-kpi--muted" };
  if (company.isBlocked) {
    return { value: "Gesperrt", hint: "Kontaktieren Sie Onroda", cls: "partner-kpi--danger" };
  }
  if (!company.isActive) {
    return { value: "Inaktiv", hint: "Kein operativer Zugang", cls: "partner-kpi--warn" };
  }
  return { value: "Aktiv", hint: "Betrieb freigegeben", cls: "partner-kpi--accent" };
}

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
  const pExpired = [];
  const pSoon = [];
  for (const d of drivers) {
    if (!d?.isActive || d?.accessStatus !== "active") continue;
    const days = daysUntilIso(d.pScheinExpiry);
    if (days == null) continue;
    const name = [d.firstName, d.lastName].filter(Boolean).join(" ").trim() || String(d.email || "Fahrer");
    if (days < 0) {
      pExpired.push({ name, days, id: d.id });
    } else if (days >= 0 && days <= 60) {
      pSoon.push({ name, days, id: d.id });
    }
  }
  pSoon.sort((a, b) => a.days - b.days);
  pExpired.sort((a, b) => a.days - b.days);
  for (const t of pExpired.slice(0, 3)) {
    out.push({
      id: `pschein-exp-${t.id}`,
      tone: "danger",
      text: `P-Schein (${t.name}): abgelaufen — sofort in der Flotte prüfen.`,
      cta: { label: "Zur Flotte", module: "flotte" },
    });
  }
  if (pExpired.length > 3) {
    out.push({
      id: "pschein-exp-more",
      tone: "danger",
      text: `Weitere ${pExpired.length - 3} Fahrer mit abgelaufenem P-Schein.`,
      cta: { label: "Zur Flotte", module: "flotte" },
    });
  }
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
  const huExpired = [];
  const huSoon = [];
  for (const v of vehicles) {
    if (!v?.isActive) continue;
    const days = daysUntilIso(v.nextInspectionDate);
    if (days == null) continue;
    const plate = v.licensePlate || "Fahrzeug";
    if (days < 0) {
      huExpired.push({ plate, days, id: v.id });
    } else if (days >= 0 && days <= 60) {
      huSoon.push({ plate, days, id: v.id });
    }
  }
  huSoon.sort((a, b) => a.days - b.days);
  huExpired.sort((a, b) => a.days - b.days);
  for (const h of huExpired.slice(0, 2)) {
    out.push({
      id: `hu-exp-${h.id}`,
      tone: "danger",
      text: `Hauptuntersuchung (${h.plate}): überfällig — Termin in der Flotte klären.`,
      cta: { label: "Zur Flotte", module: "flotte" },
    });
  }
  if (huExpired.length > 2) {
    out.push({
      id: "hu-exp-more",
      tone: "danger",
      text: `Weitere ${huExpired.length - 2} Fahrzeug(e) mit überfälliger HU.`,
      cta: { label: "Zur Flotte", module: "flotte" },
    });
  }
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

function buildCockpitSpotlightRows(company, drivers, vehicles) {
  if (!company) return [];
  const actDr = drivers.filter((d) => d?.isActive && d?.accessStatus === "active");
  const actVeh = vehicles.filter((v) => v?.isActive);
  let p60 = 0;
  let pExp = 0;
  for (const d of actDr) {
    const days = daysUntilIso(d.pScheinExpiry);
    if (days == null) continue;
    if (days < 0) pExp += 1;
    else if (days <= 60) p60 += 1;
  }
  let hu60 = 0;
  let huExp = 0;
  for (const v of actVeh) {
    const days = daysUntilIso(v.nextInspectionDate);
    if (days == null) continue;
    if (days < 0) huExp += 1;
    else if (days <= 60) hu60 += 1;
  }
  const psDetail =
    pExp > 0 ? `${pExp} abgelaufen` : p60 > 0 ? `${p60} Fristen ≤ 60 Tage` : "keine Frist in 60 Tagen";
  const huDetail =
    huExp > 0 ? `${huExp} überfällig` : hu60 > 0 ? `${hu60} fällig ≤ 60 Tage` : "keine Frist in 60 Tagen";
  return [
    {
      key: "gw",
      label: "Gewerbenachweis",
      value: company.hasComplianceGewerbe ? "hinterlegt" : "fehlt — unter „Dokumente“ nachreichen",
      ok: Boolean(company.hasComplianceGewerbe),
    },
    {
      key: "in",
      label: "Versicherung",
      value: company.hasComplianceInsurance ? "hinterlegt" : "fehlt — unter „Dokumente“ nachreichen",
      ok: Boolean(company.hasComplianceInsurance),
    },
    { key: "ps", label: "P-Schein (aktive Fahrer)", value: psDetail, ok: pExp === 0 && p60 === 0 },
    { key: "hu", label: "Hauptuntersuchung (aktive Fahrzeuge)", value: huDetail, ok: huExp === 0 && hu60 === 0 },
    {
      key: "pr",
      label: "Kern-Stammdaten",
      value: company.profileLocked ? "gesperrt — Anpassung über Onroda" : "Kern offen bzw. nach Freigabe bearbeitbar",
      ok: !company.profileLocked,
    },
  ];
}

function BlockError({ text }) {
  if (!text) return null;
  return <p className="partner-state-error">{text}</p>;
}

/**
 * Taxi-Dashboard (nur Übersicht). Navigation: obere Modulleiste im TaxiEntrepreneurShell.
 */
export default function TaxiMasterPanel({ company, onNavigateModule }) {
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

  const spotlightRows = useMemo(
    () => (companyData ? buildCockpitSpotlightRows(companyData, drivers, vehicles) : []),
    [companyData, drivers, vehicles],
  );

  const totalDriversListed = drivers.length;
  const totalVehiclesListed = vehicles.length;

  const goModule = (key) => {
    if (typeof onNavigateModule === "function") onNavigateModule(key);
  };

  return (
    <div className="partner-stack partner-stack--tight">
      {!loadComplete && <p className="partner-state-loading">Daten werden geladen …</p>}

      {loadComplete && (
        <>
          <div className="partner-page-hero">
            <p className="partner-page-eyebrow">Unternehmer-Cockpit</p>
            <h1 className="partner-page-title">Guten Tag, {displayCompanyName}</h1>
            <p className="partner-page-lead">
              Status Ihres Betriebs, Nachweise, Fristen und Tageskennzahlen. Detailarbeit erledigen Sie in den Modulen oben
              in der Leiste.
            </p>
          </div>

          {companyError ? <BlockError text={companyError} /> : null}
          {!companyData && !companyError ? <BlockError text="Firmenstammdaten sind derzeit nicht verfügbar." /> : null}

          {companyData ? (
            <>
              <div className="partner-card partner-card--section">
                <span className="partner-section-eyebrow">Kennzahlen</span>
                <h2 className="partner-section-h" style={{ margin: "0 0 8px" }}>
                  Kernzahlen
                </h2>
                <p className="partner-section-p" style={{ marginTop: 0 }}>
                  Aktive Fahrer und Fahrzeuge, Betriebs- und Prüfstatus
                </p>
                <div className="partner-kpi-grid">
                  {(() => {
                    const u = unternehmenKpiMeta(currentCompany);
                    return (
                      <div className={`partner-kpi ${u.cls}`.trim()}>
                        <p className="partner-kpi__label">Unternehmen</p>
                        <p className="partner-kpi__value">{u.value}</p>
                        {u.hint ? <p className="partner-kpi__hint">{u.hint}</p> : null}
                        {currentCompany.city ? <p className="partner-kpi__hint">{String(currentCompany.city)}</p> : null}
                      </div>
                    );
                  })()}
                  <div className={`partner-kpi${driversError ? " partner-kpi--warn" : ""}`.trim()}>
                    <p className="partner-kpi__label">Aktive Fahrer</p>
                    <p className="partner-kpi__value">{driversError ? "—" : String(activeDrivers)}</p>
                    {driversError ? (
                      <p className="partner-kpi__hint">{driversError}</p>
                    ) : (
                      <p className="partner-kpi__hint">
                        {totalDriversListed} in der Flottenliste{totalDriversListed !== activeDrivers ? " (inkl. inaktiv)" : ""}
                      </p>
                    )}
                  </div>
                  <div className={`partner-kpi${vehiclesError ? " partner-kpi--warn" : ""}`.trim()}>
                    <p className="partner-kpi__label">Aktive Fahrzeuge</p>
                    <p className="partner-kpi__value">{vehiclesError ? "—" : String(activeVehicles)}</p>
                    {vehiclesError ? (
                      <p className="partner-kpi__hint">{vehiclesError}</p>
                    ) : (
                      <p className="partner-kpi__hint">
                        {totalVehiclesListed} im Bestand{totalVehiclesListed !== activeVehicles ? " (inkl. inaktiv)" : ""}
                      </p>
                    )}
                  </div>
                  {(() => {
                    const cs = String(currentCompany.complianceStatus || "").toLowerCase();
                    const compKpiClass =
                      cs.includes("non") || cs === "pending"
                        ? " partner-kpi--danger"
                        : cs === "in_review"
                          ? " partner-kpi--warn"
                          : cs === "compliant"
                            ? " partner-kpi--muted"
                            : " partner-kpi--accent";
                    return (
                      <div className={`partner-kpi${compKpiClass}`.trim()}>
                        <p className="partner-kpi__label">Compliance</p>
                        <p className="partner-kpi__value">{formatComplianceKpiLabel(currentCompany.complianceStatus)}</p>
                        <p className="partner-kpi__hint">Nachweise, Prüfstand laut Konto</p>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="partner-card partner-card--section">
                <h2 className="partner-section-h" style={{ margin: "0 0 8px" }}>
                  Dringende Hinweise
                </h2>
                <p className="partner-section-p" style={{ marginTop: 0 }}>
                  Alles, was zuerst Ihre Aufmerksamkeit braucht
                </p>
                {cockpitAlerts.length > 0 ? (
                  <div className="partner-alert-list" aria-live="polite">
                    {cockpitAlerts.map((a) => (
                      <div
                        key={a.id}
                        className={`partner-alert${
                          a.tone === "danger"
                            ? " partner-alert--danger"
                            : a.tone === "warn"
                              ? " partner-alert--warn"
                              : " partner-alert--caution"
                        }`.trim()}
                        role="status"
                      >
                        <span className="partner-alert__text">{a.text}</span>
                        {a.cta ? (
                          <button
                            type="button"
                            className="partner-btn-primary partner-btn-primary--sm"
                            onClick={() => goModule(a.cta.module)}
                          >
                            {a.cta.label}
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="partner-empty-hint" aria-live="polite">
                    <strong>Kein akuter Handlungsstau.</strong> Prüfen Sie trotzdem regelmäßig Nachweise und Fristen in der
                    Tabelle unten.
                  </div>
                )}
              </div>

              <div className="partner-card partner-card--section partner-kvlist-card partner-kvlist-card--in-stack">
                <span className="partner-section-eyebrow">Überblick</span>
                <h2 className="partner-kvlist-title">Nachweise &amp; Fristen</h2>
                <p className="partner-section-p partner-kvlist-lead">
                  Überblick je aktivem Fahrer bzw. Fahrzeug, Stand aus Ihren Daten
                </p>
                <ul className="partner-kvlist">
                  {spotlightRows.map((row) => (
                    <li key={row.key} className="partner-kvlist__row">
                      <span className="partner-kvlist__k">{row.label}</span>
                      <span
                        className={
                          row.ok
                            ? "partner-kvlist__v partner-kvlist__v--ok"
                            : "partner-kvlist__v partner-kvlist__v--warn"
                        }
                      >
                        {row.value}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="partner-kvlist__foot">
                  Fristen: 60-Tage-Horizont und überfällige Termine laut hinterlegten Daten — Details und Korrekturen in{" "}
                  <button type="button" onClick={() => goModule("flotte")}>
                    Flotte
                  </button>{" "}
                  und{" "}
                  <button type="button" onClick={() => goModule("dokumente")}>
                    Dokumente
                  </button>
                  .
                </p>
              </div>

              <div className="partner-card partner-card--section">
                <h2 className="partner-section-h" style={{ margin: "0 0 8px" }}>
                  Schnellzugriff
                </h2>
                <p className="partner-section-p" style={{ marginTop: 0 }}>
                  Direkter Sprung in den passenden Modulbereich
                </p>
                <div className="partner-action-row">
                  <button type="button" className="partner-btn-primary" onClick={() => goModule("flotte")}>
                    Fahrer &amp; Fahrzeuge
                  </button>
                  <button type="button" className="partner-btn-primary" onClick={() => goModule("dokumente")}>
                    Dokumente hochladen
                  </button>
                  <button type="button" className="partner-btn-primary" onClick={() => goModule("stammdaten")}>
                    Stammdaten ansehen
                  </button>
                </div>
                <div className="partner-tile-grid partner-tile-grid--spaced">
                  <button type="button" className="partner-tile" onClick={() => goModule("flotte")}>
                    <div className="partner-tile__head">
                      <h2 className="partner-tile__title">Fahrer</h2>
                      <span className="partner-tile__chev" aria-hidden>
                        ↗
                      </span>
                    </div>
                    <p className="partner-tile__metric">{driversError ? "—" : activeDrivers} aktiv</p>
                    <p className="partner-tile__desc">Zugänge, Sperrung, P-Schein: Bearbeitung unter „Flotte“.</p>
                  </button>
                  <button type="button" className="partner-tile" onClick={() => goModule("flotte")}>
                    <div className="partner-tile__head">
                      <h2 className="partner-tile__title">Fahrzeuge</h2>
                      <span className="partner-tile__chev" aria-hidden>
                        ↗
                      </span>
                    </div>
                    <p className="partner-tile__metric">{vehiclesError ? "—" : activeVehicles} aktiv</p>
                    <p className="partner-tile__desc">Bestand, Kennzeichen, Hauptuntersuchung – unter „Flotte“.</p>
                  </button>
                  <button type="button" className="partner-tile" onClick={() => goModule("dokumente")}>
                    <div className="partner-tile__head">
                      <h2 className="partner-tile__title">Dokumente</h2>
                      <span className="partner-tile__chev" aria-hidden>
                        ↗
                      </span>
                    </div>
                    <p className="partner-tile__metric">
                      {currentCompany.hasComplianceGewerbe && currentCompany.hasComplianceInsurance
                        ? "Vollständig"
                        : "Prüfen"}
                    </p>
                    <p className="partner-tile__desc">Gewerbe- und Versicherungsnachweise: Bereich „Dokumente“.</p>
                  </button>
                </div>
              </div>

              <div className="partner-card partner-card--section">
                <h2 className="partner-section-h" style={{ margin: "0 0 8px" }}>
                  Betrieb heute
                </h2>
                <p className="partner-section-p" style={{ marginTop: 0 }}>
                  Offene Fahrten, Tagesplan, Umsatz (je nach Konto sichtbar)
                </p>
                {metricsError ? (
                  <BlockError text={metricsError} />
                ) : metrics ? (
                  <div className="partner-metrics partner-metrics--embedded">
                    <div>
                      <p className="partner-metrics__label">Offene Fahrten</p>
                      <p className="partner-metrics__value">{String(metrics.openRides ?? 0)}</p>
                    </div>
                    <div>
                      <p className="partner-metrics__label">Geplant heute</p>
                      <p className="partner-metrics__value">{String(metrics.scheduled?.todayCount ?? 0)}</p>
                    </div>
                    <div>
                      <p className="partner-metrics__label">Umsatz heute</p>
                      <p className="partner-metrics__value">{money(metrics?.today?.revenue)}</p>
                    </div>
                    <div>
                      <p className="partner-metrics__label">Umsatz 7 Tage / 30 Tage</p>
                      <p className="partner-metrics__value partner-metrics__value--sub">
                        {money(metrics?.week?.revenue)} · {money(metrics?.month?.revenue)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <BlockError text="Kennzahlen sind derzeit nicht verfügbar." />
                )}
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
