import { and, eq } from "drizzle-orm";
import type { RideRequest } from "../domain/rideRequest";
import { getDb } from "./client";
import { driverVehicleAssignmentsTable, fleetDriversTable, fleetVehiclesTable } from "./schema";

export type VehicleLegalType = "taxi" | "rental_car";
export type VehicleClass = "standard" | "xl" | "wheelchair";
export type PricingMode = "taxi_tariff" | "fixed_price";

export interface DriverRideCapability {
  vehicleLegalType: VehicleLegalType | null;
  vehicleClass: VehicleClass | null;
}

function normalizeVehicleText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function parsePricingMode(raw: unknown): PricingMode | null {
  if (raw !== "taxi_tariff" && raw !== "fixed_price") return null;
  return raw;
}

function requiredClassForRide(vehicleText: string): VehicleClass | null {
  if (vehicleText.includes("rollstuhl")) return "wheelchair";
  if (vehicleText === "xl" || vehicleText.includes(" xl")) return "xl";
  return null;
}

function inferPricingModeFromVehicle(vehicleText: string): PricingMode {
  if (vehicleText.includes("mietwagen") || vehicleText.includes("onroda")) return "fixed_price";
  return "taxi_tariff";
}

function requiredLegalTypeForRide(ride: RideRequest): VehicleLegalType {
  const vehicleText = normalizeVehicleText(ride.vehicle);
  const pricingMode = parsePricingMode(ride.pricingMode) ?? inferPricingModeFromVehicle(vehicleText);
  if (pricingMode === "fixed_price") return "rental_car";
  return "taxi";
}

export function isRideCompatibleWithCapability(
  ride: RideRequest,
  capability: DriverRideCapability,
): boolean {
  const requiredLegalType = requiredLegalTypeForRide(ride);
  if (!capability.vehicleLegalType || capability.vehicleLegalType !== requiredLegalType) {
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
    })
    .from(driverVehicleAssignmentsTable)
    .innerJoin(fleetVehiclesTable, eq(driverVehicleAssignmentsTable.vehicle_id, fleetVehiclesTable.id))
    .where(
      and(
        eq(driverVehicleAssignmentsTable.driver_id, driverId),
        eq(driverVehicleAssignmentsTable.company_id, companyId),
      ),
    )
    .limit(1);

  if (assigned[0]) {
    return {
      vehicleLegalType: assigned[0].vehicleLegalType as VehicleLegalType,
      vehicleClass: assigned[0].vehicleClass as VehicleClass,
    };
  }

  const fallback = await db
    .select({
      vehicleLegalType: fleetDriversTable.vehicle_legal_type,
      vehicleClass: fleetDriversTable.vehicle_class,
    })
    .from(fleetDriversTable)
    .where(and(eq(fleetDriversTable.id, driverId), eq(fleetDriversTable.company_id, companyId)))
    .limit(1);

  if (!fallback[0]) return null;
  return {
    vehicleLegalType: fallback[0].vehicleLegalType as VehicleLegalType,
    vehicleClass: fallback[0].vehicleClass as VehicleClass,
  };
}
