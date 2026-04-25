import { useCallback, useEffect, useState } from "react";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";
import { insurerRideDetailUrl, insurerRidePruefakteCsvUrl, insurerRidesUrl } from "../lib/insurerApi.js";

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: isoDate(from), to: isoDate(to) };
}

function fmt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

function flagYes(v) {
  return v ? "✓" : "—";
}

/** Anzeige-Label für Fahrtstatus (API liefert typisch snake_case). */
const INSURER_RIDE_STATUS_LABEL = {
  pending: "Offen",
  open: "Offen",
  requested: "Offen",
  searching_driver: "Offen",
  offered: "Offen",
  draft: "Entwurf",
  scheduled: "Geplant",
  accepted: "Angenommen",
  arrived: "Vor Ort",
  driver_arriving: "Fahrer unterwegs",
  driver_waiting: "Fahrer wartet",
  passenger_onboard: "Fahrgast an Bord",
  in_progress: "Unterwegs",
  completed: "Abgeschlossen",
  cancelled: "Storniert",
  cancelled_by_customer: "Storniert (Kunde)",
  cancelled_by_driver: "Storniert (Fahrer)",
  cancelled_by_system: "Storniert (System)",
  rejected: "Abgelehnt",
  expired: "Abgelaufen",
};

function insurerRideStatusLabel(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "—";
  const key = s.toLowerCase().replace(/-/g, "_");
  return INSURER_RIDE_STATUS_LABEL[key] ?? s;
}

function formatDriverLine(driverId) {
  const id = typeof driverId === "string" ? driverId.trim() : "";
  if (!id) return "Nicht zugewiesen";
  return `Fahrer-ID: ${id}`;
}

function actorLabel(actorType, actorId) {
  const type = String(actorType || "").trim() || "system";
  const id = String(actorId || "").trim();
  return id ? `${type}/${id}` : type;
}

function pickDrawerActors(ride) {
  const audit = Array.isArray(ride?.audit) ? ride.audit : [];
  const createdEvt = audit.find((a) => String(a?.eventType || "").toLowerCase().includes("created")) || audit[0];
  const cancelledEvt = [...audit]
    .reverse()
    .find((a) => String(a?.toStatus || "").toLowerCase().includes("cancelled"));
  const latestCorrection = Array.isArray(ride?.corrections) && ride.corrections.length
    ? ride.corrections[ride.corrections.length - 1]
    : null;
  const latestAudit = audit.length ? audit[audit.length - 1] : null;
  return {
    createdBy: createdEvt ? actorLabel(createdEvt.actorType, createdEvt.actorId) : "—",
    changedBy: latestCorrection
      ? actorLabel(latestCorrection.actorType, latestCorrection.actorId)
      : latestAudit
        ? actorLabel(latestAudit.actorType, latestAudit.actorId)
        : "—",
    cancelledBy: cancelledEvt ? actorLabel(cancelledEvt.actorType, cancelledEvt.actorId) : "—",
  };
}

export default function InsurerRidesPage() {
  const [range, setRange] = useState(defaultRange);
  const [rideId, setRideId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [status, setStatus] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [exportStatus, setExportStatus] = useState("any");
  const [hasCorrections, setHasCorrections] = useState("any");
  const [missingProofs, setMissingProofs] = useState([]);
  const [sort, setSort] = useState("reference_time");
  const [order, setOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [selected, setSelected] = useState(null);
  const [detailTab, setDetailTab] = useState("details");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState("");

  const loadList = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const url = insurerRidesUrl({
        from: range.from,
        to: range.to,
        page,
        pageSize: 25,
        rideId: rideId.trim() || undefined,
        companyId: companyId.trim() || undefined,
        driverId: driverId.trim() || undefined,
        status: status.trim() || undefined,
        amountMin: amountMin.trim() || undefined,
        amountMax: amountMax.trim() || undefined,
        exportStatus: exportStatus !== "any" ? exportStatus : undefined,
        hasCorrections: hasCorrections !== "any" ? hasCorrections : undefined,
        missingProofs: missingProofs.length ? missingProofs.join(",") : undefined,
        sort,
        order,
      });
      const res = await fetch(url, { headers: adminApiHeaders() });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setErr(typeof j?.error === "string" ? j.error : "Liste fehlgeschlagen.");
        setItems([]);
        setTotal(0);
        return;
      }
      setItems(Array.isArray(j.items) ? j.items : []);
      setTotal(typeof j.total === "number" ? j.total : 0);
    } catch {
      setErr("Netzwerkfehler.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, page, rideId, companyId, driverId, status, amountMin, amountMax, exportStatus, hasCorrections, missingProofs, sort, order]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadDetail = useCallback(async (id) => {
    if (!id) {
      setSelected(null);
      return;
    }
    setDetailLoading(true);
    setDetailErr("");
    try {
      const res = await fetch(insurerRideDetailUrl(id), { headers: adminApiHeaders() });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok || !j.ride) {
        setSelected(null);
        setDetailErr("Detail nicht verfügbar.");
        return;
      }
      setDetailErr("");
      setDetailTab("details");
      setSelected(j.ride);
    } catch {
      setSelected(null);
      setDetailErr("Netzwerkfehler.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
  }, [range.from, range.to, rideId, companyId, driverId, status, amountMin, amountMax, exportStatus, hasCorrections, missingProofs, sort, order]);

  function toggleMissingProof(key) {
    setMissingProofs((prev) => (prev.includes(key) ? prev.filter((v) => v !== key) : [...prev, key]));
  }

  async function downloadPruefakteCsv() {
    if (!selected?.rideId) return;
    try {
      const res = await fetch(insurerRidePruefakteCsvUrl(selected.rideId), { headers: adminApiHeaders() });
      if (!res.ok) {
        window.alert("Export fehlgeschlagen.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `insurance-pruefakte-${selected.rideId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.alert("Export fehlgeschlagen.");
    }
  }

  function preparePruefaktePdfData() {
    if (!selected) return;
    const payload = {
      rideId: selected.rideId,
      companyName: selected.companyName,
      status: insurerRideStatusLabel(selected.rideStatus),
      amount: selected.amountGross,
      executionSummary: selected.executionSummary,
      corrections: selected.corrections ?? [],
      proof: selected.proof ?? {},
    };
    window.__INSURER_PRUEFAKTE_PDF_PREP__ = payload;
    window.alert("PDF-Export vorbereitet (Payload im Browser gesetzt).");
  }

  function applyQuickFilter(mode) {
    if (mode === "open") {
      setStatus("pending");
      setHasCorrections("any");
      setMissingProofs([]);
      return;
    }
    if (mode === "completed") {
      setStatus("completed");
      setHasCorrections("any");
      setMissingProofs([]);
      return;
    }
    if (mode === "cancelled") {
      setStatus("cancelled");
      setHasCorrections("any");
      setMissingProofs([]);
      return;
    }
    // Probleme: typischer Prüf-Fokus auf Korrekturen oder fehlende Nachweise.
    setStatus("");
    setHasCorrections("true");
    setMissingProofs(["gps", "chronology", "confirmation", "approval_reference"]);
  }

  return (
    <div className="admin-page" style={{ padding: "20px 24px" }}>
      <h1 style={{ margin: "0 0 8px", fontSize: "1.35rem" }}>Krankenkassen · Fahrten</h1>
      <p style={{ margin: "0 0 16px", color: "var(--onroda-text-muted, #64748b)", maxWidth: 800, lineHeight: 1.5 }}>
        Prüfbare, minimierte Fahrtdaten. Keine Patientenklarnamen, keine Volladressen, keine Kartenrohdaten in dieser Ansicht.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, alignItems: "flex-end" }}>
        <label className="admin-table-sub" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Fahrt-ID
          <input className="admin-input" value={rideId} onChange={(e) => setRideId(e.target.value)} placeholder="REQ-…" style={{ minWidth: 170 }} />
        </label>
        <label className="admin-table-sub" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Von
          <input className="admin-input" type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
        </label>
        <label className="admin-table-sub" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Bis
          <input className="admin-input" type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
        </label>
        <label className="admin-table-sub" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Mandant
          <input className="admin-input" value={companyId} onChange={(e) => setCompanyId(e.target.value)} placeholder="co-…" style={{ minWidth: 180 }} />
        </label>
        <label className="admin-table-sub" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Fahrer-ID
          <input className="admin-input" value={driverId} onChange={(e) => setDriverId(e.target.value)} placeholder="drv-…" style={{ minWidth: 150 }} />
        </label>
        <label className="admin-table-sub" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Status
          <input className="admin-input" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="z. B. completed" style={{ minWidth: 160 }} />
        </label>
        <label className="admin-table-sub" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Betrag min
          <input className="admin-input" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} placeholder="0" style={{ width: 90 }} />
        </label>
        <label className="admin-table-sub" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Betrag max
          <input className="admin-input" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} placeholder="999" style={{ width: 90 }} />
        </label>
        <label className="admin-table-sub" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Exportstatus
          <select className="admin-input" value={exportStatus} onChange={(e) => setExportStatus(e.target.value)} style={{ minWidth: 130 }}>
            <option value="any">Alle</option>
            <option value="exported">Exportiert</option>
            <option value="not_exported">Nicht exportiert</option>
          </select>
        </label>
        <label className="admin-table-sub" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Korrekturen
          <select className="admin-input" value={hasCorrections} onChange={(e) => setHasCorrections(e.target.value)} style={{ minWidth: 120 }}>
            <option value="any">Alle</option>
            <option value="true">Mit Korrektur</option>
            <option value="false">Ohne Korrektur</option>
          </select>
        </label>
        <label className="admin-table-sub" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Sortierung
          <select className="admin-input" value={sort} onChange={(e) => setSort(e.target.value)} style={{ minWidth: 140 }}>
            <option value="reference_time">Datum</option>
            <option value="amount_gross">Betrag</option>
            <option value="ride_status">Status</option>
            <option value="company_name">Firma A-Z</option>
          </select>
        </label>
        <label className="admin-table-sub" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Reihenfolge
          <select className="admin-input" value={order} onChange={(e) => setOrder(e.target.value)} style={{ minWidth: 100 }}>
            <option value="desc">absteigend</option>
            <option value="asc">aufsteigend</option>
          </select>
        </label>
        <div className="admin-table-sub" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Fehlende Nachweise
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[
              ["gps", "GPS"],
              ["chronology", "Zeit"],
              ["confirmation", "Bestätigung"],
              ["approval_reference", "Ref"],
            ].map(([key, label]) => (
              <label key={key} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <input type="checkbox" checked={missingProofs.includes(key)} onChange={() => toggleMissingProof(key)} />
                {label}
              </label>
            ))}
          </div>
        </div>
        <button type="button" className="admin-btn-primary" onClick={() => void loadList()} disabled={loading}>
          {loading ? "Lade…" : "Aktualisieren"}
        </button>
        <span className="admin-table-sub">Gesamt: {total}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <button type="button" className="admin-btn-refresh" onClick={() => applyQuickFilter("open")}>
          Offen
        </button>
        <button type="button" className="admin-btn-refresh" onClick={() => applyQuickFilter("completed")}>
          Abgeschlossen
        </button>
        <button type="button" className="admin-btn-refresh" onClick={() => applyQuickFilter("cancelled")}>
          Storniert
        </button>
        <button type="button" className="admin-btn-primary" onClick={() => applyQuickFilter("problems")}>
          Probleme
        </button>
      </div>
      {err ? <div className="admin-error-banner" style={{ marginBottom: 12 }}>{err}</div> : null}
      <style>{`
        .insurer-rides-cards {
          display: grid;
          gap: 12px;
        }
        .insurer-ride-card {
          border: 1px solid var(--onroda-border-subtle, #e2e8f0);
          border-radius: 12px;
          padding: 12px 14px;
          cursor: pointer;
          transition: background-color .12s ease, border-color .12s ease;
          background: #fff;
        }
        .insurer-ride-card:hover {
          background-color: var(--onroda-surface-2, #f1f5f9);
          border-color: #cbd5e1;
        }
        .insurer-ride-card--selected {
          border-color: #38bdf8;
          background: #e0f2fe;
        }
        .insurer-ride-card__row {
          display: grid;
          gap: 10px;
          align-items: start;
        }
        .insurer-ride-card__row--top {
          grid-template-columns: minmax(230px, 1.4fr) minmax(160px, 1fr) minmax(140px, .9fr);
        }
        .insurer-ride-card__row--bottom {
          grid-template-columns: minmax(250px, 1.4fr) minmax(250px, 1.4fr) minmax(140px, .8fr);
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px dashed var(--onroda-border-subtle, #e2e8f0);
        }
        .insurer-ride-card__id {
          font-size: 17px;
          font-weight: 700;
          color: var(--onroda-text-dark, #0f172a);
          letter-spacing: -0.02em;
        }
        .insurer-ride-card__price {
          text-align: right;
          font-size: 1.05rem;
          font-weight: 700;
          color: var(--onroda-text-dark, #0f172a);
          white-space: nowrap;
        }
        .insurer-ride-card__sub {
          color: var(--onroda-text-muted, #64748b);
          font-size: 12px;
        }
      `}</style>
      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr minmax(300px, 420px)" : "1fr", gap: 16, alignItems: "start" }}>
        <div style={{ overflow: "auto", border: "1px solid var(--onroda-border-subtle, #e2e8f0)", borderRadius: 8 }}>
          <div className="insurer-rides-cards" style={{ padding: 12 }}>
            {items.length === 0 && !loading ? (
              <p className="admin-table-sub" style={{ margin: 0, padding: 12 }}>Keine Fahrten im Zeitraum.</p>
            ) : (
              items.map((r) => (
                <article
                  key={r.rideId}
                  className={`insurer-ride-card${selected?.rideId === r.rideId ? " insurer-ride-card--selected" : ""}`}
                  onClick={() => void loadDetail(r.rideId)}
                >
                  <div className="insurer-ride-card__row insurer-ride-card__row--top">
                    <div>
                      <div className="insurer-ride-card__id">{r.rideId}</div>
                      <div className="insurer-ride-card__sub">{r.companyName}</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{insurerRideStatusLabel(r.rideStatus)}</div>
                      <div className="insurer-ride-card__sub">{fmt(r.referenceTime)}</div>
                    </div>
                    <div className="insurer-ride-card__price">{Number(r.amountGross).toFixed(2)} €</div>
                  </div>
                  <div className="insurer-ride-card__row insurer-ride-card__row--bottom">
                    <div>
                      <div>{[r.fromPostalCode, r.fromLocality].filter(Boolean).join(" ") || "—"}</div>
                      <div className="insurer-ride-card__sub">Start</div>
                    </div>
                    <div>
                      <div>{[r.toPostalCode, r.toLocality].filter(Boolean).join(" ") || "—"}</div>
                      <div className="insurer-ride-card__sub">Ziel</div>
                    </div>
                    <div>
                      <div>{formatDriverLine(r.driverId)}</div>
                      <div className="insurer-ride-card__sub">
                        Export: {r.lastExportBatchId ? "ja" : "nein"} · GPS {flagYes(r.proof?.hasGpsPoints)}
                      </div>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
        {selected || detailLoading || detailErr ? (
          <div
            style={{
              border: "1px solid var(--onroda-border-subtle, #e2e8f0)",
              borderRadius: 8,
              padding: 14,
              position: "sticky",
              top: 12,
              maxHeight: "90vh",
              overflow: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <strong>Detail (Whitelist)</strong>
              <button
                type="button"
                className="admin-btn-refresh"
                onClick={() => {
                  setSelected(null);
                  setDetailErr("");
                  setDetailTab("details");
                }}
              >
                Schließen
              </button>
            </div>
            {detailLoading ? <p className="admin-table-sub">Lade…</p> : null}
            {detailErr ? <div className="admin-error-banner">{detailErr}</div> : null}
            {selected ? (
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <button
                    type="button"
                    className={detailTab === "details" ? "admin-btn-primary" : "admin-btn-refresh"}
                    onClick={() => setDetailTab("details")}
                  >
                    Fahrt-Details
                  </button>
                  <button
                    type="button"
                    className={detailTab === "corrections" ? "admin-btn-primary" : "admin-btn-refresh"}
                    onClick={() => setDetailTab("corrections")}
                  >
                    Korrekturhistorie
                  </button>
                  <button type="button" className="admin-btn-refresh" onClick={() => void downloadPruefakteCsv()}>
                    Prüfakte exportieren
                  </button>
                  <button type="button" className="admin-btn-refresh" onClick={preparePruefaktePdfData}>
                    PDF vorbereiten
                  </button>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: 8,
                    marginBottom: 10,
                    padding: 10,
                    borderRadius: 8,
                    background: "var(--onroda-surface-2, #f8fafc)",
                    border: "1px solid var(--onroda-border-subtle, #e2e8f0)",
                  }}
                >
                  <div>
                    <div className="admin-table-sub">erstellt von</div>
                    <div style={{ fontWeight: 600 }}>{pickDrawerActors(selected).createdBy}</div>
                  </div>
                  <div>
                    <div className="admin-table-sub">geändert von</div>
                    <div style={{ fontWeight: 600 }}>{pickDrawerActors(selected).changedBy}</div>
                  </div>
                  <div>
                    <div className="admin-table-sub">storniert von</div>
                    <div style={{ fontWeight: 600 }}>{pickDrawerActors(selected).cancelledBy}</div>
                  </div>
                </div>
                {detailTab === "details" ? (
                  <>
                    <h4 className="admin-table-sub" style={{ margin: "2px 0 6px" }}>Übersicht</h4>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      <li>Fahrt-ID: <code>{selected.rideId}</code></li>
                      <li>Taxi-Unternehmen: {selected.companyName} <code>({selected.companyId || "—"})</code></li>
                      <li>Fahrer-ID: <code>{selected.driverId || "—"}</code></li>
                      <li>Fahrzeug / Kennzeichen: {selected.vehiclePlate || "—"}</li>
                      <li>Status: {selected.rideStatus}</li>
                      <li>Exportstatus: {selected.lastExportBatchId ? `exportiert (${selected.lastExportBatchId})` : "nicht exportiert"}</li>
                    </ul>

                    <h4 className="admin-table-sub" style={{ margin: "12px 0 6px" }}>Durchführung</h4>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      <li>Erstellt: {fmt(selected.executionSummary?.createdAt)}</li>
                      <li>Geplant: {fmt(selected.executionSummary?.scheduledAt)}</li>
                      <li>Abgeholt: {fmt(selected.executionSummary?.pickupAt)}</li>
                      <li>Abgeschlossen: {fmt(selected.executionSummary?.completedAt)}</li>
                      <li>Storniert: {fmt(selected.executionSummary?.cancelledAt)}</li>
                      <li>Stornogrund: {selected.executionSummary?.cancelledReason || "—"}</li>
                    </ul>

                    <h4 className="admin-table-sub" style={{ margin: "12px 0 6px" }}>Strecke</h4>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      <li>Start PLZ/Ort: {[selected.fromPostalCode, selected.fromLocality].filter(Boolean).join(" ") || "—"}</li>
                      <li>Ziel PLZ/Ort: {[selected.toPostalCode, selected.toLocality].filter(Boolean).join(" ") || "—"}</li>
                      <li>Entfernung: {selected.distanceKm != null ? `${selected.distanceKm} km` : "—"}</li>
                    </ul>

                    <h4 className="admin-table-sub" style={{ margin: "12px 0 6px" }}>Abrechnung</h4>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      <li>Betrag: {Number(selected.amountGross || 0).toFixed(2)} EUR</li>
                      <li>Preisart: {selected.pricingMode || "—"}</li>
                      <li>Zahler: {selected.payerKind || "—"}</li>
                      <li>Abrechnungsstatus: {selected.financialBillingStatus || "—"} / {selected.financialSettlementStatus || "—"}</li>
                      <li>Genehmigungsreferenz: {selected.billingReference || "—"}</li>
                    </ul>

                    <h4 className="admin-table-sub" style={{ margin: "12px 0 6px" }}>Nachweise</h4>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      <li>GPS vorhanden: {selected.proof?.hasGpsPoints ? "ja" : "nein"}</li>
                      <li>Zeitnachweis vorhanden: {selected.proof?.hasChronology ? "ja" : "nein"}</li>
                      <li>Bestätigung vorhanden: {selected.proof?.hasSignatureOrConfirmation ? "ja" : "nein"}</li>
                      <li>Genehmigungsreferenz vorhanden: {selected.proof?.hasApprovalReference ? "ja" : "nein"}</li>
                    </ul>

                <h4 className="admin-table-sub" style={{ margin: "12px 0 6px" }}>
                  Audit (ohne Ro-Payload)
                </h4>
                {selected.audit?.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 200, overflow: "auto" }}>
                    {selected.audit.map((a) => (
                      <li key={a.id} style={{ fontSize: 12 }}>
                        {a.eventType} {a.fromStatus}→{a.toStatus} · {a.actorType}{a.actorId ? `/${a.actorId}` : ""} · {fmt(a.createdAt)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="admin-table-sub">Keine Ereignisse.</p>
                )}
                  </>
                ) : (
                  <>
                    <h4 className="admin-table-sub" style={{ margin: "2px 0 6px" }}>
                      Korrekturhistorie
                    </h4>
                    {selected.corrections?.length ? (
                      <div style={{ overflowX: "auto" }}>
                        <table className="admin-table" style={{ minWidth: 540, width: "100%" }}>
                          <thead>
                            <tr>
                              <th>Feld</th>
                              <th>Alt → Neu</th>
                              <th>Grund</th>
                              <th>Actor-Type</th>
                              <th>Actor-ID</th>
                              <th>Wann</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selected.corrections.map((c) => (
                              <tr key={c.id}>
                                <td><code style={{ fontSize: 11 }}>{c.fieldName}</code></td>
                                <td style={{ maxWidth: 220, whiteSpace: "normal" }}>
                                  <span style={{ wordBreak: "break-word" }}>{c.oldValue || "—"}</span> →{" "}
                                  <span style={{ wordBreak: "break-word" }}>{c.newValue || "—"}</span>
                                </td>
                                <td>{c.reasonCode || "—"}</td>
                                <td>{c.actorType || "system"}</td>
                                <td><code style={{ fontSize: 10 }}>{c.actorId || "—"}</code></td>
                                <td>{fmt(c.createdAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="admin-table-sub">Keine Korrektureinträge vorhanden.</p>
                    )}
                  </>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {total > 25 ? (
        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" className="admin-btn-refresh" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Zurück
          </button>
          <span className="admin-table-sub">Seite {page}</span>
          <button
            type="button"
            className="admin-btn-refresh"
            disabled={page * 25 >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Weiter
          </button>
        </div>
      ) : null}
    </div>
  );
}
