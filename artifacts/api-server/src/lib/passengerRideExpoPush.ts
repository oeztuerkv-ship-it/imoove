import { listPassengerExpoPushTokens } from "../db/passengerExpoPushData";
import { CUSTOMER_CANCELLATION_SUSPENSION_MESSAGE_DE } from "./customerCancellationSuspensionPolicy";
import { sendCustomerCancellationSuspensionEmail } from "./customerSuspensionMail";
import { sendExpoPushMessages } from "./expoPushGateway";

/** Reservierung: Fahrer zugewiesen (scheduled → scheduled_assigned) → Kunde informieren. */
export async function notifyPassengerReservationConfirmed(passengerId: string, rideId: string): Promise<void> {
  const tokens = await listPassengerExpoPushTokens(passengerId);
  if (tokens.length === 0) return;
  await sendExpoPushMessages(
    tokens.map((to) => ({
      to,
      title: "Fahrer zugewiesen",
      body: "Ein Fahrer wurde Ihrer Reservierung zugewiesen. Details in der App.",
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

/** Fahrer unterwegs zum Abholort (`driver_arriving`) → Kunde informieren. */
export async function notifyPassengerDriverArriving(passengerId: string, rideId: string): Promise<void> {
  const tokens = await listPassengerExpoPushTokens(passengerId);
  if (tokens.length === 0) return;
  await sendExpoPushMessages(
    tokens.map((to) => ({
      to,
      title: "Fahrer unterwegs",
      body: "Ihr Fahrer ist auf dem Weg zu Ihnen. Bitte bereithalten.",
      data: { kind: "driver_arriving", rideId },
    })),
  );
}
/** Fahrt gestartet (`in_progress`) → Kunde informieren. */
export async function notifyPassengerRideInProgress(passengerId: string, rideId: string): Promise<void> {
  const tokens = await listPassengerExpoPushTokens(passengerId);
  if (tokens.length === 0) return;
  await sendExpoPushMessages(
    tokens.map((to) => ({
      to,
      title: "Fahrt läuft",
      body: "Ihre Fahrt hat begonnen. Sie können den Verlauf in der App verfolgen.",
      data: { kind: "ride_in_progress", rideId },
    })),
  );
}

/** Fahrt abgeschlossen → Quittung in der App. */
export async function notifyPassengerRideCompleted(passengerId: string, rideId: string): Promise<void> {
  const tokens = await listPassengerExpoPushTokens(passengerId);
  if (tokens.length === 0) return;
  await sendExpoPushMessages(
    tokens.map((to) => ({
      to,
      title: "Fahrt beendet",
      body: "Ihre Fahrt ist abgeschlossen. Die Quittung finden Sie in der App.",
      data: { kind: "ride_completed", rideId },
    })),
  );
}

/** Reservierung/Fahrt abgelaufen (`expired`, z. B. Cron). */
export async function notifyPassengerReservationExpired(passengerId: string, rideId: string): Promise<void> {
  const tokens = await listPassengerExpoPushTokens(passengerId);
  if (tokens.length === 0) return;
  await sendExpoPushMessages(
    tokens.map((to) => ({
      to,
      title: "Reservierung abgelaufen",
      body: "Ihre Reservierung ist abgelaufen. Bitte bei Bedarf erneut buchen.",
      data: { kind: "reservation_expired", rideId },
    })),
  );
}

/** Zu viele Kunden-Stornos in 24h → Buchungssperre. */
export async function notifyPassengerCancellationSuspended(passengerId: string): Promise<void> {
  const pax = passengerId.trim();
  if (!pax) return;

  const tokens = await listPassengerExpoPushTokens(pax);
  if (tokens.length > 0) {
    await sendExpoPushMessages(
      tokens.map((to) => ({
        to,
        title: "Konto vorübergehend gesperrt",
        body: CUSTOMER_CANCELLATION_SUSPENSION_MESSAGE_DE,
        data: { kind: "customer_cancellation_suspended" },
      })),
    );
  }

  await sendCustomerCancellationSuspensionEmail(pax);
}

/** Fahrer: Kunde nach Wartezeit nicht erschienen (No-Show). */
export async function notifyPassengerNoShow(passengerId: string, rideId: string): Promise<void> {
  const tokens = await listPassengerExpoPushTokens(passengerId);
  if (tokens.length === 0) return;
  await sendExpoPushMessages(
    tokens.map((to) => ({
      to,
      title: "Fahrer ist abgefahren",
      body: "Der Fahrer hat am Abholort gewartet und ist abgefahren. Es kann eine No-Show-Gebühr anfallen.",
      data: { kind: "ride_no_show", rideId },
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
