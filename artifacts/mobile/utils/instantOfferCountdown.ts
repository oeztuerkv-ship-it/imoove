/** Countdown-Ende pro Sofortauftrag — überlebt Offline/Remount (kein Reset auf 10). */
const deadlineByRideId = new Map<string, number>();

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
