import type { RideRequest } from "../domain/rideRequest";
import { listMarketOnlineDriversEligibleForInstantRide } from "../db/fleetInstantRideMarketData";
import { listFleetDriverExpoPushTokens } from "../db/fleetDriverExpoPushData";
import { isFarFutureReservation } from "./dispatchStatus";
import { sendExpoPushMessages, type ExpoPushMessage } from "./expoPushGateway";

const INSTANT_OFFER_STATUSES = new Set<RideRequest["status"]>([
  "pending",
  "requested",
  "searching_driver",
  "offered",
]);

export async function notifyDriverReservationActivationReminder(
  fleetDriverId: string,
  companyId: string,
  rideId: string,
): Promise<void> {
  const tokens = await listFleetDriverExpoPushTokens(fleetDriverId, companyId);
  if (tokens.length === 0) return;
  await sendExpoPushMessages(
    tokens.map((to) => ({
      to,
      title: "Reservierung",
      body: "Bitte Reservierung aktivieren.",
      data: { kind: "reservation_activate_reminder", rideId },
    })),
  );
}

/** Sofortfahrt im Markt: Push an alle ONLINE + einsatzbereiten Fahrer mit passendem Fahrzeug. */
export async function notifyMarketOnlineDriversInstantRideOffer(ride: RideRequest): Promise<void> {
  if (!INSTANT_OFFER_STATUSES.has(ride.status)) return;
  if (isFarFutureReservation(ride.scheduledAt ?? null)) return;

  const drivers = await listMarketOnlineDriversEligibleForInstantRide(ride);
  if (drivers.length === 0) return;

  const fromLabel = (ride.fromFull || ride.from || "Abholung").trim().slice(0, 80);
  const toLabel = (ride.toFull || ride.to || "Ziel").trim().slice(0, 80);
  const body = `${fromLabel} → ${toLabel}`;

  const messages: ExpoPushMessage[] = [];
  for (const { fleetDriverId, companyId } of drivers) {
    const tokens = await listFleetDriverExpoPushTokens(fleetDriverId, companyId);
    for (const to of tokens) {
      messages.push({
        to,
        title: "Neue Fahrt",
        body,
        sound: "default",
        priority: "high",
        channelId: "ride-offers",
        data: { kind: "instant_ride_offer", rideId: ride.id },
      });
    }
  }
  await sendExpoPushMessages(messages);
}

/** Nach Fahrtabschluss: nächster Auftrag in der Nähe (nur dieser Fahrer). */
export async function notifyDriverFollowUpOffer(
  fleetDriverId: string,
  companyId: string,
  ride: RideRequest,
  distanceKm: number,
): Promise<void> {
  const tokens = await listFleetDriverExpoPushTokens(fleetDriverId, companyId);
  if (tokens.length === 0) return;
  const fromLabel = (ride.fromFull || ride.from || "Abholung").trim().slice(0, 60);
  const distLabel =
    distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`;
  await sendExpoPushMessages(
    tokens.map((to) => ({
      to,
      title: "Nächste Fahrt in der Nähe",
      body: `${distLabel} entfernt · ${fromLabel}`,
      sound: "default",
      priority: "high",
      channelId: "ride-offers",
      data: { kind: "follow_up_offer", rideId: ride.id, distanceKm },
    })),
  );
}

export async function notifyDriverMissedActivationReservation(
  fleetDriverId: string,
  companyId: string,
  rideId: string,
): Promise<void> {
  const tokens = await listFleetDriverExpoPushTokens(fleetDriverId, companyId);
  if (tokens.length === 0) return;
  await sendExpoPushMessages(
    tokens.map((to) => ({
      to,
      title: "Reservierung",
      body: "Reservierung verpasst – Sperre aktiv.",
      data: { kind: "reservation_missed_activation", rideId },
    })),
  );
}
