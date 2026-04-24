import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const STATS_URL = `${API_BASE}/admin/stats`;
const OVERVIEW_URL = `${API_BASE}/admin/dashboard/overview`;
const OPERATOR_SNAPSHOT_URL = `${API_BASE}/admin/dashboard/operator-snapshot`;

function ampelClass(s) {
  if (s === "ok") return "admin-dashboard__tile-btn--ampel-ok";
  if (s === "warn") return "admin-dashboard__tile-btn--ampel-warn";
  return "admin-dashboard__tile-btn--ampel-alert";
}

function severityToAmpel(n) {
  const c = Number(n) || 0;
  if (c <= 0) return "ok";
  if (c <= 5) return "warn";
  return "alert";
}

function formatTaskTime(iso) {
  try {
    return new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

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

export default function DashboardPage({ onOpenRide, onOpenCompany, onNavigate, userRole }) {
  const hotelLimited = userRole === "hotel";
  const [stats, setStats] = useState(emptyStats);
  const [revenuePreset, setRevenuePreset] = useState("30d");
  const [loading, setLoading] = useState(!hotelLimited);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(hotelLimited);
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

  const [operatorSnapshot, setOperatorSnapshot] = useState(null);
  const [operatorLoading, setOperatorLoading] = useState(true);
  const [operatorError, setOperatorError] = useState("");

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
      if (res.status === 403) {
        setStats(emptyStats());
        setHasLoadedOnce(true);
        setError("");
        return;
      }
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
      if (res.status === 403) {
        setAgenda([]);
        setPartnerDay([]);
        setRecentCompleted([]);
        setOverviewError("");
        return;
      }
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

  const loadOperatorSnapshot = useCallback(async () => {
    if (hotelLimited) {
      setOperatorSnapshot(null);
      setOperatorError("");
      setOperatorLoading(false);
      return;
    }
    setOperatorLoading(true);
    setOperatorError("");
    try {
      const res = await fetch(OPERATOR_SNAPSHOT_URL, { headers: adminApiHeaders() });
      if (res.status === 403) {
        setOperatorSnapshot(null);
        setOperatorError("");
        return;
      }
      if (!res.ok) {
        setOperatorSnapshot(null);
        setOperatorError("Aufgaben-Überblick konnte nicht geladen werden.");
        return;
      }
      const data = await res.json();
      if (!data?.ok || !data?.snapshot) {
        setOperatorSnapshot(null);
        setOperatorError("Aufgaben-Überblick: ungültige Antwort.");
        return;
      }
      setOperatorSnapshot(data.snapshot);
    } catch {
      setOperatorSnapshot(null);
      setOperatorError("Aufgaben-Überblick: Netzwerkfehler.");
    } finally {
      setOperatorLoading(false);
    }
  }, [hotelLimited]);

  useEffect(() => {
    if (hotelLimited) {
      setStats(emptyStats());
      setHasLoadedOnce(true);
      setLoading(false);
      setError("");
      return;
    }
    void loadStats();
  }, [loadStats, hotelLimited]);

  useEffect(() => {
    if (hotelLimited) {
      setAgenda([]);
      setPartnerDay([]);
      setRecentCompleted([]);
      setOverviewLoading(false);
      setOverviewError("");
      return;
    }
    void loadOverview();
  }, [loadOverview, hotelLimited]);

  useEffect(() => {
    void loadOperatorSnapshot();
  }, [loadOperatorSnapshot]);

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
    <div
      className={`admin-dashboard${
        loading || overviewLoading || operatorLoading ? " admin-dashboard--refreshing" : ""
      }`}
    >
      {hotelLimited ? (
        <div className="admin-info-banner" style={{ marginBottom: 14 }}>
          Hotel-Zugang: globale Plattform-KPIs sind deaktiviert. Nutzen Sie <strong>Fahrten</strong> für Ihre Buchungen.
        </div>
      ) : null}
      <div className="admin-dashboard__top">
        <div className="admin-dashboard__hero">
          <div>
            <div className="admin-dashboard__hero-label">Kontrollzentrum</div>
            <h2 className="admin-dashboard__hero-title">Plattform-Cockpit</h2>
            <p className="admin-dashboard__hero-text">
              Offene Warteschlangen, Support und Compliance auf einen Blick — darunter Tagesagenda, Mandanten-Top und
              Kennzahlen.
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
                void loadOperatorSnapshot();
              }}
              disabled={loading || overviewLoading || operatorLoading}
            >
              {loading || overviewLoading || operatorLoading ? "Aktualisiere …" : "Aktualisieren"}
            </button>
          </div>
        </div>
      </div>

      {operatorError ? <div className="admin-error-banner">{operatorError}</div> : null}

      {!hotelLimited && operatorSnapshot ? (
        <section className="admin-dashboard__operator" aria-labelledby="dash-op-title" style={{ marginTop: 4 }}>
          <h3 id="dash-op-title" className="admin-dashboard__section-title" style={{ marginBottom: 12 }}>
            Heute prüfen
          </h3>
          <div className="admin-dashboard__grid">
            <button
              type="button"
              className={`admin-dashboard__card admin-dashboard__tile-btn ${ampelClass(
                severityToAmpel(operatorSnapshot.registration?.pendingCount ?? 0),
              )}`}
              onClick={() => onNavigate?.("company-registration-requests")}
            >
              <div className="admin-dashboard__card-label">Registrierungsanfragen</div>
              <div className="admin-dashboard__card-value">
                {operatorSnapshot.registration?.pendingCount ?? 0}
              </div>
              <div className="admin-dashboard__card-sub">Neue Homepage-Partnerbewerbungen · Warteschlange</div>
            </button>
            <button
              type="button"
              className={`admin-dashboard__card admin-dashboard__tile-btn ${ampelClass(
                severityToAmpel(
                  (operatorSnapshot.support?.openCount ?? 0) + (operatorSnapshot.support?.inProgressCount ?? 0),
                ),
              )}`}
              onClick={() => onNavigate?.("support-inbox")}
            >
              <div className="admin-dashboard__card-label">Partner-Anfragen (Support)</div>
              <div className="admin-dashboard__card-value">{operatorSnapshot.support?.openCount ?? 0}</div>
              <div className="admin-dashboard__tile-metric">
                In Bearbeitung: {operatorSnapshot.support?.inProgressCount ?? 0} · Beantwortet:{" "}
                {operatorSnapshot.support?.answeredCount ?? 0}
              </div>
            </button>
            <button
              type="button"
              className={`admin-dashboard__card admin-dashboard__tile-btn ${ampelClass(
                severityToAmpel(operatorSnapshot.fleet?.pendingApprovalCount ?? 0),
              )}`}
              onClick={() => onNavigate?.("fleet-vehicles-review")}
            >
              <div className="admin-dashboard__card-label">Fahrzeuge prüfen</div>
              <div className="admin-dashboard__card-value">
                {operatorSnapshot.fleet?.pendingApprovalCount ?? 0}
              </div>
              <div className="admin-dashboard__card-sub">Freigabe offen (pending)</div>
            </button>
            <button
              type="button"
              className={`admin-dashboard__card admin-dashboard__tile-btn ${ampelClass(
                severityToAmpel(
                  (operatorSnapshot.companies?.blockedCount ?? 0) +
                    (operatorSnapshot.companies?.incompleteComplianceCount ?? 0),
                ),
              )}`}
              onClick={() => onNavigate?.("companies")}
            >
              <div className="admin-dashboard__card-label">Firmen &amp; Compliance</div>
              <div className="admin-dashboard__card-value" style={{ fontSize: "1.4rem" }}>
                {operatorSnapshot.companies?.blockedCount ?? 0} / {operatorSnapshot.companies?.incompleteComplianceCount ?? 0}
              </div>
              <div className="admin-dashboard__card-sub">Gesperrt · offene oder unvollständige Compliance</div>
            </button>
          </div>
        </section>
      ) : null}
      {!hotelLimited && operatorLoading && !operatorSnapshot && !operatorError ? (
        <div className="admin-info-banner">Aufgaben-Überblick wird geladen …</div>
      ) : null}
      {Array.isArray(operatorSnapshot?.recentTasks) && operatorSnapshot.recentTasks.length > 0 ? (
        <section className="admin-dashboard__recent" aria-labelledby="dash-tasks-title" style={{ marginTop: 8 }}>
          <div className="admin-dashboard__section-head">
            <h3 id="dash-tasks-title" className="admin-dashboard__section-title">
              Neueste Aufgaben
            </h3>
            <p className="admin-dashboard__section-sub">Sortiert nach letzter Aktivität (eingehend)</p>
          </div>
          <div className="admin-dashboard__todo-list">
            {operatorSnapshot.recentTasks.map((t) => (
              <button
                type="button"
                key={`${t.kind}-${t.refId}`}
                className="admin-dashboard__todo-item"
                onClick={() => onNavigate?.(t.pageKey)}
                style={{ cursor: "pointer", textAlign: "left", width: "100%", font: "inherit" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, color: "var(--onroda-text-dark)" }}>{t.title}</span>
                  <span className="admin-table-sub" style={{ fontSize: 12 }}>
                    {formatTaskTime(t.at)}
                  </span>
                </div>
                <div style={{ marginTop: 4 }}>
                  <span
                    className="admin-dashboard__badge"
                    style={t.severity === "high" ? { borderColor: "#dc2626", color: "#b91c1c" } : undefined}
                  >
                    {t.kind === "registration"
                      ? "Registrierung"
                      : t.kind === "support"
                        ? "Support"
                        : "Fahrzeug"}
                  </span>{" "}
                  <span className="admin-table-sub">{t.subtitle}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

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
          <span className="admin-dashboard__metric-chip-value admin-crisp-numeric">{r.total}</span>
        </div>
        <div className="admin-dashboard__metric-chip">
          <span className="admin-dashboard__metric-chip-label">Offen</span>
          <span className="admin-dashboard__metric-chip-value admin-crisp-numeric">{r.pending}</span>
        </div>
        <div className="admin-dashboard__metric-chip">
          <span className="admin-dashboard__metric-chip-label">Aktiv</span>
          <span className="admin-dashboard__metric-chip-value admin-crisp-numeric">{r.active}</span>
        </div>
        <div className="admin-dashboard__metric-chip">
          <span className="admin-dashboard__metric-chip-label">Abgeschlossen</span>
          <span className="admin-dashboard__metric-chip-value admin-crisp-numeric">{r.completed}</span>
        </div>
        <div className="admin-dashboard__metric-chip">
          <span className="admin-dashboard__metric-chip-label">Unternehmen</span>
          <span className="admin-dashboard__metric-chip-value admin-crisp-numeric">
            {stats.companies.active}/{stats.companies.total}
          </span>
        </div>
        <div className="admin-dashboard__metric-chip">
          <span className="admin-dashboard__metric-chip-label">Fahrer (mind. eine Fahrt)</span>
          <span className="admin-dashboard__metric-chip-value admin-crisp-numeric">{stats.drivers.distinctWithRide}</span>
        </div>
        <div className="admin-dashboard__metric-chip admin-dashboard__metric-chip--accent">
          <span className="admin-dashboard__metric-chip-label">Umsatz ({formatPeriodLabel(stats, revenuePreset)})</span>
          <span className="admin-dashboard__metric-chip-value admin-crisp-numeric">{formatMoneyEUR(stats.revenue.completedSum)}</span>
          <span className="admin-dashboard__metric-chip-hint">{stats.revenue.completedRideCount} Fahrten</span>
        </div>
      </div>
    </div>
  );
}
