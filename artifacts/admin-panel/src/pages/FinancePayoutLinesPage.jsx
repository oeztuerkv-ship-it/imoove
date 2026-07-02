import { useCallback, useEffect, useMemo, useState } from "react";
import AdminCollapsibleSection from "../components/AdminCollapsibleSection.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const LIST_URL = `${API_BASE}/admin/finance/payout-lines`;
const COMPANIES_URL = `${API_BASE}/admin/companies`;
const PAGE_SIZE = 25;

const SORT_OPTIONS = [
  { value: "calculated_at_desc", label: "Datum · neueste zuerst" },
  { value: "calculated_at_asc", label: "Datum · älteste zuerst" },
  { value: "company_asc", label: "Unternehmer A → Z" },
  { value: "company_desc", label: "Unternehmer Z → A" },
];

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

function formatDtParts(iso) {
  if (!iso) return { date: "—", time: "" };
  try {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }),
      time: d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
    };
  } catch {
    return { date: String(iso), time: "" };
  }
}

function payoutStatusPill(status) {
  const s = String(status ?? "offen");
  if (s === "ausgezahlt") return "admin-status-pill admin-status-pill--ok";
  return "admin-status-pill admin-status-pill--pending";
}

function payoutStatusLabel(status) {
  return String(status ?? "offen") === "ausgezahlt" ? "Ausgezahlt" : "Offen";
}

export default function FinancePayoutLinesPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyRideId, setBusyRideId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState({
    payoutLineStatus: "",
    companyId: "",
    sort: "calculated_at_desc",
    search: "",
  });

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(COMPANIES_URL, { headers: adminApiHeaders() });
        const data = await res.json().catch(() => ({}));
        const list = Array.isArray(data?.companies) ? data.companies : Array.isArray(data) ? data : [];
        setCompanies(
          list
            .map((c) => ({
              id: String(c.id ?? c.companyId ?? "").trim(),
              name: String(c.name ?? c.displayName ?? c.id ?? "").trim(),
            }))
            .filter((c) => c.id && c.name)
            .sort((a, b) => a.name.localeCompare(b.name, "de")),
        );
      } catch {
        setCompanies([]);
      }
    })();
  }, []);

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
      q.set("sort", filters.sort || "calculated_at_desc");
      if (filters.payoutLineStatus.trim()) q.set("payout_line_status", filters.payoutLineStatus.trim());
      if (filters.companyId.trim()) q.set("company_id", filters.companyId.trim());
      if (filters.search.trim()) q.set("search", filters.search.trim());
      const res = await fetch(`${LIST_URL}?${q.toString()}`, { headers: adminApiHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.ok) throw new Error("invalid_response");
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total ?? 0));
      setSummary(data.summary && typeof data.summary === "object" ? data.summary : null);
    } catch {
      setItems([]);
      setTotal(0);
      setSummary(null);
      setError("Auszahlungsliste konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function markAusgezahlt(rideId) {
    if (!rideId || busyRideId) return;
    const ok = window.confirm(`Fahrt ${rideId} als ausgezahlt markieren?`);
    if (!ok) return;
    setBusyRideId(rideId);
    setError("");
    try {
      const res = await fetch(`${LIST_URL}/${encodeURIComponent(rideId)}/mark-ausgezahlt`, {
        method: "POST",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Markieren fehlgeschlagen.");
    } finally {
      setBusyRideId("");
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const kpiCards = useMemo(
    () => [
      { label: "Treffer (Filter)", value: String(summary?.totalRows ?? total) },
      { label: "Offen", value: String(summary?.openCount ?? "—") },
      { label: "Offen · Netto gesamt", value: money(summary?.openNetTotal) },
      { label: "Ausgezahlt", value: String(summary?.paidOutCount ?? "—") },
    ],
    [summary, total],
  );

  return (
    <div className="admin-page admin-page--loose admin-page--content">
      <p className="admin-page-lead">
        Unternehmer-Auszahlungen je Fahrt — Zuordnung über Finanz-Snapshot, Partner oder Fahrt-Mandant.
        Stripe-Gebühr zu Lasten ONRODA; Netto Unternehmer ohne Gebührenabzug.
      </p>

      {error ? (
        <section className="admin-section-block">
          <div className="admin-section-block__body">
            <div className="admin-error-banner admin-info-banner--inline">{error}</div>
          </div>
        </section>
      ) : null}

      <div className="finance-kpi-grid" style={{ marginBottom: 16 }}>
        {kpiCards.map((c) => (
          <div key={c.label} className="finance-kpi-card">
            <div className="finance-kpi-card__label">{c.label}</div>
            <div className="finance-kpi-card__value admin-crisp-numeric">{loading ? "…" : c.value}</div>
          </div>
        ))}
      </div>

      <AdminCollapsibleSection title="Auszahlungen" subtitle={`${total} Fahrten`} defaultOpen flushBody>
        <div className="admin-finance-payout-toolbar">
          <label className="admin-filter-field admin-filter-field--search">
            <span className="admin-field-label">Suche</span>
            <input
              className="admin-input"
              placeholder="Fahrt-ID, Route, Unternehmer …"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </label>
          <label className="admin-filter-field">
            <span className="admin-field-label">Unternehmer</span>
            <select
              className="admin-select"
              value={filters.companyId}
              onChange={(e) => {
                setPage(1);
                setFilters((f) => ({ ...f, companyId: e.target.value }));
              }}
            >
              <option value="">Alle</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-filter-field">
            <span className="admin-field-label">Status</span>
            <select
              className="admin-select"
              value={filters.payoutLineStatus}
              onChange={(e) => {
                setPage(1);
                setFilters((f) => ({ ...f, payoutLineStatus: e.target.value }));
              }}
            >
              <option value="">Alle</option>
              <option value="offen">Offen</option>
              <option value="ausgezahlt">Ausgezahlt</option>
            </select>
          </label>
          <label className="admin-filter-field">
            <span className="admin-field-label">Sortierung</span>
            <select
              className="admin-select"
              value={filters.sort}
              onChange={(e) => {
                setPage(1);
                setFilters((f) => ({ ...f, sort: e.target.value }));
              }}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="admin-btn-refresh admin-finance-payout-toolbar__refresh"
            onClick={() => void loadList()}
            disabled={loading}
          >
            {loading ? "Lade …" : "Aktualisieren"}
          </button>
        </div>

        <div className="admin-rides-table-wrap admin-payout-lines-table-wrap">
          <table className="admin-rides-table admin-payout-lines-table">
            <colgroup>
              <col className="col-ride" />
              <col className="col-company" />
              <col className="col-route" />
              <col className="col-money" />
              <col className="col-money" />
              <col className="col-money" />
              <col className="col-net" />
              <col className="col-status" />
              <col className="col-action" />
            </colgroup>
            <thead>
              <tr>
                <th>Fahrt</th>
                <th>Unternehmer</th>
                <th>Route</th>
                <th className="admin-table__num">Brutto</th>
                <th className="admin-table__num">Stripe</th>
                <th className="admin-table__num">Prov.</th>
                <th className="admin-table__num">Netto</th>
                <th>Status</th>
                <th className="admin-rides-table__col-actions" aria-label="Aktion" />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !loading ? (
                <tr>
                  <td colSpan={9} className="admin-table-empty">
                    Keine Einträge für die aktuelle Filterung.
                  </td>
                </tr>
              ) : null}
              {items.map((row) => {
                const rideId = row.rideId ?? row.ride_id ?? "";
                const status = row.payoutLineStatus ?? row.payout_line_status ?? "offen";
                const isOpen = status === "offen";
                const companyName = row.companyName ?? row.company_name;
                const companyId = row.companyId ?? row.company_id;
                const when = formatDtParts(row.calculatedAt ?? row.calculated_at);
                const routeLabel = row.routeLabel ?? "";
                return (
                  <tr key={rideId} className="admin-rides-table__row">
                    <td>
                      <a
                        className="admin-link admin-payout-lines-ride__id"
                        href={`#/ride-detail/${encodeURIComponent(rideId)}`}
                        title={rideId}
                      >
                        {rideId}
                      </a>
                      <div className="admin-payout-lines-ride__date admin-crisp-numeric">
                        {when.time ? `${when.date}, ${when.time}` : when.date}
                      </div>
                    </td>
                    <td>
                      {companyName ? (
                        <div className="admin-payout-lines-company" title={companyName}>
                          {companyName}
                        </div>
                      ) : companyId ? (
                        <div className="admin-payout-lines-company admin-payout-lines-company--empty" title={companyId}>
                          <code className="admin-mono">{companyId}</code>
                        </div>
                      ) : (
                        <span className="admin-payout-lines-company admin-payout-lines-company--empty">—</span>
                      )}
                    </td>
                    <td>
                      {routeLabel ? (
                        <div className="admin-payout-lines-route" title={routeLabel}>
                          {routeLabel}
                        </div>
                      ) : (
                        <span className="admin-table-sub">—</span>
                      )}
                    </td>
                    <td className="admin-crisp-numeric admin-table__num">{money(row.grossAmount ?? row.gross_amount)}</td>
                    <td className="admin-crisp-numeric admin-table__num admin-table-sub">
                      {money(row.stripeFeeAmount ?? row.stripe_fee_amount)}
                    </td>
                    <td className="admin-crisp-numeric admin-table__num">{money(row.commissionAmount ?? row.commission_amount)}</td>
                    <td className="admin-crisp-numeric admin-table__num admin-payout-lines-net">
                      {money(row.operatorPayoutAmount ?? row.operator_payout_amount)}
                    </td>
                    <td>
                      <span className={payoutStatusPill(status)}>{payoutStatusLabel(status)}</span>
                    </td>
                    <td className="admin-payout-lines-action">
                      {isOpen ? (
                        <button
                          type="button"
                          className="admin-btn-payout-mark"
                          disabled={busyRideId === rideId}
                          onClick={() => void markAusgezahlt(rideId)}
                        >
                          {busyRideId === rideId ? "…" : "Ausgezahlt"}
                        </button>
                      ) : (
                        <span className="admin-table-sub">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {pages > 1 ? (
          <div className="admin-pagination" style={{ margin: "12px 12px 0" }}>
            <button
              type="button"
              className="admin-btn admin-btn--secondary admin-btn--sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Zurück
            </button>
            <span className="admin-table-sub" style={{ margin: "0 12px" }}>
              Seite {page} / {pages}
            </span>
            <button
              type="button"
              className="admin-btn admin-btn--secondary admin-btn--sm"
              disabled={page >= pages || loading}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
            >
              Weiter
            </button>
          </div>
        ) : null}
      </AdminCollapsibleSection>
    </div>
  );
}
