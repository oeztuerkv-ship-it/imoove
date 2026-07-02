import { useCallback, useEffect, useState } from "react";
import AdminCollapsibleSection from "../components/AdminCollapsibleSection.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const LIST_URL = `${API_BASE}/admin/finance/payout-lines`;
const PAGE_SIZE = 25;

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

function formatDt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return String(iso);
  }
}

export default function FinancePayoutLinesPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyRideId, setBusyRideId] = useState("");
  const [filters, setFilters] = useState({
    payoutLineStatus: "",
    search: "",
  });

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams();
      q.set("page", String(page));
      q.set("pageSize", String(PAGE_SIZE));
      if (filters.payoutLineStatus.trim()) q.set("payout_line_status", filters.payoutLineStatus.trim());
      if (filters.search.trim()) q.set("search", filters.search.trim());
      const res = await fetch(`${LIST_URL}?${q.toString()}`, { headers: adminApiHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.ok) throw new Error("invalid_response");
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total ?? 0));
    } catch {
      setItems([]);
      setTotal(0);
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

  return (
    <div className="admin-page admin-page--loose admin-page--content">
      <p className="admin-page-lead">
        Unternehmer-Auszahlungen je Fahrt — Stripe-Gebühr zu Lasten ONRODA, Netto Unternehmer ohne Abzug der
        Gebühr. Manuelles Markieren, keine automatische Auszahlung.
      </p>

      {error ? (
        <section className="admin-section-block">
          <div className="admin-section-block__body">
            <div className="admin-error-banner admin-info-banner--inline">{error}</div>
          </div>
        </section>
      ) : null}

      <AdminCollapsibleSection title="Auszahlungen" subtitle={`${total} Fahrten`} defaultOpen>
        <div className="admin-filter-toolbar">
          <select
            className="admin-select"
            value={filters.payoutLineStatus}
            onChange={(e) => {
              setPage(1);
              setFilters((f) => ({ ...f, payoutLineStatus: e.target.value }));
            }}
          >
            <option value="">Status: alle</option>
            <option value="offen">Offen</option>
            <option value="ausgezahlt">Ausgezahlt</option>
          </select>
          <input
            className="admin-input"
            placeholder="Suche Fahrt-ID"
            value={filters.search}
            onChange={(e) => {
              setPage(1);
              setFilters((f) => ({ ...f, search: e.target.value }));
            }}
          />
          <button type="button" className="admin-btn-refresh" onClick={() => void loadList()} disabled={loading}>
            {loading ? "Lade …" : "Aktualisieren"}
          </button>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table admin-table--compact">
            <thead>
              <tr>
                <th>Fahrt</th>
                <th>Datum</th>
                <th>Unternehmer</th>
                <th>Brutto</th>
                <th>Stripe-Gebühr</th>
                <th>ONRODA-Provision</th>
                <th>Netto Unternehmer</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !loading ? (
                <tr>
                  <td colSpan={9} className="admin-table-empty">
                    Keine Einträge.
                  </td>
                </tr>
              ) : null}
              {items.map((row) => {
                const rideId = row.rideId ?? row.ride_id ?? "";
                const status = row.payoutLineStatus ?? row.payout_line_status ?? "offen";
                const isOpen = status === "offen";
                return (
                  <tr key={rideId}>
                    <td>
                      <code>{rideId}</code>
                    </td>
                    <td>{formatDt(row.calculatedAt ?? row.calculated_at)}</td>
                    <td>{row.companyName ?? row.company_name ?? row.companyId ?? "—"}</td>
                    <td className="admin-crisp-numeric">{money(row.grossAmount ?? row.gross_amount)}</td>
                    <td className="admin-crisp-numeric">{money(row.stripeFeeAmount ?? row.stripe_fee_amount)}</td>
                    <td className="admin-crisp-numeric">{money(row.commissionAmount ?? row.commission_amount)}</td>
                    <td className="admin-crisp-numeric">
                      {money(row.operatorPayoutAmount ?? row.operator_payout_amount)}
                    </td>
                    <td>{isOpen ? "Offen" : "Ausgezahlt"}</td>
                    <td>
                      {isOpen ? (
                        <button
                          type="button"
                          className="admin-btn admin-btn--secondary admin-btn--sm"
                          disabled={busyRideId === rideId}
                          onClick={() => void markAusgezahlt(rideId)}
                        >
                          {busyRideId === rideId ? "…" : "Als ausgezahlt markieren"}
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
          <div className="admin-pagination" style={{ marginTop: 12 }}>
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
