import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import {
  complianceBucketFromCompany,
  complianceDocSpotlight,
  complianceKpiLabelAndClass,
} from "../lib/partnerComplianceBucket.js";

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

/**
 * @typedef {{ id: string, tone: "danger"|"warn"|"caution", text: string, cta?: { label: string, module: string }, tier: "blocker"|"mandatory"|"deadline"|"info" }} CockpitAlert
 * @returns {CockpitAlert[]}
 */
function buildTaxiCockpitAlerts(company, drivers, vehicles) {
  /** @type {CockpitAlert[]} */
  const blockers = [];
  /** @type {CockpitAlert[]} */
  const mandatory = [];
  /** @type {CockpitAlert[]} */
  const deadlines = [];
  /** @type {CockpitAlert[]} */
  const info = [];

  if (!company) return [];

  if (company.isBlocked) {
    blockers.push({
      id: "blocked",
      tone: "danger",
      tier: "blocker",
      text: "Ihr Unternehmenszugang ist gesperrt. Bitte wenden Sie sich an Onroda.",
    });
  }
  if (!company.hasComplianceGewerbe) {
    mandatory.push({
      id: "doc-gw",
      tone: "warn",
      tier: "mandatory",
      text: "Gewerbenachweis fehlt – bitte unter „Dokumente“ nachreichen.",
      cta: { label: "Zu Dokumenten", module: "dokumente" },
    });
  }
  if (!company.hasComplianceInsurance) {
    mandatory.push({
      id: "doc-in",
      tone: "warn",
      tier: "mandatory",
      text: "Versicherungsnachweis fehlt – bitte unter „Dokumente“ hochladen.",
      cta: { label: "Zu Dokumenten", module: "dokumente" },
    });
  }

  const bucket = complianceBucketFromCompany(company);
  if (bucket === "rejected") {
    mandatory.push({
      id: "compliance-rejected",
      tone: "danger",
      tier: "mandatory",
      text: "Mindestens ein Pflichtnachweis wurde abgelehnt — bitte Bemerkung unter „Dokumente“ prüfen und erneut hochladen.",
      cta: { label: "Zu Dokumenten", module: "dokumente" },
    });
  } else if (bucket === "in_review" && company.hasComplianceGewerbe && company.hasComplianceInsurance) {
    info.push({
      id: "compliance-in-review",
      tone: "caution",
      tier: "info",
      text: "Alle erwarteten Nachweise sind hochgeladen; die Freigabe durch Onroda steht noch aus.",
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
    deadlines.push({
      id: `pschein-exp-${t.id}`,
      tone: "danger",
      tier: "deadline",
      text: `P-Schein (${t.name}): abgelaufen — sofort in der Flotte prüfen.`,
      cta: { label: "Zur Flotte", module: "flotte" },
    });
  }
  if (pExpired.length > 3) {
    deadlines.push({
      id: "pschein-exp-more",
      tone: "danger",
      tier: "deadline",
      text: `Weitere ${pExpired.length - 3} Fahrer mit abgelaufenem P-Schein.`,
      cta: { label: "Zur Flotte", module: "flotte" },
    });
  }
  for (const t of pSoon.slice(0, 2)) {
    deadlines.push({
      id: `pschein-${t.id}`,
      tone: "caution",
      tier: "deadline",
      text: `P-Schein (${t.name}): läuft in ${t.days} Tagen ab.`,
      cta: { label: "Zur Flotte", module: "flotte" },
    });
  }
  if (pSoon.length > 2) {
    deadlines.push({
      id: "pschein-more",
      tone: "caution",
      tier: "deadline",
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
    deadlines.push({
      id: `hu-exp-${h.id}`,
      tone: "danger",
      tier: "deadline",
      text: `Hauptuntersuchung (${h.plate}): überfällig — Termin in der Flotte klären.`,
      cta: { label: "Zur Flotte", module: "flotte" },
    });
  }
  if (huExpired.length > 2) {
    deadlines.push({
      id: "hu-exp-more",
      tone: "danger",
      tier: "deadline",
      text: `Weitere ${huExpired.length - 2} Fahrzeug(e) mit überfälliger HU.`,
      cta: { label: "Zur Flotte", module: "flotte" },
    });
  }
  if (huSoon.length) {
    const h = huSoon[0];
    deadlines.push({
      id: "hu-0",
      tone: "caution",
      tier: "deadline",
      text: `Hauptuntersuchung (${h.plate}): fällig in ${h.days} Tagen.`,
      cta: { label: "Zur Flotte", module: "flotte" },
    });
  }
  if (huSoon.length > 1) {
    deadlines.push({
      id: "hu-more",
      tone: "caution",
      tier: "deadline",
      text: `Weitere ${huSoon.length - 1} Fahrzeug(e) mit fälliger HU in den nächsten 60 Tagen.`,
      cta: { label: "Zur Flotte", module: "flotte" },
    });
  }
  return [...blockers, ...mandatory, ...deadlines, ...info];
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
  const gw = complianceDocSpotlight(company, "gewerbe");
  const ins = complianceDocSpotlight(company, "insurance");
  return [
    {
      key: "gw",
      label: "Gewerbenachweis",
      value: gw.value,
      ok: gw.ok,
    },
    {
      key: "in",
      label: "Versicherung",
      value: ins.value,
      ok: ins.ok,
    },
    { key: "ps", label: "P-Schein (aktive Fahrer)", value: psDetail, ok: pExp === 0 && p60 === 0 },
    { key: "hu", label: "Hauptuntersuchung (aktive Fahrzeuge)", value: huDetail, ok: huExp === 0 && hu60 === 0 },
    {
      key: "pr",
      label: "Kern-Stammdaten",
      value: company.profileLocked
        ? "gesperrt — Änderung nur über Anfrage bei Onroda"
        : "leere Kernfelder hier befüllbar; nach Setzung nur noch per Anfrage",
      ok: !company.profileLocked,
    },
  ];
}

function BlockError({ text }) {
  if (!text) return null;
  return <p className="partner-state-error">{text}</p>;
}

function ymdLocal(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultExportRange30() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return { from: ymdLocal(from), to: ymdLocal(to) };
}

/** @param {{ tone?: string, tier?: string }} a */
function alertToneSurfaceClass(a) {
  if (a.tone === "danger") return "partner-alert--danger";
  if (a.tone === "warn") return "partner-alert--warn";
  return "partner-alert--caution";
}

/** @param {string | undefined} tier */
function alertTierStripeClass(tier) {
  if (tier === "blocker") return "partner-alert--tier-blocker";
  if (tier === "mandatory") return "partner-alert--tier-mandatory";
  if (tier === "deadline") return "partner-alert--tier-deadline";
  if (tier === "info") return "partner-alert--tier-info";
  return "";
}

/**
 * Taxi-Dashboard (nur Übersicht). Navigation: obere Modulleiste im TaxiEntrepreneurShell.
 */
export default function TaxiMasterPanel({ company, onNavigateModule }) {
  const [loadComplete, setLoadComplete] = useState(false);
  const defRange = useMemo(() => defaultExportRange30(), []);
  const [exportFrom, setExportFrom] = useState(() => defRange.from);
  const [exportTo, setExportTo] = useState(() => defRange.to);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportErr, setExportErr] = useState("");

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

  const cockpitAlertGroups = useMemo(() => {
    const g = { blockers: [], mandatory: [], deadlines: [], info: [] };
    for (const a of cockpitAlerts) {
      const t = a.tier || "mandatory";
      if (t === "blocker") g.blockers.push(a);
      else if (t === "mandatory") g.mandatory.push(a);
      else if (t === "deadline") g.deadlines.push(a);
      else g.info.push(a);
    }
    return g;
  }, [cockpitAlerts]);

  const spotlightRows = useMemo(
    () => (companyData ? buildCockpitSpotlightRows(companyData, drivers, vehicles) : []),
    [companyData, drivers, vehicles],
  );

  const totalDriversListed = drivers.length;
  const totalVehiclesListed = vehicles.length;

  const goModule = (key) => {
    if (typeof onNavigateModule === "function") onNavigateModule(key);
  };

  const isTaxiCompany = String(currentCompany?.companyKind ?? "")
    .trim()
    .toLowerCase() === "taxi";

  async function downloadRevenueCsv() {
    setExportErr("");
    const token = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : "";
    if (!token) {
      setExportErr("Export nicht möglich: keine Anmeldung.");
      return;
    }
    setExportBusy(true);
    try {
      const qs = new URLSearchParams({ createdFrom: exportFrom, createdTo: exportTo });
      const res = await fetch(`${API_BASE}/panel/v1/taxi/revenue-export.csv?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          if (j?.error) msg = String(j.error);
        } catch {
          /* ignore */
        }
        setExportErr(`Export fehlgeschlagen: ${msg}`);
        return;
      }
      const blob = await res.blob();
      const dispo = res.headers.get("Content-Disposition");
      let name = `onroda-taxi-umsatz-${exportFrom}-${exportTo}.csv`;
      if (dispo) {
        const m = /filename="([^"]+)"/i.exec(dispo);
        if (m?.[1]) name = m[1];
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportErr("Export fehlgeschlagen (Netzwerk).");
    } finally {
      setExportBusy(false);
    }
  }

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
                    const bucket = complianceBucketFromCompany(currentCompany);
                    const k = complianceKpiLabelAndClass(bucket);
                    return (
                      <div className={`partner-kpi${k.cls}`.trim()}>
                        <p className="partner-kpi__label">Compliance</p>
                        <p className="partner-kpi__value">{k.label}</p>
                        <p className="partner-kpi__hint">{k.hint}</p>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="partner-card partner-card--section">
                <h2 className="partner-section-h" style={{ margin: "0 0 8px" }}>
                  Hinweise &amp; Fristen
                </h2>
                <p className="partner-section-p" style={{ marginTop: 0 }}>
                  Blockierendes zuerst, dann Pflichtnachweise, Fristen und neutrale Infos
                </p>
                {cockpitAlerts.length > 0 ? (
                  <div className="partner-cockpit-alert-stack" aria-live="polite">
                    {cockpitAlertGroups.blockers.length ? (
                      <>
                        <h4 className="partner-cockpit-alert-heading">Blockiert</h4>
                        <div className="partner-alert-list">
                          {cockpitAlertGroups.blockers.map((a) => (
                            <div
                              key={a.id}
                              className={`partner-alert ${alertToneSurfaceClass(a)} ${alertTierStripeClass(a.tier)}`.trim()}
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
                      </>
                    ) : null}
                    {cockpitAlertGroups.mandatory.length ? (
                      <>
                        <h4 className="partner-cockpit-alert-heading">Pflicht / Nachweise</h4>
                        <div className="partner-alert-list">
                          {cockpitAlertGroups.mandatory.map((a) => (
                            <div
                              key={a.id}
                              className={`partner-alert ${alertToneSurfaceClass(a)} ${alertTierStripeClass(a.tier)}`.trim()}
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
                      </>
                    ) : null}
                    {cockpitAlertGroups.deadlines.length ? (
                      <>
                        <h4 className="partner-cockpit-alert-heading">Fristen (P-Schein / HU)</h4>
                        <div className="partner-alert-list">
                          {cockpitAlertGroups.deadlines.map((a) => (
                            <div
                              key={a.id}
                              className={`partner-alert ${alertToneSurfaceClass(a)} ${alertTierStripeClass(a.tier)}`.trim()}
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
                      </>
                    ) : null}
                    {cockpitAlertGroups.info.length ? (
                      <>
                        <h4 className="partner-cockpit-alert-heading">Info</h4>
                        <div className="partner-alert-list">
                          {cockpitAlertGroups.info.map((a) => (
                            <div
                              key={a.id}
                              className={`partner-alert ${alertToneSurfaceClass(a)} ${alertTierStripeClass(a.tier)}`.trim()}
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
                      </>
                    ) : null}
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
                      {(() => {
                        const b = complianceBucketFromCompany(currentCompany);
                        if (b === "compliant") return "Freigegeben";
                        if (b === "rejected") return "Abgelehnt";
                        if (b === "in_review") return "In Prüfung";
                        if (b === "missing") return "Unvollständig";
                        return "Prüfen";
                      })()}
                    </p>
                    <p className="partner-tile__desc">Gewerbe- und Versicherungsnachweise: Bereich „Dokumente“.</p>
                  </button>
                </div>
              </div>

              <div className="partner-card partner-card--section">
                <h2 className="partner-section-h" style={{ margin: "0 0 8px" }}>
                  Betrieb &amp; Umsatz
                </h2>
                <p className="partner-section-p" style={{ marginTop: 0 }}>
                  Tagesplan, offene Fahrten und abgeschlossene Fahrten-Einnahmen (Taxi-Betrieb)
                </p>
                {metricsError ? (
                  <BlockError text={metricsError} />
                ) : metrics ? (
                  <>
                    <div className="partner-metrics partner-metrics--embedded">
                      <div>
                        <p className="partner-metrics__label">Offene Fahrten</p>
                        <p className="partner-metrics__value">{String(metrics.openRides ?? 0)}</p>
                        <p className="partner-metrics__sub">Noch nicht abgeschlossen / nicht storniert</p>
                      </div>
                      <div>
                        <p className="partner-metrics__label">Geplant heute</p>
                        <p className="partner-metrics__value">{String(metrics.scheduled?.todayCount ?? 0)}</p>
                      </div>
                      <div>
                        <p className="partner-metrics__label">Umsatz heute</p>
                        <p className="partner-metrics__value">{money(metrics?.today?.revenue)}</p>
                        <p className="partner-metrics__sub">Abgeschlossene Fahrten, Kalendertag Berlin</p>
                      </div>
                      <div>
                        <p className="partner-metrics__label">Umsatz 7 Tage</p>
                        <p className="partner-metrics__value">{money(metrics?.week?.revenue)}</p>
                        <p className="partner-metrics__sub">Rollierend 7×24h</p>
                      </div>
                      <div>
                        <p className="partner-metrics__label">Umsatz 30 Tage</p>
                        <p className="partner-metrics__value">{money(metrics?.rolling30?.revenue)}</p>
                        <p className="partner-metrics__sub">Rollierend 30×24h</p>
                      </div>
                      <div>
                        <p className="partner-metrics__label">Kalendermonat (laufend)</p>
                        <p className="partner-metrics__value partner-metrics__value--sub">{money(metrics?.month?.revenue)}</p>
                        <p className="partner-metrics__sub">Europe/Berlin — zusätzlich zur 30-Tage-Rolle</p>
                      </div>
                    </div>
                    {isTaxiCompany ? (
                      <div className="partner-cockpit-csv partner-stack partner-stack--tight" style={{ marginTop: 20 }}>
                        <h3 className="partner-card__title" style={{ marginBottom: 4 }}>
                          Umsatz-Export (CSV)
                        </h3>
                        <p className="partner-muted" style={{ margin: "0 0 12px" }}>
                          Zeitraum wählen, dann CSV herunterladen (Datum, Fahrt-ID, Start, Ziel, Preis, Zahlungsart, Status).
                        </p>
                        <div className="partner-cockpit-csv__row">
                          <label className="partner-form-field partner-form-field--inline">
                            <span>Von</span>
                            <input
                              className="partner-input"
                              type="date"
                              value={exportFrom}
                              onChange={(ev) => setExportFrom(ev.target.value)}
                              disabled={exportBusy}
                            />
                          </label>
                          <label className="partner-form-field partner-form-field--inline">
                            <span>Bis</span>
                            <input
                              className="partner-input"
                              type="date"
                              value={exportTo}
                              onChange={(ev) => setExportTo(ev.target.value)}
                              disabled={exportBusy}
                            />
                          </label>
                          <button
                            type="button"
                            className="partner-btn-primary"
                            disabled={exportBusy || !exportFrom || !exportTo}
                            onClick={() => void downloadRevenueCsv()}
                          >
                            {exportBusy ? "Export …" : "CSV herunterladen"}
                          </button>
                        </div>
                        {exportErr ? <p className="partner-state-error" style={{ margin: "8px 0 0" }}>{exportErr}</p> : null}
                      </div>
                    ) : null}
                  </>
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
