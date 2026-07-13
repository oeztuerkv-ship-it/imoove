/** Nur Anzeige-Labels/Töne — DB/API-Werte unverändert. */

const LIVE_STATUSES = new Set([
  "accepted",
  "driver_arriving",
  "driver_waiting",
  "passenger_onboard",
  "arrived",
  "in_progress",
]);

const SEARCH_STATUSES = new Set([
  "pending",
  "requested",
  "searching_driver",
  "offered",
  "ready_for_dispatch",
]);

const STATUS_LABELS = {
  pending: "Wartet auf Disposition",
  requested: "Angefragt",
  searching_driver: "Fahrersuche aktiv",
  offered: "An Fahrer angeboten",
  scheduled: "Reserviert",
  scheduled_assigned: "Reserviert · Zugewiesen",
  ready_for_dispatch: "Bereit zur Vergabe",
  accepted: "Fahrer angenommen",
  driver_arriving: "Fahrer unterwegs",
  driver_waiting: "Fahrer wartet",
  passenger_onboard: "Fahrgast an Bord",
  arrived: "Vor Ort",
  in_progress: "Unterwegs",
  rejected: "Abgelehnt",
  cancelled: "Storniert",
  cancelled_by_customer: "Storniert (Kund*in)",
  cancelled_by_driver: "Storniert (Fahrer*in)",
  cancelled_by_system: "Storniert (System)",
  completed: "Abgeschlossen",
  no_driver: "Kein Fahrer",
  expired: "Abgelaufen",
};

export function normalizeRideStatusKey(status) {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
}

export function rideStatusLabelDe(status) {
  const key = normalizeRideStatusKey(status);
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  if (!key) return "—";
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** scheduled | search | accepted | live | ok | err | pending */
export function rideStatusTone(status) {
  const key = normalizeRideStatusKey(status);
  if (key === "completed") return "ok";
  if (key.startsWith("cancelled") || key === "rejected" || key === "no_driver" || key === "expired") return "err";
  if (key === "scheduled" || key === "scheduled_assigned") return "scheduled";
  if (key === "accepted") return "accepted";
  if (LIVE_STATUSES.has(key)) return "live";
  if (key === "searching_driver" || key === "offered" || key === "ready_for_dispatch") return "search";
  if (SEARCH_STATUSES.has(key)) return "pending";
  return "pending";
}

export function rideStatusPillClass(status, extra = "") {
  const tone = rideStatusTone(status);
  return `admin-ride-status-pill admin-ride-status-pill--${tone}${extra ? ` ${extra}` : ""}`;
}

export function RideStatusPill({ status, className = "" }) {
  if (!status) return <span className="admin-ride-rec-kv__v">—</span>;
  return <span className={rideStatusPillClass(status, className)}>{rideStatusLabelDe(status)}</span>;
}

const CODE_ID_RE = /^(REQ-|fd-|co-|drv-)/i;

export function isRideCodeValue(value) {
  const s = String(value ?? "").trim();
  return CODE_ID_RE.test(s);
}

export function rideCodeChipClass(value, baseClass = "admin-ride-rec-kv__v") {
  return `${baseClass}${isRideCodeValue(value) ? " admin-ride-code-chip" : ""}`;
}
