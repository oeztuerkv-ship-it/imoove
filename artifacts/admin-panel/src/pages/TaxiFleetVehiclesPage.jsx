import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";
import { groupFleetVehicleDocumentsForAdmin } from "../lib/fleetVehicleDocumentsAdmin.js";

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
    missing_documents: "Unterlagen fehlen",
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

function vehicleClassDe(t) {
  const m = {
    standard: "Standard",
    xl: "XL / Großraum",
    wheelchair: "Rollstuhl / barrierefrei",
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

function vEinsatzbereit(v) {
  return v && v.approvalStatus === "approved";
}

function vBlocked(v) {
  return v && v.approvalStatus === "blocked";
}

function approvalBadgeClass(status) {
  if (status === "approved") return "admin-c-badge--ok";
  if (status === "rejected" || status === "blocked") return "admin-c-badge--err";
  if (status === "pending_approval" || status === "draft" || status === "missing_documents") return "admin-c-badge--warn";
  return "admin-c-badge--neutral";
}

function fmtAuditMeta(meta) {
  if (meta == null || typeof meta !== "object" || Object.keys(meta).length === 0) return null;
  try {
    const j = JSON.stringify(meta);
    if (j.length > 400) return `${j.slice(0, 400)}…`;
    return j;
  } catch {
    return null;
  }
}

function auditActionDe(action) {
  const m = {
    "admin.fleet_vehicle.approved": "Fahrzeug freigegeben",
    "admin.fleet_vehicle.rejected": "Fahrzeug abgelehnt",
    "admin.fleet_vehicle.missing_documents": "Unterlagen fehlen (gesetzt)",
    "admin.fleet_vehicle.blocked": "Fahrzeug gesperrt",
    "admin.fleet_vehicle.unblocked": "Fahrzeug entsperrt",
    "admin.fleet_vehicle.notes_patched": "Sperrgrund/Notiz aktualisiert",
    "admin.fleet_vehicle.created": "Fahrzeug angelegt (Admin)",
    "admin.fleet_vehicle.stammdaten_patched": "Stammdaten aktualisiert",
  };
  return m[action] || action;
}

function KvRow({ label, children, wideValue }) {
  return (
    <div className={`admin-taxi-fv-kv__row${wideValue ? " admin-taxi-fv-kv__row--stack" : ""}`}>
      <div className="admin-taxi-fv-kv__k">{label}</div>
      <div className="admin-taxi-fv-kv__v">{children}</div>
    </div>
  );
}

export default function TaxiFleetVehiclesPage({ initialCompanyId = null, onInitialCompanyConsumed }) {
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
  const [createForm, setCreateForm] = useState({
    licensePlate: "",
    model: "",
    color: "",
    konzessionNumber: "",
    nextInspectionDate: "",
  });
  const [createBusy, setCreateBusy] = useState(false);
  const [stammdatenForm, setStammdatenForm] = useState({
    licensePlate: "",
    model: "",
    color: "",
    konzessionNumber: "",
    nextInspectionDate: "",
  });
  const [stammdatenBusy, setStammdatenBusy] = useState(false);

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

  const selectedCompanyName = useMemo(
    () => (companyId ? companies.find((c) => c.id === companyId)?.name : "") || "",
    [companies, companyId],
  );

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

  useEffect(() => {
    const v = detail?.vehicle;
    if (!v) return;
    setStammdatenForm({
      licensePlate: v.licensePlate || "",
      model: v.model || "",
      color: v.color || "",
      konzessionNumber: v.konzessionNumber || v.taxiOrderNumber || "",
      nextInspectionDate: v.nextInspectionDate ? String(v.nextInspectionDate).slice(0, 10) : "",
    });
  }, [detail?.vehicle?.id, detail?.vehicle?.licensePlate, detail?.vehicle?.model, detail?.vehicle?.color, detail?.vehicle?.konzessionNumber, detail?.vehicle?.taxiOrderNumber, detail?.vehicle?.nextInspectionDate]);

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

  async function runApproveVehicle(despiteGaps = false) {
    if (!companyId || !sel) return;
    setActBusy(despiteGaps ? "/approve-gap" : "/approve");
    try {
      const url = `${API_BASE}/admin/taxi-fleet-vehicles/${encodeURIComponent(companyId)}/vehicles/${encodeURIComponent(sel.id)}/approve`;
      const payload = despiteGaps ? { acknowledgeIncompleteDocuments: true } : {};
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

  async function createVehicleAdmin(e) {
    e.preventDefault();
    if (!companyId) return;
    setCreateBusy(true);
    try {
      const plate = createForm.licensePlate.trim();
      const res = await fetch(`${API_BASE}/admin/taxi-fleet-vehicles/${encodeURIComponent(companyId)}/vehicles`, {
        method: "POST",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          licensePlate: plate,
          model: createForm.model.trim(),
          color: createForm.color.trim(),
          konzessionNumber: createForm.konzessionNumber.trim(),
          nextInspectionDate: createForm.nextInspectionDate.trim() || null,
          approveNow: true,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        window.alert(j?.error === "konzession_number_required" ? "Konzessionsnummer fehlt." : j?.error || "Anlegen fehlgeschlagen.");
        return;
      }
      setCreateForm({ licensePlate: "", model: "", color: "", konzessionNumber: "", nextInspectionDate: "" });
      loadVehicles(companyId);
      if (j.id) {
        setSel({ id: j.id, licensePlate: plate });
      }
    } catch {
      window.alert("Anlegen fehlgeschlagen.");
    } finally {
      setCreateBusy(false);
    }
  }

  async function saveStammdatenAdmin() {
    if (!companyId || !sel?.id) return;
    setStammdatenBusy(true);
    try {
      const res = await fetch(
        `${API_BASE}/admin/taxi-fleet-vehicles/${encodeURIComponent(companyId)}/vehicles/${encodeURIComponent(sel.id)}/stammdaten`,
        {
          method: "PATCH",
          headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            licensePlate: stammdatenForm.licensePlate.trim(),
            model: stammdatenForm.model.trim(),
            color: stammdatenForm.color.trim(),
            konzessionNumber: stammdatenForm.konzessionNumber.trim(),
            nextInspectionDate: stammdatenForm.nextInspectionDate.trim() || null,
          }),
        },
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        window.alert(j?.error || "Speichern fehlgeschlagen.");
        return;
      }
      loadVehicles(companyId);
      loadDetailAndAudit(companyId, sel.id);
    } catch {
      window.alert("Speichern fehlgeschlagen.");
    } finally {
      setStammdatenBusy(false);
    }
  }

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
    <div className="admin-page admin-page--loose admin-page--content admin-taxi-fv-page">
      <p className="admin-page-lead">
        <strong>Operator-Sicht</strong> — Fahrzeuge je Taxi-Mandant prüfen, freigeben, sperren und Sperrgrund/Notiz
        dokumentieren. Änderungen werden in <code>panel_audit_log</code> (Mandant) mitgeschrieben.
      </p>

      <div className="admin-taxi-fv-workgrid">
        <section className="admin-taxi-fv-side" aria-label="Mandant wählen">
          <div className="admin-taxi-fv-sidelabel">1. Taxi-Unternehmen</div>
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
          <div className="admin-taxi-fv-side-scroll" role="list">
            {filteredCompanies.map((c) => (
              <button
                type="button"
                key={c.id}
                role="listitem"
                onClick={() => {
                  setCompanyId(c.id);
                  setSel(null);
                }}
                className={`admin-taxi-fv-corpick${companyId === c.id ? " is-active" : ""}`}
              >
                <div className="admin-taxi-fv-corpick__name">{c.name}</div>
                <div className="admin-taxi-fv-corpick__id">{c.id}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="admin-taxi-fv-veh" aria-label="Fahrzeuge im Mandanten">
          <div className="admin-taxi-fv-sidelabel">2. Fahrzeuge in diesem Mandanten</div>
          {!companyId ? (
            <p className="admin-taxi-fv-muted">Bitte links ein Unternehmen wählen.</p>
          ) : dLoading ? (
            <p className="admin-table-sub">Lade Fahrzeuge …</p>
          ) : (
            <>
              <form className="admin-m-form admin-taxi-fv-create" onSubmit={createVehicleAdmin} style={{ marginBottom: 14, maxWidth: 720 }}>
                <div className="admin-m-card__h" style={{ marginBottom: 8 }}>
                  <span className="admin-panel-card__title" style={{ margin: 0, fontSize: "1rem" }}>
                    Neues Fahrzeug (direkt freigegeben)
                  </span>
                </div>
                <div className="admin-m-form" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
                  <label className="admin-m-lbl">
                    Kennzeichen *
                    <input className="admin-m-inp" value={createForm.licensePlate} onChange={(e) => setCreateForm((f) => ({ ...f, licensePlate: e.target.value }))} required />
                  </label>
                  <label className="admin-m-lbl">
                    Konzession *
                    <input className="admin-m-inp" value={createForm.konzessionNumber} onChange={(e) => setCreateForm((f) => ({ ...f, konzessionNumber: e.target.value }))} required />
                  </label>
                  <label className="admin-m-lbl">
                    Modell
                    <input className="admin-m-inp" value={createForm.model} onChange={(e) => setCreateForm((f) => ({ ...f, model: e.target.value }))} />
                  </label>
                  <label className="admin-m-lbl">
                    Farbe
                    <input className="admin-m-inp" value={createForm.color} onChange={(e) => setCreateForm((f) => ({ ...f, color: e.target.value }))} />
                  </label>
                  <label className="admin-m-lbl">
                    TÜV bis
                    <input className="admin-m-inp" type="date" value={createForm.nextInspectionDate} onChange={(e) => setCreateForm((f) => ({ ...f, nextInspectionDate: e.target.value }))} />
                  </label>
                </div>
                <button type="submit" className="admin-c-btn" disabled={createBusy} style={{ marginTop: 10 }}>
                  {createBusy ? "Speichert …" : "Fahrzeug anlegen"}
                </button>
              </form>
              <div className="admin-filter-toolbar admin-filter-toolbar--modern admin-filter-toolbar--single" style={{ maxWidth: 480, marginBottom: 10 }}>
                <label className="admin-filter-field">
                  <span className="admin-field-label">Fahrzeug suchen</span>
                  <input
                    className="admin-input"
                    value={dQuery}
                    onChange={(e) => setDQuery(e.target.value)}
                    placeholder="Kennzeichen, Modell oder Fahrer …"
                    type="search"
                    autoComplete="off"
                  />
                </label>
              </div>
              <div className="admin-taxi-fv-tablewrap">
                <table className="admin-taxi-fv-table">
                  <thead>
                    <tr>
                      <th>Kennzeichen</th>
                      <th>Status</th>
                      <th>Plattform einsatzbereit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVehicles.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="admin-taxi-fv-muted" style={{ padding: "16px 12px" }}>
                          {dQuery.trim() ? "Keine Fahrzeuge passend zur Suche." : "Keine Fahrzeuge in diesem Mandanten."}
                        </td>
                      </tr>
                    ) : null}
                    {filteredVehicles.map((v) => (
                      <tr
                        key={v.id}
                        className={sel?.id === v.id ? "is-sel" : ""}
                        onClick={() => setSel(v)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSel(v);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-selected={sel?.id === v.id}
                      >
                        <td>
                          <span className="admin-taxi-fv-tdpl">{v.licensePlate}</span>
                          <div className="admin-taxi-fv-tdsub">
                            {v.model || "—"}
                            {v.konzessionNumber || v.taxiOrderNumber
                              ? ` · Konz. ${v.konzessionNumber || v.taxiOrderNumber}`
                              : ""}
                          </div>
                        </td>
                        <td>
                          <span className={`admin-c-badge ${approvalBadgeClass(v.approvalStatus)}`}>
                            {approvalDe(v.approvalStatus)}
                          </span>
                        </td>
                        <td>
                          {vEinsatzbereit(v) ? (
                            <span className="admin-c-badge admin-c-badge--ok">Ja</span>
                          ) : (
                            <span className="admin-c-badge admin-c-badge--warn">Nein</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>

      {sel && companyId && (
        <div className="admin-taxi-fv-detail">
          {detailLoading && !detail ? (
            <p className="admin-table-sub">Fahrzeugdetails werden geladen …</p>
          ) : null}

          {detail && detail.vehicle && (
            <>
              <header className="admin-m-hero">
                <div className="admin-m-hero__bar">
                  <div className="admin-m-hero__left">
                    <div className="admin-taxi-fv-eyebrow">
                      Taxi-Mandant: {detail.companyName || selectedCompanyName || detail.companyId || companyId}
                    </div>
                    <h1 className="admin-m-hero__title">{detail.vehicle.licensePlate}</h1>
                    <p className="admin-taxi-fv-heroline">{detail.vehicle.model || "—"}</p>
                    <div className="admin-m-hero__badges">
                      <span className={`admin-c-badge ${approvalBadgeClass(detail.vehicle.approvalStatus)}`} title="Freigabestatus">
                        {approvalDe(detail.vehicle.approvalStatus)}
                      </span>
                      {vEinsatzbereit(detail.vehicle) ? (
                        <span className="admin-c-badge admin-c-badge--ok" title="Für Matching / Flotte einsatzbereit">
                          Einsatzbereit: Ja
                        </span>
                      ) : (
                        <span className="admin-c-badge admin-c-badge--warn" title="Für Matching / Flotte einsatzbereit">
                          Einsatzbereit: Nein
                        </span>
                      )}
                      {vBlocked(detail.vehicle) ? (
                        <span className="admin-c-badge admin-c-badge--err">Gesperrt / blockiert: Ja</span>
                      ) : (
                        <span className="admin-c-badge admin-c-badge--neutral">Gesperrt / blockiert: Nein</span>
                      )}
                    </div>
                    <p className="admin-m-hero__hint" style={{ marginTop: 10, maxWidth: 720 }}>
                      Sperrgrund (partner-sichtbar) und interne Plattform-Notiz stellen Sie unten ein. Aktionen Freigeben,
                      Ablehnen, Sperren und Entsperren finden sich oben rechts.
                    </p>
                  </div>
                  <div className="admin-taxi-fv-heroactions admin-m-hero__actions">
                    <button
                      type="button"
                      className="admin-m-btn-bearb"
                      disabled={!!actBusy}
                      onClick={() => void runApproveVehicle()}
                    >
                      {actBusy === "/approve" ? "…" : "Freigeben"}
                    </button>
                    <button
                      type="button"
                      className="admin-c-btn-sec"
                      disabled={!!actBusy}
                      title="Freigabe ohne vollständige Unterlagen — ohne Rückfrage-Dialog"
                      onClick={() => void runApproveVehicle(true)}
                    >
                      {actBusy === "/approve-gap" ? "…" : "Trotz Lücken freigeben"}
                    </button>
                    <button
                      type="button"
                      className="admin-c-btn-sec"
                      disabled={!!actBusy}
                      onClick={() => {
                        const r = window.prompt("Ablehnungsgrund (sichtbar im Partner-Workflow):", "");
                        if (r == null) return;
                        postAction("/reject", { reason: r });
                      }}
                    >
                      {actBusy === "/reject" ? "…" : "Ablehnen"}
                    </button>
                    <button
                      type="button"
                      className="admin-c-btn-sec"
                      disabled={!!actBusy}
                      onClick={() => {
                        if (
                          !window.confirm(
                            "Status „Unterlagen fehlen“ setzen? Das Fahrzeug bleibt für die Vermittlung inaktiv, bis unterlagen nachgereicht und erneut freigegeben wird.",
                          )
                        )
                          return;
                        postAction("/mark-missing-documents", {});
                      }}
                    >
                      {actBusy === "/mark-missing-documents" ? "…" : "Unterlagen fehlen"}
                    </button>
                    <button
                      type="button"
                      className="admin-c-btn-sec"
                      disabled={!!actBusy}
                      onClick={() => {
                        const r = window.prompt("Sperrgrund (für Partner sichtbar, wird gespeichert):", "Administrativ gesperrt");
                        if (r == null) return;
                        postAction("/block", { blockReason: r, adminInternalNote: noteIn || undefined });
                      }}
                    >
                      {actBusy === "/block" ? "…" : "Sperren"}
                    </button>
                    <button
                      type="button"
                      className="admin-c-btn-sec"
                      disabled={!!actBusy}
                      onClick={() => postAction("/unblock", {})}
                    >
                      {actBusy === "/unblock" ? "…" : "Entsperren"}
                    </button>
                  </div>
                </div>
              </header>

              <div className="admin-taxi-fv-cards">
                <section className="admin-panel-card admin-m-card admin-m-card--unified">
                  <div className="admin-m-card__h">
                    <span className="admin-panel-card__title" style={{ margin: 0 }}>
                      Fahrzeug — Stammdaten
                    </span>
                    <button type="button" className="admin-c-btn" disabled={stammdatenBusy} onClick={() => void saveStammdatenAdmin()}>
                      {stammdatenBusy ? "Speichert …" : "Stammdaten speichern"}
                    </button>
                  </div>
                  <div className="admin-m-form" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", padding: "12px 14px 16px", gap: 10 }}>
                    <label className="admin-m-lbl">
                      Kennzeichen
                      <input className="admin-m-inp" value={stammdatenForm.licensePlate} onChange={(e) => setStammdatenForm((f) => ({ ...f, licensePlate: e.target.value }))} />
                    </label>
                    <label className="admin-m-lbl">
                      Konzession / Ordnungsnr.
                      <input className="admin-m-inp" value={stammdatenForm.konzessionNumber} onChange={(e) => setStammdatenForm((f) => ({ ...f, konzessionNumber: e.target.value }))} />
                    </label>
                    <label className="admin-m-lbl">
                      Hersteller / Modell
                      <input className="admin-m-inp" value={stammdatenForm.model} onChange={(e) => setStammdatenForm((f) => ({ ...f, model: e.target.value }))} />
                    </label>
                    <label className="admin-m-lbl">
                      Farbe
                      <input className="admin-m-inp" value={stammdatenForm.color} onChange={(e) => setStammdatenForm((f) => ({ ...f, color: e.target.value }))} />
                    </label>
                    <label className="admin-m-lbl">
                      TÜV (HU) gültig bis
                      <input className="admin-m-inp" type="date" value={stammdatenForm.nextInspectionDate} onChange={(e) => setStammdatenForm((f) => ({ ...f, nextInspectionDate: e.target.value }))} />
                    </label>
                  </div>
                  <div className="admin-taxi-fv-kv" style={{ paddingTop: 0 }}>
                    {detail.vehicle.vin ? <KvRow label="FIN / VIN">{detail.vehicle.vin}</KvRow> : null}
                    <KvRow label="Baujahr">{detail.vehicle.modelYear != null ? String(detail.vehicle.modelYear) : "—"}</KvRow>
                    <KvRow label="Fahrzeugtyp">{vehicleTypeDe(detail.vehicle.vehicleType)}</KvRow>
                    <KvRow label="Fahrart / Klasse">
                      {legalTypeDe(detail.vehicle.vehicleLegalType)} · {vehicleClassDe(detail.vehicle.vehicleClass)}
                    </KvRow>
                    <KvRow label="Sitzplätze">
                      {detail.vehicle.passengerSeats != null ? String(detail.vehicle.passengerSeats) : "—"}
                    </KvRow>
                  </div>
                </section>

                <section className="admin-panel-card admin-m-card admin-m-card--unified">
                  <div className="admin-m-card__h">
                    <span className="admin-panel-card__title" style={{ margin: 0 }}>
                      Status & Einsatz
                    </span>
                  </div>
                  <div className="admin-taxi-fv-kv">
                    <KvRow label="Freigabestatus">
                      <span className={`admin-c-badge ${approvalBadgeClass(detail.vehicle.approvalStatus)}`}>
                        {approvalDe(detail.vehicle.approvalStatus)}
                      </span>
                    </KvRow>
                    <KvRow label="Plattform einsatzbereit">
                      {vEinsatzbereit(detail.vehicle) ? (
                        <span className="admin-c-badge admin-c-badge--ok">Ja (freigegeben)</span>
                      ) : (
                        <span className="admin-c-badge admin-c-badge--warn">Nein (nicht freigegeben / gesperrt / Entwurf)</span>
                      )}
                    </KvRow>
                    <KvRow label="Zugewiesener Fahrer" wideValue>
                      {detail.assignedDriver ? (
                        <span>
                          {detail.assignedDriver.firstName} {detail.assignedDriver.lastName}
                          {detail.assignedDriver.phone ? ` · ${detail.assignedDriver.phone}` : ""} · {detail.assignedDriver.email}
                        </span>
                      ) : (
                        "—"
                      )}
                    </KvRow>
                    <KvRow label="Letzte Fahrt (Näherung, Fahrer im Mandant)" wideValue>
                      {detail.lastRide
                        ? `${fmtTs(detail.lastRide.createdAt)} — ${detail.lastRide.status} — ${detail.lastRide.fromLabel} → ${detail.lastRide.toLabel}`
                        : "—"}
                    </KvRow>
                    <KvRow label="Aktuell gesperrt / blockiert (Plattform)">
                      {vBlocked(detail.vehicle) ? (
                        <span className="admin-c-badge admin-c-badge--err">Ja (gesperrt)</span>
                      ) : (
                        <span className="admin-c-badge admin-c-badge--neutral">Nein</span>
                      )}
                    </KvRow>
                    {detail.vehicle.rejectionReason ? (
                      <KvRow label="Ablehnungsgrund (letzte Prüfung)" wideValue>
                        <span className="admin-taxi-fv-warn">{detail.vehicle.rejectionReason}</span>
                      </KvRow>
                    ) : null}
                  </div>
                    {detail.vehicle.approvalStatus !== "approved" ? (
                      <p className="admin-m-ro-note" style={{ margin: "0 16px 16px" }}>
                        Ohne Freigabe ist der zugewiesene Fahrer in der Regel <strong>nicht einsatzbereit</strong> (Flottenlogik).
                      </p>
                    ) : null}
                </section>

                <section className="admin-panel-card admin-m-card admin-m-card--unified">
                  <div className="admin-m-card__h">
                    <span className="admin-panel-card__title" style={{ margin: 0 }}>
                      Sperre & Admin-Notiz
                    </span>
                    <span className="admin-table-sub" style={{ margin: 0, maxWidth: 420, textAlign: "right" }}>
                      Sperrgrund: für Partner sichtbar. Notiz: nur Plattform-Admin.
                    </span>
                  </div>
                  <div className="admin-m-form" style={{ gridTemplateColumns: "1fr", padding: "12px 14px 0" }}>
                    <label className="admin-m-lbl">
                      Sperrgrund (editierbar, partner-sichtbar)
                      <textarea
                        className="admin-m-ta"
                        value={blockReasonIn}
                        onChange={(e) => setBlockReasonIn(e.target.value)}
                        rows={3}
                        style={{ minHeight: 80 }}
                        placeholder="Kurzgrund für Partner und Operative …"
                      />
                    </label>
                    <label className="admin-m-lbl">
                      Interne Plattform-Notiz
                      <textarea
                        className="admin-m-ta"
                        value={noteIn}
                        onChange={(e) => setNoteIn(e.target.value)}
                        rows={3}
                        style={{ minHeight: 80 }}
                        placeholder="Nur für Admins, nicht an Partner…"
                      />
                    </label>
                    <div className="admin-m-form__foot" style={{ borderTop: "1px solid #e8edf4", background: "#fff" }}>
                      <button
                        type="button"
                        className="admin-m-btn-bearb"
                        disabled={actBusy === "notes"}
                        onClick={() => void patchNotes()}
                      >
                        {actBusy === "notes" ? "…" : "Sperrgrund & Notiz speichern"}
                      </button>
                    </div>
                  </div>
                </section>

                <section className="admin-panel-card admin-m-card admin-m-card--unified">
                  <div className="admin-m-card__h">
                    <span className="admin-panel-card__title" style={{ margin: 0 }}>
                      Dokumente
                    </span>
                  </div>
                  <div className="admin-taxi-fv-kv" style={{ padding: "0 16px 16px" }}>
                    {(!detail.vehicle.vehicleDocuments || detail.vehicle.vehicleDocuments.length === 0) ? (
                      <div className="admin-error-banner" style={{ margin: 0 }}>
                        Keine hochgeladenen PDFs — <strong>fehlt</strong>. Bitte prüfen, ob Nachweise in der Warteschlange oder beim
                        Partner nachgereicht werden sollen.
                      </div>
                    ) : null}
                    <p className="admin-m-sec__hint" style={{ margin: "0 0 6px" }}>
                      Nachweise (PDF) — pro Dokumenttyp versioniert. Mit „Version … anzeigen“ öffnen Sie die Datei aus dem Mandanten-Upload. Ältere Versionen
                      bleiben verfügbar; Partner-Löschung ist nicht vorgesehen.
                    </p>
                    {groupFleetVehicleDocumentsForAdmin(detail.vehicle.vehicleDocuments || []).map((g) => (
                      <div key={g.kindKey} className="admin-taxi-fv-doclist" style={{ marginBottom: 12 }}>
                        <div className="admin-taxi-fv-docmeta" style={{ fontWeight: 600, marginBottom: 6 }}>
                          {g.kindLabel}
                        </div>
                        <ul className="admin-taxi-fv-doclist" style={{ margin: 0, paddingLeft: 16 }}>
                          {g.versions.map((d) => (
                            <li key={String(d.storageKey) + d.versionIndex} style={{ marginBottom: 6 }}>
                              <button
                                type="button"
                                className="admin-taxi-fv-linkbtn"
                                onClick={() => void openPdf(detail.vehicle.id, d.storageKey)}
                              >
                                Version {d.versionIndex} anzeigen{d.isLatest ? " (aktuell)" : " (früher)"}
                              </button>
                              <code className="admin-taxi-fv-docmeta">{d.storageKey}</code>
                              {d.uploadedAt ? <span className="admin-taxi-fv-docmeta"> · hochgeladen: {fmtTs(d.uploadedAt)}</span> : null}
                              {d.uploadedByPanelUserId ? (
                                <span className="admin-taxi-fv-docmeta"> · hochgeladen von (Panel): {d.uploadedByPanelUserId}</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    <p className="admin-taxi-fv-muted" style={{ margin: "8px 0 0" }}>
                      Versicherungs-/HUK-Flags gibt es in der DB nicht; Bewertung erfolgt inhaltlich über die PDFs.
                    </p>
                  </div>
                </section>

                <section className="admin-panel-card admin-m-card admin-m-card--unified">
                  <div className="admin-m-card__h">
                    <span className="admin-panel-card__title" style={{ margin: 0 }}>
                      Verlauf / Audit
                    </span>
                    <span className="admin-table-sub" style={{ margin: 0 }}>letzte {audit.length} Einträge</span>
                  </div>
                  <div className="admin-taxi-fv-audit" role="log">
                    {audit.length === 0 ? <div className="admin-taxi-fv-muted">Noch kein Audit-Eintrag zu diesem Fahrzeug.</div> : null}
                    {audit.map((e) => {
                      const metaS = fmtAuditMeta(e.meta);
                      return (
                        <div className="admin-taxi-fv-audit__row" key={e.id}>
                          <div className="admin-taxi-fv-audit__t">{fmtTs(e.createdAt)}</div>
                          <div className="admin-taxi-fv-audit__a">{auditActionDe(e.action)}</div>
                          {e.subjectType || e.subjectId ? (
                            <div className="admin-taxi-fv-audit__id">
                              {e.subjectType || "—"} {e.subjectId ? `· ${e.subjectId}` : ""}
                            </div>
                          ) : null}
                          {metaS ? <pre className="admin-taxi-fv-audit__meta">{metaS}</pre> : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
