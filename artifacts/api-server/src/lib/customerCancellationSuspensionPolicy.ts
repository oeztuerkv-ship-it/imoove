import {
  countPassengerCancellationsInLast24Hours,
  findActiveCustomerCancellationSuspension,
  upsertCustomerCancellationSuspension,
} from "../db/customerCancellationSuspensionData";
import { notifyPassengerCancellationSuspended } from "./passengerRideExpoPush";

export const CUSTOMER_CANCELLATION_SUSPENSION_ERROR = "customer_cancellation_suspended";
export const CUSTOMER_CANCELLATION_SUSPENSION_MESSAGE_DE =
  "Ihr Konto ist wegen zu vieler Stornierungen vorläufig gesperrt.";

export const CUSTOMER_CANCELLATION_THRESHOLD = 4;
export const CUSTOMER_CANCELLATION_WINDOW_HOURS = 24;
export const CUSTOMER_CANCELLATION_SUSPENSION_HOURS = 24;

export type PassengerBookingGateResult =
  | { ok: true }
  | { ok: false; error: string; message: string };

export async function assertPassengerCanBook(passengerId: string): Promise<PassengerBookingGateResult> {
  const pax = passengerId.trim();
  if (!pax) {
    return { ok: false, error: "unauthorized", message: "Bitte anmelden, um eine Fahrt zu buchen." };
  }
  const active = await findActiveCustomerCancellationSuspension(pax);
  if (!active) return { ok: true };
  return {
    ok: false,
    error: CUSTOMER_CANCELLATION_SUSPENSION_ERROR,
    message: CUSTOMER_CANCELLATION_SUSPENSION_MESSAGE_DE,
  };
}

/** Nach Kunden-Storno: bei ≥4 Stornos in 24h → 24h Sperre + Benachrichtigung (einmal pro Sperre). */
export async function evaluateCustomerCancellationSuspensionAfterCancel(passengerId: string): Promise<void> {
  const pax = passengerId.trim();
  if (!pax) return;

  const count = await countPassengerCancellationsInLast24Hours(pax);
  if (count < CUSTOMER_CANCELLATION_THRESHOLD) return;

  const wasSuspended = Boolean(await findActiveCustomerCancellationSuspension(pax));
  const until = new Date(Date.now() + CUSTOMER_CANCELLATION_SUSPENSION_HOURS * 60 * 60 * 1000);
  await upsertCustomerCancellationSuspension({
    passengerId: pax,
    suspendedUntil: until,
  });

  if (!wasSuspended) {
    void notifyPassengerCancellationSuspended(pax).catch(() => undefined);
  }
}
