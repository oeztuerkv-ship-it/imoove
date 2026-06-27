import { eq } from "drizzle-orm";
import { getDb } from "./client";
import { customerAccountsTable, passengerProfilesTable } from "./schema";

export type PassengerLegalConsentRow = {
  passengerId: string;
  termsAcceptedAt: Date | null;
  privacyAcceptedAt: Date | null;
  termsVersion: string;
  privacyVersion: string;
};

export function passengerHasLegalConsent(row: {
  termsAcceptedAt: Date | null;
  privacyAcceptedAt: Date | null;
}): boolean {
  return row.termsAcceptedAt != null && row.privacyAcceptedAt != null;
}

export async function getPassengerLegalConsent(
  passengerId: string,
): Promise<PassengerLegalConsentRow | null> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  const id = passengerId.trim();
  if (!id) return null;
  const rows = await db
    .select({
      passenger_id: passengerProfilesTable.passenger_id,
      terms_accepted_at: passengerProfilesTable.terms_accepted_at,
      privacy_accepted_at: passengerProfilesTable.privacy_accepted_at,
      terms_version: passengerProfilesTable.terms_version,
      privacy_version: passengerProfilesTable.privacy_version,
    })
    .from(passengerProfilesTable)
    .where(eq(passengerProfilesTable.passenger_id, id))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    passengerId: r.passenger_id,
    termsAcceptedAt: r.terms_accepted_at,
    privacyAcceptedAt: r.privacy_accepted_at,
    termsVersion: r.terms_version,
    privacyVersion: r.privacy_version,
  };
}

export async function recordPassengerLegalConsent(input: {
  passengerId: string;
  termsVersion: string;
  privacyVersion: string;
}): Promise<boolean> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");
  const passengerId = input.passengerId.trim();
  if (!passengerId) return false;
  const termsVersion = input.termsVersion.trim();
  const privacyVersion = input.privacyVersion.trim();
  if (!termsVersion || !privacyVersion) return false;

  const existing = await getPassengerLegalConsent(passengerId);
  if (existing && passengerHasLegalConsent(existing)) {
    return true;
  }

  const now = new Date();
  if (existing) {
    await db
      .update(passengerProfilesTable)
      .set({
        terms_accepted_at: now,
        privacy_accepted_at: now,
        terms_version: termsVersion,
        privacy_version: privacyVersion,
        updated_at: now,
      })
      .where(eq(passengerProfilesTable.passenger_id, passengerId));
  } else {
    await db.insert(passengerProfilesTable).values({
      passenger_id: passengerId,
      name: "",
      email: "",
      auth_provider: "google",
      first_seen_at: now,
      last_seen_at: now,
      updated_at: now,
      terms_accepted_at: now,
      privacy_accepted_at: now,
      terms_version: termsVersion,
      privacy_version: privacyVersion,
    });
  }

  await syncCustomerAccountLegalConsent(passengerId, termsVersion, privacyVersion, now);
  return true;
}

async function syncCustomerAccountLegalConsent(
  passengerId: string,
  termsVersion: string,
  privacyVersion: string,
  acceptedAt: Date,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .update(customerAccountsTable)
    .set({
      terms_accepted_at: acceptedAt,
      privacy_accepted_at: acceptedAt,
      terms_version: termsVersion,
      privacy_version: privacyVersion,
      updated_at: acceptedAt,
    })
    .where(eq(customerAccountsTable.id, passengerId));
}
