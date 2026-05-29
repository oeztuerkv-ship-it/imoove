import type { PartnerRideRow } from "@/utils/partnerApi";

export const PARTNER_MAX_OPEN_RIDES = 5;

/** Partner-Liste: ausgeblendete/archivierte Fahrten nicht anzeigen (API filtert parallel). */
export function isPartnerRideHiddenFromList(
  ride: Pick<PartnerRideRow, "partnerBookingMeta">,
): boolean {
  const meta = ride.partnerBookingMeta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  const m = meta as Record<string, unknown>;
  const hidden = m.partner_hidden;
  const archived = m.partner_archived;
  return (
    hidden === true
    || hidden === "true"
    || archived === true
    || archived === "true"
  );
}

export function filterPartnerVisibleRides(rides: PartnerRideRow[]): PartnerRideRow[] {
  return rides.filter((r) => !isPartnerRideHiddenFromList(r));
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

const ACTIVE_STATUSES = new Set([
  "pending",
  "requested",
  "searching_driver",
  "offered",
  "accepted",
  "ready_for_dispatch",
  "driver_arriving",
  "driver_waiting",
  "passenger_onboard",
  "in_progress",
  "arrived",
]);

const RESERVATION_STATUSES = new Set(["scheduled", "scheduled_assigned"]);

export function isPartnerRideOpen(status: string): boolean {
  return !TERMINAL_STATUSES.has(status);
}

function partnerSearchAnchorMs(ride: Pick<PartnerRideRow, "createdAt" | "partnerBookingMeta">): number | null {
  const meta = ride.partnerBookingMeta;
  const fromMeta =
    meta && typeof meta === "object" && !Array.isArray(meta) && typeof (meta as Record<string, unknown>).search_started_at === "string"
      ? String((meta as Record<string, unknown>).search_started_at)
      : "";
  const raw = fromMeta || String(ride.createdAt ?? "");
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

export function isPartnerRideActive(ride: PartnerRideRow): boolean {
  if (!isPartnerRideOpen(ride.status)) return false;
  if (isPartnerSearchTimeout(ride)) return false;
  if (RESERVATION_STATUSES.has(ride.status)) return false;
  if (ride.scheduledAt) {
    const t = Date.parse(ride.scheduledAt);
    if (Number.isFinite(t) && t > Date.now()) return false;
  }
  return ACTIVE_STATUSES.has(ride.status) || ride.status === "pending";
}

export function isPartnerRideReservation(ride: PartnerRideRow): boolean {
  if (!isPartnerRideOpen(ride.status)) return false;
  if (isPartnerSearchTimeout(ride)) return false;
  if (RESERVATION_STATUSES.has(ride.status)) return true;
  if (ride.scheduledAt) {
    const t = Date.parse(ride.scheduledAt);
    return Number.isFinite(t) && t > Date.now();
  }
  return false;
}

export function partnerRideDriverNote(ride: PartnerRideRow): string | null {
  const meta = ride.partnerBookingMeta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const note = (meta as Record<string, unknown>).customer_driver_note;
  return typeof note === "string" && note.trim() ? note.trim() : null;
}

export function partnerRideRouteLabel(ride: PartnerRideRow): string {
  const from = (ride.fromFull || ride.from || "").trim();
  const to = (ride.toFull || ride.to || "").trim();
  if (from && to) return `${from} → ${to}`;
  return from || to || "—";
}

export function partnerRideTimeLabel(ride: PartnerRideRow): string {
  const iso = ride.scheduledAt || ride.createdAt;
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return "—";
  }
}

export function isPartnerRideCancellable(status: string): boolean {
  return (
    status === "searching_driver"
    || status === "scheduled"
    || status === "scheduled_assigned"
    || status === "accepted"
    || status === "pending"
    || status === "requested"
    || status === "offered"
    || status === "ready_for_dispatch"
  );
}

const SEARCH_TIMEOUT_MS = 60_000;
const SEARCH_PHASE_1_MS = 15_000;
const LIVE_CANCEL_NO_REASON_STATUSES = new Set(["accepted", "driver_arriving", "driver_waiting", "passenger_onboard", "in_progress"]);

export type PartnerStatusVisual = {
  bg: string;
  text: string;
  accent: string;
  loading: boolean;
};

export function partnerRideShortId(id: string): string {
  const clean = id.trim();
  if (!clean) return "—";
  if (clean.startsWith("REQ-")) {
    const tail = clean.slice(4).replace(/-/g, "");
    return `REQ-${tail.slice(0, 6).toUpperCase()}`;
  }
  return clean.slice(0, 8).toUpperCase();
}

export function isPartnerSearchTimeout(
  ride: Pick<PartnerRideRow, "status" | "createdAt" | "partnerBookingMeta">,
  nowMs: number = Date.now(),
): boolean {
  if (!["pending", "requested", "searching_driver", "offered", "ready_for_dispatch"].includes(ride.status)) {
    return false;
  }
  const anchorMs = partnerSearchAnchorMs(ride);
  if (anchorMs == null) return false;
  return nowMs - anchorMs >= SEARCH_TIMEOUT_MS;
}

function partnerSearchElapsedMs(ride: Pick<PartnerRideRow, "createdAt" | "partnerBookingMeta">, nowMs: number): number | null {
  const anchorMs = partnerSearchAnchorMs(ride);
  if (anchorMs == null) return null;
  return Math.max(0, nowMs - anchorMs);
}

export function partnerSearchPhaseLabel(
  ride: Pick<PartnerRideRow, "status" | "createdAt" | "partnerBookingMeta">,
  nowMs: number = Date.now(),
): string {
  if (isPartnerSearchTimeout(ride, nowMs)) return "Momentan kein Fahrer verfügbar";
  const elapsed = partnerSearchElapsedMs(ride, nowMs);
  if (elapsed != null && elapsed >= SEARCH_PHASE_1_MS) return "Wir suchen einen Fahrer...";
  return "Fahrer wird gesucht...";
}

export function partnerRideNeedsCancelReason(status: string): boolean {
  return !LIVE_CANCEL_NO_REASON_STATUSES.has(status);
}

export function partnerRideStatusHumanLabel(ride: Pick<PartnerRideRow, "status" | "createdAt" | "partnerBookingMeta">): string {
  switch (ride.status) {
    case "pending":
    case "requested":
    case "searching_driver":
    case "offered":
    case "ready_for_dispatch":
      return partnerSearchPhaseLabel(ride);
    case "accepted":
      return "Fahrer wurde zugewiesen";
    case "driver_arriving":
      return "Fahrer ist unterwegs";
    case "driver_waiting":
      return "Fahrer wartet an der Abholung";
    case "passenger_onboard":
    case "in_progress":
      return "Fahrt läuft";
    case "scheduled":
      return "Reserviert";
    case "scheduled_assigned":
      return "Reservierung mit Fahrer";
    case "completed":
      return "Abgeschlossen";
    case "cancelled":
    case "cancelled_by_customer":
    case "cancelled_by_driver":
    case "cancelled_by_system":
      return "Storniert";
    case "expired":
      return "Nicht vermittelt";
    case "rejected":
      return "Abgelehnt";
    default:
      return "In Bearbeitung";
  }
}

export function partnerRideStatusVisual(ride: Pick<PartnerRideRow, "status" | "createdAt" | "partnerBookingMeta">): PartnerStatusVisual {
  if (isPartnerSearchTimeout(ride)) {
    return { bg: "rgba(245, 158, 11, 0.18)", text: "#B45309", accent: "#D97706", loading: false };
  }
  switch (ride.status) {
    case "pending":
    case "requested":
    case "searching_driver":
    case "offered":
    case "ready_for_dispatch":
      return { bg: "rgba(245, 158, 11, 0.16)", text: "#B45309", accent: "#D97706", loading: true };
    case "accepted":
      return { bg: "rgba(34, 197, 94, 0.16)", text: "#166534", accent: "#16A34A", loading: false };
    case "driver_waiting":
      return { bg: "rgba(99, 102, 241, 0.16)", text: "#3730A3", accent: "#6366F1", loading: false };
    default:
      return { bg: "rgba(107, 114, 128, 0.12)", text: "#374151", accent: "#6B7280", loading: false };
  }
}

export type PartnerHomeStats = {
  activeCount: number;
  plannedCount: number;
  completedToday: number;
  openCount: number;
};

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function computePartnerHomeStats(rides: PartnerRideRow[]): PartnerHomeStats {
  const today0 = startOfLocalDay(new Date());
  const todayEnd = today0 + 86400000;
  let activeCount = 0;
  let plannedCount = 0;
  let completedToday = 0;
  let openCount = 0;

  for (const r of rides) {
    if (isPartnerRideOpen(r.status)) openCount += 1;
    if (isPartnerRideActive(r)) activeCount += 1;
    if (isPartnerRideReservation(r)) plannedCount += 1;
    if (r.status === "completed" && r.createdAt) {
      const t = Date.parse(r.createdAt);
      if (Number.isFinite(t) && t >= today0 && t < todayEnd) completedToday += 1;
    }
  }

  return { activeCount, plannedCount, completedToday, openCount };
}

export function sortPartnerRidesNewestFirst(a: PartnerRideRow, b: PartnerRideRow): number {
  const ta = Date.parse(a.createdAt ?? "") || 0;
  const tb = Date.parse(b.createdAt ?? "") || 0;
  return tb - ta;
}
