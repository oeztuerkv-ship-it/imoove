import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const LIST_URL = `${API_BASE}/admin/finance/invoices`;
const PAGE_SIZE = 20;

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(String(iso).includes("T") ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function statusPillClass(status) {
  const s = String(status ?? "").toLowerCase();
  if (s === "paid") return "admin-status-pill admin-status-pill--ok";
  if (s === "overdue" || s === "cancelled") return "admin-status-pill admin-status-pill--bad";
  if (s === "issued" || s === "partially_paid" || s === "draft") return "admin-status-pill admin-status-pill--pending";
  return "admin-status-pill";
}

export default function FinanceInvoicesPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [markBusy, setMarkBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  const [status, setStatus] = useState("");
  const [companyId, setCompanyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams();
      q.set("page", String(page));
      q.set("pageSize", String(PAGE_SIZE));
      if (status) q.set("status", status);
      if (companyId.trim()) q.set("company_id", companyId.trim());
      const res = await fetch(`${LIST_URL}?${q.toString()}`, { headers: adminApiHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.ok) throw new Error("invalid_response");
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total ?? 0));
    } catch {
      setItems([]);
      setTotal(0);
      setError("Rechnungen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [page, status, companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(id) {
    setDetailLoading(true);
    setActionMsg("");
    try {
      const res = await fetch(`${LIST_URL}/${encodeURIComponent(id)}`, { headers: adminApiHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.ok) throw new Error("invalid_response");
      setDetail(data.item);
    } catch {
      setDetail({ error: "Rechnungsdetail konnte nicht geladen werden." });
    } finally {
      setDetailLoading(false);
    }
  }

  async function markPaid() {
    if (!detail?.id || detail.status === "paid") return;
    setMarkBusy(true);
    setActionMsg("");
    try {
      const res = await fetch(`${LIST_URL}/${encodeURIComponent(detail.id)}/mark-paid`, {
        method: "POST",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setActionMsg(data.idempotent ? "War bereits als bezahlt verbucht." : "Als bezahlt markiert.");
      await openDetail(detail.id);
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Markieren fehlgeschlagen.");
    } finally {
      setMarkBusy(false);
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="admin-page admin-page--loose">
      {error ? <div className="admin-error-banner">{error}</div> : null}
      <div className="admin-panel-card">
        <div className="admin-panel-card__title">Plattform-Rechnungen (B2B)</div>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--admin-muted, #6b7280)" }}>
          Mandantenübergreifend · Verwendungszweck eindeutig pro Unternehmen und Abrechnungsmonat (ohne interne Firmen-ID im
          Überweisungstext).
        </p>
        <div className="admin-table-toolbar">
          <select className="admin-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Status (alle)</option>
            <option value="draft">Entwurf</option>
            <option value="issued">Offen</option>
            <option value="partially_paid">Teilweise bezahlt</option>
            <option value="paid">Bezahlt</option>
            <option value="overdue">Überfällig</option>
            <option value="cancelled">Storniert</option>
          </select>
          <input
            className="admin-input"
            placeholder="Firma (company_id)"
            value={companyId}
            onChange={(e) => { setCompanyId(e.target.value); setPage(1); }}
            style={{ minWidth: 180 }}
          />
          <button type="button" className="admin-btn-refresh" onClick={() => void load()} disabled={loading}>
            {loading ? "Lade …" : "Aktualisieren"}
          </button>
        </div>
        <div className="admin-table-card">
          <div className="admin-table-scroll">
            <div className="admin-table-row admin-table-row--head">
              <div>Nummer</div>
              <div>Unternehmen</div>
              <div>Zeitraum</div>
              <div>Status</div>
              <div>Verwendungszweck</div>
              <div>Brutto</div>
              <div />
            </div>
            {items.map((x) => (
              <div className="admin-table-row" key={x.id}>
                <div className="admin-mono">{x.invoice_number}</div>
                <div>{x.company_name || "—"}</div>
                <div style={{ fontSize: 12 }}>
                  {fmtDate(x.billing_period_start)} – {fmtDate(x.billing_period_end)}
                </div>
                <div>
                  <span className={statusPillClass(x.status)}>{x.status_label_de || x.status}</span>
                </div>
                <div style={{ fontSize: 12, wordBreak: "break-word" }} title={x.payment_reference}>
                  {x.payment_reference || "—"}
                </div>
                <div>{money(x.total_gross)}</div>
                <div>
                  <button type="button" className="admin-page-btn admin-page-btn--compact" onClick={() => void openDetail(x.id)}>
                    Details
                  </button>
                </div>
              </div>
            ))}
            {!loading && items.length === 0 ? <div className="admin-info-banner">Keine Rechnungen gefunden.</div> : null}
          </div>
        </div>
        <div className="admin-pagination">
          <button className="admin-page-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Zurück
          </button>
          <span className="admin-page-dots">
            Seite {page} / {pages} ({total} gesamt)
          </span>
          <button className="admin-page-btn" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>
            Weiter
          </button>
        </div>
      </div>

      {detailLoading ? (
        <div className="admin-panel-card">
          <p style={{ margin: 0 }}>Detail wird geladen …</p>
        </div>
      ) : null}

      {detail && !detailLoading ? (
        <div className="admin-panel-card">
          <div className="admin-panel-card__title">Rechnungsdetail</div>
          {actionMsg ? <div className="admin-info-banner" style={{ marginBottom: 12 }}>{actionMsg}</div> : null}
          {"error" in detail ? (
            <div className="admin-error-banner">{detail.error}</div>
          ) : (
            <>
              <div className="finance-detail-grid">
                <div>
                  <strong>Rechnungsnr.:</strong> {detail.invoice_number}
                </div>
                <div>
                  <strong>Unternehmen:</strong> {detail.company_name || "—"}
                </div>
                <div>
                  <strong>Mandanten-ID (intern):</strong>{" "}
                  <span className="admin-mono">{detail.company_id || "—"}</span>
                </div>
                <div>
                  <strong>Status:</strong>{" "}
                  <span className={statusPillClass(detail.status)}>{detail.status_label_de || detail.status}</span>
                </div>
                <div>
                  <strong>Zeitraum:</strong> {fmtDate(detail.billing_period_start)} – {fmtDate(detail.billing_period_end)}
                </div>
                <div>
                  <strong>Fällig:</strong> {fmtDate(detail.due_date)}
                </div>
                <div>
                  <strong>Brutto:</strong> {money(detail.total_gross)}
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <strong>Verwendungszweck (Überweisung):</strong>
                  <div className="admin-mono" style={{ marginTop: 6, fontSize: 13, wordBreak: "break-word" }}>
                    {detail.payment_reference || "—"}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
                {detail.status !== "paid" && detail.status !== "cancelled" ? (
                  <button type="button" className="admin-page-btn" onClick={() => void markPaid()} disabled={markBusy}>
                    {markBusy ? "Speichere …" : "Als bezahlt markieren"}
                  </button>
                ) : null}
                <button type="button" className="admin-page-btn admin-page-btn--compact" onClick={() => setDetail(null)}>
                  Schließen
                </button>
              </div>

              {Array.isArray(detail.payments) && detail.payments.length > 0 ? (
                <div style={{ marginTop: 20 }}>
                  <strong>Zahlungen</strong>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13 }}>
                    {detail.payments.map((p) => (
                      <li key={p.id}>
                        {money(p.amount)} · {p.status} · {p.reference || "—"} ·{" "}
                        {p.paid_at ? fmtDate(p.paid_at) : "offen"}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
