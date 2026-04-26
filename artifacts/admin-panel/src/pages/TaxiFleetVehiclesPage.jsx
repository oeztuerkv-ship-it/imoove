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

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    const s = String(iso).trim().slice(0, 10);
    const d = new Date(`${s}T12:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("de-DE", { dateStyle: "short" });
  } catch {
    return "—";
  }
}

function approvalDe(key) {
  const m = {
    draft: "Entwurf",
    pending_approval: "Wartet auf Prüfung",
    approved: "Freigegeben",
    rejected: "Abgelehnt",
    blocked: "Gesperrt",
  };
  return m[key] || key || "—";
}

function vehicleTypeDe(t) {
  const m = {
    sedan: "Limousine",
    station_wagon: "Kombi",
    van: "Van",
    wheelchair: "Rollstuhl",
  };
  return m[t] || t || "—";
}

function legalTypeDe(t) {
  return t === "rental_car" ? "Mietwagen" : "Taxi";
}

function docFileUrl(companyId, vehicleId, storageKey) {
  const u = new URL(
    `${API_BASE}/admin/taxi-fleet-vehicles/${encodeURIComponent(companyId)}/vehicles/${encodeURIComponent(vehicleId)}/documents/file`,
  );
  u.searchParams.set("storageKey", storageKey);
  return u.toString();
}

export default function TaxiFleetVehiclesPage() {
  const [companies, setCompanies] = useState([]);
  const [cLoading, setCLoading] = useState(true);
  const [cQuery, setCQuery] = useState("");
  const [companyId, setCompanyId] = useState("");

  const [rows, setRows] = useState([]);
  const [dLoading, setDLoading] = useState(false);
  const [dQuery, setDQuery] = useState("");

  const [sel, setSel] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [audit, setAudit] = useState([]);
  const [noteIn, setNoteIn] = useState("");
  const [blockReasonIn, setBlockReasonIn] = useState("");
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

  const loadVehicles = useCallback((cid) => {
    if (!cid) {
      setRows([]);
      return;
    }
    setDLoading(true);
    fetch(`${API_BASE}/admin/taxi-fleet-vehicles/${encodeURIComponent(cid)}/vehicles`, { headers: adminApiHeaders() })
      .then((r) => r.json())
      .then((j) => {
        setRows(Array.isArray(j.items) ? j.items : []);
        setDLoading(false);
      })
      .catch(() => {
        setRows([]);
        setDLoading(false);
      });
  }, []);

  useEffect(() => {
    if (companyId) loadVehicles(companyId);
  }, [companyId, loadVehicles]);

  const filteredCompanies = useMemo(() => {
    const q = cQuery.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => (c.name || "").toLowerCase().includes(q) || (c.id || "").toLowerCase().includes(q));
  }, [companies, cQuery]);

  const flatList = useMemo(() => {
    return rows.map((r) => ({
      ...r.vehicle,
      assignedDriver: r.assignedDriver,
    }));
  }, [rows]);

  const filteredVehicles = useMemo(() => {
    const q = dQuery.trim().toLowerCase();
    if (!q) return flatList;
    return flatList.filter((v) => {
      const a = [
        v.licensePlate,
        v.model,
        v.konzessionNumber,
        v.id,
        v.assignedDriver?.firstName,
        v.assignedDriver?.lastName,
        v.assignedDriver?.email,
      ]
        .map((x) => String(x || "").toLowerCase())
        .join(" ");
      return a.includes(q);
    });
  }, [flatList, dQuery]);

  function loadDetailAndAudit(cid, vehicleId) {
    if (!cid || !vehicleId) return;
    setDetailLoading(true);
    setDetail(null);
    setAudit([]);
    const h = adminApiHeaders();
    Promise.all([
      fetch(`${API_BASE}/admin/taxi-fleet-vehicles/${encodeURIComponent(cid)}/vehicles/${encodeURIComponent(vehicleId)}`, {
        headers: h,
      }).then((r) => r.json()),
      fetch(
        `${API_BASE}/admin/taxi-fleet-vehicles/${encodeURIComponent(cid)}/audit?subjectId=${encodeURIComponent(vehicleId)}&limit=80`,
        { headers: h },
      ).then((r) => r.json()),
    ])
      .then(([dj, aj]) => {
        if (dj.vehicle) {
          setDetail(dj);
        } else {
          setDetail(null);
        }
        setNoteIn(dj.vehicle?.adminInternalNote || "");
        setBlockReasonIn(dj.vehicle?.blockReason || "");
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
        `${API_BASE}/admin/taxi-fleet-vehicles/${encodeURIComponent(companyId)}/vehicles/${encodeURIComponent(sel.id)}${path}`,
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
      loadVehicles(companyId);
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
        `${API_BASE}/admin/taxi-fleet-vehicles/${encodeURIComponent(companyId)}/vehicles/${encodeURIComponent(sel.id)}/notes`,
        {
          method: "PATCH",
          headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ adminInternalNote: noteIn, blockReason: blockReasonIn }),
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

  const vEinsatzbereit = (v) => v && v.approvalStatus === "approved";

  async function openPdf(vehicleId, storageKey) {
    if (!companyId) return;
    try {
      const res = await fetch(docFileUrl(companyId, vehicleId, storageKey), { headers: adminApiHeaders() });
      if (!res.ok) {
        window.alert("PDF konnte nicht geladen werden.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      window.alert("PDF konnte nicht geöffnet werden.");
    }
  }

  return (
    <div className="admin-page" style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: 1280 }}>
      <h1 style={{ marginTop: 0, color: "#0f172a" }}>Taxi · Fahrzeuge (Plattform)</h1>
      <p style={{ color: "#64748b", maxWidth: 720, lineHeight: 1.5, marginBottom: 20 }}>
        <strong>Operator-Sicht</strong> — Fahrzeuge je Taxi-Mandant prüfen, freigeben, sperren und Sperrgrund/Notiz
        dokumentieren. Änderungen werden in <code>panel_audit_log</code> (Mandant) mitgeschrieben.
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
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>2. Fahrzeuge in diesem Mandanten</div>
          {!companyId ? (
            <p style={{ color: "#94a3b8" }}>Bitte links ein Unternehmen wählen.</p>
          ) : dLoading ? (
            <p className="admin-table-sub">Lade Fahrzeuge …</p>
          ) : (
            <>
              <input
                value={dQuery}
                onChange={(e) => setDQuery(e.target.value)}
                placeholder="Fahrzeug suchen (Kennzeichen, Modell, Fahrer)…"
                style={{ width: "100%", maxWidth: 420, padding: "8px 10px", marginBottom: 10, border: "1px solid #cbd5e1", borderRadius: 6 }}
              />
              <div style={{ overflow: "auto", maxHeight: 400, border: "1px solid #e2e8f0", borderRadius: 6 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                      <th style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>Kennzeichen</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>Status</th>
                      <th style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>Einsatzbereit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVehicles.map((v) => (
                      <tr
                        key={v.id}
                        onClick={() => setSel(v)}
                        style={{
                          cursor: "pointer",
                          background: sel?.id === v.id ? "#e0f2fe" : "#fff",
                        }}
                      >
                        <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>
                          {v.licensePlate}
                          <div style={{ fontSize: 11, color: "#64748b" }}>{v.model || "—"}</div>
                        </td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>{approvalDe(v.approvalStatus)}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>{vEinsatzbereit(v) ? "Ja" : "Nein"}</td>
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
          <h2 style={{ marginTop: 0, fontSize: 18, color: "#0f172a" }}>Fahrzeug-Detail</h2>
          {detailLoading ? <p>Detail wird geladen…</p> : null}
          {detail && detail.vehicle && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 13 }}>
              <div>
                <div>
                  <strong>Kennzeichen</strong> {detail.vehicle.licensePlate}
                </div>
                <div>
                  <strong>Hersteller / Modell</strong> {detail.vehicle.model || "—"}
                </div>
                <div>
                  <strong>Baujahr</strong> {detail.vehicle.modelYear != null ? detail.vehicle.modelYear : "—"}
                </div>
                <div>
                  <strong>Farbe</strong> {detail.vehicle.color || "—"}
                </div>
                <div>
                  <strong>Fahrzeugtyp / Klasse</strong> {vehicleTypeDe(detail.vehicle.vehicleType)} · {legalTypeDe(detail.vehicle.vehicleLegalType)} · {detail.vehicle.vehicleClass}
                </div>
                <div>
                  <strong>Sitzplätze</strong> {detail.vehicle.passengerSeats != null ? detail.vehicle.passengerSeats : "—"}
                </div>
                <div>
                  <strong>Konzession / Ordnungsnr.</strong> {detail.vehicle.konzessionNumber || detail.vehicle.taxiOrderNumber || "—"}
                </div>
                <div>
                  <strong>TÜV (Hauptuntersuchung) gültig bis</strong> {fmtDate(detail.vehicle.nextInspectionDate)}
                </div>
                <div>
                  <strong>Dokumente</strong>{" "}
                  {Array.isArray(detail.vehicle.vehicleDocuments) && detail.vehicle.vehicleDocuments.length > 0
                    ? `${detail.vehicle.vehicleDocuments.length} Datei(en)`
                    : "keine"}
                </div>
                <div style={{ color: "#64748b" }}>
                  Versicherungs-/HUK-Nachweise: bitte hochgeladene PDFs prüfen (kein separates Versicherungs-Flag in der DB).
                </div>
                <div>
                  <strong>approval_status</strong> <code>{detail.vehicle.approvalStatus}</code>
                </div>
                <div>
                  <strong>Plattform: einsatzbereit (Freigabe)</strong> {vEinsatzbereit(detail.vehicle) ? "Ja" : "Nein"}
                </div>
                {detail.vehicle.approvalStatus !== "approved" && (
                  <p style={{ color: "#b45309", marginTop: 8, marginBottom: 0, lineHeight: 1.45 }}>
                    Solange das Fahrzeug nicht freigegeben ist, kann der zugewiesene Fahrer nicht einsatzbereit werden (Fahrer-Logik
                    & Zuweisung).
                  </p>
                )}
                <div>
                  <strong>Zugewiesener Fahrer</strong>{" "}
                  {detail.assignedDriver
                    ? `${detail.assignedDriver.firstName} ${detail.assignedDriver.lastName} · ${detail.assignedDriver.email}`
                    : "—"}
                </div>
                <div>
                  <strong>Letzte Fahrt (Näherung: letzte Fahrt des zugewiesenen Fahrers im Mandanten)</strong>
                  {detail.lastRide
                    ? ` ${fmtTs(detail.lastRide.createdAt)} — ${detail.lastRide.status} — ${detail.lastRide.fromLabel} → ${detail.lastRide.toLabel}`
                    : " —"}
                </div>
                {detail.vehicle.rejectionReason ? (
                  <div style={{ marginTop: 8, color: "#b45309" }}>
                    <strong>Ablehnungsgrund (Prüfung)</strong> {detail.vehicle.rejectionReason}
                  </div>
                ) : null}
                <div style={{ marginTop: 8, color: "#334155" }}>
                  <strong>Sperrgrund (Feld)</strong> {detail.vehicle.blockReason || "—"}
                </div>
                <div>
                  <strong>Interne Notiz (Plattform)</strong> {detail.vehicle.adminInternalNote || "—"}
                </div>
                <div style={{ marginTop: 8 }}>
                  <strong>Dokumente öffnen (PDF)</strong>
                  <ul style={{ margin: "4px 0 0 18px" }}>
                    {(detail.vehicle.vehicleDocuments || []).length === 0 ? (
                      <li>—</li>
                    ) : (
                      (detail.vehicle.vehicleDocuments || []).map((d, i) => (
                        <li key={d.storageKey + i} style={{ marginBottom: 4 }}>
                          <button type="button" className="admin-link" onClick={() => void openPdf(detail.vehicle.id, d.storageKey)}>
                            Anzeigen {i + 1} ({d.storageKey})
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
              <div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  <button
                    type="button"
                    style={{ padding: "6px 12px" }}
                    disabled={!!actBusy}
                    onClick={() => postAction("/approve", {})}
                  >
                    Freigeben
                  </button>
                  <button
                    type="button"
                    style={{ padding: "6px 12px" }}
                    disabled={!!actBusy}
                    onClick={() => {
                      const r = window.prompt("Ablehnungsgrund (sichtbar für den Partner-Workflow):", "");
                      if (r == null) return;
                      postAction("/reject", { reason: r });
                    }}
                  >
                    Ablehnen
                  </button>
                  <button
                    type="button"
                    style={{ padding: "6px 12px" }}
                    disabled={!!actBusy}
                    onClick={() => {
                      const r = window.prompt("Sperrgrund (Plattform, wird gespeichert):", "Administrativ gesperrt");
                      if (r == null) return;
                      postAction("/block", { blockReason: r, adminInternalNote: noteIn || undefined });
                    }}
                  >
                    Sperren
                  </button>
                  <button type="button" style={{ padding: "6px 12px" }} disabled={!!actBusy} onClick={() => postAction("/unblock", {})}>
                    Entsperren
                  </button>
                </div>
                <div style={{ marginTop: 8 }}>
                  <label>
                    Sperrgrund (editierbar)
                    <br />
                    <textarea
                      value={blockReasonIn}
                      onChange={(e) => setBlockReasonIn(e.target.value)}
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
