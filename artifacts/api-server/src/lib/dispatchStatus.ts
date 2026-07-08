/** Ab wann eine Fahrt als „Vorbestellung“ gilt (kein Sofort-Klingeln). Mindestvorlauf 60 Minuten. */
export const RESERVATION_LEAD_MS = 60 * 60 * 1000;
/** Reservierung maximal 5 Tage im Voraus. */
export const RESERVATION_MAX_ADVANCE_MS = 5 * 24 * 60 * 60 * 1000;

function parseScheduledAtMs(scheduledAtIso: string | null | undefined): number | null {
  if (scheduledAtIso == null) return null;
  const s = String(scheduledAtIso).trim();
  if (!s) return null;
  const t = new Date(s).getTime();
  if (!Number.isFinite(t)) return null;
  return t;
}

export function isFarFutureReservation(
  scheduledAtIso: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  const t = parseScheduledAtMs(scheduledAtIso);
  if (t == null) return false;
  return t >= nowMs + RESERVATION_LEAD_MS;
}

export function isReservationWithinAdvanceWindow(
  scheduledAtIso: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  const t = parseScheduledAtMs(scheduledAtIso);
  if (t == null) return false;
  return t <= nowMs + RESERVATION_MAX_ADVANCE_MS;
}

/** Partner-Panel: Sofort-Disposition `searching_driver` (wie Kunden-API), Reservierung → Planer. */
export function initialPanelRideStatus(
  scheduledAtIso: string | null | undefined,
): "scheduled" | "searching_driver" {
  return isFarFutureReservation(scheduledAtIso) ? "scheduled" : "searching_driver";
}
