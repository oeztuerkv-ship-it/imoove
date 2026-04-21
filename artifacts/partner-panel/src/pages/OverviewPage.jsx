import { useEffect, useMemo, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { hasPanelModule } from "../lib/panelNavigation.js";

function hasPerm(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

function formatEur(n) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);
}

function formatPct(rate) {
  if (rate == null || Number.isNaN(rate)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 1 }).format(rate);
}

function formatKm(km) {
  if (km == null || Number.isNaN(km)) return "—";
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(km)} km`;
}

function companyKindLabel(kind) {
  switch (kind) {
    case "taxi":
      return "Taxi / Flotte";
    case "insurer":
      return "Krankenkasse / Versicherer";
    case "hotel":
      return "Hotel";
    case "corporate":
      return "Corporate / Firma";
    case "voucher_client":
      return "Gutschein / Voucher";
    case "general":
    default:
      return "Allgemein";
  }
}

function formatShortDt(iso) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function statusDe(s) {
  const m = {
    draft: "Entwurf",
    scheduled: "Geplant",
    requested: "Angefragt",
    searching_driver: "Suche",
    offered: "Angebot",
    pending: "Wartet",
    accepted: "Angenommen",
    driver_arriving: "Anfahrt",
    driver_waiting: "Wartet",
    passenger_onboard: "Einsteigen",
    arrived: "Vor Ort",
    in_progress: "Fahrt",
    completed: "Fertig",
    cancelled: "Storno",
    cancelled_by_customer: "Storno Kunde",
    cancelled_by_driver: "Storno Fahrer",
    cancelled_by_system: "Storno System",
    expired: "Abgelaufen",
    rejected: "Abgelehnt",
  };
  return m[s] ?? s ?? "—";
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

function fareCell(ride) {
  const v = ride.finalFare != null ? ride.finalFare : ride.estimatedFare;
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return formatEur(n);
}

function KpiCard({ hero, value, label }) {
  return (
    <div className={`panel-kpi-card${hero ? " panel-kpi-card--hero" : ""}`}>
      <div className="panel-kpi-card__value">{value}</div>
      <div className="panel-kpi-card__label">{label}</div>
    </div>
  );
}

export default function OverviewPage() {
  const { user, token } = usePanelAuth();
  const [fleetDash, setFleetDash] = useState(null);
  const [rideMetrics, setRideMetrics] = useState(null);
  const [rides, setRides] = useState([]);
  const [ridesErr, setRidesErr] = useState("");

  useEffect(() => {
    if (!token || !hasPanelModule(user?.panelModules, "taxi_fleet")) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/panel/v1/fleet/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok || !data?.ok) return;
        setFleetDash(data);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user?.panelModules]);

  useEffect(() => {
    if (!token || !hasPerm(user?.permissions, "rides.read")) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/panel/v1/overview/metrics`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok || !data?.ok) return;
        setRideMetrics(data.metrics ?? null);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user?.permissions]);

  useEffect(() => {
    if (!token || !hasPanelModule(user?.panelModules, "rides_list") || !hasPerm(user?.permissions, "rides.read")) {
      return;
    }
    let cancelled = false;
    void (async () => {
      setRidesErr("");
      try {
        const res = await fetch(`${API_BASE}/panel/v1/rides`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
          setRidesErr("Fahrten konnten nicht geladen werden.");
          setRides([]);
          return;
        }
        const list = Array.isArray(data.rides) ? data.rides : [];
        setRides(list.slice(0, 200));
      } catch {
        if (!cancelled) {
          setRidesErr("Fahrten konnten nicht geladen werden.");
          setRides([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user?.panelModules, user?.permissions]);

  const moneyWord = rideMetrics?.presentation === "taxi_betrieb" ? "Umsatz" : "Volumen";

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

  return (
    <div className="panel-page panel-page--overview panel-dash">
      <div className="panel-dash-hero">
        <div className="panel-dash-hero__top">
          <p className="panel-dash-hero__eyebrow">Unternehmer · Onroda</p>
          <span className="panel-dash-hero__badge">{companyKindLabel(user?.companyKind ?? "general")}</span>
        </div>
        <h2 className="panel-dash-hero__title">
          Guten Tag{user?.username ? `, ${user.username}` : ""}
          {user?.companyName ? (
            <>
              <span className="panel-dash-hero__company"> · {user.companyName}</span>
            </>
          ) : null}
        </h2>
        <p className="panel-dash-hero__sub">Cockpit — Kennzahlen und operative Übersicht.</p>
      </div>

      {rideMetrics ? (
        <>
          <div className="panel-kpi-grid panel-kpi-grid--tier1">
            <KpiCard
              hero
              value={formatEur(rideMetrics.today.revenue)}
              label={`${moneyWord} heute`}
            />
            <KpiCard hero value={String(rideMetrics.today.completedRides)} label="Abgeschlossen heute" />
            <KpiCard hero value={formatEur(rideMetrics.week.revenue)} label={`${moneyWord} 7 Tage`} />
            <KpiCard hero value={formatEur(rideMetrics.month.revenue)} label={`${moneyWord} Monat`} />
          </div>

          <p className="panel-kpi-tier-label">Status &amp; Planung</p>
          <div className="panel-kpi-grid panel-kpi-grid--tier2">
            <KpiCard value={String(rideMetrics.openRides)} label="Nicht abgeschlossen" />
            <KpiCard value={String(rideMetrics.scheduled?.todayCount ?? 0)} label="Geplant heute" />
            <KpiCard value={String(rideMetrics.scheduled?.tomorrowCount ?? 0)} label="Geplant morgen" />
            <KpiCard value={String(rideMetrics.monthDecided?.cancelledRides ?? 0)} label="Stornos Monat" />
          </div>

          <p className="panel-kpi-tier-label">Qualität</p>
          <div className="panel-kpi-grid panel-kpi-grid--tier3">
            <KpiCard value={formatPct(rideMetrics.monthDecided?.cancelRate)} label="Stornoquote" />
            <KpiCard
              value={
                rideMetrics.monthCompletedQuality?.avgFare != null
                  ? formatEur(rideMetrics.monthCompletedQuality.avgFare)
                  : "—"
              }
              label="Ø Preis"
            />
            <KpiCard value={formatKm(rideMetrics.monthCompletedQuality?.avgDistanceKm)} label="Ø Entfernung" />
            <KpiCard
              value={String(rideMetrics.monthCompletedQuality?.completedWithAccessCode ?? 0)}
              label="Code-Fahrten Monat"
            />
          </div>

          <p className="panel-dash-footnote">
            {rideMetrics.presentation === "taxi_betrieb"
              ? `${moneyWord}: abgeschlossene Fahrten · ${rideMetrics.zone} · Woche rollierend 7 Tage.`
              : `${moneyWord}: gebuchtes Fahrtvolumen (Leistungsnachweis) · ${rideMetrics.zone}.`}
          </p>

          {user?.companyKind === "taxi" && fleetDash ? (
            <div className="panel-dash-fleet-strip">
              <KpiCard value={String(fleetDash.driversOnline ?? 0)} label="Fahrer online" />
              <KpiCard value={String(fleetDash.driversTotal ?? 0)} label="Fahrer gesamt" />
              <KpiCard value={String(fleetDash.vehiclesActive ?? 0)} label="Aktive Fahrzeuge" />
            </div>
          ) : null}
        </>
      ) : null}

      {hasPanelModule(user?.panelModules, "rides_list") && hasPerm(user?.permissions, "rides.read") ? (
        <>
          <section className="panel-dash-section">
            <div className="panel-dash-section__head">
              <h3 className="panel-dash-section__title">Letzte Fahrten</h3>
              <p className="panel-dash-section__hint">Seitenleiste: Meine Fahrten</p>
            </div>
            {ridesErr ? <p className="panel-page__warn">{ridesErr}</p> : null}
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
                        <td>{fareCell(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="panel-dash-section">
            <div className="panel-dash-section__head">
              <h3 className="panel-dash-section__title">Offene Fahrten</h3>
              <p className="panel-dash-section__hint">Nicht abgeschlossen / nicht storniert</p>
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
                        <td>{fareCell(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="panel-dash-section">
            <div className="panel-dash-section__head">
              <h3 className="panel-dash-section__title">Heute geplant</h3>
              <p className="panel-dash-section__hint">Mit Abholtermin heute (lokal)</p>
            </div>
            <div className="panel-dash-table-wrap">
              {rideSlices.planned.length === 0 ? (
                <p className="panel-dash-empty">Keine geplanten Fahrten für heute.</p>
              ) : (
                <table className="panel-dash-table">
                  <thead>
                    <tr>
                      <th>Abholung</th>
                      <th>Route</th>
                      <th>Status</th>
                      <th>Betrag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rideSlices.planned.map((r) => (
                      <tr key={r.id}>
                        <td>{formatShortDt(r.scheduledAt)}</td>
                        <td>
                          <span className="panel-dash-table__muted">{r.from ?? "—"}</span> → {r.to ?? "—"}
                        </td>
                        <td>{statusDe(r.status)}</td>
                        <td>{fareCell(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
