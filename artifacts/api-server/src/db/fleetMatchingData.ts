import { and, desc, eq } from "drizzle-orm";
import type { RideRequest } from "../domain/rideRequest";
import { getDb } from "./client";
import { driverVehicleAssignmentsTable, fleetVehiclesTable } from "./schema";

export type VehicleLegalType = "taxi" | "rental_car";
export type VehicleClass = "standard" | "xl" | "wheelchair";
export type PricingMode = "taxi_tariff";

export interface DriverRideCapability {
  vehicleLegalType: VehicleLegalType | null;
  vehicleClass: VehicleClass | null;
}

function normalizeVehicleText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function parsePricingMode(raw: unknown): PricingMode | null {
  if (raw !== "taxi_tariff") return null;
  return raw;
}

function requiredClassForRide(vehicleText: string): VehicleClass | null {
  if (vehicleText.includes("rollstuhl")) return "wheelchair";
  if (vehicleText === "xl" || vehicleText.includes(" xl")) return "xl";
  return null;
}

function inferPricingModeFromVehicle(_vehicleText: string): PricingMode {
  return "taxi_tariff";
}

function requiredLegalTypeForRide(ride: RideRequest): VehicleLegalType {
  const vehicleText = normalizeVehicleText(ride.vehicle);
  const _pricingMode = parsePricingMode(ride.pricingMode) ?? inferPricingModeFromVehicle(vehicleText);
  return "taxi";
}

export function isRideCompatibleWithCapability(
  ride: RideRequest,
  capability: DriverRideCapability,
): boolean {
  const requiredLegalType = requiredLegalTypeForRide(ride);
  const normalizedLegalType = capability.vehicleLegalType === "rental_car" ? "taxi" : capability.vehicleLegalType;
  if (!normalizedLegalType || normalizedLegalType !== requiredLegalType) {
    return false;
  }
  const vehicleText = normalizeVehicleText(ride.vehicle);
  const requiredClass = requiredClassForRide(vehicleText);
  if (!requiredClass) return true;
  return capability.vehicleClass === requiredClass;
}

export async function getFleetDriverCapability(
  driverId: string,
  companyId: string,
): Promise<DriverRideCapability | null> {
  const db = getDb();
  if (!db) return null;

  const assigned = await db
    .select({
      vehicleLegalType: fleetVehiclesTable.vehicle_legal_type,
      vehicleClass: fleetVehiclesTable.vehicle_class,
      approvalStatus: fleetVehiclesTable.approval_status,
    })
    .from(driverVehicleAssignmentsTable)
    .innerJoin(fleetVehiclesTable, eq(driverVehicleAssignmentsTable.vehicle_id, fleetVehiclesTable.id))
    .where(
      and(
        eq(driverVehicleAssignmentsTable.driver_id, driverId),
        eq(driverVehicleAssignmentsTable.company_id, companyId),
      ),
    )
    .orderBy(desc(driverVehicleAssignmentsTable.assigned_at))
    .limit(1);

  if (assigned[0]) {
    if (String(assigned[0].approvalStatus) !== "approved") {
      return null;
    }
    return {
      vehicleLegalType: assigned[0].vehicleLegalType as VehicleLegalType,
      vehicleClass: assigned[0].vehicleClass as VehicleClass,
    };
  }

  return null;
}
