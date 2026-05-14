/**
 * Reservierungen (mit `scheduledAt`): Storno durch Kunde oder zugewiesenen Fahrer
 * ist nicht mehr möglich, sobald die Abholzeit höchstens diese Minuten in der
 * Zukunft liegt (einschließlich „in der Vergangenheit“).
 * Operator/Admin und System-Jobs sind davon nicht betroffen.
 */
export const RESERVATION_CUSTOMER_DRIVER_STORNO_LOCK_MINUTES = 60;

const MS_PER_MINUTE = 60 * 1000;

export function msUntilScheduledPickup(scheduledAt: string | null | undefined): number | null {
  if (scheduledAt == null) return null;
  const s = typeof scheduledAt === "string" ? scheduledAt.trim() : "";
  if (!s) return null;
  const t = new Date(s).getTime();
  if (!Number.isFinite(t)) return null;
  return t - Date.now();
}

/** true = Kunden-/Fahrer-Storno für diese Reservierung ist gesperrt. */
export function isReservationCustomerDriverStornoLocked(scheduledAt: string | null | undefined): boolean {
  const ms = msUntilScheduledPickup(scheduledAt);
  if (ms === null) return false;
  return ms <= RESERVATION_CUSTOMER_DRIVER_STORNO_LOCK_MINUTES * MS_PER_MINUTE;
}
