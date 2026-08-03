import type { RideRequest } from "../domain/rideRequest";
import {
  listDriversEligibleForScheduledPoolOffer,
  listMarketOnlineDriversEligibleForInstantRide,
} from "../db/fleetInstantRideMarketData";
import {
  listFleetDriverExpoPushTokens,
  listFleetDriverExpoPushTokensByDriverId,
} from "../db/fleetDriverExpoPushData";
import { findFleetDriverAuthRow, getFleetDriverMarketOnline } from "../db/fleetDriversData";
import { isFarFutureReservation } from "./dispatchStatus";
import { logger } from "./logger";
import { sendExpoPushMessages, type ExpoPushMessage } from "./expoPushGateway";

/** Muss zu gebündeltem Sound in Mobile `app.json` → expo-notifications `sounds` passen. */
export const DRIVER_RIDE_OFFER_PUSH_SOUND = "ride_alert";
export const DRIVER_RIDE_OFFER_CHANNEL_ID = "ride-offers-v2";

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

  const { recordDispatchOffersSentForDriver } = await import("../db/rideDispatchOfferData.js");
  const messages: ExpoPushMessage[] = [];
  for (const { fleetDriverId, companyId } of drivers) {
    const marketOnline = await getFleetDriverMarketOnline(fleetDriverId, companyId);
    if (!marketOnline) continue;
    void recordDispatchOffersSentForDriver(fleetDriverId, companyId, [ride.id]);
    const tokens = await listFleetDriverExpoPushTokens(fleetDriverId, companyId);
    for (const to of tokens) {
      messages.push({
        to,
        title: "Neue Anfrage",
        body: "\u200B",
        sound: DRIVER_RIDE_OFFER_PUSH_SOUND,
        priority: "high",
        channelId: DRIVER_RIDE_OFFER_CHANNEL_ID,
        data: { kind: "instant_ride_offer", rideId: ride.id },
      });
    }
  }
  await sendExpoPushMessages(messages);
}

/** Neue Reservierung im Planer-Pool: Push an alle einsatzbereiten Fahrer (auch Markt-OFFLINE). */
export async function notifyEligibleDriversScheduledPoolOffer(ride: RideRequest): Promise<void> {
  if (ride.status !== "scheduled" || ride.driverId) return;
  if (!isFarFutureReservation(ride.scheduledAt ?? null)) return;

  const drivers = await listDriversEligibleForScheduledPoolOffer(ride);
  if (drivers.length === 0) return;

  const { recordDispatchOffersSentForDriver } = await import("../db/rideDispatchOfferData.js");
  const fromLabel = (ride.fromFull || ride.from || "Abholung").trim().slice(0, 48);
  const messages: ExpoPushMessage[] = [];
  for (const { fleetDriverId, companyId } of drivers) {
    void recordDispatchOffersSentForDriver(fleetDriverId, companyId, [ride.id]);
    const tokens = await listFleetDriverExpoPushTokens(fleetDriverId, companyId);
    for (const to of tokens) {
      messages.push({
        to,
        title: "Neue Reservierung",
        body: fromLabel,
        sound: DRIVER_RIDE_OFFER_PUSH_SOUND,
        priority: "high",
        channelId: DRIVER_RIDE_OFFER_CHANNEL_ID,
        data: { kind: "scheduled_pool_offer", rideId: ride.id },
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
      sound: DRIVER_RIDE_OFFER_PUSH_SOUND,
      priority: "high",
      channelId: DRIVER_RIDE_OFFER_CHANNEL_ID,
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

/** Zugewiesener Fahrer: Kunde hat nach Annahme storniert (Navi beenden). */
export async function notifyDriverRideCancelledByCustomer(
  fleetDriverId: string,
  companyId: string,
  rideId: string,
): Promise<void> {
  const tokens = await listFleetDriverExpoPushTokens(fleetDriverId, companyId);
  if (tokens.length === 0) return;
  await sendExpoPushMessages(
    tokens.map((to) => ({
      to,
      title: "Fahrt storniert",
      body: "Der Kunde hat die Fahrt storniert.",
      priority: "high",
      data: { kind: "ride_cancelled_by_customer", rideId },
    })),
  );
}

/**
 * Kunde brach eine laufende Fahrt ab — Fahrer muss Taxameter-Endpreis eingeben (Navi bleibt offen).
 * Loggt immer (auch bei 0 Tokens), damit pm2-grep „expo-push“ / „mid-trip-abort“ greift.
 */
export async function notifyDriverRideAbortedAwaitingFare(
  fleetDriverId: string,
  companyId: string,
  rideId: string,
): Promise<void> {
  const did = fleetDriverId.trim();
  const cid = companyId.trim();
  const rid = rideId.trim();
  if (!did || !rid) {
    logger.warn({ fleetDriverId: did, companyId: cid, rideId: rid }, "[expo-push] mid-trip-abort skipped: missing driver or ride");
    return;
  }

  let tokens = cid ? await listFleetDriverExpoPushTokens(did, cid) : [];
  let tokenSource: "company" | "driver_fallback" = "company";
  if (tokens.length === 0) {
    tokens = await listFleetDriverExpoPushTokensByDriverId(did);
    tokenSource = "driver_fallback";
  }

  if (tokens.length === 0) {
    logger.warn(
      { fleetDriverId: did, companyId: cid || null, rideId: rid, tokenSource },
      "[expo-push] mid-trip-abort skipped: no expo tokens for driver",
    );
    return;
  }

  logger.info(
    { fleetDriverId: did, companyId: cid || null, rideId: rid, tokenCount: tokens.length, tokenSource },
    "[expo-push] mid-trip-abort sending ride_aborted_awaiting_fare",
  );
  await sendExpoPushMessages(
    tokens.map((to) => ({
      to,
      title: "Kunde hat abgebrochen",
      body: "Bitte den Betrag vom Taxameter eingeben.",
      priority: "high",
      data: { kind: "ride_aborted_awaiting_fare", rideId: rid },
    })),
  );
  logger.info({ fleetDriverId: did, rideId: rid, tokenCount: tokens.length }, "[expo-push] mid-trip-abort send invoked");
}

/** company_id von der Fahrt oder aus fleet_drivers auflösen, dann Push. */
export async function notifyAssignedDriverRideAbortedAwaitingFare(
  ride: Pick<RideRequest, "id" | "driverId" | "companyId">,
): Promise<void> {
  const rideId = String(ride.id ?? "").trim();
  const fleetDriverId = (ride.driverId ?? "").trim();
  if (!rideId || !fleetDriverId) {
    logger.warn({ rideId, fleetDriverId }, "[expo-push] mid-trip-abort skip: ride has no assigned driver");
    return;
  }
  let companyId = (ride.companyId ?? "").trim();
  if (!companyId) {
    try {
      const row = await findFleetDriverAuthRow(fleetDriverId);
      companyId = (row?.company_id ?? "").trim();
    } catch (err) {
      logger.warn({ err, fleetDriverId, rideId }, "[expo-push] mid-trip-abort company resolve failed");
    }
  }
  await notifyDriverRideAbortedAwaitingFare(fleetDriverId, companyId, rideId);
}

/** Zugewiesener Fahrer: Kunde hat das Ziel während der aktiven Fahrt geändert. */
export async function notifyDriverDestinationChanged(
  fleetDriverId: string,
  companyId: string,
  rideId: string,
  destination: { toFull: string; toLat: number; toLon: number },
): Promise<void> {
  const tokens = await listFleetDriverExpoPushTokens(fleetDriverId, companyId);
  if (tokens.length === 0) return;
  const label = destination.toFull.trim().slice(0, 100) || "Neues Ziel";
  await sendExpoPushMessages(
    tokens.map((to) => ({
      to,
      title: "Achtung: Ziel wurde geändert",
      body: label,
      priority: "high",
      data: {
        kind: "ride_destination_changed" as const,
        rideId: String(rideId),
        toFull: label,
        toLat: destination.toLat,
        toLon: destination.toLon,
      },
    })),
  );
}
