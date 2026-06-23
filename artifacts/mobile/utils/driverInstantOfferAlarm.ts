import { shouldPresentDriverRideOfferNotification } from "@/utils/notificationAudience";
import { sendNewRideNotification } from "@/utils/notifications";

const RING_DEDUPE_MS = 50_000;
const lastRingAtByRideId = new Map<string, number>();

export type DriverInstantOfferAlarmOpts = {
  rideId: string;
  customerName?: string;
  fromAddress?: string;
  distanceKm?: number | null;
  estimatedFare?: number;
};

/** Einheitlicher Alarm für Sofortauftrag — Push und Poll teilen sich dieselbe Klingel-Logik. */
export async function ringForDriverInstantOffer(opts: DriverInstantOfferAlarmOpts): Promise<void> {
  if (!shouldPresentDriverRideOfferNotification()) return;
  const id = opts.rideId.trim();
  const now = Date.now();
  if (id) {
    const last = lastRingAtByRideId.get(id);
    if (last != null && now - last < RING_DEDUPE_MS) return;
    lastRingAtByRideId.set(id, now);
  }
  await sendNewRideNotification({
    customerName: opts.customerName?.trim() || "Kunde",
    fromAddress: opts.fromAddress?.trim() || "—",
    distanceKm: opts.distanceKm ?? null,
    estimatedFare: Number.isFinite(opts.estimatedFare) ? (opts.estimatedFare as number) : 0,
  });
}

export function clearDriverInstantOfferAlarmDedupe(rideId?: string): void {
  const id = rideId?.trim();
  if (!id) {
    lastRingAtByRideId.clear();
    return;
  }
  lastRingAtByRideId.delete(id);
}
