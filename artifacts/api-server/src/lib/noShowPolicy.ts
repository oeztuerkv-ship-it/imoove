export type NoShowPolicy = {
  minWaitBeforeStartMinutes: number;
  countdownMinutes: number;
  feeEur: number;
};

const DEFAULT_NO_SHOW: NoShowPolicy = {
  minWaitBeforeStartMinutes: 5,
  countdownMinutes: 5,
  feeEur: 5,
};

export function resolveNoShowPolicy(opPayload: { bookingRules?: unknown }): NoShowPolicy {
  const b = opPayload.bookingRules;
  if (!b || typeof b !== "object" || Array.isArray(b)) return DEFAULT_NO_SHOW;
  const raw = b as Record<string, unknown>;
  const minWait =
    typeof raw.noShowMinWaitBeforeStartMinutes === "number" && Number.isFinite(raw.noShowMinWaitBeforeStartMinutes)
      ? Math.max(0, Math.round(raw.noShowMinWaitBeforeStartMinutes))
      : DEFAULT_NO_SHOW.minWaitBeforeStartMinutes;
  const countdown =
    typeof raw.noShowCountdownMinutes === "number" && Number.isFinite(raw.noShowCountdownMinutes)
      ? Math.max(1, Math.round(raw.noShowCountdownMinutes))
      : DEFAULT_NO_SHOW.countdownMinutes;
  const fee =
    typeof raw.noShowFeeEur === "number" && Number.isFinite(raw.noShowFeeEur)
      ? Math.max(0, raw.noShowFeeEur)
      : DEFAULT_NO_SHOW.feeEur;
  return { minWaitBeforeStartMinutes: minWait, countdownMinutes: countdown, feeEur: fee };
}

/** Gesamte No-Show-Wartezeit ab Fahrtannahme (früher: Wartezeit am Ort + Countdown). */
export function noShowTotalMinutesFromAccept(policy: NoShowPolicy): number {
  return Math.max(1, policy.minWaitBeforeStartMinutes + policy.countdownMinutes);
}

export function noShowFinalizeAfterIso(countdownStartedAtIso: string, policy: NoShowPolicy): string {
  const startedMs = Date.parse(countdownStartedAtIso);
  const base = Number.isFinite(startedMs) ? startedMs : Date.now();
  return new Date(base + noShowTotalMinutesFromAccept(policy) * 60_000).toISOString();
}
