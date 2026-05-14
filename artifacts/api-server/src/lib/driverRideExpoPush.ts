import { listFleetDriverExpoPushTokens } from "../db/fleetDriverExpoPushData";
import { sendExpoPushMessages } from "./expoPushGateway";

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
