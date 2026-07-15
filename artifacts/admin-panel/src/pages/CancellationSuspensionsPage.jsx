import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminFetch } from "../lib/adminApiHeaders.js";

const BASE = `${API_BASE}/admin/cancellation-suspensions`;

function formatDt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function authProviderLabel(provider) {
  if (provider === "email") return "E-Mail";
  if (provider === "apple") return "Apple";
  if (provider === "google") return "Google";
  return provider || "—";
}

async function readJson(res) {
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { _raw: text };
    }
  }
  return { data, text };
}

export default function CancellationSuspensionsPage() {
  const [customers, setCustomers] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionBusyId, setActionBusyId] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const u = new URL(BASE);
      if (debouncedQ) u.searchParams.set("q", debouncedQ);
      const res = await adminFetch(u.toString());
      const { data } = await readJson(res);
      if (!res.ok || !data?.ok) {
        const detail =
          typeof data?.message === "string"
            ? data.message
            : typeof data?.error === "string"
              ? data.error
              : `HTTP ${res.status}`;
        throw new Error(detail);
      }
      setCustomers(Array.isArray(data.customers) ? data.customers : []);
      setDrivers(Array.isArray(data.drivers) ? data.drivers : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [debouncedQ]);

  useEffect(() => {
    void load();
  }, [load]);

  async function liftCustomer(passengerId) {
    if (!window.confirm("Storno-Sperre für diesen Kunden aufheben?")) return;
    setActionBusyId(`c:${passengerId}`);
    try {
      const res = await adminFetch(`${BASE}/customers/${encodeURIComponent(passengerId)}/lift`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const { data } = await readJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(typeof data?.message === "string" ? data.message : data?.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Aufheben fehlgeschlagen");
    } finally {
      setActionBusyId("");
    }
  }

  async function liftDriver(fleetDriverId) {
    if (!window.confirm("Storno-Sperre für diesen Fahrer aufheben?")) return;
    setActionBusyId(`d:${fleetDriverId}`);
    try {
      const res = await adminFetch(`${BASE}/drivers/${encodeURIComponent(fleetDriverId)}/lift`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const { data } = await readJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(typeof data?.message === "string" ? data.message : data?.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Aufheben fehlgeschlagen");
    } finally {
      setActionBusyId("");
    }
  }

  return (
    <div className="admin-page">
      <p className="admin-page-lead">
        Aktive System-Sperren wegen zu vieler Stornos — Kunden (≥4 in 24h) und Fahrer (≥5 nach Annahme in 7
        Tagen). Hier manuell entsperren; manuelle Admin-Sperren aus „Kunden“ bleiben dort verwaltbar.
      </p>

      <div className="admin-filter-card admin-filter-card--modern">
        <div className="admin-filter-grid admin-filter-grid--modern">
          <label className="admin-filter-field admin-filter-field--search">
            <span className="admin-field-label">Suche</span>
            <input
              className="admin-input"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, E-Mail, Unternehmen …"
              autoComplete="off"
            />
          </label>
          <div className="admin-filter-actions">
            <button type="button" className="admin-btn-refresh" onClick={() => void load()} disabled={loading}>
              {loading ? "Lade …" : "Aktualisieren"}
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <p className="admin-info-banner admin-info-banner--err" role="alert">
          {error}
        </p>
      ) : null}

      <h2 className="admin-panel-card__title" style={{ marginTop: 8, fontSize: "1.1rem" }}>
        Kunden ({customers.length})
      </h2>
      <div className="admin-rides-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>E-Mail</th>
              <th>Anmeldung</th>
              <th>Stornos (Fenster)</th>
              <th>Grund</th>
              <th>Gesperrt seit</th>
              <th>Gesperrt bis</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 && !loading ? (
              <tr>
                <td colSpan={8}>Keine aktiven Kunden-Storno-Sperren.</td>
              </tr>
            ) : null}
            {customers.map((row) => {
              const busy = actionBusyId === `c:${row.passengerId}`;
              return (
                <tr key={row.passengerId}>
                  <td>{row.name || "—"}</td>
                  <td>{row.email || "—"}</td>
                  <td>{authProviderLabel(row.authProvider)}</td>
                  <td>
                    {row.cancellationCountInWindow} / {row.cancellationThreshold} ({row.windowHours}h)
                  </td>
                  <td>{row.reasonLabel || row.reason || "—"}</td>
                  <td>{formatDt(row.suspendedAt)}</td>
                  <td>{formatDt(row.suspendedUntil)}</td>
                  <td>
                    <button
                      type="button"
                      className="admin-m-btn-bearb admin-m-btn-bearb--sm"
                      disabled={busy}
                      onClick={() => void liftCustomer(row.passengerId)}
                    >
                      {busy ? "…" : "Entsperren"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="admin-panel-card__title" style={{ marginTop: 24, fontSize: "1.1rem" }}>
        Fahrer ({drivers.length})
      </h2>
      <div className="admin-rides-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>E-Mail</th>
              <th>Unternehmen</th>
              <th>Stornos (Fenster)</th>
              <th>Grund</th>
              <th>Gesperrt seit</th>
              <th>Gesperrt bis</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {drivers.length === 0 && !loading ? (
              <tr>
                <td colSpan={8}>Keine aktiven Fahrer-Storno-Sperren.</td>
              </tr>
            ) : null}
            {drivers.map((row) => {
              const busy = actionBusyId === `d:${row.fleetDriverId}`;
              const fullName = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
              return (
                <tr key={row.fleetDriverId}>
                  <td>{fullName || "—"}</td>
                  <td>{row.email || "—"}</td>
                  <td>{row.companyName || row.companyId || "—"}</td>
                  <td>
                    {row.cancellationCountInWindow} / {row.cancellationThreshold} ({row.windowDays} Tage)
                  </td>
                  <td>{row.reasonLabel || row.reason || "—"}</td>
                  <td>{formatDt(row.suspendedAt)}</td>
                  <td>{formatDt(row.suspendedUntil)}</td>
                  <td>
                    <button
                      type="button"
                      className="admin-m-btn-bearb admin-m-btn-bearb--sm"
                      disabled={busy}
                      onClick={() => void liftDriver(row.fleetDriverId)}
                    >
                      {busy ? "…" : "Entsperren"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
