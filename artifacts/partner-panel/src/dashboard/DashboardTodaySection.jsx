import {
  busyAssignedDriverCount,
  getPartnerMeta,
  isoToBerlinYmd,
  medicalRides,
  openRidesList,
  berlinTodayYmd,
  rideStatusLabelDe,
  ridesScheduledTodayBerlin,
} from "./dashboardHelpers.js";

function payerLine(ride) {
  const m = getPartnerMeta(ride);
  const ins = typeof m.insurance_name === "string" ? m.insurance_name.trim() : "";
  if (ins) return ins;
  return typeof ride.customerName === "string" ? ride.customerName : "—";
}

/** @param {{ tier?: string }} alert */
function docWarningCategory(alert) {
  const t = alert?.tier;
  if (t === "deadline") return "Läuft bald ab";
  if (t === "mandatory") return "Fehlt";
  if (t === "info") return "In Prüfung";
  if (t === "blocker") return "Fehlt";
  return "Hinweis";
}

function formatTimeBerlin(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

/**
 * @param {{
 *   rides: Record<string, unknown>[];
 *   ridesError: string | null;
 *   ridesLoaded: boolean;
 *   fleetDash: object | null;
 *   fleetDashError: string | null;
 *   drivers: Record<string, unknown>[];
 *   cockpitAlerts: object[];
 *   onNavigateModule: (k: string) => void;
 * }} props
 */
export default function DashboardTodaySection({
  rides,
  ridesError,
  ridesLoaded,
  fleetDash,
  fleetDashError,
  drivers,
  cockpitAlerts,
  onNavigateModule,
}) {
  const todayYmd = berlinTodayYmd();
  let scheduledToday = ridesScheduledTodayBerlin(rides);
  scheduledToday = [...scheduledToday].sort((a, b) => {
    const ta = new Date(a.scheduledAt || 0).getTime();
    const tb = new Date(b.scheduledAt || 0).getTime();
    return ta - tb;
  });
  const fallbackOpenToday = openRidesList(rides).filter((r) => {
    const cy = isoToBerlinYmd(typeof r.createdAt === "string" ? r.createdAt : null);
    return cy === todayYmd;
  });
  const displayRides = scheduledToday.length ? scheduledToday.slice(0, 8) : fallbackOpenToday.slice(0, 8);

  const activeDrivers = drivers.filter((d) => d?.isActive && d?.accessStatus === "active").length;
  const online = fleetDashError ? null : fleetDash?.driversOnline ?? null;
  const busy = ridesLoaded ? busyAssignedDriverCount(rides) : null;
  const offlineApprox = online != null ? Math.max(0, activeDrivers - online) : null;

  const docLines = cockpitAlerts.slice(0, 6);

  return (
    <div className="partner-card partner-card--section">
      <h2 className="partner-card__title" style={{ marginTop: 0 }}>
        Heute
      </h2>
      <p className="partner-muted" style={{ margin: "0 0 18px", maxWidth: 720, lineHeight: 1.5 }}>
        Kalendertag und Uhrzeit nach{" "}
        <strong>Europe/Berlin</strong>. Fahrtenliste aus den geladenen Mandantenfahrten (keine separate Tages-API).
      </p>

      <div className="partner-dashboard-today-cols">
        <div className="partner-dashboard-today-col">
          <h3 className="partner-dashboard-today-col__h">Anstehende Fahrten</h3>
          {ridesError ? (
            <p className="partner-state-error" style={{ margin: 0 }}>
              {ridesError}
            </p>
          ) : !ridesLoaded ? (
            <p className="partner-muted">Laden …</p>
          ) : displayRides.length === 0 ? (
            <p className="partner-muted">Keine terminierten oder neuen offenen Fahrten für heute.</p>
          ) : (
            <ul className="partner-dashboard-mini-list">
              {displayRides.map((r) => (
                <li key={r.id}>
                  <div className="partner-dashboard-mini-list__row1">
                    <span className="partner-dashboard-mini-list__t">{formatTimeBerlin(r.scheduledAt || r.createdAt)}</span>
                    <span className="partner-dashboard-mini-list__tag">{rideStatusLabelDe(r.status)}</span>
                  </div>
                  <div className="partner-dashboard-mini-list__m">{payerLine(r)}</div>
                  <div className="partner-dashboard-mini-list__s">{typeof r.to === "string" ? r.to : "—"}</div>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="partner-link-btn" style={{ marginTop: 10 }} onClick={() => onNavigateModule("fahrten")}>
            Alle Fahrten
          </button>
        </div>

        <div className="partner-dashboard-today-col">
          <h3 className="partner-dashboard-today-col__h">Fahrerstatus</h3>
          {fleetDashError ? (
            <p className="partner-muted">{fleetDashError}</p>
          ) : (
            <ul className="partner-dashboard-status-list">
              <li>
                <span className="partner-dashboard-status-list__k">Online</span>
                <span className="partner-dashboard-status-list__v">{online == null ? "—" : String(online)}</span>
              </li>
              <li>
                <span className="partner-dashboard-status-list__k">Beschäftigt (zugewiesen)</span>
                <span className="partner-dashboard-status-list__v">{busy == null ? "—" : String(busy)}</span>
              </li>
              <li>
                <span className="partner-dashboard-status-list__k">Offline (geschätzt)</span>
                <span className="partner-dashboard-status-list__v">{offlineApprox == null ? "—" : String(offlineApprox)}</span>
              </li>
            </ul>
          )}
          <p className="partner-muted" style={{ margin: "12px 0 0", fontSize: 12, lineHeight: 1.45 }}>
            „Offline“ = aktive Profile minus Online-Puls — keine Einzel-GPS-Aufschlüsselung. Aktive Profile gesamt: {activeDrivers}.
            Einzelheiten unter{" "}
            <button type="button" className="partner-link-btn" style={{ display: "inline", padding: 0 }} onClick={() => onNavigateModule("flotte")}>
              Flotte
            </button>
            .
          </p>
        </div>

        <div className="partner-dashboard-today-col">
          <h3 className="partner-dashboard-today-col__h">Dokumentwarnungen</h3>
          {docLines.length === 0 ? (
            <p className="partner-muted">Keine Warnungen aus den aktuellen Daten.</p>
          ) : (
            <ul className="partner-dashboard-docwarn">
              {docLines.map((a) => (
                <li key={a.id}>
                  <span className="partner-pill partner-pill--soft">{docWarningCategory(a)}</span>
                  <span className="partner-dashboard-docwarn__txt">{a.text}</span>
                  {a.cta ? (
                    <button type="button" className="partner-link-btn" style={{ display: "inline", padding: 0 }} onClick={() => onNavigateModule(a.cta.module)}>
                      {a.cta.label}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="partner-link-btn" style={{ marginTop: 10 }} onClick={() => onNavigateModule("dokumente")}>
            Zu Dokumenten
          </button>
        </div>
      </div>

      {ridesLoaded && medicalRides(rides).length > 0 && scheduledToday.length === 0 && fallbackOpenToday.length === 0 ? (
        <p className="partner-muted" style={{ marginTop: 14, fontSize: 13 }}>
          Hinweis: Krankenfahrten ohne Zeitfenster erscheinen ggf. erst nach Terminierung — sie sind im Bereich Krankenfahrten unten gezählt.
        </p>
      ) : null}
    </div>
  );
}
