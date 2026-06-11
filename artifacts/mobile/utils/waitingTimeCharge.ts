const DEFAULT_WAITING_EUR_PER_HOUR = 38;

export function resolveWaitingEurPerHour(eurPerHour?: number): number {
  if (typeof eurPerHour === "number" && Number.isFinite(eurPerHour) && eurPerHour >= 0) return eurPerHour;
  return DEFAULT_WAITING_EUR_PER_HOUR;
}

export function liveWaitingMinutesSince(waitingStartedAtIso: string | null | undefined, now = Date.now()): number {
  if (!waitingStartedAtIso) return 0;
  const t = Date.parse(waitingStartedAtIso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 60_000));
}

export function waitingChargeEurFromMinutes(waitingMinutes: number, eurPerHour: number): number {
  const mins = Math.max(0, waitingMinutes);
  const rate = Math.max(0, eurPerHour);
  return Math.round(((mins / 60) * rate + Number.EPSILON) * 100) / 100;
}

export function formatWaitingChargeDe(minutes: number, eur: number, eurPerHour: number): string {
  return `Wartezeit: ${minutes} Min · ${eur.toFixed(2).replace(".", ",")} € (${eurPerHour.toFixed(2).replace(".", ",")} €/Std)`;
}
