/** Countdown-Ende pro Sofortauftrag — überlebt Offline/Remount (kein Reset auf 10). */
const deadlineByRideId = new Map<string, number>();

/**
 * Nach Countdown-Timeout: kurz ausblenden, dann erneut anbieten/klingeln (wiederholbar),
 * solange die Fahrt offen ist und der Fahrer nicht manuell abgelehnt hat.
 */
const snoozeUntilByRideId = new Map<string, number>();
const snoozeTimersByRideId = new Map<string, ReturnType<typeof setTimeout>>();

export type InstantOfferSnoozeEvent = { type: "start" | "end" | "clear"; rideId: string };

const snoozeListeners = new Set<(event: InstantOfferSnoozeEvent) => void>();

/** Pause zwischen verpasstem 10-s-Angebot und erneutem Klingeln. */
export const INSTANT_OFFER_MISS_SNOOZE_MS = 20_000;

function notifySnoozeListeners(event: InstantOfferSnoozeEvent): void {
  for (const listener of snoozeListeners) {
    try {
      listener(event);
    } catch {
      /* ignore */
    }
  }
}

/** UI/Context: bei Snooze-Start/Ende neu filtern und Prev-IDs für Klingeln zurücksetzen. */
export function subscribeInstantOfferSnooze(
  listener: (event: InstantOfferSnoozeEvent) => void,
): () => void {
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
 * nach `snoozeMs` wieder anzeigen + Klingeln (beliebig oft wiederholbar).
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
  const waitMs = Math.max(1000, snoozeMs);
  const until = Date.now() + waitMs;
  snoozeUntilByRideId.set(id, until);
  notifySnoozeListeners({ type: "start", rideId: id });
  const timer = setTimeout(() => {
    snoozeTimersByRideId.delete(id);
    snoozeUntilByRideId.delete(id);
    // Neuer Countdown erst nach Wake — alte Deadline darf nicht kleben.
    clearInstantOfferDeadline(id);
    notifySnoozeListeners({ type: "end", rideId: id });
  }, waitMs);
  snoozeTimersByRideId.set(id, timer);
}

export function clearInstantOfferSnooze(rideId: string): void {
  const id = rideId.trim();
  if (!id) return;
  const timer = snoozeTimersByRideId.get(id);
  if (timer) clearTimeout(timer);
  snoozeTimersByRideId.delete(id);
  if (snoozeUntilByRideId.delete(id)) {
    notifySnoozeListeners({ type: "clear", rideId: id });
  }
}
