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
    in_review: "In Prüfung",
    pending: "Angelegt",
    approved: "Freigegeben",
    unknown: "—",
  };
  return m[key] || key || "—";
}

export default function TaxiFleetDriversPage() {
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

  return (
    <div className="admin-page" style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: 1280 }}>
      <h1 style={{ marginTop: 0, color: "#0f172a" }}>Taxi · Fahrer (Plattform)</h1>
      <p style={{ color: "#64748b", maxWidth: 720, lineHeight: 1.5, marginBottom: 20 }}>
        <strong>Operator-Sicht</strong> — Fahrer je Taxi-Mandant prüfen, Freigabe erteilen, sperren und
        Sperrgrund/Notiz dokumentieren. Änderungen werden in <code>panel_audit_log</code> (Mandant) mitgeschrieben.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) 1.2fr", gap: 20, alignItems: "start" }}>
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, background: "#fafafa" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>1. Taxi-Unternehmen</div>
          <input
            value={cQuery}
            onChange={(e) => setCQuery(e.target.value)}
            placeholder="Suche (Name, ID)…"
            style={{ width: "100%", padding: "8px 10px", marginBottom: 10, border: "1px solid #cbd5e1", borderRadius: 6 }}
          />
          {cLoading ? <p className="admin-table-sub">Lade …</p> : null}
          <div style={{ maxHeight: 320, overflow: "auto" }}>
            {filteredCompanies.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => {
                  setCompanyId(c.id);
                  setSel(null);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  marginBottom: 4,
                  border: "1px solid " + (companyId === c.id ? "#0ea5e9" : "#e2e8f0"),
                  borderRadius: 6,
                  background: companyId === c.id ? "#e0f2fe" : "#fff",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 600, color: "#0f172a" }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "#64748b", fontFamily: "ui-monospace" }}>{c.id}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>2. Fahrer in diesem Mandanten</div>
          {!companyId ? (
            <p style={{ color: "#94a3b8" }}>Bitte links ein Unternehmen wählen.</p>
          ) : dLoading ? (
            <p className="admin-table-sub">Lade Fahrer …</p>
          ) : (
            <>
              <input
                value={dQuery}
                onChange={(e) => setDQuery(e.target.value)}
                placeholder="Fahrer suchen (Name, E-Mail, Telefon)…"
                style={{ width: "100%", maxWidth: 420, padding: "8px 10px", marginBottom: 10, border: "1px solid #cbd5e1", borderRadius: 6 }}
              />
              <div style={{ overflow: "auto", maxHeight: 400, border: "1px solid #e2e8f0", borderRadius: 6 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                      <th style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>Name</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>Status</th>
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

      {sel && companyId && (
        <div style={{ marginTop: 24, border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, background: "#fff" }}>
          <h2 style={{ marginTop: 0, fontSize: 18, color: "#0f172a" }}>Fahrer-Detail</h2>
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
                  <strong>approval_status</strong> <code>{detail.approvalStatus}</code>
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
              </div>
              <div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  <button
                    type="button"
                    style={{ padding: "6px 12px" }}
                    disabled={!!actBusy}
                    onClick={() => postAction("/approval", { status: "approved" })}
                  >
                    Freigeben
                  </button>
                  <button
                    type="button"
                    style={{ padding: "6px 12px" }}
                    disabled={!!actBusy}
                    onClick={() => {
                      if (!window.confirm("Fahrer wirklich ablehnen?")) return;
                      postAction("/approval", { status: "rejected" });
                    }}
                  >
                    Ablehnen
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
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
