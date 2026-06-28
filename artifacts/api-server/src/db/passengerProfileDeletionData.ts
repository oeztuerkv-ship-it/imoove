import { eq } from "drizzle-orm";
import { getDb } from "./client";
import { passengerProfilesTable } from "./schema";

export type PassengerProfileRow = {
  passenger_id: string;
  name: string;
  email: string;
  auth_provider: string;
  deleted_at: Date | null;
};

export async function findPassengerProfile(passengerId: string): Promise<PassengerProfileRow | null> {
  const db = getDb();
  if (!db) return null;
  const pid = passengerId.trim();
  if (!pid) return null;
  const rows = await db
    .select({
      passenger_id: passengerProfilesTable.passenger_id,
      name: passengerProfilesTable.name,
      email: passengerProfilesTable.email,
      auth_provider: passengerProfilesTable.auth_provider,
      deleted_at: passengerProfilesTable.deleted_at,
    })
    .from(passengerProfilesTable)
    .where(eq(passengerProfilesTable.passenger_id, pid))
    .limit(1);
  return rows[0] ?? null;
}

export async function isPassengerAccountDeleted(passengerId: string): Promise<boolean> {
  const row = await findPassengerProfile(passengerId);
  return row?.deleted_at != null;
}

export async function assertPassengerMayAuthenticate(
  passengerId: string,
): Promise<{ ok: true } | { ok: false; error: "account_deleted" }> {
  if (await isPassengerAccountDeleted(passengerId)) {
    return { ok: false, error: "account_deleted" };
  }
  return { ok: true };
}
