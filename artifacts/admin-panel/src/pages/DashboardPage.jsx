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

/** Kalendertag / Fenster — Bounds als ISO für `revenueFrom` / `revenueTo`. */
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
  if (preset === "all") return "Alle abgeschlossenen Fahrten";
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
    } catch {
      setError("Die Kennzahlen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [revenuePreset]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  if (!hasLoadedOnce && loading) {
    return <div className="admin-info-banner">Kennzahlen werden geladen …</div>;
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
            <div className="admin-dashboard__hero-label">Überblick</div>
            <h2 className="admin-dashboard__hero-title">Aktuelle Lage der Plattform</h2>
            <p className="admin-dashboard__hero-text">
              Hier sehen Sie Fahrten, angebundene Unternehmen und Umsätze über alle Mandanten hinweg — unabhängig vom
              Blickwinkel eines einzelnen Partners.
            </p>
          </div>

          <div className="admin-dashboard__hero-actions">
            <label className="admin-dashboard__revenue-label">
              <span>Umsatzzeitraum</span>
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
              {loading ? "Aktualisiere …" : "Aktualisieren"}
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="admin-error-banner">{error}</div> : null}

      <div className="admin-dashboard__grid">
        <div className="admin-dashboard__card">
          <div className="admin-dashboard__card-label">Fahrten gesamt</div>
          <div className="admin-dashboard__card-value">{r.total}</div>
          <div className="admin-dashboard__card-sub">Alle erfassten Aufträge</div>
        </div>

        <div className="admin-dashboard__card">
          <div className="admin-dashboard__card-label">Offen</div>
          <div className="admin-dashboard__card-value">{r.pending}</div>
          <div className="admin-dashboard__card-sub">Warten auf Zuweisung</div>
        </div>

        <div className="admin-dashboard__card">
          <div className="admin-dashboard__card-label">Aktiv</div>
          <div className="admin-dashboard__card-value">{r.active}</div>
          <div className="admin-dashboard__card-sub">In Bearbeitung</div>
        </div>

        <div className="admin-dashboard__card">
          <div className="admin-dashboard__card-label">Abgeschlossen</div>
          <div className="admin-dashboard__card-value">{r.completed}</div>
          <div className="admin-dashboard__card-sub">Erfolgreich beendet</div>
        </div>

        <div className="admin-dashboard__card">
          <div className="admin-dashboard__card-label">Storniert</div>
          <div className="admin-dashboard__card-value">{r.cancelled}</div>
          <div className="admin-dashboard__card-sub">Vom Kunden oder der Plattform</div>
        </div>

        <div className="admin-dashboard__card">
          <div className="admin-dashboard__card-label">Abgelehnt</div>
          <div className="admin-dashboard__card-value">{r.rejected}</div>
          <div className="admin-dashboard__card-sub">Nicht angenommen</div>
        </div>

        <div className="admin-dashboard__card">
          <div className="admin-dashboard__card-label">Unternehmen</div>
          <div className="admin-dashboard__card-value">{stats.companies.total}</div>
          <div className="admin-dashboard__card-sub">{stats.companies.active} aktiv</div>
        </div>

        <div className="admin-dashboard__card">
          <div className="admin-dashboard__card-label">Fahrer mit Fahrt</div>
          <div className="admin-dashboard__card-value">{stats.drivers.distinctWithRide}</div>
          <div className="admin-dashboard__card-sub">Eindeutige Fahrer auf Aufträgen</div>
        </div>

        <div className="admin-dashboard__card">
          <div className="admin-dashboard__card-label">Aktive Partner-Zugänge</div>
          <div className="admin-dashboard__card-value">{stats.panelUsers.active}</div>
          <div className="admin-dashboard__card-sub">Zum Partner-Portal</div>
        </div>

        <div className="admin-dashboard__card admin-dashboard__card--accent">
          <div className="admin-dashboard__card-label">Umsatz (abgeschlossen)</div>
          <div className="admin-dashboard__card-value">{formatMoneyEUR(stats.revenue.completedSum)}</div>
          <div className="admin-dashboard__card-sub">
            {formatPeriodLabel(stats, revenuePreset)} · {stats.revenue.completedRideCount} Fahrten · Schätz- und
            Abschlussbeträge wie in der Abrechnung
          </div>
        </div>
      </div>
    </div>
  );
}
