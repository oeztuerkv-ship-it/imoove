import {
  getPartnerMeta,
  isoToBerlinYmd,
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

function formatTimeBerlin(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function driverLabel(drivers, ride) {
  const id = typeof ride.driverId === "string" ? ride.driverId.trim() : "";
  if (!id) return "—";
  const d = drivers.find((x) => String(x.id) === id);
  if (!d) return `ID …${id.slice(-6)}`;
  const name = [d.firstName, d.lastName].filter(Boolean).join(" ").trim();
  return name || (typeof d.email === "string" ? d.email : `ID …${id.slice(-6)}`);
}

function vehicleLabel(vehicles, ride) {
  const vStr = typeof ride.vehicle === "string" ? ride.vehicle.trim() : "";
  if (vStr) return vStr;
  const vid = typeof ride.vehicleId === "string" ? ride.vehicleId.trim() : "";
  if (!vid) return "—";
  const v = vehicles.find((x) => String(x.id) === vid);
  if (!v) return `Fzg. …${vid.slice(-6)}`;
  return v.licensePlate || v.model || `Fzg. …${String(v.id).slice(-6)}`;
}

/**
 * @param {{
 *   rides: Record<string, unknown>[];
 *   ridesError: string | null;
 *   ridesLoaded: boolean;
 *   drivers: Record<string, unknown>[];
 *   vehicles: Record<string, unknown>[];
 *   onNavigateModule: (k: string, opts?: { settingsTab?: string }) => void;
 * }} props
 */
export default function DashboardTodaySection({ rides, ridesError, ridesLoaded, drivers, vehicles, onNavigateModule }) {
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
  const displayRides = scheduledToday.length ? scheduledToday.slice(0, 12) : fallbackOpenToday.slice(0, 12);

  return (
    <div className="partner-card partner-card--section">
      <h2 className="partner-card__title" style={{ marginTop: 0 }}>
        Heute
      </h2>
      <p className="partner-muted" style={{ margin: "0 0 14px", maxWidth: 640 }}>
        Termine und offene Fahrten für den Kalendertag <strong>Europe/Berlin</strong>.
      </p>

      {ridesError ? (
        <p className="partner-state-error" style={{ margin: 0 }}>
          {ridesError}
        </p>
      ) : !ridesLoaded ? (
        <p className="partner-muted">Laden …</p>
      ) : displayRides.length === 0 ? (
        <p className="partner-muted">Keine Fahrten für heute in den geladenen Daten.</p>
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
              <div className="partner-muted" style={{ fontSize: 12, marginTop: 4 }}>
                Fahrer: {driverLabel(drivers, r)} · Fahrzeug: {vehicleLabel(vehicles, r)}
              </div>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="partner-link-btn" style={{ marginTop: 12 }} onClick={() => onNavigateModule("fahrten")}>
        Alle Fahrten
      </button>
    </div>
  );
}
