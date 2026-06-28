import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { findCustomerAccountById } from "../db/customerAccountsData";
import { getDb } from "../db/client";
import { findPassengerProfile } from "../db/passengerProfileDeletionData";
import {
  appHelpTicketsTable,
  customerAccountsTable,
  passengerExpoPushTokensTable,
  passengerProfilesTable,
  ridesTable,
} from "../db/schema";
import { logger } from "./logger";
import {
  clearStripePaymentMethodsForPassenger,
} from "./stripePassengerCustomer";
import { getStripeClient } from "./stripeClient.js";

export const DELETED_CUSTOMER_DISPLAY_NAME = "Gelöschter Nutzer";

export function deletedCustomerEmail(passengerId: string): string {
  return `deleted_${passengerId.trim()}@deleted.onroda.de`;
}

export type AnonymizeCustomerAccountResult =
  | { ok: true; alreadyDeleted: boolean }
  | { ok: false; error: string };

export async function anonymizeCustomerAccount(passengerId: string): Promise<AnonymizeCustomerAccountResult> {
  const pid = passengerId.trim();
  if (!pid) {
    return { ok: false, error: "passenger_id_required" };
  }

  const db = getDb();
  if (!db) {
    return { ok: false, error: "database_not_configured" };
  }

  const existingProfile = await findPassengerProfile(pid);
  if (existingProfile?.deleted_at) {
    return { ok: true, alreadyDeleted: true };
  }

  const account = await findCustomerAccountById(pid);
  const emailBeforeDelete =
    existingProfile?.email?.trim() ||
    account?.email?.trim() ||
    null;
  const anonEmail = deletedCustomerEmail(pid);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .insert(passengerProfilesTable)
      .values({
        passenger_id: pid,
        name: DELETED_CUSTOMER_DISPLAY_NAME,
        email: anonEmail,
        auth_provider: existingProfile?.auth_provider ?? (account ? "email" : "google"),
        deleted_at: now,
        updated_at: now,
        last_seen_at: now,
      })
      .onConflictDoUpdate({
        target: passengerProfilesTable.passenger_id,
        set: {
          name: DELETED_CUSTOMER_DISPLAY_NAME,
          email: anonEmail,
          deleted_at: now,
          updated_at: now,
        },
      });

    if (account) {
      await tx
        .update(customerAccountsTable)
        .set({
          email: anonEmail,
          name: DELETED_CUSTOMER_DISPLAY_NAME,
          password_hash: "DELETED",
          phone: null,
          updated_at: now,
        })
        .where(eq(customerAccountsTable.id, pid));
    }

    await tx
      .update(ridesTable)
      .set({
        customer_name: DELETED_CUSTOMER_DISPLAY_NAME,
        customer_phone: null,
      })
      .where(eq(ridesTable.passenger_id, pid));

    await tx
      .update(appHelpTicketsTable)
      .set({
        passenger_name: DELETED_CUSTOMER_DISPLAY_NAME,
        passenger_email: anonEmail,
        passenger_phone: null,
        updated_at: now,
      })
      .where(eq(appHelpTicketsTable.passenger_id, pid));

    await tx.delete(passengerExpoPushTokensTable).where(eq(passengerExpoPushTokensTable.passenger_id, pid));
  });

  try {
    const stripe = getStripeClient();
    if (stripe) {
      await clearStripePaymentMethodsForPassenger(stripe, pid, emailBeforeDelete);
    }
  } catch (err) {
    logger.warn({ err, passengerId: pid }, "[customer-delete] Stripe cleanup failed — account still anonymized");
  }

  return { ok: true, alreadyDeleted: false };
}
