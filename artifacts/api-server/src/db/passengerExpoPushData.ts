import { eq } from "drizzle-orm";
import { getDb } from "./client";
import { passengerExpoPushTokensTable } from "./schema";

function isLikelyExponentPushToken(raw: string): boolean {
  const t = raw.trim();
  return t.startsWith("ExponentPushToken[") && t.endsWith("]");
}

export async function upsertPassengerExpoPushToken(passengerId: string, expoPushToken: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const pid = passengerId.trim();
  const tok = expoPushToken.trim();
  if (!pid || !tok || !isLikelyExponentPushToken(tok)) return;
  await db
    .insert(passengerExpoPushTokensTable)
    .values({
      expo_push_token: tok,
      passenger_id: pid,
      updated_at: new Date(),
    })
    .onConflictDoUpdate({
      target: passengerExpoPushTokensTable.expo_push_token,
      set: { passenger_id: pid, updated_at: new Date() },
    });
}

export async function listPassengerExpoPushTokens(passengerId: string): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  const pid = passengerId.trim();
  if (!pid) return [];
  const rows = await db
    .select({ t: passengerExpoPushTokensTable.expo_push_token })
    .from(passengerExpoPushTokensTable)
    .where(eq(passengerExpoPushTokensTable.passenger_id, pid));
  return rows.map((r) => r.t).filter((t) => typeof t === "string" && t.length > 0);
}
