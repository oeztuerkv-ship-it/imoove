/** Countdown-Ende pro Sofortauftrag — überlebt Offline/Remount (kein Reset auf 10). */
const deadlineByRideId = new Map<string, number>();

/**
 * Nach Countdown-Timeout: kurz ausblenden, dann erneut anbieten/klingeln (wiederholbar),
 * solange die Fahrt für diesen Fahrer noch am Markt sichtbar ist und er nicht manuell abgelehnt hat.
 */
const snoozeUntilByRideId = new Map<string, number>();
const snoozeTimersByRideId = new Map<string, ReturnType<typeof setTimeout>>();
/** Nach Pause: versteckt bis Markt-Refresh bestätigt, dass die Fahrt noch sichtbar ist. */
const wakeHoldRideIds = new Set<string>();
/** Remount-Schlüssel für InstantCard — neuer Zyklus = frischer 10-s-Countdown. */
const offerCycleByRideId = new Map<string, number>();
/** Letzter bekannter Ride-Snapshot für Soft-Miss über A→B hinweg. */
const softMissStashByRideId = new Map<string, unknown>();

export type InstantOfferSnoozeEvent =
  | { type: "start"; rideId: string }
  | { type: "wake_refresh"; rideId: string }
  | { type: "end"; rideId: string }
  | { type: "clear"; rideId: string };

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

function bumpOfferCycle(rideId: string): number {
  const next = (offerCycleByRideId.get(rideId) ?? 0) + 1;
  offerCycleByRideId.set(rideId, next);
  return next;
}

/** UI/Context: Snooze-Start, Wake-Refresh, Ende, Clear. */
export function subscribeInstantOfferSnooze(
  listener: (event: InstantOfferSnoozeEvent) => void,
): () => void {
  snoozeListeners.add(listener);
  return () => {
    snoozeListeners.delete(listener);
  };
}

/** Frischer Countdown; abgelaufene/kurz vor Ende stehende Deadlines nicht wiederverwenden. */
export function getInstantOfferDeadlineMs(rideId: string, durationSec: number): number {
  const id = rideId.trim();
  const existing = deadlineByRideId.get(id);
  if (existing != null && existing - Date.now() > 1000) return existing;
  const deadline = Date.now() + Math.max(1, durationSec) * 1000;
  deadlineByRideId.set(id, deadline);
  return deadline;
}

export function getInstantOfferCycle(rideId: string): number {
  return offerCycleByRideId.get(rideId.trim()) ?? 0;
}

export function stashSoftMissRide(ride: { id: string }): void {
  const id = String(ride.id ?? "").trim();
  if (!id) return;
  softMissStashByRideId.set(id, ride);
}

export function getSoftMissStash<T = unknown>(rideId: string): T | undefined {
  return softMissStashByRideId.get(rideId.trim()) as T | undefined;
}

export function listSoftMissStash<T = unknown>(): T[] {
  return [...softMissStashByRideId.values()] as T[];
}

export function clearSoftMissStash(rideId: string): void {
  softMissStashByRideId.delete(rideId.trim());
}

export function clearInstantOfferDeadline(rideId: string): void {
  deadlineByRideId.delete(rideId.trim());
}

export function clearAllInstantOfferDeadlines(): void {
  deadlineByRideId.clear();
}

export function isInstantOfferSnoozed(rideId: string, nowMs = Date.now()): boolean {
  const id = rideId.trim();
  if (!id) return false;
  if (wakeHoldRideIds.has(id)) return true;
  const until = snoozeUntilByRideId.get(id);
  if (until == null) return false;
  // Kein Auto-Delete hier — sonst Race mit Timer (kurz sichtbar → Deadline weg).
  return nowMs < until;
}

/**
 * Countdown abgelaufen ohne Annahme/Ablehnen: nicht in rejectedBy schreiben —
 * nach `snoozeMs` Markt prüfen, dann ggf. wieder anzeigen + Klingeln.
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
  wakeHoldRideIds.delete(id);
  const waitMs = Math.max(1000, snoozeMs);
  snoozeUntilByRideId.set(id, Date.now() + waitMs);
  notifySnoozeListeners({ type: "start", rideId: id });
  const timer = setTimeout(() => {
    snoozeTimersByRideId.delete(id);
    snoozeUntilByRideId.delete(id);
    wakeHoldRideIds.add(id);
    clearInstantOfferDeadline(id);
    notifySnoozeListeners({ type: "wake_refresh", rideId: id });
  }, waitMs);
  snoozeTimersByRideId.set(id, timer);
}

/** Markt hat bestätigt: Fahrt noch sichtbar → erneut anbieten. */
export function finishInstantOfferWake(rideId: string): void {
  const id = rideId.trim();
  if (!id) return;
  wakeHoldRideIds.delete(id);
  snoozeUntilByRideId.delete(id);
  clearInstantOfferDeadline(id);
  bumpOfferCycle(id);
  notifySnoozeListeners({ type: "end", rideId: id });
}

/** Nicht mehr offen / manuell beendet → Soft-Miss-Schleife beenden. */
export function abandonInstantOfferWake(rideId: string): void {
  const id = rideId.trim();
  if (!id) return;
  const timer = snoozeTimersByRideId.get(id);
  if (timer) clearTimeout(timer);
  snoozeTimersByRideId.delete(id);
  wakeHoldRideIds.delete(id);
  snoozeUntilByRideId.delete(id);
  clearInstantOfferDeadline(id);
  softMissStashByRideId.delete(id);
  notifySnoozeListeners({ type: "clear", rideId: id });
}

export function clearInstantOfferSnooze(rideId: string): void {
  const id = rideId.trim();
  if (!id) return;
  const timer = snoozeTimersByRideId.get(id);
  if (timer) clearTimeout(timer);
  snoozeTimersByRideId.delete(id);
  const wasHeld = wakeHoldRideIds.delete(id);
  const wasSnoozed = snoozeUntilByRideId.delete(id);
  softMissStashByRideId.delete(id);
  if (wasHeld || wasSnoozed) {
    notifySnoozeListeners({ type: "clear", rideId: id });
  }
}
