/**
 * Reservierungen (mit `scheduledAt`):
 * - **Kunde:** Storno gesperrt, wenn Abholung ≤ diese Minuten entfernt (inkl. überfällig).
 * - **Fahrer:** Storno bleibt immer möglich; im gleichen Fenster gilt 24h-Sperre (Sanktion).
 * Operator/Admin und System-Jobs sind davon nicht betroffen.
 */
export const RESERVATION_CUSTOMER_DRIVER_STORNO_LOCK_MINUTES = 60;

/** Dauer der Fahrer-Sperre nach Spät-Storno einer Vorbestellung. */
export const RESERVATION_DRIVER_LATE_CANCEL_SUSPENSION_HOURS = 24;

const MS_PER_MINUTE = 60 * 1000;

export function msUntilScheduledPickup(scheduledAt: string | null | undefined): number | null {
  if (scheduledAt == null) return null;
  const s = typeof scheduledAt === "string" ? scheduledAt.trim() : "";
  if (!s) return null;
  const t = new Date(s).getTime();
  if (!Number.isFinite(t)) return null;
  return t - Date.now();
}

/** true = Kunden-Storno für diese Reservierung ist gesperrt. */
export function isReservationCustomerDriverStornoLocked(scheduledAt: string | null | undefined): boolean {
  const ms = msUntilScheduledPickup(scheduledAt);
  if (ms === null) return false;
  return ms <= RESERVATION_CUSTOMER_DRIVER_STORNO_LOCK_MINUTES * MS_PER_MINUTE;
}

/** true = Fahrer-Storno löst 24h-Reservierungssperre aus (Fenster wie Kunden-Lock). */
export function isReservationDriverLateCancelSanctionWindow(
  scheduledAt: string | null | undefined,
): boolean {
  return isReservationCustomerDriverStornoLocked(scheduledAt);
}

export function reservationDriverLateCancelSuspensionUntil(from: Date = new Date()): Date {
  return new Date(from.getTime() + RESERVATION_DRIVER_LATE_CANCEL_SUSPENSION_HOURS * 60 * 60 * 1000);
}
