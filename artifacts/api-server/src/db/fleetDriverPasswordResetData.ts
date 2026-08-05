import { and, eq, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb, isPostgresConfigured } from "./client";
import { fleetDriverPasswordResetsTable } from "./schema";

export type FleetDriverPasswordResetRow = {
  id: string;
  fleetDriverId: string;
  companyId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

function mapRow(r: {
  id: string;
  fleetDriverId: string;
  companyId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}): FleetDriverPasswordResetRow {
  return r;
}

export async function createFleetDriverPasswordResetToken(input: {
  fleetDriverId: string;
  companyId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<FleetDriverPasswordResetRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;

  // Alte offene Codes desselben Fahrers verwerfen.
  await db
    .update(fleetDriverPasswordResetsTable)
    .set({ used_at: new Date() })
    .where(
      and(
        eq(fleetDriverPasswordResetsTable.fleet_driver_id, input.fleetDriverId),
        isNull(fleetDriverPasswordResetsTable.used_at),
      ),
    );

  const rows = await db
    .insert(fleetDriverPasswordResetsTable)
    .values({
      id: randomUUID(),
      fleet_driver_id: input.fleetDriverId,
      company_id: input.companyId,
      token_hash: input.tokenHash,
      expires_at: input.expiresAt,
      created_at: new Date(),
    })
    .returning({
      id: fleetDriverPasswordResetsTable.id,
      fleetDriverId: fleetDriverPasswordResetsTable.fleet_driver_id,
      companyId: fleetDriverPasswordResetsTable.company_id,
      tokenHash: fleetDriverPasswordResetsTable.token_hash,
      expiresAt: fleetDriverPasswordResetsTable.expires_at,
      usedAt: fleetDriverPasswordResetsTable.used_at,
      createdAt: fleetDriverPasswordResetsTable.created_at,
    });
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findOpenFleetDriverPasswordResetByHash(
  tokenHash: string,
): Promise<FleetDriverPasswordResetRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({
      id: fleetDriverPasswordResetsTable.id,
      fleetDriverId: fleetDriverPasswordResetsTable.fleet_driver_id,
      companyId: fleetDriverPasswordResetsTable.company_id,
      tokenHash: fleetDriverPasswordResetsTable.token_hash,
      expiresAt: fleetDriverPasswordResetsTable.expires_at,
      usedAt: fleetDriverPasswordResetsTable.used_at,
      createdAt: fleetDriverPasswordResetsTable.created_at,
    })
    .from(fleetDriverPasswordResetsTable)
    .where(
      and(
        eq(fleetDriverPasswordResetsTable.token_hash, tokenHash),
        isNull(fleetDriverPasswordResetsTable.used_at),
        sql`${fleetDriverPasswordResetsTable.expires_at} > now()`,
      ),
    )
    .limit(1);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function markFleetDriverPasswordResetUsed(id: string): Promise<boolean> {
  if (!isPostgresConfigured()) return false;
  const db = getDb();
  if (!db) return false;
  const rows = await db
    .update(fleetDriverPasswordResetsTable)
    .set({ used_at: new Date() })
    .where(and(eq(fleetDriverPasswordResetsTable.id, id), isNull(fleetDriverPasswordResetsTable.used_at)))
    .returning({ id: fleetDriverPasswordResetsTable.id });
  return rows.length > 0;
}
