import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

function fmtTs(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function workflowDe(key) {
  const m = {
    suspended: "Gesperrt",
    rejected: "Abgelehnt",
    missing_documents: "Unterlagen fehlen",
    in_review: "In Prüfung",
    pending: "Angelegt",
    approved: "Freigegeben",
    unknown: "—",
  };
  return m[key] || key || "—";
}

export default function TaxiFleetDriversPage({ initialCompanyId = null, onInitialCompanyConsumed }) {
  const [companies, setCompanies] = useState([]);
  const [cLoading, setCLoading] = useState(true);
  const [cQuery, setCQuery] = useState("");
  const [companyId, setCompanyId] = useState("");

  const [drivers, setDrivers] = useState([]);
  const [dLoading, setDLoading] = useState(false);
  const [dQuery, setDQuery] = useState("");

  const [sel, setSel] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [audit, setAudit] = useState([]);
  const [noteIn, setNoteIn] = useState("");
  const [susReasonIn, setSusReasonIn] = useState("");
  const [actBusy, setActBusy] = useState("");
  const [commissionPct, setCommissionPct] = useState("");
  const [commissionUseCompany, setCommissionUseCompany] = useState(true);

  const loadCompanies = useCallback(() => {
    setCLoading(true);
    fetch(`${API_BASE}/admin/taxi-fleet-drivers/taxi-companies`, { headers: adminApiHeaders() })
      .then((r) => r.json())
      .then((j) => {
        setCompanies(Array.isArray(j.items) ? j.items : []);
        setCLoading(false);
      })
      .catch(() => {
        setCompanies([]);
        setCLoading(false);
      });
  }, []);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    if (!initialCompanyId || typeof initialCompanyId !== "string") return;
    setCompanyId(initialCompanyId);
    setSel(null);
    onInitialCompanyConsumed?.();
  }, [initialCompanyId, onInitialCompanyConsumed]);

  const loadDrivers = useCallback((cid) => {
    if (!cid) {
      setDrivers([]);
      return;
    }
    setDLoading(true);
    fetch(`${API_BASE}/admin/taxi-fleet-drivers/${encodeURIComponent(cid)}/drivers`, { headers: adminApiHeaders() })
      .then((r) => r.json())
      .then((j) => {
        setDrivers(Array.isArray(j.drivers) ? j.drivers : []);
        setDLoading(false);
      })
      .catch(() => {
        setDrivers([]);
        setDLoading(false);
      });
  }, []);

  useEffect(() => {
    if (companyId) loadDrivers(companyId);
  }, [companyId, loadDrivers]);

  const filteredCompanies = useMemo(() => {
    const q = cQuery.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => (c.name || "").toLowerCase().includes(q) || (c.id || "").toLowerCase().includes(q));
  }, [companies, cQuery]);

  const filteredDrivers = useMemo(() => {
    const q = dQuery.trim().toLowerCase();
    if (!q) return drivers;
    return drivers.filter((d) => {
      const a = [d.firstName, d.lastName, d.email, d.phone, d.id].map((x) => String(x || "").toLowerCase()).join(" ");
      return a.includes(q);
    });
  }, [drivers, dQuery]);

  function loadDetailAndAudit(cid, driverId) {
    if (!cid || !driverId) return;
    setDetailLoading(true);
    setDetail(null);
    setAudit([]);
    const h = adminApiHeaders();
    Promise.all([
      fetch(
        `${API_BASE}/admin/taxi-fleet-drivers/${encodeURIComponent(cid)}/drivers/${encodeURIComponent(driverId)}`,
        { headers: h },
      ).then((r) => r.json()),
      fetch(
        `${API_BASE}/admin/taxi-fleet-drivers/${encodeURIComponent(cid)}/audit?subjectId=${encodeURIComponent(driverId)}&limit=80`,
        { headers: h },
      ).then((r) => r.json()),
    ])
      .then(([dj, aj]) => {
        setDetail(dj.driver || null);
        setNoteIn(dj.driver?.adminInternalNote || "");
        setSusReasonIn(dj.driver?.suspensionReason || "");
        const cr = dj.driver?.commissionRate;
        if (cr == null || cr === "") {
          setCommissionUseCompany(true);
          setCommissionPct("");
        } else {
          setCommissionUseCompany(false);
          setCommissionPct(String(Math.round(Number(cr) * 1000) / 10));
        }
        setAudit(Array.isArray(aj.entries) ? aj.entries : []);
        setDetailLoading(false);
      })
      .catch(() => {
        setDetail(null);
        setAudit([]);
        setDetailLoading(false);
      });
  }

  useEffect(() => {
    if (sel && companyId) {
      loadDetailAndAudit(companyId, sel.id);
    } else {
      setDetail(null);
      setAudit([]);
    }
  }, [sel, companyId]);

  async function saveCommissionRate() {
    if (!companyId || !sel?.id) return;
    setActBusy("commission");
    try {
      const res = await fetch(
        `${API_BASE}/admin/taxi-fleet-drivers/${encodeURIComponent(companyId)}/drivers/${encodeURIComponent(sel.id)}/commission-rate`,
        {
          method: "PATCH",
          headers: adminApiHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(
            commissionUseCompany
              ? { useCompanyDefault: true }
              : { commissionRatePercent: Number(commissionPct.replace(",", ".")) },
          ),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data?.error || data?.hint || `HTTP ${res.status}`);
        return;
      }
      setDetail(data.driver || detail);
    } finally {
      setActBusy("");
    }
  }

  async function postAction(path, body) {
    if (!companyId || !sel) return;
    setActBusy(path);
    try {
      const r = await fetch(
        `${API_BASE}/admin/taxi-fleet-drivers/${encodeURIComponent(companyId)}/drivers/${encodeURIComponent(sel.id)}${path}`,
        {
          method: "POST",
          headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
          body: body != null ? JSON.stringify(body) : "{}",
        },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        window.alert(j.error || r.status);
        return;
      }
      loadDrivers(companyId);
      loadDetailAndAudit(companyId, sel.id);
    } finally {
      setActBusy("");
    }
  }

  async function runApproveDriver(despiteGaps = false) {
    if (!companyId || !sel) return;
    setActBusy(despiteGaps ? "/approval-approve-gap" : "/approval-approve");
    const url = `${API_BASE}/admin/taxi-fleet-drivers/${encodeURIComponent(companyId)}/drivers/${encodeURIComponent(sel.id)}/approval`;
    try {
      const payload = despiteGaps
        ? { status: "approved", acknowledgeIncompleteDocuments: true }
        : { status: "approved" };
      const r = await fetch(url, {
        method: "POST",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (!despiteGaps && j?.error === "incomplete_documents_ack_required") return;
        window.alert(typeof j?.error === "string" ? j.error : String(r.status));
        return;
      }
      loadDrivers(companyId);
      loadDetailAndAudit(companyId, sel.id);
    } finally {
      setActBusy("");
    }
  }

  async function patchNotes() {
    if (!companyId || !sel) return;
    setActBusy("notes");
    try {
      const r = await fetch(
        `${API_BASE}/admin/taxi-fleet-drivers/${encodeURIComponent(companyId)}/drivers/${encodeURIComponent(sel.id)}/notes`,
        {
          method: "PATCH",
          headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ adminInternalNote: noteIn, suspensionReason: susReasonIn }),
        },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        window.alert(j.error || r.status);
        return;
      }
      loadDetailAndAudit(companyId, sel.id);
    } finally {
      setActBusy("");
    }
  }

  async function patchMedicalTransport(patch) {
    if (!companyId || !sel) return;
    setActBusy("medical-transport");
    try {
      const r = await fetch(
        `${API_BASE}/admin/taxi-fleet-drivers/${encodeURIComponent(companyId)}/drivers/${encodeURIComponent(sel.id)}/medical-transport`,
        {
          method: "PATCH",
          headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        window.alert(j.error || r.status);
        return;
      }
      loadDrivers(companyId);
      loadDetailAndAudit(companyId, sel.id);
    } finally {
      setActBusy("");
    }
  }

  return (
    <div className="admin-page admin-page--loose admin-page--content">
      <p className="admin-page-lead">
        <strong>Operator-Sicht</strong> — Fahrer je Taxi-Mandant prüfen, Freigabe erteilen, sperren und
        Sperrgrund/Notiz dokumentieren. Änderungen werden in <code>panel_audit_log</code> (Mandant) mitgeschrieben.
      </p>

      <div className="admin-split-layout">
        <div className="admin-split-pane">
          <div className="admin-split-pane__head">1. Taxi-Unternehmen</div>
          <div className="admin-split-pane__body">
            <div className="admin-filter-toolbar admin-filter-toolbar--modern admin-filter-toolbar--single">
              <label className="admin-filter-field">
                <span className="admin-field-label">Unternehmen suchen</span>
                <input
                  className="admin-input"
                  value={cQuery}
                  onChange={(e) => setCQuery(e.target.value)}
                  placeholder="Name oder Mandanten-ID …"
                  type="search"
                  autoComplete="off"
                />
              </label>
            </div>
            {cLoading ? <p className="admin-table-sub">Lade …</p> : null}
            <div className="admin-split-pane__list" style={{ maxHeight: 320 }}>
              {filteredCompanies.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => {
                    setCompanyId(c.id);
                    setSel(null);
                  }}
                  className={`admin-split-list-btn${companyId === c.id ? " admin-split-list-btn--active" : ""}`}
                >
                  <div className="admin-split-list-btn__title">{c.name}</div>
                  <div className="admin-split-list-btn__meta admin-crisp-numeric">{c.id}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="admin-split-pane">
          <div className="admin-split-pane__head">2. Fahrer in diesem Mandanten</div>
          <div className="admin-split-pane__body">
          {!companyId ? (
            <p className="admin-split-list-empty">Bitte links ein Unternehmen wählen.</p>
          ) : dLoading ? (
            <p className="admin-table-sub">Lade Fahrer …</p>
          ) : (
            <>
              <div className="admin-filter-toolbar admin-filter-toolbar--modern admin-filter-toolbar--single" style={{ maxWidth: 420, marginBottom: 10 }}>
                <label className="admin-filter-field">
                  <span className="admin-field-label">Fahrer suchen</span>
                  <input
                    className="admin-input"
                    value={dQuery}
                    onChange={(e) => setDQuery(e.target.value)}
                    placeholder="Name, E-Mail oder Telefon …"
                    type="search"
                    autoComplete="off"
                  />
                </label>
              </div>
              <div className="admin-table-card admin-table-card--embedded" style={{ overflow: "auto", maxHeight: 400 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                      <th style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>Name</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>Status</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>Angelegt</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>Einsatzbereit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDrivers.map((d) => (
                      <tr
                        key={d.id}
                        onClick={() => setSel(d)}
                        style={{
                          cursor: "pointer",
                          background: sel?.id === d.id ? "#e0f2fe" : "#fff",
                        }}
                      >
                        <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>
                          {d.firstName} {d.lastName}
                          <div style={{ fontSize: 11, color: "#64748b" }}>{d.email}</div>
                        </td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>{workflowDe(d.workflow?.key)}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap", fontSize: 12 }}>
                          {fmtTs(d.createdAt)}
                        </td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>{d.readiness?.ready ? "Ja" : "Nein"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          </div>
        </div>
      </div>

      {sel && companyId ? (
        <section className="admin-section-block">
          <div className="admin-section-block__head admin-section-block__head--static">
            <h2 className="admin-section-block__title">Fahrer-Detail</h2>
          </div>
          <div className="admin-section-block__body">
          {detailLoading ? <p>Detail wird geladen…</p> : null}
          {detail && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 13 }}>
              <div>
                <div>
                  <strong>E-Mail</strong> {detail.email}
                </div>
                <div>
                  <strong>Telefon</strong> {detail.phone || "—"}
                </div>
                <div>
                  <strong>Anschrift (Unternehmer)</strong> {detail.homeAddress?.trim() ? detail.homeAddress : "—"}
                </div>
                <div>
                  <strong>Führerschein</strong>{" "}
                  {detail.driversLicenseNumber?.trim()
                    ? `${detail.driversLicenseNumber.trim()} · gültig bis ${detail.driversLicenseExpiry || "—"}`
                    : "—"}
                </div>
                <div>
                  <strong>Freigabe</strong> {workflowDe(detail.workflow?.key)}
                </div>
                <div>
                  <strong>Angelegt am</strong> {fmtTs(detail.createdAt)}
                </div>
                <div>
                  <strong>Einsatzbereit</strong> {detail.readiness?.ready ? "Ja" : "Nein"}
                </div>
                {detail.readiness && !detail.readiness.ready && (
                  <ul style={{ margin: "6px 0 0 18px", color: "#b45309" }}>
                    {(detail.readiness.blockReasons || []).map((b, i) => (
                      <li key={i}>{b.message}</li>
                    ))}
                  </ul>
                )}
                <div>
                  <strong>P-Schein gültig bis</strong> {detail.pScheinExpiry || "—"}{" "}
                  {detail.pScheinDocPresent ? "(PDF: ja)" : "(PDF: nein)"}
                </div>
                <div>
                  <strong>Zugeordnetes Fahrzeug</strong>{" "}
                  {detail.assignedVehicle
                    ? `${detail.assignedVehicle.model} · ${detail.assignedVehicle.licensePlate} · ${detail.assignedVehicle.approvalStatus}`
                    : "—"}
                </div>
                <div>
                  <strong>Letzter Login / Heartbeat</strong> {fmtTs(detail.lastLoginAt)} / {fmtTs(detail.lastHeartbeatAt)}
                </div>
                <div style={{ marginTop: 8, color: "#334155" }}>
                  <strong>Sperrgrund (Feld)</strong> {detail.suspensionReason || "—"}
                </div>
                <div>
                  <strong>Interne Notiz (Plattform)</strong> {detail.adminInternalNote || "—"}
                </div>
                <div style={{ marginTop: 12, maxWidth: 420 }}>
                  <strong>ONRODA Provision (individuell)</strong>
                  <p className="admin-table-sub" style={{ margin: "4px 0 8px" }}>
                    Leer = Mandanten-Satz aus der Mandantenzentrale. Gilt bei Fahrtabschluss für diesen Fahrer.
                  </p>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <input
                      type="checkbox"
                      checked={commissionUseCompany}
                      onChange={(e) => setCommissionUseCompany(e.target.checked)}
                    />
                    <span>Mandanten-Provision verwenden</span>
                  </label>
                  {!commissionUseCompany ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        className="admin-input"
                        style={{ width: 88 }}
                        inputMode="decimal"
                        value={commissionPct}
                        onChange={(e) => setCommissionPct(e.target.value)}
                        placeholder="8"
                      />
                      <span>%</span>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="admin-btn admin-btn--primary"
                    style={{ marginTop: 8 }}
                    disabled={actBusy === "commission"}
                    onClick={() => void saveCommissionRate()}
                  >
                    Provision speichern
                  </button>
                </div>
              </div>
              <div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, alignItems: "center" }}>
                  <button
                    type="button"
                    style={{ padding: "6px 12px" }}
                    disabled={!!actBusy}
                    onClick={() => void runApproveDriver()}
                  >
                    Freigeben
                  </button>
                  <button
                    type="button"
                    style={{ padding: "6px 12px", background: "#f1f5f9" }}
                    disabled={!!actBusy}
                    title="Freigabe ohne vollständige Unterlagen — ohne Rückfrage-Dialog"
                    onClick={() => void runApproveDriver(true)}
                  >
                    Trotz Lücken freigeben
                  </button>
                  <button
                    type="button"
                    style={{ padding: "6px 12px" }}
                    disabled={!!actBusy}
                    onClick={() => {
                      const reason = window.prompt("Ablehnungsgrund (Pflicht):", "");
                      if (reason == null) return;
                      if (!reason.trim()) {
                        window.alert("Grund erforderlich.");
                        return;
                      }
                      postAction("/approval", { status: "rejected", reason: reason.trim() });
                    }}
                  >
                    Ablehnen
                  </button>
                  <button
                    type="button"
                    style={{ padding: "6px 12px" }}
                    disabled={!!actBusy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          "Status „Unterlagen fehlen“ setzen? Fahrer bleibt für die Vermittlung ohne Freigabe.",
                        )
                      )
                        return;
                      postAction("/approval", { status: "missing_documents" });
                    }}
                  >
                    Unterlagen fehlen
                  </button>
                  <button
                    type="button"
                    style={{ padding: "6px 12px" }}
                    disabled={!!actBusy}
                    onClick={() => {
                      const r = window.prompt("Sperrgrund (für Fahrer sichtbar / Akte):", "Administrativ gesperrt");
                      if (r == null) return;
                      postAction("/suspend", { reason: r, adminInternalNote: noteIn || undefined });
                    }}
                  >
                    Sperren
                  </button>
                  <button type="button" style={{ padding: "6px 12px" }} disabled={!!actBusy} onClick={() => postAction("/activate", {})}>
                    Entsperren / aktivieren
                  </button>
                  <button
                    type="button"
                    style={{
                      padding: "6px 12px",
                      borderColor: "#b45309",
                      color: "#92400e",
                      background: detail.readinessOverrideSystem ? "#fef3c7" : "#fffbeb",
                    }}
                    disabled={!!actBusy}
                    title="Nur Plattform-Operator: Fahrer-App behandelt Fahrer als einsatzbereit trotz fehlender Unterlagen (P-Schein, Fahrzeug, Mandanten-Gate). Sperre und explizite Nicht-Freigabe bleiben wirksam."
                    onClick={() => {
                      const on = Boolean(detail.readinessOverrideSystem);
                      const msg = on
                        ? "System-Readiness-Override für diesen Fahrer ausschalten? Danach gelten wieder alle Nachweis-Regeln."
                        : [
                            "System-Readiness-Override aktivieren?",
                            "",
                            "Der Fahrer kann in der Fahrer-App als einsatzbereit gelten, obwohl z. B. P-Schein, Fahrzeugfreigabe oder Mandanten-Nachweise fehlen.",
                            "Gesperrte oder noch nicht freigegebene Fahrer bleiben blockiert.",
                            "",
                            "Nur für interne Tests — fachlich nachziehen oder wieder deaktivieren.",
                          ].join("\n");
                      if (!window.confirm(msg)) return;
                      postAction("/readiness-override-system", { enabled: !on });
                    }}
                  >
                    {detail.readinessOverrideSystem ? "System-Override aus" : "System: trotz fehlender Unterlagen einsatzbereit"}
                  </button>
                </div>
                {detail.readinessOverrideSystem ? (
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#92400e", maxWidth: 560 }}>
                    <strong>Hinweis:</strong> System-Readiness-Override ist aktiv — Einsatzbereitschaft ignoriert fehlende
                    Unterlagen/Fahrzeug/Mandanten-Gate (nicht: Sperre / keine Plattform-Freigabe).
                  </p>
                ) : null}
                <div
                  style={{
                    marginTop: 16,
                    padding: 12,
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    maxWidth: 560,
                    background: detail.medicalTransportAuthorized ? "#ecfdf5" : "#f8fafc",
                  }}
                >
                  <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>Krankenfahrten</h3>
                  <p style={{ margin: "0 0 10px", fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
                    Unternehmen:{" "}
                    <strong>{detail.medicalTransportCompanyEnabled ? "freigegeben" : "nicht freigegeben"}</strong>
                    {" · "}
                    Effektiv für Fahrer:{" "}
                    <strong>{detail.medicalTransportAuthorized ? "Ja" : "Nein"}</strong>
                  </p>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(detail.medicalTransportInheritFromCompany)}
                      disabled={actBusy === "medical-transport"}
                      onChange={(e) => {
                        patchMedicalTransport({ inheritFromCompany: e.target.checked });
                      }}
                    />
                    Vom Unternehmen erben
                  </label>
                  {!detail.medicalTransportInheritFromCompany ? (
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(detail.medicalTransportEnabled)}
                        disabled={actBusy === "medical-transport" || !detail.medicalTransportCompanyEnabled}
                        onChange={(e) => {
                          patchMedicalTransport({ enabled: e.target.checked });
                        }}
                      />
                      Krankenfahrten freigegeben (Fahrer-Override)
                    </label>
                  ) : null}
                  {!detail.medicalTransportCompanyEnabled ? (
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: "#b45309" }}>
                      Mandant hat keine Krankenfahrt-Freigabe — zuerst in der Mandantenzentrale aktivieren.
                    </p>
                  ) : null}
                </div>
                <div style={{ marginTop: 8 }}>
                  <label>
                    Sperrgrund (editierbar)
                    <br />
                    <textarea
                      value={susReasonIn}
                      onChange={(e) => setSusReasonIn(e.target.value)}
                      rows={2}
                      style={{ width: "100%", maxWidth: 400, marginTop: 4 }}
                    />
                  </label>
                </div>
                <div style={{ marginTop: 8 }}>
                  <label>
                    Interne Notiz
                    <br />
                    <textarea
                      value={noteIn}
                      onChange={(e) => setNoteIn(e.target.value)}
                      rows={2}
                      style={{ width: "100%", maxWidth: 400, marginTop: 4 }}
                    />
                  </label>
                </div>
                <button type="button" style={{ marginTop: 8, padding: "6px 12px" }} disabled={actBusy === "notes"} onClick={patchNotes}>
                  Notizen / Sperrgrund speichern
                </button>
                <h3 style={{ fontSize: 14, marginTop: 20 }}>Audit (Ausschnitt)</h3>
                <div style={{ maxHeight: 200, overflow: "auto", fontSize: 11, fontFamily: "ui-monospace" }}>
                  {audit.length === 0 ? "—" : null}
                  {audit.map((e) => (
                    <div key={e.id} style={{ borderBottom: "1px solid #f1f5f9", padding: "4px 0" }}>
                      {fmtTs(e.createdAt)} <strong>{e.action}</strong> {e.subjectId ? e.subjectId : ""}
                      {e.actorPanelUserId ? (
                        <span style={{ color: "#64748b" }}> · Panel-Nutzer: {e.actorPanelUserId}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
