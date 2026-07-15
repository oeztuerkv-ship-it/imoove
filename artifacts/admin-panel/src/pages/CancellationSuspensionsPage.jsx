import { useCallback, useEffect, useState } from "react";
import AdminCollapsibleSection from "../components/AdminCollapsibleSection.jsx";
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

function StornoCountBadge({ count, threshold, windowLabel }) {
  const atLimit = Number(count) >= Number(threshold);
  return (
    <span
      className={`admin-c-badge ${atLimit ? "admin-c-badge--err" : "admin-c-badge--warn"}`}
      title={`${count} Stornos im Messfenster`}
    >
      {count} / {threshold} · {windowLabel}
    </span>
  );
}

function SuspensionTableState({ loading, empty, emptyLabel }) {
  if (loading) {
    return (
      <div className="admin-section-block__inset">
        <p className="admin-muted">Wird geladen …</p>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="admin-section-block__inset">
        <div className="admin-info-banner admin-info-banner--inline">{emptyLabel}</div>
      </div>
    );
  }
  return null;
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
    <div className="admin-page admin-page--loose">
      <p className="admin-page-lead">
        <strong>System-Storno-Sperren</strong> — automatisch gesetzt bei zu vielen Stornos (Kunden ≥4 in 24h,
        Fahrer ≥5 nach Annahme in 7 Tagen). Hier manuell entsperren; andere Admin-Sperren bleiben unter „Kunden“ bzw.
        „Taxi · Fahrer“.
      </p>

      <div className="admin-stat-grid admin-stat-grid--wide">
        <div className="admin-stat-card">
          <div className="admin-stat-label">Kunden gesperrt</div>
          <div className="admin-stat-value admin-crisp-numeric">{loading ? "…" : customers.length}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Fahrer gesperrt</div>
          <div className="admin-stat-value admin-crisp-numeric">{loading ? "…" : drivers.length}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Kunden-Regel</div>
          <div className="admin-stat-value admin-crisp-numeric" style={{ fontSize: "1.35rem" }}>
            ≥4 / 24h
          </div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Fahrer-Regel</div>
          <div className="admin-stat-value admin-crisp-numeric" style={{ fontSize: "1.35rem" }}>
            ≥5 / 7 Tage
          </div>
        </div>
      </div>

      <AdminCollapsibleSection
        title="Suche & Aktualisieren"
        subtitle="Name, E-Mail oder Unternehmen filtern"
        defaultOpen
        flushBody
      >
        <div className="admin-filter-toolbar admin-filter-toolbar--modern admin-filter-toolbar--search-wide">
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
          <button
            type="button"
            className="admin-btn-primary admin-filter-toolbar--modern__refresh"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "Lade …" : "Aktualisieren"}
          </button>
        </div>
      </AdminCollapsibleSection>

      {error ? (
        <div className="admin-info-banner admin-info-banner--err" role="alert">
          {error}
        </div>
      ) : null}

      <AdminCollapsibleSection
        title={`Kunden (${customers.length})`}
        subtitle="Aktive Buchungssperren in der Kunden-App"
        icon="👤"
        defaultOpen
        flushBody
      >
        <SuspensionTableState
          loading={loading}
          empty={!loading && customers.length === 0}
          emptyLabel="Keine aktiven Kunden-Storno-Sperren."
        />
        {customers.length > 0 ? (
          <div className="admin-rides-table-wrap">
            <table className="admin-rides-table">
              <thead>
                <tr>
                  <th>Kunde</th>
                  <th>Anmeldung</th>
                  <th>Stornos</th>
                  <th>Grund</th>
                  <th>Gesperrt seit</th>
                  <th>Gesperrt bis</th>
                  <th className="admin-rides-table__col-actions">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((row) => {
                  const busy = actionBusyId === `c:${row.passengerId}`;
                  return (
                    <tr key={row.passengerId}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{row.name?.trim() || "—"}</div>
                        <div className="admin-muted" style={{ fontSize: "0.9rem", marginTop: 2 }}>
                          {row.email?.trim() || row.passengerId}
                        </div>
                      </td>
                      <td>
                        <span className="admin-c-badge admin-c-badge--neutral">
                          {authProviderLabel(row.authProvider)}
                        </span>
                      </td>
                      <td>
                        <StornoCountBadge
                          count={row.cancellationCountInWindow}
                          threshold={row.cancellationThreshold}
                          windowLabel={`${row.windowHours}h`}
                        />
                      </td>
                      <td>
                        <span className="admin-c-badge admin-c-badge--err">
                          {row.reasonLabel || row.reason || "—"}
                        </span>
                      </td>
                      <td>{formatDt(row.suspendedAt)}</td>
                      <td>{formatDt(row.suspendedUntil)}</td>
                      <td className="admin-rides-table__actions">
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
        ) : null}
      </AdminCollapsibleSection>

      <AdminCollapsibleSection
        title={`Fahrer (${drivers.length})`}
        subtitle="Kein Dispatch und keine neuen Aufträge bis Sperre endet"
        icon="🚕"
        defaultOpen
        flushBody
      >
        <SuspensionTableState
          loading={loading}
          empty={!loading && drivers.length === 0}
          emptyLabel="Keine aktiven Fahrer-Storno-Sperren."
        />
        {drivers.length > 0 ? (
          <div className="admin-rides-table-wrap">
            <table className="admin-rides-table">
              <thead>
                <tr>
                  <th>Fahrer</th>
                  <th>Unternehmen</th>
                  <th>Stornos</th>
                  <th>Grund</th>
                  <th>Gesperrt seit</th>
                  <th>Gesperrt bis</th>
                  <th className="admin-rides-table__col-actions">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((row) => {
                  const busy = actionBusyId === `d:${row.fleetDriverId}`;
                  const fullName = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
                  return (
                    <tr key={row.fleetDriverId}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{fullName || "—"}</div>
                        <div className="admin-muted" style={{ fontSize: "0.9rem", marginTop: 2 }}>
                          {row.email?.trim() || row.fleetDriverId}
                        </div>
                      </td>
                      <td>{row.companyName || row.companyId || "—"}</td>
                      <td>
                        <StornoCountBadge
                          count={row.cancellationCountInWindow}
                          threshold={row.cancellationThreshold}
                          windowLabel={`${row.windowDays} Tage`}
                        />
                      </td>
                      <td>
                        <span className="admin-c-badge admin-c-badge--err">
                          {row.reasonLabel || row.reason || "—"}
                        </span>
                      </td>
                      <td>{formatDt(row.suspendedAt)}</td>
                      <td>{formatDt(row.suspendedUntil)}</td>
                      <td className="admin-rides-table__actions">
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
        ) : null}
      </AdminCollapsibleSection>
    </div>
  );
}
