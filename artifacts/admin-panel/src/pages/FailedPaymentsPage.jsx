import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const LIST_URL = `${API_BASE}/admin/payments/failed-rides`;
const PAGE_SIZE = 20;

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

function formatDt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

export default function FailedPaymentsPage({ onOpenRide }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams();
      q.set("page", String(page));
      q.set("pageSize", String(PAGE_SIZE));
      const res = await fetch(`${LIST_URL}?${q.toString()}`, { headers: adminApiHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.ok) throw new Error("invalid_response");
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total ?? 0));
    } catch {
      setItems([]);
      setTotal(0);
      setError("Fehlgeschlagene Zahlungen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="admin-page">
      <div className="admin-card admin-card--flush">
        <div className="admin-card__header admin-card__header--split">
          <div>
            <h2 className="admin-card__title">Offene fehlgeschlagene Zahlungen</h2>
            <p className="admin-card__subtitle">
              Abgeschlossene Fahrten mit <code>payment_status: failed</code> — automatische Retries und manuelle Nachverfolgung.
            </p>
          </div>
          <div className="admin-kpi-pill">
            <span className="admin-kpi-pill__label">Gesamt</span>
            <span className="admin-kpi-pill__value">{total}</span>
          </div>
        </div>

        {error ? <p className="admin-form-error">{error}</p> : null}

        {loading ? (
          <p className="admin-muted">Lade …</p>
        ) : items.length === 0 ? (
          <p className="admin-muted">Keine fehlgeschlagenen Zahlungen.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Fahrt</th>
                  <th>Kunde</th>
                  <th>Mandant</th>
                  <th>Betrag</th>
                  <th>Versuche</th>
                  <th>Letzter Versuch</th>
                  <th>Nächster Retry</th>
                  <th>Fehler</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {typeof onOpenRide === "function" ? (
                        <button type="button" className="admin-link-button" onClick={() => onOpenRide(row.id)}>
                          {row.id}
                        </button>
                      ) : (
                        row.id
                      )}
                    </td>
                    <td>
                      <div>{row.passengerEmail || "—"}</div>
                      <div className="admin-muted admin-text-xs">{row.passengerId || ""}</div>
                    </td>
                    <td>{row.companyName || row.companyId || "—"}</td>
                    <td>{money(row.finalFare ?? row.estimatedFare)}</td>
                    <td>{row.paymentCaptureAttemptCount ?? 0}</td>
                    <td>{formatDt(row.paymentCaptureLastAttemptAt)}</td>
                    <td>{row.paymentCaptureNextRetryAt ? formatDt(row.paymentCaptureNextRetryAt) : "— (Sperre)"}</td>
                    <td className="admin-text-xs" title={row.paymentCaptureLastError || ""}>
                      {(row.paymentCaptureLastError || "—").slice(0, 80)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pageCount > 1 ? (
          <div className="admin-pagination">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Zurück
            </button>
            <span>
              Seite {page} / {pageCount}
            </span>
            <button type="button" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
              Weiter
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
