import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { fleetVehiclesTable } from "./schema";

export type FleetVehicleType = "sedan" | "station_wagon" | "van" | "wheelchair";
export type FleetVehicleLegalType = "taxi" | "rental_car";
export type FleetVehicleClass = "standard" | "xl" | "wheelchair";

export interface FleetVehicleRow {
  id: string;
  companyId: string;
  licensePlate: string;
  vin: string;
  color: string;
  model: string;
  vehicleType: FleetVehicleType;
  vehicleLegalType: FleetVehicleLegalType;
  vehicleClass: FleetVehicleClass;
  taxiOrderNumber: string;
  nextInspectionDate: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function rowToVehicle(r: typeof fleetVehiclesTable.$inferSelect): FleetVehicleRow {
  return {
    id: r.id,
    companyId: r.company_id,
    licensePlate: r.license_plate,
    vin: r.vin,
    color: r.color,
    model: r.model,
    vehicleType: r.vehicle_type as FleetVehicleType,
    vehicleLegalType: r.vehicle_legal_type as FleetVehicleLegalType,
    vehicleClass: r.vehicle_class as FleetVehicleClass,
    taxiOrderNumber: r.taxi_order_number,
    nextInspectionDate: r.next_inspection_date ? String(r.next_inspection_date) : null,
    isActive: r.is_active,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function countActiveFleetVehicles(companyId: string): Promise<number> {
  if (!isPostgresConfigured()) return 0;
  const db = getDb();
  if (!db) return 0;
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(fleetVehiclesTable)
    .where(and(eq(fleetVehiclesTable.company_id, companyId), eq(fleetVehiclesTable.is_active, true)));
  return Number(rows[0]?.n ?? 0);
}

export async function listFleetVehiclesForCompany(companyId: string): Promise<FleetVehicleRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const rows = await db.select().from(fleetVehiclesTable).where(eq(fleetVehiclesTable.company_id, companyId));
  return rows.map(rowToVehicle);
}

export async function findFleetVehicleInCompany(
  id: string,
  companyId: string,
): Promise<(typeof fleetVehiclesTable.$inferSelect) | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(fleetVehiclesTable)
    .where(and(eq(fleetVehiclesTable.id, id), eq(fleetVehiclesTable.company_id, companyId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertFleetVehicle(input: {
  companyId: string;
  licensePlate: string;
  vin?: string;
  color?: string;
  model?: string;
  vehicleType: FleetVehicleType;
  vehicleLegalType?: FleetVehicleLegalType;
  vehicleClass?: FleetVehicleClass;
  taxiOrderNumber?: string;
  nextInspectionDate?: string | null;
  isActive?: boolean;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!isPostgresConfigured()) return { ok: false, error: "database_not_configured" };
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const plate = input.licensePlate.trim();
  if (!plate) return { ok: false, error: "license_plate_required" };
  const id = `fv-${randomUUID()}`;
  await db.insert(fleetVehiclesTable).values({
    id,
    company_id: input.companyId,
    license_plate: plate,
    vin: (input.vin ?? "").trim(),
    color: (input.color ?? "").trim(),
    model: (input.model ?? "").trim(),
    vehicle_type: input.vehicleType,
    vehicle_legal_type: input.vehicleLegalType ?? "taxi",
    vehicle_class: input.vehicleClass ?? "standard",
    taxi_order_number: (input.taxiOrderNumber ?? "").trim(),
    next_inspection_date: input.nextInspectionDate?.trim() || null,
    is_active: input.isActive ?? true,
  });
  return { ok: true, id };
}

export async function patchFleetVehicle(
  id: string,
  companyId: string,
  patch: Partial<{
    licensePlate: string;
    vin: string;
    color: string;
    model: string;
    vehicleType: FleetVehicleType;
    vehicleLegalType: FleetVehicleLegalType;
    vehicleClass: FleetVehicleClass;
    taxiOrderNumber: string;
    nextInspectionDate: string | null;
    isActive: boolean;
  }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cur = await findFleetVehicleInCompany(id, companyId);
  if (!cur) return { ok: false, error: "not_found" };
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const set: Partial<typeof fleetVehiclesTable.$inferInsert> = { updated_at: new Date() };
  if (patch.licensePlate !== undefined) set.license_plate = patch.licensePlate.trim();
  if (patch.vin !== undefined) set.vin = patch.vin.trim();
  if (patch.color !== undefined) set.color = patch.color.trim();
  if (patch.model !== undefined) set.model = patch.model.trim();
  if (patch.vehicleType !== undefined) set.vehicle_type = patch.vehicleType;
  if (patch.vehicleLegalType !== undefined) set.vehicle_legal_type = patch.vehicleLegalType;
  if (patch.vehicleClass !== undefined) set.vehicle_class = patch.vehicleClass;
  if (patch.taxiOrderNumber !== undefined) set.taxi_order_number = patch.taxiOrderNumber.trim();
  if (patch.nextInspectionDate !== undefined) {
    set.next_inspection_date = patch.nextInspectionDate?.trim() ? patch.nextInspectionDate.trim() : null;
  }
  if (patch.isActive !== undefined) set.is_active = patch.isActive;
  await db
    .update(fleetVehiclesTable)
    .set(set)
    .where(and(eq(fleetVehiclesTable.id, id), eq(fleetVehiclesTable.company_id, companyId)));
  return { ok: true };
}
