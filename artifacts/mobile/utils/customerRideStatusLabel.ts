import type { RequestStatus } from "@/context/RideRequestContext";

export const CUSTOMER_RIDE_STATUS_CANCELLED_BY_SYSTEM = "Leider kein Fahrer gefunden";
export const CUSTOMER_RIDE_STATUS_RESERVATION_UNFULFILLED = "Reservierung konnte nicht erfüllt werden";

function hasScheduledPickup(scheduledAt: Date | string | null | undefined): boolean {
  if (scheduledAt == null) return false;
  if (scheduledAt instanceof Date) return Number.isFinite(scheduledAt.getTime());
  return String(scheduledAt).trim().length > 0;
}

/**
 * Kunden-App: feste Kurztexte für Reservierungs-Flow + System-Storno (AUFGABE 5).
 * Nur für die genannten API-Status; sonst leerer String (Fallback in UI).
 */
export function customerReservationFlowHeadline(status: RequestStatus | string): string {
  switch (status) {
    case "scheduled":
      return "Reservierung angefragt";
    case "scheduled_assigned":
      return "Fahrer bestätigt";
    case "ready_for_dispatch":
      return "Fahrer ist aktiv – Live-Standort verfügbar";
    case "cancelled_by_system":
      return CUSTOMER_RIDE_STATUS_CANCELLED_BY_SYSTEM;
    default:
      return "";
  }
}

/** Abgelaufene oder abgelehnte Reservierung (Abholzeit war geplant). */
export function customerReservationUnfulfilledHeadline(
  status: string,
  scheduledAt: Date | string | null | undefined,
): string {
  if (!hasScheduledPickup(scheduledAt)) return "";
  if (status === "expired" || status === "rejected") return CUSTOMER_RIDE_STATUS_RESERVATION_UNFULFILLED;
  return "";
}

/** Liste/Badge: Spez-Text oder Reservierung-nicht-erfüllbar; sonst leer → UI-Fallback. */
export function customerRideListStatusLabel(status: string, scheduledAt?: Date | string | null): string {
  const flow = customerReservationFlowHeadline(status);
  if (flow) return flow;
  const un = customerReservationUnfulfilledHeadline(status, scheduledAt);
  if (un) return un;
  return "";
}
