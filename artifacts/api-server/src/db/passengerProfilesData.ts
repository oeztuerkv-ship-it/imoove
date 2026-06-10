import { sql } from "drizzle-orm";
import { getDb } from "./client";
import { passengerProfilesTable } from "./schema";

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
}): Promise<void> {
  const db = getDb();
  if (!db) return;
  const passengerId = input.passengerId.trim();
  if (!passengerId) return;
  const now = new Date();
  const name = (input.name ?? "").trim().slice(0, 200);
  const email = (input.email ?? "").trim().slice(0, 254);
  const authProvider = input.authProvider;

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
}

export async function touchPassengerProfileFromEmailAccount(input: {
  passengerId: string;
  name: string;
  email: string;
}): Promise<void> {
  await upsertPassengerProfile({
    passengerId: input.passengerId,
    name: input.name,
    email: input.email,
    authProvider: "email",
  });
}
