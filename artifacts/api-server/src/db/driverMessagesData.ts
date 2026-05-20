import { and, desc, eq, isNull, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "./client";
import { driverMessagesTable, fleetDriversTable } from "./schema";

type Row = typeof driverMessagesTable.$inferSelect;

export type DriverMessageDto = {
  id: string;
  title: string;
  body: string;
  targetDriverId: string | null;
  targetDriverLabel: string | null;
  sentAt: string;
  sentBy: string;
};

function rowToDto(r: Row, targetDriverLabel: string | null = null): DriverMessageDto {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    targetDriverId: r.target_driver_id,
    targetDriverLabel,
    sentAt: r.sent_at.toISOString(),
    sentBy: r.sent_by,
  };
}

export async function listDriverMessagesAdmin(limit = 100): Promise<DriverMessageDto[]> {
  const db = getDb();
  if (!db) return [];
  const cap = Math.min(200, Math.max(1, limit));
  const rows = await db
    .select({
      msg: driverMessagesTable,
      firstName: fleetDriversTable.first_name,
      lastName: fleetDriversTable.last_name,
      email: fleetDriversTable.email,
    })
    .from(driverMessagesTable)
    .leftJoin(fleetDriversTable, eq(driverMessagesTable.target_driver_id, fleetDriversTable.id))
    .orderBy(desc(driverMessagesTable.sent_at))
    .limit(cap);
  return rows.map((r) => {
    const label =
      r.msg.target_driver_id == null
        ? null
        : [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || r.email || r.msg.target_driver_id;
    return rowToDto(r.msg, label);
  });
}

export async function listDriverMessagesForFleetDriver(fleetDriverId: string, limit = 50): Promise<DriverMessageDto[]> {
  const db = getDb();
  if (!db) return [];
  const did = fleetDriverId.trim();
  if (!did) return [];
  const cap = Math.min(100, Math.max(1, limit));
  const rows = await db
    .select()
    .from(driverMessagesTable)
    .where(or(isNull(driverMessagesTable.target_driver_id), eq(driverMessagesTable.target_driver_id, did)))
    .orderBy(desc(driverMessagesTable.sent_at))
    .limit(cap);
  return rows.map((r) => rowToDto(r));
}

export async function insertDriverMessage(input: {
  title: string;
  body: string;
  targetDriverId: string | null;
  sentBy: string;
}): Promise<DriverMessageDto | null> {
  const db = getDb();
  if (!db) return null;
  const id = randomUUID();
  const now = new Date();
  await db.insert(driverMessagesTable).values({
    id,
    title: input.title,
    body: input.body,
    target_driver_id: input.targetDriverId,
    sent_at: now,
    sent_by: input.sentBy,
  });
  const rows = await db.select().from(driverMessagesTable).where(eq(driverMessagesTable.id, id)).limit(1);
  return rows[0] ? rowToDto(rows[0]) : null;
}

export async function fleetDriverExists(driverId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const did = driverId.trim();
  if (!did) return false;
  const rows = await db
    .select({ id: fleetDriversTable.id })
    .from(fleetDriversTable)
    .where(eq(fleetDriversTable.id, did))
    .limit(1);
  return rows.length > 0;
}
