import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const STATS_URL = `${API_BASE}/admin/stats`;
const OVERVIEW_URL = `${API_BASE}/admin/dashboard/overview`;

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

function rideAgendaInstant(ride) {
  const t = ride.scheduledAt || ride.createdAt;
  try {
    return new Date(t);
  } catch {
    return new Date();
  }
}

function formatAgendaTime(ride) {
  const d = rideAgendaInstant(ride);
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function rideStatusDe(status) {
  const s = String(status || "");
  const m = {
    pending: "Offen",
    accepted: "Angenommen",
    arrived: "Vor Ort",
    in_progress: "Unterwegs",
    completed: "Abgeschlossen",
    cancelled: "Storniert",
    rejected: "Abgelehnt",
  };
  return m[s] || (s || "—");
}

function routeLine(ride) {
  const a = ride.from || ride.fromFull || "—";
  const b = ride.to || ride.toFull || "—";
  return `${a} → ${b}`;
}

function trendLabel(trend) {
  if (trend === "up") return "↑";
  if (trend === "down") return "↓";
  return "→";
}

function trendTitle(trend) {
  if (trend === "up") return "Mehr Fahrten als am Vortag";
  if (trend === "down") return "Weniger Fahrten als am Vortag";
  return "Gleich viele Fahrten wie am Vortag";
}

function amountForRide(ride) {
  const v = ride.finalFare != null ? ride.finalFare : ride.estimatedFare;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function DashboardPage({ onOpenRide, onOpenCompany }) {
  const [stats, setStats] = useState(emptyStats);
  const [revenuePreset, setRevenuePreset] = useState("30d");
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState("");

  const [overviewDay, setOverviewDay] = useState(() => {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const da = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
  });
  const [agenda, setAgenda] = useState([]);
  const [partnerDay, setPartnerDay] = useState([]);
  const [recentCompleted, setRecentCompleted] = useState([]);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState("");

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

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError("");
    try {
      const p = new URLSearchParams();
      const dayRaw = overviewDay.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(dayRaw)) p.set("date", dayRaw);
      const url = p.toString() ? `${OVERVIEW_URL}?${p.toString()}` : OVERVIEW_URL;
      const res = await fetch(url, { headers: adminApiHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.ok) throw new Error("Ungültige Antwort");
      setAgenda(Array.isArray(data.agenda) ? data.agenda : []);
      setPartnerDay(Array.isArray(data.partnerDay) ? data.partnerDay : []);
      setRecentCompleted(Array.isArray(data.recentCompleted) ? data.recentCompleted : []);
    } catch {
      setOverviewError("Die Tagesübersicht konnte nicht geladen werden.");
      setAgenda([]);
      setPartnerDay([]);
      setRecentCompleted([]);
    } finally {
      setOverviewLoading(false);
    }
  }, [overviewDay]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

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
    <div className={`admin-dashboard${loading || overviewLoading ? " admin-dashboard--refreshing" : ""}`}>
      <div className="admin-dashboard__top">
        <div className="admin-dashboard__hero">
          <div>
            <div className="admin-dashboard__hero-label">Kontrollzentrum</div>
            <h2 className="admin-dashboard__hero-title">Operative Tageslage</h2>
            <p className="admin-dashboard__hero-text">
              Chronologische Fahrten, Mandanten-Aktivität und letzte Abschlüsse — ergänzt durch Kennzahlen und Umsatz
              für den gewählten Zeitraum.
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
            <label className="admin-dashboard__revenue-label">
              <span>Tagesagenda (UTC-Datum)</span>
              <input
                className="admin-dashboard__date-input"
                type="date"
                value={overviewDay}
                onChange={(e) => setOverviewDay(e.target.value)}
                aria-label="Kalendertag für Agenda und Partner-Top"
              />
            </label>
            <button
              type="button"
              className="admin-btn-refresh"
              onClick={() => {
                void loadStats();
                void loadOverview();
              }}
              disabled={loading || overviewLoading}
            >
              {loading || overviewLoading ? "Aktualisiere …" : "Aktualisieren"}
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="admin-error-banner">{error}</div> : null}
      {overviewError ? <div className="admin-error-banner">{overviewError}</div> : null}

      <div className="admin-dashboard__ops">
        <section className="admin-dashboard__agenda" aria-labelledby="dash-agenda-title">
          <div className="admin-dashboard__section-head">
            <h3 id="dash-agenda-title" className="admin-dashboard__section-title">
              Heutige Fahrten
            </h3>
            <p className="admin-dashboard__section-sub">Sortiert nach Fahrtzeit (geplant oder angelegt)</p>
          </div>
          <div className="admin-dashboard__table-wrap">
            <div className="admin-dashboard__table admin-dashboard__table--agenda">
              <div className="admin-dashboard__thead">
                <div>Zeit</div>
                <div>Partner</div>
                <div>Strecke</div>
                <div>Status</div>
              </div>
              {agenda.length === 0 ? (
                <div className="admin-dashboard__empty">Keine Fahrten für diesen Tag.</div>
              ) : (
                agenda.map((ride) => (
                  <button
                    key={ride.id}
                    type="button"
                    className="admin-dashboard__tbody-row"
                    onClick={() => onOpenRide?.(ride.id)}
                  >
                    <div className="admin-dashboard__cell-time">{formatAgendaTime(ride)}</div>
                    <div className="admin-dashboard__cell-strong admin-ellipsis" title={ride.companyName || ""}>
                      {ride.companyName || "—"}
                    </div>
                    <div className="admin-dashboard__cell-route admin-ellipsis" title={routeLine(ride)}>
                      {routeLine(ride)}
                    </div>
                    <div className="admin-dashboard__cell-muted">{rideStatusDe(ride.status)}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </section>

        <aside className="admin-dashboard__aside" aria-labelledby="dash-partner-title">
          <div className="admin-dashboard__section-head">
            <h3 id="dash-partner-title" className="admin-dashboard__section-title">
              Partner heute
            </h3>
            <p className="admin-dashboard__section-sub">Nach Fahrtenanzahl · Umsatz abgeschlossen · Trend</p>
          </div>
          <div className="admin-dashboard__table-wrap">
            <div className="admin-dashboard__table admin-dashboard__table--compact">
              <div className="admin-dashboard__thead">
                <div>Unternehmen</div>
                <div className="admin-dashboard__num">Fahrten</div>
                <div className="admin-dashboard__num">Umsatz</div>
                <div className="admin-dashboard__trend" title="Vergleich zum Vortag (Fahrten)">
                  Tr.
                </div>
              </div>
              {partnerDay.length === 0 ? (
                <div className="admin-dashboard__empty">Keine Mandanten-Fahrten an diesem Tag.</div>
              ) : (
                partnerDay.map((row) => (
                  <button
                    key={row.companyId}
                    type="button"
                    className="admin-dashboard__tbody-row"
                    onClick={() => onOpenCompany?.(row.companyId)}
                    title="Unternehmen bearbeiten"
                  >
                    <div className="admin-dashboard__cell-strong admin-ellipsis">{row.companyName}</div>
                    <div className="admin-dashboard__num">{row.ridesToday}</div>
                    <div className="admin-dashboard__num">{formatMoneyEUR(row.revenueToday)}</div>
                    <div className="admin-dashboard__trend" title={trendTitle(row.trend)}>
                      <span aria-hidden>{trendLabel(row.trend)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>

      <section className="admin-dashboard__recent" aria-labelledby="dash-recent-title">
        <div className="admin-dashboard__section-head">
          <h3 id="dash-recent-title" className="admin-dashboard__section-title">
            Letzte abgeschlossene Fahrten
          </h3>
          <p className="admin-dashboard__section-sub">Chronologisch die jüngsten Abschlüsse (plattformweit)</p>
        </div>
        <div className="admin-dashboard__table-wrap">
          <div className="admin-dashboard__table admin-dashboard__table--recent">
            <div className="admin-dashboard__thead">
              <div>Name / Mandant</div>
              <div className="admin-dashboard__num">Betrag</div>
              <div>Zeit</div>
              <div>Status</div>
            </div>
            {recentCompleted.length === 0 ? (
              <div className="admin-dashboard__empty">Keine Daten.</div>
            ) : (
              recentCompleted.map((ride) => {
                const amt = amountForRide(ride);
                return (
                  <button
                    key={ride.id}
                    type="button"
                    className="admin-dashboard__tbody-row"
                    onClick={() => onOpenRide?.(ride.id)}
                  >
                    <div>
                      <div className="admin-dashboard__cell-strong admin-ellipsis" title={ride.customerName || ""}>
                        {ride.customerName || "—"}
                      </div>
                      <div className="admin-dashboard__cell-sub admin-ellipsis" title={ride.companyName || ""}>
                        {ride.companyName || "—"}
                      </div>
                    </div>
                    <div className="admin-dashboard__num">{amt != null ? formatMoneyEUR(amt) : "—"}</div>
                    <div className="admin-dashboard__cell-muted">
                      {ride.createdAt
                        ? new Date(ride.createdAt).toLocaleString("de-DE", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </div>
                    <div className="admin-dashboard__cell-muted">{rideStatusDe(ride.status)}</div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </section>

      <div className="admin-dashboard__metrics-strip">
        <div className="admin-dashboard__metric-chip">
          <span className="admin-dashboard__metric-chip-label">Fahrten gesamt</span>
          <span className="admin-dashboard__metric-chip-value">{r.total}</span>
        </div>
        <div className="admin-dashboard__metric-chip">
          <span className="admin-dashboard__metric-chip-label">Offen</span>
          <span className="admin-dashboard__metric-chip-value">{r.pending}</span>
        </div>
        <div className="admin-dashboard__metric-chip">
          <span className="admin-dashboard__metric-chip-label">Aktiv</span>
          <span className="admin-dashboard__metric-chip-value">{r.active}</span>
        </div>
        <div className="admin-dashboard__metric-chip">
          <span className="admin-dashboard__metric-chip-label">Abgeschlossen</span>
          <span className="admin-dashboard__metric-chip-value">{r.completed}</span>
        </div>
        <div className="admin-dashboard__metric-chip">
          <span className="admin-dashboard__metric-chip-label">Unternehmen</span>
          <span className="admin-dashboard__metric-chip-value">
            {stats.companies.active}/{stats.companies.total}
          </span>
        </div>
        <div className="admin-dashboard__metric-chip">
          <span className="admin-dashboard__metric-chip-label">Fahrer (mind. eine Fahrt)</span>
          <span className="admin-dashboard__metric-chip-value">{stats.drivers.distinctWithRide}</span>
        </div>
        <div className="admin-dashboard__metric-chip admin-dashboard__metric-chip--accent">
          <span className="admin-dashboard__metric-chip-label">Umsatz ({formatPeriodLabel(stats, revenuePreset)})</span>
          <span className="admin-dashboard__metric-chip-value">{formatMoneyEUR(stats.revenue.completedSum)}</span>
          <span className="admin-dashboard__metric-chip-hint">{stats.revenue.completedRideCount} Fahrten</span>
        </div>
      </div>
    </div>
  );
}
