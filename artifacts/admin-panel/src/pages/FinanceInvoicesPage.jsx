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

export default function FinanceInvoicesPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);

  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams();
      q.set("page", String(page));
      q.set("pageSize", String(PAGE_SIZE));
      if (status) q.set("status", status);
      const res = await fetch(`${LIST_URL}?${q.toString()}`, { headers: adminApiHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.ok) throw new Error("invalid_response");
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total ?? 0));
    } catch {
      setItems([]);
      setTotal(0);
      setError("Invoices konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(id) {
    try {
      const res = await fetch(`${LIST_URL}/${encodeURIComponent(id)}`, { headers: adminApiHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.ok) throw new Error("invalid_response");
      setDetail(data.item);
    } catch {
      setDetail({ error: "Rechnungsdetail konnte nicht geladen werden." });
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="admin-page admin-page--loose">
      {error ? <div className="admin-error-banner">{error}</div> : null}
      <div className="admin-panel-card">
        <div className="admin-panel-card__title">Invoices (read only)</div>
        <div className="admin-table-toolbar">
          <select className="admin-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Status (alle)</option>
            <option value="draft">draft</option>
            <option value="issued">issued</option>
            <option value="partially_paid">partially_paid</option>
            <option value="paid">paid</option>
            <option value="overdue">overdue</option>
            <option value="cancelled">cancelled</option>
          </select>
          <button type="button" className="admin-btn-refresh" onClick={() => void load()} disabled={loading}>
            {loading ? "Lade …" : "Aktualisieren"}
          </button>
        </div>
        <div className="admin-table-card">
          <div className="admin-table-scroll">
            <div className="admin-table-row admin-table-row--head">
              <div>Nummer</div><div>Firma</div><div>Typ</div><div>Status</div><div>Total</div><div />
            </div>
            {items.map((x) => (
              <div className="admin-table-row" key={x.id}>
                <div className="admin-mono">{x.invoice_number}</div>
                <div>{x.company_name || x.company_id || "—"}</div>
                <div>{x.invoice_type}</div>
                <div>{x.status}</div>
                <div>{money(x.total_gross)}</div>
                <div><button type="button" className="admin-page-btn admin-page-btn--compact" onClick={() => void openDetail(x.id)}>Details</button></div>
              </div>
            ))}
            {!loading && items.length === 0 ? <div className="admin-info-banner">Keine Rechnungen gefunden.</div> : null}
          </div>
        </div>
        <div className="admin-pagination">
          <button className="admin-page-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Zurück</button>
          <span className="admin-page-dots">Seite {page} / {pages}</span>
          <button className="admin-page-btn" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>Weiter</button>
        </div>
      </div>

      {detail ? (
        <div className="admin-panel-card">
          <div className="admin-panel-card__title">Invoice Detail</div>
          {"error" in detail ? (
            <div className="admin-error-banner">{detail.error}</div>
          ) : (
            <div className="finance-detail-grid">
              <div><strong>ID:</strong> <span className="admin-mono">{detail.id}</span></div>
              <div><strong>Nummer:</strong> {detail.invoice_number}</div>
              <div><strong>Firma:</strong> {detail.company_name || detail.company_id || "—"}</div>
              <div><strong>Status:</strong> {detail.status}</div>
              <div><strong>Netto:</strong> {money(detail.subtotal_net)}</div>
              <div><strong>MwSt:</strong> {money(detail.vat_total)}</div>
              <div><strong>Brutto:</strong> {money(detail.total_gross)}</div>
              <div><strong>Items:</strong> {detail.items?.length ?? 0}</div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
