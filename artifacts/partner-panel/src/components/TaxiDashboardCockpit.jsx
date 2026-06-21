import { useMemo, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { hasPanelModule } from "../lib/panelNavigation.js";
import { SettlementKpiPeriodPanel } from "./SettlementKpiBlock.jsx";
import DashboardQuickActions from "../dashboard/DashboardQuickActions.jsx";
import DashboardTodaySection from "../dashboard/DashboardTodaySection.jsx";
import { medicalOpenOperationsCount } from "../dashboard/dashboardHelpers.js";
import {
  fareCellLabeled,
  formatEur,
  formatPctRate,
  formatShortDt,
  statusDe,
} from "../dashboard/settlementDashboardHelpers.js";

function hasPerm(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

const TERMINAL_STATUSES = new Set([
  "completed",
  "cancelled",
  "cancelled_by_customer",
  "cancelled_by_driver",
  "cancelled_by_system",
  "expired",
  "rejected",
]);

function isOpenRide(status) {
  return !TERMINAL_STATUSES.has(status);
}

function startOfLocalDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isLocalCalendarDay(iso, refDayStart) {
  if (!iso) return false;
  const t = new Date(iso);
  const end = new Date(refDayStart.getTime() + 86400000);
  return t >= refDayStart && t < end;
}

function KpiCard({ hero, value, label, hint, onClick, active }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      className={`panel-kpi-card${hero ? " panel-kpi-card--hero" : ""}${onClick ? " panel-kpi-card--clickable" : ""}${active ? " panel-kpi-card--active" : ""}`}
      onClick={onClick}
    >
      <div className="panel-kpi-card__value">{value}</div>
      <div className="panel-kpi-card__label">{label}</div>
      {hint ? <div className="panel-kpi-card__hint">{hint}</div> : null}
    </Tag>
  );
}

function AmountTd({ ride }) {
  const cell = fareCellLabeled(ride);
  return (
    <td>
      {cell.value}
      {cell.label ? <span className="panel-dash-table__amount-kind"> · {cell.label}</span> : null}
    </td>
  );
}

/**
 * Einheitliches Taxi-Cockpit für Fleet-Shell und Legacy-PanelShell.
 * @param {{
 *   user: object;
 *   company?: object | null;
 *   metrics: object | null;
 *   metricsError?: string | null;
 *   fleetDash?: object | null;
 *   fleetDashError?: string | null;
 *   rides?: Record<string, unknown>[];
 *   ridesError?: string | null;
 *   ridesLoaded?: boolean;
 *   drivers?: Record<string, unknown>[];
 *   vehicles?: Record<string, unknown>[];
 *   loadComplete?: boolean;
 *   variant?: "fleet" | "legacy";
 *   displayCompanyName?: string;
 *   onNavigateModule?: (key: string, opts?: object) => void;
 *   onQuickCreate?: (id: string) => void;
 *   onMetricsReload?: () => void;
 *   metricsYear?: number;
 *   onMetricsYearChange?: (year: number) => void;
 * }} props
 */
export default function TaxiDashboardCockpit({
  user,
  company,
  metrics,
  metricsError = null,
  fleetDash = null,
  fleetDashError = null,
  rides = [],
  ridesError = null,
  ridesLoaded = true,
  drivers = [],
  vehicles = [],
  loadComplete = true,
  variant = "fleet",
  displayCompanyName,
  onNavigateModule,
  onQuickCreate,
  onMetricsReload,
  metricsYear,
  onMetricsYearChange,
}) {
  const { token } = usePanelAuth();
  const [lastRidesOpen, setLastRidesOpen] = useState(true);

  const companyName = displayCompanyName || company?.name || user?.companyName || "Unternehmen";
  const moneyWord = metrics?.presentation === "taxi_betrieb" ? "Umsatz" : "Volumen";

  const rideSlices = useMemo(() => {
    const list = rides.slice();
    const byCreated = (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    list.sort(byCreated);
    const last = list.slice(0, 8);
    const open = list.filter((r) => isOpenRide(r.status)).slice(0, 12);
    const today0 = startOfLocalDay(new Date());
    const planned = list
      .filter((r) => r.scheduledAt && isLocalCalendarDay(r.scheduledAt, today0))
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
      .slice(0, 12);
    return { last, open, planned };
  }, [rides]);

  const medicalOpenCount = useMemo(() => medicalOpenOperationsCount(rides), [rides]);

  const showFleetBlock =
    user?.companyKind === "taxi" && hasPanelModule(user?.panelModules, "taxi_fleet") && metrics?.presentation === "taxi_betrieb";

  const todayOps = metrics?.today;
  const driversOnline = fleetDashError ? null : fleetDash?.driversOnline ?? null;
  const avgToday =
    todayOps?.avgCompletedFare != null
      ? formatEur(todayOps.avgCompletedFare)
      : metrics?.monthCompletedQuality?.avgFare != null
        ? formatEur(metrics.monthCompletedQuality.avgFare)
        : "—";

  if (!loadComplete) {
    return <p className="partner-state-loading">Daten werden geladen …</p>;
  }

  return (
    <div className={`panel-page panel-page--overview panel-dash${variant === "fleet" ? " panel-dash--fleet" : ""}`}>
      {variant === "fleet" ? (
        <div className="partner-page-hero">
          <p className="partner-page-eyebrow">Dashboard</p>
          <h1 className="partner-page-title">Betriebsübersicht</h1>
          <p className="partner-page-lead">
            Guten Tag, {companyName} — Kennzahlen, Abrechnung und der Fahrplan für heute.
          </p>
        </div>
      ) : (
        <div className="panel-dash-hero">
          <div className="panel-dash-hero__top">
            <p className="panel-dash-hero__eyebrow">Unternehmer · Onroda</p>
            <span className="panel-dash-hero__badge">Taxi / Flotte</span>
          </div>
          <h2 className="panel-dash-hero__title">
            Guten Tag{user?.username ? `, ${user.username}` : ""}
            {companyName ? <span className="panel-dash-hero__company"> · {companyName}</span> : null}
          </h2>
          <p className="panel-dash-hero__sub">Cockpit — Kennzahlen, Abrechnung und operative Übersicht.</p>
        </div>
      )}

      {metricsError ? <p className="panel-page__warn">{metricsError}</p> : null}

      {metrics ? (
        <>
          {metrics.presentation === "taxi_betrieb" ? (
            <SettlementKpiPeriodPanel
              metrics={metrics}
              token={token}
              formatMoney={formatEur}
              formatPctRate={formatPctRate}
              Card={KpiCard}
              selectedYear={metricsYear ?? metrics.selectedYear}
              onYearChange={onMetricsYearChange}
              onNavigateFinanzen={
                typeof onNavigateModule === "function"
                  ? (opts) => onNavigateModule("finanzen", opts)
                  : undefined
              }
            />
          ) : (
            <div className="panel-kpi-grid panel-kpi-grid--tier1">
              <KpiCard hero value={formatEur(metrics.today.revenue)} label={`${moneyWord} heute`} />
              <KpiCard hero value={String(metrics.today.completedRides)} label="Abgeschlossen heute" />
              <KpiCard hero value={formatEur(metrics.week.revenue)} label={`${moneyWord} 7 Tage`} />
              <KpiCard hero value={formatEur(metrics.month.revenue)} label={`${moneyWord} Monat`} />
            </div>
          )}

          {showFleetBlock ? (
            <section className="panel-dash-ops-block" aria-label="Heute im Betrieb">
              <p className="panel-kpi-tier-label">Heute im Betrieb</p>
              <div className="panel-kpi-grid panel-kpi-grid--tier1 panel-kpi-grid--ops">
                <KpiCard
                  value={fleetDashError ? "—" : driversOnline == null ? "—" : String(driversOnline)}
                  label="Fahrer online"
                  hint={fleetDashError || "Heartbeat ≤ 2 Min."}
                />
                <KpiCard
                  value={String(todayOps?.completedRides ?? 0)}
                  label="Abgeschlossen heute"
                  hint="Abgeschlossene Fahrten (Kalendertag)"
                />
                <KpiCard value={avgToday} label="Ø Fahrtpreis heute" hint="Taxameter/Schätzung auf rides" />
                <KpiCard
                  value={String(metrics.openRides ?? 0)}
                  label="Offene Fahrten"
                  hint="Noch nicht abgeschlossen"
                />
              </div>
            </section>
          ) : null}

          <p className="panel-kpi-tier-label">Status &amp; Planung</p>
          <div className="panel-kpi-grid panel-kpi-grid--tier2">
            <KpiCard value={String(metrics.openRides)} label="Nicht abgeschlossen" />
            <KpiCard value={String(metrics.scheduled?.todayCount ?? 0)} label="Geplant heute" />
            <KpiCard value={String(metrics.scheduled?.tomorrowCount ?? 0)} label="Geplant morgen" />
            <KpiCard value={String(metrics.monthDecided?.cancelledRides ?? 0)} label="Stornos Monat" />
          </div>

          <p className="panel-kpi-tier-label">Qualität</p>
          <div className="panel-kpi-grid panel-kpi-grid--tier3">
            <KpiCard value={formatPctRate(metrics.monthDecided?.cancelRate)} label="Stornoquote" />
            <KpiCard
              value={
                metrics.monthCompletedQuality?.avgFare != null
                  ? formatEur(metrics.monthCompletedQuality.avgFare)
                  : "—"
              }
              label="Ø Preis Monat"
            />
            <KpiCard
              value={
                metrics.monthCompletedQuality?.avgDistanceKm != null
                  ? `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(metrics.monthCompletedQuality.avgDistanceKm)} km`
                  : "—"
              }
              label="Ø Entfernung"
            />
            <KpiCard
              value={String(metrics.monthCompletedQuality?.completedWithAccessCode ?? 0)}
              label="Code-Fahrten Monat"
            />
          </div>

          {variant === "fleet" && user?.featureKkModule === true ? (
            <p className="panel-dash-footnote">
              Offene Krankenfahrten (vereinfacht): {ridesLoaded ? medicalOpenCount : "…"}
              {typeof onNavigateModule === "function" ? (
                <>
                  {" "}
                  ·{" "}
                  <button type="button" className="partner-link-btn" onClick={() => onNavigateModule("krankenfahrten")}>
                    Zu Krankenfahrten
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
        </>
      ) : null}

      {variant === "fleet" ? (
        <>
          <DashboardTodaySection
            rides={rides}
            ridesError={ridesError}
            ridesLoaded={ridesLoaded}
            drivers={drivers}
            vehicles={vehicles}
            onNavigateModule={onNavigateModule}
          />
          {typeof onQuickCreate === "function" ? (
            <DashboardQuickActions user={user} onQuickCreate={onQuickCreate} />
          ) : null}
        </>
      ) : null}

      {hasPanelModule(user?.panelModules, "rides_list") && hasPerm(user?.permissions, "rides.read") ? (
        <>
          <section className="panel-dash-section panel-dash-section--collapsible">
            <button
              type="button"
              className="panel-dash-section__toggle"
              aria-expanded={lastRidesOpen}
              aria-controls="panel-last-rides-body"
              onClick={() => setLastRidesOpen((v) => !v)}
            >
              <div className="panel-dash-section__head">
                <h3 className="panel-dash-section__title">Letzte Fahrten</h3>
                <p className="panel-dash-section__hint">
                  Betrag = Taxameter/Schätzung (rides) — Abrechnung siehe Drill-down oben
                </p>
              </div>
              <span className="panel-dash-section__chevron" aria-hidden>
                {lastRidesOpen ? "▾" : "▸"}
              </span>
            </button>
            {lastRidesOpen ? (
              <div id="panel-last-rides-body" className="panel-dash-section__body">
                {ridesError ? <p className="panel-page__warn">{ridesError}</p> : null}
                <div className="panel-dash-table-wrap">
                  {rideSlices.last.length === 0 ? (
                    <p className="panel-dash-empty">Keine Fahrten geladen.</p>
                  ) : (
                    <table className="panel-dash-table">
                      <thead>
                        <tr>
                          <th>Zeit</th>
                          <th>Route</th>
                          <th>Status</th>
                          <th>Betrag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rideSlices.last.map((r) => (
                          <tr key={r.id}>
                            <td>{formatShortDt(r.createdAt)}</td>
                            <td>
                              <span className="panel-dash-table__muted">{r.from ?? "—"}</span> → {r.to ?? "—"}
                            </td>
                            <td>{statusDe(r.status)}</td>
                            <AmountTd ride={r} />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ) : null}
          </section>

          {variant === "legacy" ? (
            <>
              <section className="panel-dash-section">
                <div className="panel-dash-section__head">
                  <h3 className="panel-dash-section__title">Offene Fahrten</h3>
                </div>
                <div className="panel-dash-table-wrap">
                  {rideSlices.open.length === 0 ? (
                    <p className="panel-dash-empty">Keine offenen Fahrten.</p>
                  ) : (
                    <table className="panel-dash-table">
                      <thead>
                        <tr>
                          <th>Zeit</th>
                          <th>Kunde / Strecke</th>
                          <th>Status</th>
                          <th>Betrag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rideSlices.open.map((r) => (
                          <tr key={r.id}>
                            <td>{formatShortDt(r.createdAt)}</td>
                            <td>
                              {r.customerName ? <>{r.customerName} · </> : null}
                              <span className="panel-dash-table__muted">{r.from ?? "—"}</span>
                            </td>
                            <td>{statusDe(r.status)}</td>
                            <AmountTd ride={r} />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
