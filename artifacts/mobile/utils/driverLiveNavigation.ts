/** Aktive Fahrer-Navi (navigation.tsx) — für Storno-Erkennung ohne WS-Race mit Kunden-/status. */

let activeNavigationRideId: string | null = null;

type CancelListener = (rideId: string, cancelReason: string | null) => void;
const cancelListeners = new Set<CancelListener>();

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
