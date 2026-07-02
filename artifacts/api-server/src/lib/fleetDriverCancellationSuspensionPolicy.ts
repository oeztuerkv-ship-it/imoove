import {
  countFleetDriverPostAcceptCancellationsInWindow,
  FLEET_DRIVER_CANCELLATION_SUSPENSION_HOURS,
  FLEET_DRIVER_CANCELLATION_SUSPENSION_MESSAGE_DE,
  FLEET_DRIVER_CANCELLATION_THRESHOLD,
  FLEET_DRIVER_CANCELLATION_WINDOW_DAYS,
  findActiveFleetDriverCancellationSuspension,
  upsertFleetDriverCancellationSuspension,
} from "../db/fleetDriverCancellationSuspensionData";
import { setFleetDriverMarketOnline } from "../db/fleetDriversData";

export {
  FLEET_DRIVER_CANCELLATION_THRESHOLD,
  FLEET_DRIVER_CANCELLATION_WINDOW_DAYS,
  FLEET_DRIVER_CANCELLATION_SUSPENSION_HOURS,
  FLEET_DRIVER_CANCELLATION_SUSPENSION_MESSAGE_DE,
};

/** Status nach Annahme — Storno zählt für Soft- und Hard-Cancel gleich. */
export const FLEET_DRIVER_POST_ACCEPT_STATUSES = new Set([
  "accepted",
  "driver_arriving",
  "driver_waiting",
  "in_progress",
  "passenger_onboard",
  "arrived",
  "ready_for_dispatch",
  "scheduled_assigned",
]);

export function rideQualifiesAsDriverPostAcceptCancel(
  ride: { status: string; driverId?: string | null },
  driverId: string,
): boolean {
  const did = driverId.trim();
  if (!did || (ride.driverId ?? "").trim() !== did) return false;
  return FLEET_DRIVER_POST_ACCEPT_STATUSES.has(ride.status);
}

export function formatFleetDriverCancellationSuspensionUntil(until: Date): string {
  return until.toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildFleetDriverCancellationSuspensionMessage(until: Date): string {
  return `${FLEET_DRIVER_CANCELLATION_SUSPENSION_MESSAGE_DE} Gesperrt bis ${formatFleetDriverCancellationSuspensionUntil(until)}.`;
}

export async function evaluateFleetDriverCancellationSuspensionAfterCancel(input: {
  fleetDriverId: string;
  companyId: string;
}): Promise<{ suspended: boolean; cancellationsInWindow: number }> {
  const did = input.fleetDriverId.trim();
  const cid = input.companyId.trim();
  if (!did || !cid) return { suspended: false, cancellationsInWindow: 0 };

  const cancellationsInWindow = await countFleetDriverPostAcceptCancellationsInWindow(did, cid);
  if (cancellationsInWindow < FLEET_DRIVER_CANCELLATION_THRESHOLD) {
    return { suspended: false, cancellationsInWindow };
  }

  const until = new Date(Date.now() + FLEET_DRIVER_CANCELLATION_SUSPENSION_HOURS * 60 * 60 * 1000);
  await upsertFleetDriverCancellationSuspension({
    fleetDriverId: did,
    companyId: cid,
    suspendedUntil: until,
  });
  await setFleetDriverMarketOnline(did, cid, false).catch(() => undefined);

  return { suspended: true, cancellationsInWindow };
}
