/** Countdown-Ende pro Sofortauftrag — überlebt Offline/Remount (kein Reset auf 10). */
const deadlineByRideId = new Map<string, number>();

/** Nach Countdown-Timeout: kurz ausblenden, dann zweite Chance (Klingeln), wenn noch offen. */
const snoozeUntilByRideId = new Map<string, number>();
const snoozeTimersByRideId = new Map<string, ReturnType<typeof setTimeout>>();
const snoozeListeners = new Set<() => void>();

/** Default: 20 s Pause nach verpasstem 10-s-Angebot. */
export const INSTANT_OFFER_MISS_SNOOZE_MS = 20_000;

function notifySnoozeListeners(): void {
  for (const listener of snoozeListeners) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

/** UI/Context: bei Snooze-Start/Ende neu filtern (zweite Chance). */
export function subscribeInstantOfferSnooze(listener: () => void): () => void {
  snoozeListeners.add(listener);
  return () => {
    snoozeListeners.delete(listener);
  };
}

export function getInstantOfferDeadlineMs(rideId: string, durationSec: number): number {
  const existing = deadlineByRideId.get(rideId);
  if (existing != null) return existing;
  const deadline = Date.now() + durationSec * 1000;
  deadlineByRideId.set(rideId, deadline);
  return deadline;
}

export function clearInstantOfferDeadline(rideId: string): void {
  deadlineByRideId.delete(rideId);
}

export function clearAllInstantOfferDeadlines(): void {
  deadlineByRideId.clear();
}

export function isInstantOfferSnoozed(rideId: string, nowMs = Date.now()): boolean {
  const id = rideId.trim();
  if (!id) return false;
  const until = snoozeUntilByRideId.get(id);
  if (until == null) return false;
  if (nowMs >= until) {
    snoozeUntilByRideId.delete(id);
    return false;
  }
  return true;
}

/**
 * Countdown abgelaufen ohne Annahme/Ablehnen: nicht in rejectedBy schreiben —
 * nach `snoozeMs` wieder anzeigen + Klingeln, falls die Fahrt noch im Markt ist.
 */
export function snoozeInstantOfferAfterMiss(
  rideId: string,
  snoozeMs: number = INSTANT_OFFER_MISS_SNOOZE_MS,
): void {
  const id = rideId.trim();
  if (!id) return;
  clearInstantOfferDeadline(id);
  const prevTimer = snoozeTimersByRideId.get(id);
  if (prevTimer) clearTimeout(prevTimer);
  const until = Date.now() + Math.max(1000, snoozeMs);
  snoozeUntilByRideId.set(id, until);
  notifySnoozeListeners();
  const timer = setTimeout(() => {
    snoozeTimersByRideId.delete(id);
    snoozeUntilByRideId.delete(id);
    notifySnoozeListeners();
  }, Math.max(1000, snoozeMs));
  snoozeTimersByRideId.set(id, timer);
}

export function clearInstantOfferSnooze(rideId: string): void {
  const id = rideId.trim();
  if (!id) return;
  const timer = snoozeTimersByRideId.get(id);
  if (timer) clearTimeout(timer);
  snoozeTimersByRideId.delete(id);
  if (snoozeUntilByRideId.delete(id)) notifySnoozeListeners();
}
