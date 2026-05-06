import { randomUUID } from "node:crypto";
import { desc, eq, and } from "drizzle-orm";
import type { RideRequest } from "../domain/rideRequest";
import { getDb } from "./client";
import { rideSupportTicketsTable } from "./schema";

const SNAPSHOT_SCHEMA = 2;

export function buildRideSupportContextSnapshot(ride: RideRequest): Record<string, unknown> {
  const pb = ride.partnerBookingMeta;
  let medicalFlowHint: string | null = null;
  try {
    if (pb && typeof pb === "object" && pb && "flow" in pb) medicalFlowHint = String((pb as { flow?: string }).flow ?? "");
  } catch {
    medicalFlowHint = null;
  }
  return {
    snapshotSchemaVersion: SNAPSHOT_SCHEMA,
    capturedAtIso: new Date().toISOString(),
    rideId: ride.id,
    status: ride.status,
    rideKind: ride.rideKind,
    payerKind: ride.payerKind,
    pricingMode: ride.pricingMode ?? null,
    estimatedFare: ride.estimatedFare,
    finalFare: ride.finalFare ?? null,
    paymentMethod: ride.paymentMethod ?? null,
    vehicle: ride.vehicle ?? null,
    companyId: ride.companyId ?? null,
    driverId: ride.driverId ?? null,
    scheduledAt: ride.scheduledAt,
    createdAt: ride.createdAt,
    accessibilityOptionsSnapshot: ride.accessibilityOptions ?? null,
    tariffSnapshotReduced: ride.tariffSnapshot ? { engineSchemaVersion: ride.tariffSnapshot.engineSchemaVersion ?? null } : null,
    medicalFlowHint,
    billingReference: ride.billingReference ?? null,
  };
}

export type RideSupportTicketInsertRow = {
  rideId: string;
  passengerId: string;
  companyId?: string | null;
  category: string;
  message?: string | null;
  priority: string;
  source: string;
  createdByActorKind: string;
  createdByActorId: string | null;
  snapshot: Record<string, unknown>;
};

export async function insertRideSupportTicket(row: RideSupportTicketInsertRow): Promise<{ id: string } | null> {
  const db = getDb();
  if (!db) return null;
  const id = `rst-${randomUUID()}`;
  const now = new Date();
  await db.insert(rideSupportTicketsTable).values({
    id,
    ride_id: row.rideId.trim(),
    passenger_id: row.passengerId.trim(),
    company_id: row.companyId?.trim() || null,
    category: row.category.trim() || "other",
    message: row.message?.trim() || null,
    status: "open",
    priority: row.priority.trim() || "normal",
    source: row.source.trim() || "mobile",
    created_by_actor_kind: row.createdByActorKind.trim() || "customer",
    created_by_actor_id: row.createdByActorId?.trim() || null,
    ride_context_snapshot: row.snapshot,
    snapshot_schema_version: SNAPSHOT_SCHEMA,
    snapshot_captured_at: now,
    created_at: now,
    updated_at: now,
  });
  return { id };
}

export async function listRideSupportTicketsForPassengerRide(
  rideId: string,
  passengerId: string,
): Promise<Array<{ id: string; category: string; status: string; createdAtIso: string; messageSnippet: string }>> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(rideSupportTicketsTable)
    .where(
      and(
        eq(rideSupportTicketsTable.ride_id, rideId.trim()),
        eq(rideSupportTicketsTable.passenger_id, passengerId.trim()),
      ),
    )
    .orderBy(desc(rideSupportTicketsTable.created_at));

  return rows.map((r) => {
    const msg = r.message ?? "";
    return {
      id: r.id,
      category: r.category,
      status: r.status,
      createdAtIso: r.created_at.toISOString(),
      messageSnippet: msg.length > 120 ? `${msg.slice(0, 117)}…` : msg,
    };
  });
}
