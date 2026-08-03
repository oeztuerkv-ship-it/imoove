import { and, eq } from "drizzle-orm";
import { getDb } from "./client";
import { fleetDriverExpoPushTokensTable, passengerExpoPushTokensTable } from "./schema";

function isLikelyExponentPushToken(raw: string): boolean {
  const t = raw.trim();
  return t.startsWith("ExponentPushToken[") && t.endsWith("]");
}

/** Ein Gerät = ein Push-Ziel: Fahrer-Registrierung entfernt Kunden-Zuordnung desselben Tokens. */
export async function deletePassengerExpoPushTokenByToken(expoPushToken: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const tok = expoPushToken.trim();
  if (!tok || !isLikelyExponentPushToken(tok)) return;
  await db.delete(passengerExpoPushTokensTable).where(eq(passengerExpoPushTokensTable.expo_push_token, tok));
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
  await deletePassengerExpoPushTokenByToken(tok);
  // Nur das aktuelle Gerät: alle anderen Tokens dieses Fahrers entfernen.
  await db
    .delete(fleetDriverExpoPushTokensTable)
    .where(
      and(
        eq(fleetDriverExpoPushTokensTable.fleet_driver_id, did),
        eq(fleetDriverExpoPushTokensTable.company_id, cid),
      ),
    );
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

export async function listAllFleetDriverExpoPushTokens(): Promise<
  Array<{ token: string; fleetDriverId: string; companyId: string }>
> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      token: fleetDriverExpoPushTokensTable.expo_push_token,
      fleetDriverId: fleetDriverExpoPushTokensTable.fleet_driver_id,
      companyId: fleetDriverExpoPushTokensTable.company_id,
    })
    .from(fleetDriverExpoPushTokensTable);
  return rows
    .map((r) => ({
      token: r.token,
      fleetDriverId: r.fleetDriverId,
      companyId: r.companyId,
    }))
    .filter((r) => r.token && isLikelyExponentPushToken(r.token));
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

/** Fallback wenn company_id auf der Fahrt fehlt oder Token unter anderem Mandanten liegt. */
export async function listFleetDriverExpoPushTokensByDriverId(fleetDriverId: string): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  const did = fleetDriverId.trim();
  if (!did) return [];
  const rows = await db
    .select({ t: fleetDriverExpoPushTokensTable.expo_push_token })
    .from(fleetDriverExpoPushTokensTable)
    .where(eq(fleetDriverExpoPushTokensTable.fleet_driver_id, did));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const t = typeof r.t === "string" ? r.t.trim() : "";
    if (!t || seen.has(t) || !isLikelyExponentPushToken(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Logout / Abmelden: keine Fahrer-Pushes mehr an dieses Konto. */
export async function deleteFleetDriverExpoPushTokens(
  fleetDriverId: string,
  companyId: string,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  const did = fleetDriverId.trim();
  const cid = companyId.trim();
  if (!did || !cid) return;
  await db
    .delete(fleetDriverExpoPushTokensTable)
    .where(and(eq(fleetDriverExpoPushTokensTable.fleet_driver_id, did), eq(fleetDriverExpoPushTokensTable.company_id, cid)));
}
