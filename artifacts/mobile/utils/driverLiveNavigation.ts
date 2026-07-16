/** Aktive Fahrer-Navi (navigation.tsx) — für Storno-Erkennung ohne WS-Race mit Kunden-/status. */

let activeNavigationRideId: string | null = null;

type CancelListener = (rideId: string, cancelReason: string | null) => void;
const cancelListeners = new Set<CancelListener>();

type DestinationChangedListener = (
  rideId: string,
  destination: { toFull: string; toLat: number; toLon: number },
) => void;
const destinationChangedListeners = new Set<DestinationChangedListener>();

export function setDriverLiveNavigationRideId(rideId: string | null): void {
  const id = typeof rideId === "string" ? rideId.trim() : "";
  activeNavigationRideId = id.length > 0 ? id : null;
}

export function getDriverLiveNavigationRideId(): string | null {
  return activeNavigationRideId;
}

export function subscribeDriverRideCancelledByCustomer(listener: CancelListener): () => void {
  cancelListeners.add(listener);
  return () => {
    cancelListeners.delete(listener);
  };
}

export function notifyDriverRideCancelledByCustomer(rideId: string, cancelReason?: string | null): void {
  const id = rideId.trim();
  if (!id) return;
  const reason = typeof cancelReason === "string" ? cancelReason.trim() : null;
  cancelListeners.forEach((cb) => {
    try {
      cb(id, reason && reason.length > 0 ? reason : null);
    } catch {
      /* ignore */
    }
  });
}

export function subscribeDriverDestinationChanged(listener: DestinationChangedListener): () => void {
  destinationChangedListeners.add(listener);
  return () => {
    destinationChangedListeners.delete(listener);
  };
}

export function notifyDriverDestinationChanged(
  rideId: string,
  destination: { toFull: string; toLat: number; toLon: number },
): void {
  const id = rideId.trim();
  if (!id) return;
  if (!Number.isFinite(destination.toLat) || !Number.isFinite(destination.toLon)) return;
  const toFull = destination.toFull.trim() || "Neues Ziel";
  destinationChangedListeners.forEach((cb) => {
    try {
      cb(id, { toFull, toLat: destination.toLat, toLon: destination.toLon });
    } catch {
      /* ignore */
    }
  });
}
