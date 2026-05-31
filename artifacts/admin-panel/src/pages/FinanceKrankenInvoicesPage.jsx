import { useCallback, useEffect, useState } from "react";
import AdminCollapsibleSection from "../components/AdminCollapsibleSection.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const LIST_URL = `${API_BASE}/admin/kranken-invoices`;

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

function fmtPct(rate) {
  const r = Number(rate);
  if (!Number.isFinite(r)) return "—";
  return `${(Math.round(r * 10000) / 100).toLocaleString("de-DE")} %`;
}

function statusLabel(s) {
  const x = String(s ?? "").toLowerCase();
  if (x === "draft") return "Entwurf";
  if (x === "sent") return "Gesendet";
  if (x === "paid") return "Bezahlt";
  return s || "—";
}

function statusClass(s) {
  const x = String(s ?? "").toLowerCase();
  if (x === "paid") return "admin-status-pill admin-status-pill--ok";
  if (x === "sent") return "admin-status-pill admin-status-pill--pending";
  return "admin-status-pill";
}

export default function FinanceKrankenInvoicesPage() {
  const [items, setItems] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(LIST_URL, { headers: adminApiHeaders() });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setErr("Liste konnte nicht geladen werden.");
        setItems([]);
        setKpis(null);
        return;
      }
      setItems(Array.isArray(j.invoices) ? j.invoices : []);
      setKpis(j.kpis ?? null);
    } catch {
      setErr("Netzwerkfehler.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markPaid(id) {
    setBusyId(id);
    setErr("");
    try {
      const res = await fetch(`${LIST_URL}/${encodeURIComponent(id)}/paid`, {
        method: "PATCH",
        headers: adminApiHeaders(),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setErr("Status konnte nicht gesetzt werden.");
        return;
      }
      await load();
    } catch {
      setErr("Netzwerkfehler.");
    } finally {
      setBusyId("");
    }
  }

  function downloadPdf(id, invoiceNumber) {
    fetch(`${LIST_URL}/${encodeURIComponent(id)}/pdf`, { headers: adminApiHeaders() })
      .then(async (res) => {
        if (!res.ok) throw new Error("pdf");
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${(invoiceNumber || id).replace(/[^\w-]+/g, "_")}.pdf`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => setErr("PDF-Download fehlgeschlagen."));
  }

  return (
    <div className="admin-page admin-page--loose admin-page--content">
      <p className="admin-page-lead">
        Sammelrechnungen Krankenfahrten aller Taxi-Mandanten — Provision je Mandant aus{" "}
        <code>admin_companies.commission_rate</code>, auf der PDF sichtbar.
      </p>

      {err ? (
        <section className="admin-section-block">
          <div className="admin-section-block__body">
            <div className="admin-error-banner admin-info-banner--inline">{err}</div>
          </div>
        </section>
      ) : null}

      <AdminCollapsibleSection title="Kennzahlen" defaultOpen>
        {loading && !kpis ? <p className="admin-table-sub">Lade …</p> : null}
        {kpis ? (
          <div className="admin-stat-grid">
            {[
              ["Rechnungen gesamt", kpis.totalInvoices],
              ["Entwurf", kpis.draftCount],
              ["Gesendet", kpis.sentCount],
              ["Bezahlt", kpis.paidCount],
              ["Fahrpreise gesamt", money(kpis.totalAmount)],
              ["Provision ONRODA", money(kpis.commissionAmount)],
              ["Auszahlung Taxi", money(kpis.netAmount)],
            ].map(([label, val]) => (
              <div key={label} className="admin-stat-card">
                <div className="admin-stat-label">{label}</div>
                <div className="admin-stat-value admin-crisp-numeric">{val}</div>
              </div>
            ))}
          </div>
        ) : null}
      </AdminCollapsibleSection>

      <AdminCollapsibleSection
        title="Alle Sammelrechnungen"
        subtitle={loading ? "Wird geladen …" : `${items.length} Einträge`}
        defaultOpen
      >
        <div className="admin-section-toolbar admin-section-toolbar--start" style={{ marginBottom: 8 }}>
          <button type="button" className="admin-btn-refresh" onClick={() => void load()} disabled={loading}>
            {loading ? "Lade…" : "Aktualisieren"}
          </button>
        </div>
        <div className="admin-table-card admin-table-card--embedded">
          <table className="admin-table" style={{ minWidth: 900, width: "100%" }}>
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Unternehmen</th>
                <th>Krankenkasse</th>
                <th>Zeitraum</th>
                <th>Fahrten</th>
                <th>Betrag</th>
                <th>Provision</th>
                <th>Satz</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !loading ? (
                <tr>
                  <td colSpan={10} className="admin-table-sub">
                    Noch keine Krankenfahrten-Sammelrechnungen.
                  </td>
                </tr>
              ) : (
                items.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <code style={{ fontSize: 11 }}>{inv.invoiceNumber}</code>
                    </td>
                    <td>{inv.companyName || inv.companyId}</td>
                    <td>
                      {inv.insurerName}
                      {inv.insurerIk ? (
                        <>
                          <br />
                          <span className="admin-table-sub">IK {inv.insurerIk}</span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      {inv.periodFrom} – {inv.periodTo}
                    </td>
                    <td>{inv.rideCount}</td>
                    <td>{money(inv.totalAmount)}</td>
                    <td>{money(inv.commissionAmount)}</td>
                    <td>{fmtPct(inv.commissionRateSnap)}</td>
                    <td>
                      <span className={statusClass(inv.status)}>{statusLabel(inv.status)}</span>
                    </td>
                    <td>
                      <div className="admin-toolbar-inline">
                        <button type="button" className="admin-btn-refresh" onClick={() => downloadPdf(inv.id, inv.invoiceNumber)}>
                          PDF
                        </button>
                        {inv.status !== "paid" ? (
                          <button
                            type="button"
                            className="admin-btn-primary admin-btn-compact"
                            disabled={busyId === inv.id}
                            onClick={() => void markPaid(inv.id)}
                          >
                            {busyId === inv.id ? "…" : "Bezahlt"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </AdminCollapsibleSection>
    </div>
  );
}
