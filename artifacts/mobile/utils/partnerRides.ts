import type { PartnerRideRow } from "@/utils/partnerApi";

export const PARTNER_MAX_OPEN_RIDES = 5;

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

export function isPartnerRideActive(ride: PartnerRideRow): boolean {
  if (!isPartnerRideOpen(ride.status)) return false;
  if (RESERVATION_STATUSES.has(ride.status)) return false;
  if (ride.scheduledAt) {
    const t = Date.parse(ride.scheduledAt);
    if (Number.isFinite(t) && t > Date.now()) return false;
  }
  return ACTIVE_STATUSES.has(ride.status) || ride.status === "pending";
}

export function isPartnerRideReservation(ride: PartnerRideRow): boolean {
  if (!isPartnerRideOpen(ride.status)) return false;
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
