import { listPassengerExpoPushTokens } from "../db/passengerExpoPushData";
import { sendExpoPushMessages } from "./expoPushGateway";

/** Reservierung: Fahrer zugewiesen (scheduled → scheduled_assigned) → Kunde informieren. */
export async function notifyPassengerReservationConfirmed(passengerId: string, rideId: string): Promise<void> {
  const tokens = await listPassengerExpoPushTokens(passengerId);
  if (tokens.length === 0) return;
  await sendExpoPushMessages(
    tokens.map((to) => ({
      to,
      title: "Reservierung",
      body: "Deine Reservierung wurde bestätigt.",
      data: { kind: "reservation_confirmed", rideId },
    })),
  );
}

/** Reservierung: Fahrer hat „Aktivieren“ gedrückt → Kunde informieren. */
export async function notifyPassengerReservationActivated(passengerId: string, rideId: string): Promise<void> {
  const tokens = await listPassengerExpoPushTokens(passengerId);
  if (tokens.length === 0) return;
  await sendExpoPushMessages(
    tokens.map((to) => ({
      to,
      title: "Ihre Fahrt startet",
      body: "Der Fahrer ist unterwegs zu Ihnen. Sie sehen den Live-Standort in der App.",
      data: { kind: "reservation_activated", rideId },
    })),
  );
}

/** Sofortfahrt: Fahrer am Abholort (`driver_waiting`) → Push „Fahrer da“. */
export async function notifyPassengerDriverWaiting(passengerId: string, rideId: string): Promise<void> {
  const tokens = await listPassengerExpoPushTokens(passengerId);
  if (tokens.length === 0) return;
  await sendExpoPushMessages(
    tokens.map((to) => ({
      to,
      title: "Fahrer da",
      body: "Ihr Fahrer ist am Abholort. Bitte zum Fahrzeug kommen.",
      data: { kind: "driver_waiting", rideId },
    })),
  );
}

/** Fahrer hat angenommen → Kunde informieren. */
export async function notifyPassengerDriverAccepted(passengerId: string, rideId: string): Promise<void> {
  const tokens = await listPassengerExpoPushTokens(passengerId);
  if (tokens.length === 0) return;
  await sendExpoPushMessages(
    tokens.map((to) => ({
      to,
      title: "Fahrer gefunden",
      body: "Ein Fahrer hat Ihre Fahrt angenommen. Sie sehen den Standort in der App.",
      data: { kind: "ride_accepted", rideId },
    })),
  );
}

/** Cron/System: keine Fahrerannahme rechtzeitig → Buchung beendet. */
export async function notifyPassengerRideCancelledBySystem(passengerId: string, rideId: string): Promise<void> {
  const tokens = await listPassengerExpoPushTokens(passengerId);
  if (tokens.length === 0) return;
  await sendExpoPushMessages(
    tokens.map((to) => ({
      to,
      title: "Vorbestellung nicht möglich",
      body: "Leider wurde keine Fahrzeugannahme rechtzeitig gefunden. Die Buchung wurde automatisch beendet.",
      data: { kind: "ride_cancelled_by_system", rideId },
    })),
  );
}
