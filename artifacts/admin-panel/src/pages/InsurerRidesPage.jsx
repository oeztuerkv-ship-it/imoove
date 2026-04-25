import { useCallback, useEffect, useState } from "react";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";
import { insurerRideDetailUrl, insurerRidesUrl } from "../lib/insurerApi.js";

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

export default function InsurerRidesPage() {
  const [range, setRange] = useState(defaultRange);
  const [companyId, setCompanyId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [selected, setSelected] = useState(null);
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
        companyId: companyId.trim() || undefined,
        status: status.trim() || undefined,
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
  }, [range.from, range.to, page, companyId, status]);

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
      setSelected(j.ride);
    } catch {
      setSelected(null);
      setDetailErr("Netzwerkfehler.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  return (
    <div className="admin-page" style={{ padding: "20px 24px" }}>
      <h1 style={{ margin: "0 0 8px", fontSize: "1.35rem" }}>Krankenkassen · Fahrten</h1>
      <p style={{ margin: "0 0 16px", color: "var(--onroda-text-muted, #64748b)", maxWidth: 800, lineHeight: 1.5 }}>
        Prüfbare, minimierte Fahrtdaten. Keine Patientenklarnamen, keine Volladressen, keine Kartenrohdaten in dieser Ansicht.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, alignItems: "flex-end" }}>
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
          Status
          <input className="admin-input" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="z. B. completed" style={{ minWidth: 160 }} />
        </label>
        <button type="button" className="admin-btn-primary" onClick={() => void loadList()} disabled={loading}>
          {loading ? "Lade…" : "Aktualisieren"}
        </button>
        <span className="admin-table-sub">Gesamt: {total}</span>
      </div>
      {err ? <div className="admin-error-banner" style={{ marginBottom: 12 }}>{err}</div> : null}
      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr minmax(300px, 420px)" : "1fr", gap: 16, alignItems: "start" }}>
        <div style={{ overflow: "auto", border: "1px solid var(--onroda-border-subtle, #e2e8f0)", borderRadius: 8 }}>
          <table className="admin-table" style={{ minWidth: 900, width: "100%" }}>
            <thead>
              <tr>
                <th>Ref</th>
                <th>Firma</th>
                <th>Fahrer-ID</th>
                <th>Fahrzeug</th>
                <th>Datum/Zeit</th>
                <th>Start</th>
                <th>Ziel</th>
                <th>Betrag</th>
                <th>Status</th>
                <th>Nachweise</th>
                <th>Export</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !loading ? (
                <tr>
                  <td colSpan={11} className="admin-table-sub" style={{ padding: 12 }}>
                    Keine Fahrten im Zeitraum.
                  </td>
                </tr>
              ) : (
                items.map((r) => (
                  <tr
                    key={r.rideId}
                    style={{ cursor: "pointer", background: selected?.rideId === r.rideId ? "#e0f2fe" : undefined }}
                    onClick={() => void loadDetail(r.rideId)}
                  >
                    <td>
                      <code style={{ fontSize: 11 }}>{r.rideId}</code>
                    </td>
                    <td>{r.companyName}</td>
                    <td>
                      <code style={{ fontSize: 11 }}>{r.driverId || "—"}</code>
                    </td>
                    <td>{r.vehiclePlate}</td>
                    <td>{fmt(r.referenceTime)}</td>
                    <td>
                      {[r.fromPostalCode, r.fromLocality].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td>
                      {[r.toPostalCode, r.toLocality].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td>{Number(r.amountGross).toFixed(2)}</td>
                    <td>
                      {r.rideStatus}
                      {r.financialSettlementStatus ? (
                        <span className="admin-table-sub" style={{ display: "block", fontSize: 10 }}>
                          {r.financialSettlementStatus}
                        </span>
                      ) : null}
                    </td>
                    <td style={{ fontSize: 12 }} title="Ort, Zeit, ggf. Freigabe — keine Rohkoordinaten">
                      GPS:{flagYes(r.proof?.hasGpsPoints)} Z:{flagYes(r.proof?.hasChronology)} S:{flagYes(r.proof?.hasSignatureOrConfirmation)} V:
                      {flagYes(r.proof?.hasApprovalReference)}
                    </td>
                    <td>
                      <code style={{ fontSize: 10 }}>{r.lastExportBatchId || "—"}</code>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
              <button type="button" className="admin-btn-refresh" onClick={() => { setSelected(null); setDetailErr(""); }}>
                Schließen
              </button>
            </div>
            {detailLoading ? <p className="admin-table-sub">Lade…</p> : null}
            {detailErr ? <div className="admin-error-banner">{detailErr}</div> : null}
            {selected ? (
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                <p>
                  <span className="admin-table-sub">Ref</span> <code>{selected.rideId}</code>
                </p>
                <p>
                  <span className="admin-table-sub">Mandant</span> {selected.companyName} <code>({selected.companyId})</code>
                </p>
                <p>
                  <span className="admin-table-sub">Fahrer-ID / Kennzeichen</span> {selected.driverId || "—"} / {selected.vehiclePlate}
                </p>
                <p>
                  <span className="admin-table-sub">Pseudonym Patient/in</span> <code>{selected.passengerPseudonymId || "—"}</code>
                </p>
                <p>
                  <span className="admin-table-sub">Referenz (Abrechnung)</span> {selected.billingReference || "—"}
                </p>
                {selected.financial ? (
                  <p>
                    <span className="admin-table-sub">Finanz (Snapshot)</span> brutto {selected.financial.grossAmount} · {selected.financial.billingStatus}{" "}
                    / {selected.financial.settlementStatus} · Korrekturen: {selected.financial.correctionCount}
                  </p>
                ) : null}
                <h4 className="admin-table-sub" style={{ margin: "12px 0 6px" }}>
                  Nachweis-Flags
                </h4>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  <li>GPS-Punkte (Vorhanden, keine Koordinaten in API): {selected.proof?.hasGpsPoints ? "ja" : "nein"}</li>
                  <li>Chronologie / Dauer: {selected.proof?.hasChronology ? "ja" : "nein"}</li>
                  <li>Bestätigung/Signatur (Meta, falls erfasst): {selected.proof?.hasSignatureOrConfirmation ? "ja" : "nein"}</li>
                  <li>Genehmigungsreferenz: {selected.proof?.hasApprovalReference ? "ja" : "nein"}</li>
                </ul>
                <h4 className="admin-table-sub" style={{ margin: "12px 0 6px" }}>
                  Korrekturhistorie
                </h4>
                {selected.corrections?.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {selected.corrections.map((c) => (
                      <li key={c.id} style={{ marginBottom: 6 }}>
                        <code>{c.fieldName}</code>: {c.oldValue} → {c.newValue} · {c.reasonCode}{" "}
                        <span className="admin-table-sub">({fmt(c.createdAt)})</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="admin-table-sub">Keine feingranularen Einträge (Tabelle ggf. noch leer).</p>
                )}
                <h4 className="admin-table-sub" style={{ margin: "12px 0 6px" }}>
                  Audit (ohne Ro-Payload)
                </h4>
                {selected.audit?.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 200, overflow: "auto" }}>
                    {selected.audit.map((a) => (
                      <li key={a.id} style={{ fontSize: 12 }}>
                        {a.eventType} {a.fromStatus}→{a.toStatus} · {a.actorType} · {fmt(a.createdAt)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="admin-table-sub">Keine Ereignisse.</p>
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
