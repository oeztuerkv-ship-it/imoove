import { useCallback, useEffect, useState } from "react";
import AdminCollapsibleSection from "../components/AdminCollapsibleSection.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const LIST_URL = `${API_BASE}/admin/finance/ride-financials`;
const PAGE_SIZE = 20;

const BILLING_STATUS_OPTIONS = [
  { value: "", label: "Alle" },
  { value: "unbilled", label: "Nicht abgerechnet" },
  { value: "queued", label: "In Warteschlange" },
  { value: "invoiced", label: "Fakturiert" },
  { value: "partially_paid", label: "Teilweise bezahlt" },
  { value: "paid", label: "Bezahlt" },
  { value: "cancelled", label: "Abrechnung storniert" },
  { value: "written_off", label: "Abgeschrieben" },
];

const SETTLEMENT_STATUS_OPTIONS = [
  { value: "", label: "Alle" },
  { value: "open", label: "Offen" },
  { value: "calculated", label: "Berechnet" },
  { value: "approved", label: "Freigegeben" },
  { value: "paid_out", label: "Ausgezahlt" },
  { value: "held", label: "Zurückgehalten" },
  { value: "disputed", label: "Beanstandet" },
];

const LOCK_OPTIONS = [
  { value: "", label: "Alle" },
  { value: "true", label: "Gesperrt" },
  { value: "false", label: "Nicht gesperrt" },
];

const BILLING_LABELS = Object.fromEntries(
  BILLING_STATUS_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]),
);

const SETTLEMENT_LABELS = Object.fromEntries(
  SETTLEMENT_STATUS_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]),
);

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

function billingStatusDe(status) {
  const k = String(status ?? "").trim();
  return BILLING_LABELS[k] || k || "—";
}

function settlementStatusDe(status) {
  const k = String(status ?? "").trim();
  return SETTLEMENT_LABELS[k] || k || "—";
}

function lockReasonDe(reason) {
  const k = String(reason ?? "").trim();
  const m = {
    invoice_item_assigned: "Rechnungsposition zugeordnet",
    manual_lock: "Manuell gesperrt",
  };
  return m[k] || k || "—";
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
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchInput.trim() }));
      setPage(1);
    }, 320);
    return () => window.clearTimeout(t);
  }, [searchInput]);

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
      setError("Finanz-Snapshots konnten nicht geladen werden.");
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
    <div className="admin-page admin-page--loose admin-page--content">
      <p className="admin-page-lead">Finanz-Snapshots je Fahrt — Filter, Seiten und Detailansicht.</p>

      {error ? (
        <section className="admin-section-block">
          <div className="admin-section-block__body">
            <div className="admin-error-banner admin-info-banner--inline">{error}</div>
          </div>
        </section>
      ) : null}

      <AdminCollapsibleSection title="Finanz-Snapshots je Fahrt" subtitle={`${total} Einträge`} defaultOpen>
        <div className="admin-filter-toolbar admin-filter-toolbar--modern admin-filter-toolbar--search-wide">
          <label className="admin-filter-field admin-filter-field--wide">
            <span className="admin-field-label">Suche</span>
            <input
              className="admin-input"
              placeholder="Fahrt-ID, Abrechnungsreferenz …"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </label>
          <label className="admin-filter-field">
            <span className="admin-field-label">Abrechnungsstatus</span>
            <select
              className="admin-select"
              value={filters.billingStatus}
              onChange={(e) => {
                setPage(1);
                setFilters((f) => ({ ...f, billingStatus: e.target.value }));
              }}
            >
              {BILLING_STATUS_OPTIONS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-filter-field">
            <span className="admin-field-label">Auszahlungsstatus</span>
            <select
              className="admin-select"
              value={filters.settlementStatus}
              onChange={(e) => {
                setPage(1);
                setFilters((f) => ({ ...f, settlementStatus: e.target.value }));
              }}
            >
              {SETTLEMENT_STATUS_OPTIONS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-filter-field">
            <span className="admin-field-label">Sperre</span>
            <select
              className="admin-select"
              value={filters.locked}
              onChange={(e) => {
                setPage(1);
                setFilters((f) => ({ ...f, locked: e.target.value }));
              }}
            >
              {LOCK_OPTIONS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="admin-btn-refresh admin-filter-toolbar--modern__refresh" onClick={() => void loadList()} disabled={loading}>
            {loading ? "Lade …" : "Aktualisieren"}
          </button>
        </div>
        <div className="admin-table-card admin-table-card--embedded">
          <div className="admin-table-scroll">
            <div className="admin-table-row admin-table-row--head">
              <div>Fahrt</div>
              <div>Partner</div>
              <div>Unternehmer</div>
              <div>Brutto</div>
              <div>Provision</div>
              <div>Abrechnung</div>
              <div>Auszahlung</div>
              <div />
            </div>
            {items.map((x) => (
              <div className="admin-table-row" key={x.id}>
                <div className="admin-mono">{x.ride_id}</div>
                <div className="admin-text-clamp-2">{x.partner_company_name || x.partner_company_id || "—"}</div>
                <div className="admin-text-clamp-2">{x.service_provider_company_name || x.service_provider_company_id || "—"}</div>
                <div className="admin-crisp-numeric">{money(x.gross_amount)}</div>
                <div className="admin-crisp-numeric">{money(x.commission_amount)}</div>
                <div title={x.billing_status}>{billingStatusDe(x.billing_status)}</div>
                <div title={x.settlement_status}>{settlementStatusDe(x.settlement_status)}</div>
                <div>
                  <button type="button" className="admin-btn-table-ghost" onClick={() => void openDetail(x.ride_id)}>
                    Details
                  </button>
                </div>
              </div>
            ))}
            {!loading && items.length === 0 ? <div className="admin-info-banner admin-info-banner--inline">Keine Datensätze gefunden.</div> : null}
          </div>
        </div>
        <div className="admin-pagination admin-pagination--inset">
          <button className="admin-page-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Zurück
          </button>
          <span className="admin-page-dots">
            Seite {page} / {pages}
          </span>
          <button className="admin-page-btn" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>
            Weiter
          </button>
        </div>
      </AdminCollapsibleSection>

      {detailLoading ? (
        <section className="admin-section-block">
          <div className="admin-section-block__body">
            <div className="admin-info-banner admin-info-banner--inline">Detail wird geladen …</div>
          </div>
        </section>
      ) : null}
      {detail ? (
        <section className="admin-section-block">
          <div className="admin-section-block__head admin-section-block__head--static">
            <h2 className="admin-section-block__title">Finanz-Snapshot · Detail</h2>
          </div>
          <div className="admin-section-block__body">
            {"error" in detail ? (
              <div className="admin-error-banner">{detail.error}</div>
            ) : (
              <div className="finance-detail-grid">
                <div>
                  <strong>Fahrt-ID:</strong> <span className="admin-mono">{detail?.snapshot?.ride_id}</span>
                </div>
                <div>
                  <strong>Berechnung:</strong> {detail?.snapshot?.calculation_version} ({detail?.snapshot?.calculation_rule_set || "—"})
                </div>
                <div>
                  <strong>Sperrgrund:</strong> {lockReasonDe(detail?.snapshot?.lock_reason)}
                </div>
                <div>
                  <strong>Anzahl Korrekturen:</strong> {detail?.snapshot?.correction_count ?? 0}
                </div>
                <div>
                  <strong>Rechnungsverknüpfungen:</strong> {detail?.invoiceLinkage?.length ?? 0}
                </div>
                <div>
                  <strong>Auszahlungsverknüpfungen:</strong> {detail?.settlementLinkage?.length ?? 0}
                </div>
                <div>
                  <strong>Rechnungsfähig:</strong> {detail?.eligibility?.invoiceEligible ? "ja" : "nein"}
                </div>
                <div>
                  <strong>Auszahlungsfähig:</strong> {detail?.eligibility?.settlementEligible ? "ja" : "nein"}
                </div>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
