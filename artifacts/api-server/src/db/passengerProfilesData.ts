import { eq, sql } from "drizzle-orm";
import { getDb } from "./client";
import { findPassengerProfile } from "./passengerProfileDeletionData";
import { passengerProfilesTable } from "./schema";
import { recordPassengerLegalConsent } from "./customerLegalConsentData";

export type PassengerAuthProvider = "email" | "google" | "apple";

export function inferPassengerAuthProvider(passengerId: string): PassengerAuthProvider {
  const id = passengerId.trim();
  if (id.startsWith("apple:")) return "apple";
  return "google";
}

export async function upsertPassengerProfile(input: {
  passengerId: string;
  name?: string;
  email?: string;
  authProvider: PassengerAuthProvider;
  /**
   * OAuth (Apple/Google): nach DSGVO-Löschung erneut anmelden erlauben.
   * Cleared `deleted_at` und überschreibt anonymisierte Name/E-Mail — alte Ride-Daten bleiben anonym.
   * Ohne Flag: gelöschte Profile unverändert (kein stilles Reaktivieren aus Nebenpfaden).
   */
  reactivateIfDeleted?: boolean;
}): Promise<{ reactivated: boolean }> {
  const db = getDb();
  if (!db) return { reactivated: false };
  const passengerId = input.passengerId.trim();
  if (!passengerId) return { reactivated: false };
  const existing = await findPassengerProfile(passengerId);
  const now = new Date();
  const name = (input.name ?? "").trim().slice(0, 200);
  const email = (input.email ?? "").trim().slice(0, 254);
  const authProvider = input.authProvider;

  if (existing?.deleted_at) {
    if (!input.reactivateIfDeleted) return { reactivated: false };
    // Kein COALESCE mit „Gelöschter Nutzer“ / deleted_*@ — Apple liefert Name/E-Mail oft nur beim Erstlogin.
    await db
      .update(passengerProfilesTable)
      .set({
        deleted_at: null,
        name,
        email,
        auth_provider: authProvider,
        last_seen_at: now,
        updated_at: now,
      })
      .where(eq(passengerProfilesTable.passenger_id, passengerId));

    const { ensurePassengerRideVerifyPin } = await import("../lib/customerRideVerifyPin");
    void ensurePassengerRideVerifyPin(passengerId);
    return { reactivated: true };
  }

  await db
    .insert(passengerProfilesTable)
    .values({
      passenger_id: passengerId,
      name,
      email,
      auth_provider: authProvider,
      first_seen_at: now,
      last_seen_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: passengerProfilesTable.passenger_id,
      set: {
        name: sql`COALESCE(NULLIF(excluded.name, ''), ${passengerProfilesTable.name})`,
        email: sql`COALESCE(NULLIF(excluded.email, ''), ${passengerProfilesTable.email})`,
        auth_provider: authProvider,
        last_seen_at: now,
        updated_at: now,
      },
    });

  // Jeder App-Kunde hat immer einen Abhol-PIN (Auto-Vergabe falls fehlend).
  const { ensurePassengerRideVerifyPin } = await import("../lib/customerRideVerifyPin");
  void ensurePassengerRideVerifyPin(passengerId);
  return { reactivated: false };
}

export async function touchPassengerProfileFromEmailAccount(input: {
  passengerId: string;
  name: string;
  email: string;
  legalConsent?: { termsVersion: string; privacyVersion: string; acceptedAt: Date };
}): Promise<void> {
  await upsertPassengerProfile({
    passengerId: input.passengerId,
    name: input.name,
    email: input.email,
    authProvider: "email",
  });
  if (input.legalConsent) {
    await recordPassengerLegalConsent({
      passengerId: input.passengerId,
      termsVersion: input.legalConsent.termsVersion,
      privacyVersion: input.legalConsent.privacyVersion,
    });
  }
}
