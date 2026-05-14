import { and, eq } from "drizzle-orm";
import { getDb } from "./client";
import { fleetDriverExpoPushTokensTable } from "./schema";

function isLikelyExponentPushToken(raw: string): boolean {
  const t = raw.trim();
  return t.startsWith("ExponentPushToken[") && t.endsWith("]");
}

export async function upsertFleetDriverExpoPushToken(
  fleetDriverId: string,
  companyId: string,
  expoPushToken: string,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  const did = fleetDriverId.trim();
  const cid = companyId.trim();
  const tok = expoPushToken.trim();
  if (!did || !cid || !tok || !isLikelyExponentPushToken(tok)) return;
  await db
    .insert(fleetDriverExpoPushTokensTable)
    .values({
      expo_push_token: tok,
      fleet_driver_id: did,
      company_id: cid,
      updated_at: new Date(),
    })
    .onConflictDoUpdate({
      target: fleetDriverExpoPushTokensTable.expo_push_token,
      set: { fleet_driver_id: did, company_id: cid, updated_at: new Date() },
    });
}

export async function listFleetDriverExpoPushTokens(fleetDriverId: string, companyId: string): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  const did = fleetDriverId.trim();
  const cid = companyId.trim();
  if (!did || !cid) return [];
  const rows = await db
    .select({ t: fleetDriverExpoPushTokensTable.expo_push_token })
    .from(fleetDriverExpoPushTokensTable)
    .where(and(eq(fleetDriverExpoPushTokensTable.fleet_driver_id, did), eq(fleetDriverExpoPushTokensTable.company_id, cid)));
  return rows.map((r) => r.t).filter((t) => typeof t === "string" && t.length > 0);
}
