import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const URL = `${API_BASE}/admin/finance/daily-driver-settlement`;

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

export default function DriversRevenuePage() {
  const [date, setDate] = useState(todayYmd);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ date });
      const res = await fetch(`${URL}?${q.toString()}`, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setReport(data);
    } catch (e) {
      setReport(null);
      setError(e instanceof Error ? e.message : "Laden fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = report?.totals;
  const drivers = Array.isArray(report?.drivers) ? report.drivers : [];

  return (
    <div className="admin-page admin-page--loose admin-page--content">
      <p className="admin-page-lead">
        Tagesabrechnung aus abgeschlossenen Fahrten (<code>ride_financials</code>): Brutto, ONRODA-Provision und
        Fahrer-Auszahlung — pro Fahrer aufgeschlüsselt.
      </p>

      <div className="admin-filter-toolbar admin-filter-toolbar--modern">
        <label className="admin-filter-field">
          <span className="admin-field-label">Tag</span>
          <input className="admin-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button
          type="button"
          className="admin-btn-refresh admin-filter-toolbar--modern__refresh"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? "Lade …" : "Aktualisieren"}
        </button>
      </div>

      {error ? <div className="admin-error-banner">{error}</div> : null}

      {totals ? (
        <div className="admin-kpi-grid" style={{ marginBottom: 20 }}>
          <div className="admin-kpi-card">
            <div className="admin-kpi-card__label">Fahrten (abgeschlossen)</div>
            <div className="admin-kpi-card__value admin-crisp-numeric">{totals.rideCount}</div>
          </div>
          <div className="admin-kpi-card">
            <div className="admin-kpi-card__label">Brutto heute</div>
            <div className="admin-kpi-card__value admin-crisp-numeric">{money(totals.grossAmount)}</div>
          </div>
          <div className="admin-kpi-card">
            <div className="admin-kpi-card__label">Provision ONRODA</div>
            <div className="admin-kpi-card__value admin-crisp-numeric">{money(totals.commissionAmount)}</div>
          </div>
          <div className="admin-kpi-card">
            <div className="admin-kpi-card__label">Trinkgeld (gesamt)</div>
            <div className="admin-kpi-card__value admin-crisp-numeric">{money(totals.tipAmount)}</div>
          </div>
          <div className="admin-kpi-card">
            <div className="admin-kpi-card__label">Auszahlung Fahrer</div>
            <div className="admin-kpi-card__value admin-crisp-numeric">{money(totals.driverPayoutAmount)}</div>
          </div>
        </div>
      ) : null}

      <div className="admin-table-card">
        {loading ? <p className="admin-table-sub">Lade …</p> : null}
        {!loading && drivers.length === 0 ? (
          <p className="admin-table-sub">Keine abgeschlossenen Fahrten mit Finanz-Snapshot an diesem Tag.</p>
        ) : null}
        {!loading && drivers.length > 0 ? (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Fahrer</th>
                <th>Mandant</th>
                <th>Fahrten</th>
                <th>Brutto</th>
                <th>Provision ONRODA</th>
                <th>Trinkgeld</th>
                <th>Auszahlung Fahrer</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((row) => (
                <tr key={`${row.companyId}:${row.driverId}`}>
                  <td>
                    {row.driverName}
                    <div className="admin-table-sub">{row.driverId}</div>
                  </td>
                  <td>{row.companyName}</td>
                  <td>{row.rideCount}</td>
                  <td>{money(row.grossAmount)}</td>
                  <td>{money(row.commissionAmount)}</td>
                  <td>{money(row.tipAmount)}</td>
                  <td>{money(row.driverPayoutAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}
