import {
  countPassengerCancellationsInLast24Hours,
  customerCancelCountsTowardSuspension,
  findActiveCustomerCancellationSuspension,
  upsertCustomerCancellationSuspension,
} from "../db/customerCancellationSuspensionData";
import { findPassengerProfile } from "../db/passengerProfileDeletionData";
import { findActiveCustomerPaymentSuspension } from "../db/customerPaymentSuspensionData";
import { notifyPassengerCancellationSuspended } from "./passengerRideExpoPush";
import {
  CUSTOMER_PAYMENT_SUSPENSION_ERROR,
  CUSTOMER_PAYMENT_SUSPENSION_MESSAGE_DE,
} from "./ridePaymentRecoveryPolicy";

export const CUSTOMER_CANCELLATION_SUSPENSION_ERROR = "customer_cancellation_suspended";
export const CUSTOMER_CANCELLATION_SUSPENSION_MESSAGE_DE =
  "Ihr Konto ist wegen zu vieler Stornierungen vorläufig gesperrt.";

export const CUSTOMER_CANCELLATION_THRESHOLD = 4;
export const CUSTOMER_CANCELLATION_WINDOW_HOURS = 24;
export const CUSTOMER_CANCELLATION_SUSPENSION_HOURS = 24;

export { customerCancelCountsTowardSuspension };

/** Team-Testkonten: keine automatische Storno-Sperre (kommagetrennt, lowercase). */
function customerCancellationSuspensionBypassEmails(): Set<string> {
  const raw =
    process.env.CUSTOMER_CANCELLATION_SUSPENSION_BYPASS_EMAILS ?? "onroda2026@gmail.com";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function isCustomerCancellationSuspensionBypassed(passengerId: string): Promise<boolean> {
  const allow = customerCancellationSuspensionBypassEmails();
  if (allow.size === 0) return false;
  const profile = await findPassengerProfile(passengerId);
  const email = profile?.email?.trim().toLowerCase() ?? "";
  return Boolean(email && allow.has(email));
}

export type PassengerBookingGateResult =
  | { ok: true }
  | { ok: false; error: string; message: string };

export async function assertPassengerCanBook(passengerId: string): Promise<PassengerBookingGateResult> {
  const pax = passengerId.trim();
  if (!pax) {
    return { ok: false, error: "unauthorized", message: "Bitte anmelden, um eine Fahrt zu buchen." };
  }

  const paymentSuspension = await findActiveCustomerPaymentSuspension(pax);
  if (paymentSuspension) {
    return {
      ok: false,
      error: CUSTOMER_PAYMENT_SUSPENSION_ERROR,
      message: CUSTOMER_PAYMENT_SUSPENSION_MESSAGE_DE,
    };
  }

  const cancellationSuspension = await findActiveCustomerCancellationSuspension(pax);
  if (cancellationSuspension) {
    if (await isCustomerCancellationSuspensionBypassed(pax)) {
      return { ok: true };
    }
    return {
      ok: false,
      error: CUSTOMER_CANCELLATION_SUSPENSION_ERROR,
      message: CUSTOMER_CANCELLATION_SUSPENSION_MESSAGE_DE,
    };
  }

  return { ok: true };
}

/**
 * Nach Kunden-Storno: bei ≥4 sperr-relevanten Stornos in 24h → 24h Sperre.
 * Sperr-relevant = Storno erst nach Fahrer-Annahme (accepted…in_progress), nicht während Suche.
 */
export async function evaluateCustomerCancellationSuspensionAfterCancel(
  passengerId: string,
  fromStatus?: string | null,
): Promise<void> {
  const pax = passengerId.trim();
  if (!pax) return;
  if (fromStatus != null && !customerCancelCountsTowardSuspension(fromStatus)) return;
  if (await isCustomerCancellationSuspensionBypassed(pax)) return;

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
