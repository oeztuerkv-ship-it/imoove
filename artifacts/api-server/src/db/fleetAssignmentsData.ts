import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { driverVehicleAssignmentsTable, fleetDriversTable, fleetVehiclesTable } from "./schema";

export interface DriverVehicleAssignmentRow {
  id: string;
  companyId: string;
  driverId: string;
  vehicleId: string;
  assignedAt: string;
}

function toRow(r: typeof driverVehicleAssignmentsTable.$inferSelect): DriverVehicleAssignmentRow {
  return {
    id: r.id,
    companyId: r.company_id,
    driverId: r.driver_id,
    vehicleId: r.vehicle_id,
    assignedAt: r.assigned_at.toISOString(),
  };
}

export async function listAssignmentsForCompany(companyId: string): Promise<DriverVehicleAssignmentRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(driverVehicleAssignmentsTable)
    .where(eq(driverVehicleAssignmentsTable.company_id, companyId));
  return rows.map(toRow);
}

export async function setDriverVehicleAssignment(input: {
  companyId: string;
  driverId: string;
  vehicleId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isPostgresConfigured()) return { ok: false, error: "database_not_configured" };
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };

  const dRows = await db
    .select({ id: fleetDriversTable.id })
    .from(fleetDriversTable)
    .where(and(eq(fleetDriversTable.id, input.driverId), eq(fleetDriversTable.company_id, input.companyId)))
    .limit(1);
  if (!dRows[0]) return { ok: false, error: "driver_not_found" };

  const vRows = await db
    .select({ id: fleetVehiclesTable.id, approvalStatus: fleetVehiclesTable.approval_status })
    .from(fleetVehiclesTable)
    .where(and(eq(fleetVehiclesTable.id, input.vehicleId), eq(fleetVehiclesTable.company_id, input.companyId)))
    .limit(1);
  if (!vRows[0]) return { ok: false, error: "vehicle_not_found" };
  if (String(vRows[0].approvalStatus) !== "approved") {
    return { ok: false, error: "vehicle_not_approved" };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(driverVehicleAssignmentsTable)
      .where(eq(driverVehicleAssignmentsTable.driver_id, input.driverId));
    await tx
      .delete(driverVehicleAssignmentsTable)
      .where(eq(driverVehicleAssignmentsTable.vehicle_id, input.vehicleId));
    await tx.insert(driverVehicleAssignmentsTable).values({
      id: `fva-${randomUUID()}`,
      company_id: input.companyId,
      driver_id: input.driverId,
      vehicle_id: input.vehicleId,
    });
  });

  return { ok: true };
}

export async function clearDriverAssignment(driverId: string, companyId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const r = await db
    .delete(driverVehicleAssignmentsTable)
    .where(
      and(
        eq(driverVehicleAssignmentsTable.driver_id, driverId),
        eq(driverVehicleAssignmentsTable.company_id, companyId),
      ),
    )
    .returning({ id: driverVehicleAssignmentsTable.id });
  return r.length > 0;
}
