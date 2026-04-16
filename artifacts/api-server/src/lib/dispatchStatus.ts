/** Ab wann eine Fahrt als „Vorbestellung“ gilt (kein Sofort-Klingeln). */
export const RESERVATION_LEAD_MS = 30 * 60 * 1000;

export function isFarFutureReservation(
  scheduledAtIso: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (scheduledAtIso == null) return false;
  const s = String(scheduledAtIso).trim();
  if (!s) return false;
  const t = new Date(s).getTime();
  if (!Number.isFinite(t)) return false;
  return t > nowMs + RESERVATION_LEAD_MS;
}

/** Partner-Panel: Sofort-Disposition bleibt `pending`, weit in der Zukunft → stiller Planer-Pool. */
export function initialPanelRideStatus(scheduledAtIso: string | null | undefined): "scheduled" | "pending" {
  return isFarFutureReservation(scheduledAtIso) ? "scheduled" : "pending";
}
