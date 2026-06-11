/** Stuttgart-Tarif Wartezeit: 38,00 €/Std (konfigurierbar über operational bookingRules). */
const DEFAULT_WAITING_EUR_PER_HOUR = 38;

export function resolveWaitingEurPerHour(bookingRules: Record<string, unknown> | undefined): number {
  const raw = bookingRules?.waitingEurPerHour;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return raw;
  return DEFAULT_WAITING_EUR_PER_HOUR;
}

export function waitingChargeEurFromMinutes(waitingMinutes: number, eurPerHour: number): number {
  const mins = Math.max(0, waitingMinutes);
  const rate = Math.max(0, eurPerHour);
  return Math.round(((mins / 60) * rate + Number.EPSILON) * 100) / 100;
}

export function liveWaitingMinutesSince(waitingStartedAtIso: string | null | undefined, now = Date.now()): number {
  if (!waitingStartedAtIso) return 0;
  const t = Date.parse(waitingStartedAtIso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 60_000));
}
