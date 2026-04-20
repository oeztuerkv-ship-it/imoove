import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const LIST_URL = `${API_BASE}/admin/finance/ride-financials`;
const PAGE_SIZE = 20;

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

export default function FinanceRideFinancialsPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [filters, setFilters] = useState({
    search: "",
    payerType: "",
    billingStatus: "",
    settlementStatus: "",
    locked: "",
    hasInvoice: "",
  });

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams();
      q.set("page", String(page));
      q.set("pageSize", String(PAGE_SIZE));
      if (filters.search.trim()) q.set("search", filters.search.trim());
      if (filters.payerType.trim()) q.set("payer_type", filters.payerType.trim());
      if (filters.billingStatus.trim()) q.set("billing_status", filters.billingStatus.trim());
      if (filters.settlementStatus.trim()) q.set("settlement_status", filters.settlementStatus.trim());
      if (filters.locked) q.set("locked", filters.locked);
      if (filters.hasInvoice) q.set("has_invoice", filters.hasInvoice);
      const res = await fetch(`${LIST_URL}?${q.toString()}`, { headers: adminApiHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.ok) throw new Error("invalid_response");
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total ?? 0));
    } catch {
      setItems([]);
      setTotal(0);
      setError("Ride-Financials konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function openDetail(rideId) {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetch(`${LIST_URL}/${encodeURIComponent(rideId)}`, { headers: adminApiHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.ok) throw new Error("invalid_response");
      setDetail(data);
    } catch {
      setDetail({ error: "Detail konnte nicht geladen werden." });
    } finally {
      setDetailLoading(false);
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="admin-page admin-page--loose">
      {error ? <div className="admin-error-banner">{error}</div> : null}
      <div className="admin-panel-card">
        <div className="admin-panel-card__title">Ride Financials</div>
        <div className="admin-table-toolbar">
          <input
            className="admin-input"
            placeholder="Suche (ride_id / billing_reference)"
            value={filters.search}
            onChange={(e) => {
              setPage(1);
              setFilters((f) => ({ ...f, search: e.target.value }));
            }}
          />
          <select className="admin-select" value={filters.billingStatus} onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, billingStatus: e.target.value })); }}>
            <option value="">Billing-Status (alle)</option>
            <option value="unbilled">unbilled</option>
            <option value="queued">queued</option>
            <option value="invoiced">invoiced</option>
            <option value="partially_paid">partially_paid</option>
            <option value="paid">paid</option>
            <option value="cancelled">cancelled</option>
            <option value="written_off">written_off</option>
          </select>
          <select className="admin-select" value={filters.settlementStatus} onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, settlementStatus: e.target.value })); }}>
            <option value="">Settlement-Status (alle)</option>
            <option value="open">open</option>
            <option value="calculated">calculated</option>
            <option value="approved">approved</option>
            <option value="paid_out">paid_out</option>
            <option value="held">held</option>
            <option value="disputed">disputed</option>
          </select>
          <select className="admin-select" value={filters.locked} onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, locked: e.target.value })); }}>
            <option value="">Lock (alle)</option>
            <option value="true">locked</option>
            <option value="false">unlocked</option>
          </select>
          <button type="button" className="admin-btn-refresh" onClick={() => void loadList()} disabled={loading}>
            {loading ? "Lade …" : "Aktualisieren"}
          </button>
        </div>
        <div className="admin-table-card">
          <div className="admin-table-scroll">
            <div className="admin-table-row admin-table-row--head">
              <div>Ride</div><div>Partner</div><div>Provider</div><div>Gross</div><div>Commission</div><div>Billing</div><div>Settlement</div><div />
            </div>
            {items.map((x) => (
              <div className="admin-table-row" key={x.id}>
                <div className="admin-mono">{x.ride_id}</div>
                <div>{x.partner_company_name || x.partner_company_id || "—"}</div>
                <div>{x.service_provider_company_name || x.service_provider_company_id || "—"}</div>
                <div>{money(x.gross_amount)}</div>
                <div>{money(x.commission_amount)}</div>
                <div>{x.billing_status}</div>
                <div>{x.settlement_status}</div>
                <div><button type="button" className="admin-page-btn admin-page-btn--compact" onClick={() => void openDetail(x.ride_id)}>Details</button></div>
              </div>
            ))}
            {!loading && items.length === 0 ? <div className="admin-info-banner">Keine Datensätze gefunden.</div> : null}
          </div>
        </div>
        <div className="admin-pagination">
          <button className="admin-page-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Zurück</button>
          <span className="admin-page-dots">Seite {page} / {pages}</span>
          <button className="admin-page-btn" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>Weiter</button>
        </div>
      </div>

      {detailLoading ? <div className="admin-info-banner">Detail wird geladen …</div> : null}
      {detail ? (
        <div className="admin-panel-card">
          <div className="admin-panel-card__title">Ride Financial Detail</div>
          {"error" in detail ? (
            <div className="admin-error-banner">{detail.error}</div>
          ) : (
            <div className="finance-detail-grid">
              <div><strong>Ride ID:</strong> <span className="admin-mono">{detail?.snapshot?.ride_id}</span></div>
              <div><strong>Calculation:</strong> {detail?.snapshot?.calculation_version} ({detail?.snapshot?.calculation_rule_set || "—"})</div>
              <div><strong>Lock reason:</strong> {detail?.snapshot?.lock_reason || "—"}</div>
              <div><strong>Correction count:</strong> {detail?.snapshot?.correction_count ?? 0}</div>
              <div><strong>Invoice links:</strong> {detail?.invoiceLinkage?.length ?? 0}</div>
              <div><strong>Settlement links:</strong> {detail?.settlementLinkage?.length ?? 0}</div>
              <div><strong>Invoice eligible:</strong> {detail?.eligibility?.invoiceEligible ? "ja" : "nein"}</div>
              <div><strong>Settlement eligible:</strong> {detail?.eligibility?.settlementEligible ? "ja" : "nein"}</div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
