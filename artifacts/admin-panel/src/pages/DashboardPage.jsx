import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const STATS_URL = `${API_BASE}/admin/stats`;

function emptyStats() {
  return {
    rides: {
      total: 0,
      pending: 0,
      active: 0,
      completed: 0,
      cancelled: 0,
      rejected: 0,
    },
    companies: { total: 0, active: 0 },
    drivers: { distinctWithRide: 0 },
    panelUsers: { active: 0 },
    revenue: {
      currency: "EUR",
      periodFrom: null,
      periodTo: null,
      completedSum: 0,
      completedRideCount: 0,
    },
  };
}

/** Lokaler Kalendertag / Fenster — Bounds als ISO für `revenueFrom` / `revenueTo` (inklusiv, API: lte auf `created_at`). */
function revenueRangeForPreset(preset) {
  if (preset === "all") return null;
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  if (preset === "today") {
    return { start, end };
  }
  if (preset === "7d") {
    start.setDate(start.getDate() - 6);
    return { start, end };
  }
  if (preset === "30d") {
    start.setDate(start.getDate() - 29);
    return { start, end };
  }
  return null;
}

function formatMoneyEUR(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatPeriodLabel(stats, preset) {
  if (preset === "all") return "Gesamt (alle abgeschlossenen Fahrten)";
  if (stats?.revenue?.periodFrom && stats?.revenue?.periodTo) {
    try {
      const a = new Date(stats.revenue.periodFrom);
      const b = new Date(stats.revenue.periodTo);
      const o = { day: "2-digit", month: "2-digit", year: "numeric" };
      return `${a.toLocaleDateString("de-DE", o)} – ${b.toLocaleDateString("de-DE", o)}`;
    } catch {
      return "Zeitraum";
    }
  }
  return "Zeitraum";
}

export default function DashboardPage() {
  const [stats, setStats] = useState(emptyStats);
  const [revenuePreset, setRevenuePreset] = useState("30d");
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState("");

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const range = revenueRangeForPreset(revenuePreset);
      let url = STATS_URL;
      if (range) {
        const p = new URLSearchParams();
        p.set("revenueFrom", range.start.toISOString());
        p.set("revenueTo", range.end.toISOString());
        url = `${STATS_URL}?${p.toString()}`;
      }

      const res = await fetch(url, { headers: adminApiHeaders() });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      if (!data?.ok || !data?.stats) {
        throw new Error("Ungültige Antwort");
      }

      const s = data.stats;
      setStats({
        rides: {
          total: s.rides?.total ?? 0,
          pending: s.rides?.pending ?? 0,
          active: s.rides?.active ?? 0,
          completed: s.rides?.completed ?? 0,
          cancelled: s.rides?.cancelled ?? 0,
          rejected: s.rides?.rejected ?? 0,
        },
        companies: {
          total: s.companies?.total ?? 0,
          active: s.companies?.active ?? 0,
        },
        drivers: {
          distinctWithRide: s.drivers?.distinctWithRide ?? 0,
        },
        panelUsers: {
          active: s.panelUsers?.active ?? 0,
        },
        revenue: {
          currency: s.revenue?.currency ?? "EUR",
          periodFrom: s.revenue?.periodFrom ?? null,
          periodTo: s.revenue?.periodTo ?? null,
          completedSum: s.revenue?.completedSum ?? 0,
          completedRideCount: s.revenue?.completedRideCount ?? 0,
        },
      });
      setHasLoadedOnce(true);
    } catch (err) {
      console.error("Dashboard stats error:", err);
      setError("Statistiken konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [revenuePreset]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  if (!hasLoadedOnce && loading) {
    return <div className="admin-info-banner">Lade Dashboard …</div>;
  }

  if (!hasLoadedOnce && error) {
    return (
      <div>
        <div className="admin-error-banner">{error}</div>
        <button type="button" className="admin-btn-refresh admin-dashboard__retry" onClick={() => void loadStats()}>
          Erneut versuchen
        </button>
      </div>
    );
  }

  const r = stats.rides;

  return (
    <div className={`admin-dashboard${loading ? " admin-dashboard--refreshing" : ""}`}>
      <div className="admin-dashboard__top">
        <div className="admin-dashboard__hero">
          <div>
            <div className="admin-dashboard__hero-label">Systemstatus</div>
            <h2 className="admin-dashboard__hero-title">Onroda Admin-Übersicht</h2>
            <p className="admin-dashboard__hero-text">
              Zentrale Kennzahlen aus der Datenbank: Fahrten nach Status, Mandanten, Fahrer-IDs auf Fahrten, Panel-Zugänge
              und Umsatz abgeschlossener Fahrten (geschätzt oder final, je nach Datenstand).
            </p>
          </div>

          <div className="admin-dashboard__hero-actions">
            <label className="admin-dashboard__revenue-label">
              <span>Umsatz-Zeitraum</span>
              <select
                className="admin-dashboard__revenue-select"
                value={revenuePreset}
                onChange={(e) => setRevenuePreset(e.target.value)}
                aria-label="Zeitraum für Umsatzkennzahl"
              >
                <option value="today">Heute</option>
                <option value="7d">Letzte 7 Tage</option>
                <option value="30d">Letzte 30 Tage</option>
                <option value="all">Gesamt</option>
              </select>
            </label>
            <button type="button" className="admin-btn-refresh" onClick={() => void loadStats()} disabled={loading}>
              {loading ? "Laden …" : "Neu laden"}
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="admin-error-banner">{error}</div> : null}

      <div className="admin-dashboard__grid">
        <div className="admin-dashboard__card">
          <div className="admin-dashboard__card-label">Fahrten gesamt</div>
          <div className="admin-dashboard__card-value">{r.total}</div>
          <div className="admin-dashboard__card-sub">Alle Fahrten im System</div>
        </div>

        <div className="admin-dashboard__card">
          <div className="admin-dashboard__card-label">Offen</div>
          <div className="admin-dashboard__card-value">{r.pending}</div>
          <div className="admin-dashboard__card-sub">Status: ausstehend</div>
        </div>

        <div className="admin-dashboard__card">
          <div className="admin-dashboard__card-label">Aktiv</div>
          <div className="admin-dashboard__card-value">{r.active}</div>
          <div className="admin-dashboard__card-sub">Angenommen, vor Ort, unterwegs</div>
        </div>

        <div className="admin-dashboard__card">
          <div className="admin-dashboard__card-label">Abgeschlossen</div>
          <div className="admin-dashboard__card-value">{r.completed}</div>
          <div className="admin-dashboard__card-sub">Status: abgeschlossen</div>
        </div>

        <div className="admin-dashboard__card">
          <div className="admin-dashboard__card-label">Storniert</div>
          <div className="admin-dashboard__card-value">{r.cancelled}</div>
          <div className="admin-dashboard__card-sub">Status: storniert</div>
        </div>

        <div className="admin-dashboard__card">
          <div className="admin-dashboard__card-label">Abgelehnt</div>
          <div className="admin-dashboard__card-value">{r.rejected}</div>
          <div className="admin-dashboard__card-sub">Status: abgelehnt</div>
        </div>

        <div className="admin-dashboard__card">
          <div className="admin-dashboard__card-label">Firmen gesamt</div>
          <div className="admin-dashboard__card-value">{stats.companies.total}</div>
          <div className="admin-dashboard__card-sub">Einträge in admin_companies</div>
        </div>

        <div className="admin-dashboard__card">
          <div className="admin-dashboard__card-label">Firmen aktiv</div>
          <div className="admin-dashboard__card-value">{stats.companies.active}</div>
          <div className="admin-dashboard__card-sub">is_active = true</div>
        </div>

        <div className="admin-dashboard__card">
          <div className="admin-dashboard__card-label">Fahrer (eindeutig)</div>
          <div className="admin-dashboard__card-value">{stats.drivers.distinctWithRide}</div>
          <div className="admin-dashboard__card-sub">Verschiedene driver_id auf Fahrten</div>
        </div>

        <div className="admin-dashboard__card">
          <div className="admin-dashboard__card-label">Panel-Nutzer aktiv</div>
          <div className="admin-dashboard__card-value">{stats.panelUsers.active}</div>
          <div className="admin-dashboard__card-sub">Partner-Panel-Logins (aktiv)</div>
        </div>

        <div className="admin-dashboard__card admin-dashboard__card--accent">
          <div className="admin-dashboard__card-label">Umsatz (abgeschlossen)</div>
          <div className="admin-dashboard__card-value">{formatMoneyEUR(stats.revenue.completedSum)}</div>
          <div className="admin-dashboard__card-sub">
            {formatPeriodLabel(stats, revenuePreset)} · {stats.revenue.completedRideCount} Fahrten · final sonst
            geschätzt
          </div>
        </div>
      </div>

      <div className="admin-dashboard__bottom">
        <div className="admin-dashboard__panel">
          <div className="admin-dashboard__panel-header">
            <h3 className="admin-dashboard__panel-title">Fahrten nach Status</h3>
            <span className="admin-dashboard__badge">Live</span>
          </div>

          <div className="admin-dashboard__metric-list">
            <div className="admin-dashboard__metric-row">
              <span className="admin-dashboard__metric-label">Gesamt</span>
              <strong className="admin-dashboard__metric-value">{r.total}</strong>
            </div>
            <div className="admin-dashboard__metric-row">
              <span className="admin-dashboard__metric-label">Offen (pending)</span>
              <strong className="admin-dashboard__metric-value">{r.pending}</strong>
            </div>
            <div className="admin-dashboard__metric-row">
              <span className="admin-dashboard__metric-label">Aktiv</span>
              <strong className="admin-dashboard__metric-value">{r.active}</strong>
            </div>
            <div className="admin-dashboard__metric-row">
              <span className="admin-dashboard__metric-label">Abgeschlossen</span>
              <strong className="admin-dashboard__metric-value">{r.completed}</strong>
            </div>
            <div className="admin-dashboard__metric-row">
              <span className="admin-dashboard__metric-label">Storniert</span>
              <strong className="admin-dashboard__metric-value">{r.cancelled}</strong>
            </div>
            <div className="admin-dashboard__metric-row">
              <span className="admin-dashboard__metric-label">Abgelehnt</span>
              <strong className="admin-dashboard__metric-value">{r.rejected}</strong>
            </div>
          </div>
        </div>

        <div className="admin-dashboard__panel">
          <div className="admin-dashboard__panel-header">
            <h3 className="admin-dashboard__panel-title">Mandanten & Umsatz</h3>
            <span className="admin-dashboard__badge admin-dashboard__badge--muted">API</span>
          </div>

          <div className="admin-dashboard__metric-list">
            <div className="admin-dashboard__metric-row">
              <span className="admin-dashboard__metric-label">Firmen gesamt / aktiv</span>
              <strong className="admin-dashboard__metric-value">
                {stats.companies.total} / {stats.companies.active}
              </strong>
            </div>
            <div className="admin-dashboard__metric-row">
              <span className="admin-dashboard__metric-label">Fahrer-IDs (distinct)</span>
              <strong className="admin-dashboard__metric-value">{stats.drivers.distinctWithRide}</strong>
            </div>
            <div className="admin-dashboard__metric-row">
              <span className="admin-dashboard__metric-label">Panel-Nutzer aktiv</span>
              <strong className="admin-dashboard__metric-value">{stats.panelUsers.active}</strong>
            </div>
            <div className="admin-dashboard__metric-row">
              <span className="admin-dashboard__metric-label">Umsatz gewählter Zeitraum</span>
              <strong className="admin-dashboard__metric-value">
                {formatMoneyEUR(stats.revenue.completedSum)}
              </strong>
            </div>
            <div className="admin-dashboard__metric-row">
              <span className="admin-dashboard__metric-label">Abgeschlossene Fahrten im Zeitraum</span>
              <strong className="admin-dashboard__metric-value">{stats.revenue.completedRideCount}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
