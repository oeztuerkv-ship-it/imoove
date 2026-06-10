import { and, desc, eq } from "drizzle-orm";
import type { RideRequest } from "../domain/rideRequest";
import type { FleetVehicleType } from "./fleetVehiclesData";
import { getDb } from "./client";
import { driverVehicleAssignmentsTable, fleetVehiclesTable } from "./schema";

export type VehicleLegalType = "taxi" | "rental_car";
export type VehicleClass = "standard" | "xl" | "wheelchair";
export type PricingMode = "taxi_tariff";

export interface DriverRideCapability {
  vehicleLegalType: VehicleLegalType | null;
  vehicleClass: VehicleClass | null;
  vehicleType: FleetVehicleType | null;
}

function normalizeVehicleText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function parsePricingMode(raw: unknown): PricingMode | null {
  if (raw === "taxi_tariff" || raw === "fixed_price" || raw === "hybrid") return "taxi_tariff";
  return null;
}

/** Rollstuhl-/XL-Anforderung aus Fahrzeuglabel, Service-Klasse oder accessibilityOptions. */
export function rideRequiredVehicleClass(ride: RideRequest): VehicleClass | null {
  const vehicleText = normalizeVehicleText(ride.vehicle);

  if (vehicleText.includes("rollstuhl") || vehicleText.includes("wheelchair")) {
    return "wheelchair";
  }

  const opts = ride.accessibilityOptions;
  if (opts && typeof opts === "object" && !Array.isArray(opts)) {
    const wt = typeof opts.wheelchairType === "string" ? opts.wheelchairType.trim() : "";
    if (wt === "foldable" || wt === "electric") return "wheelchair";
    if (opts.rampRequired === true || opts.carryChairRequired === true) return "wheelchair";
  }

  if (vehicleText === "xl" || /\bxl\b/.test(vehicleText)) {
    return "xl";
  }

  return null;
}

function requiredLegalTypeForRide(ride: RideRequest): VehicleLegalType {
  const vehicleText = normalizeVehicleText(ride.vehicle);
  const _pricingMode = parsePricingMode(ride.pricingMode) ?? inferPricingModeFromVehicle(vehicleText);
  return "taxi";
}

function inferPricingModeFromVehicle(_vehicleText: string): PricingMode {
  return "taxi_tariff";
}

/** Fahrzeug ist rollstuhlgeeignet (Partner-Registrierung: Typ oder Klasse wheelchair). */
export function isFleetVehicleWheelchairCapable(capability: DriverRideCapability): boolean {
  return capability.vehicleClass === "wheelchair" || capability.vehicleType === "wheelchair";
}

function fleetVehicleSatisfiesRequiredClass(
  capability: DriverRideCapability,
  required: VehicleClass,
): boolean {
  if (required === "wheelchair") {
    return isFleetVehicleWheelchairCapable(capability);
  }
  if (required === "xl") {
    return capability.vehicleClass === "xl" || capability.vehicleClass === "wheelchair";
  }
  return true;
}

export function isRideCompatibleWithCapability(
  ride: RideRequest,
  capability: DriverRideCapability,
): boolean {
  const requiredLegalType = requiredLegalTypeForRide(ride);
  const normalizedLegalType =
    capability.vehicleLegalType === "rental_car" ? "taxi" : capability.vehicleLegalType;
  if (!normalizedLegalType || normalizedLegalType !== requiredLegalType) {
    return false;
  }

  const requiredClass = rideRequiredVehicleClass(ride);
  if (!requiredClass) return true;

  return fleetVehicleSatisfiesRequiredClass(capability, requiredClass);
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
      vehicleType: fleetVehiclesTable.vehicle_type,
      approvalStatus: fleetVehiclesTable.approval_status,
      isActive: fleetVehiclesTable.is_active,
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
    if (!assigned[0].isActive) return null;
    return {
      vehicleLegalType: assigned[0].vehicleLegalType as VehicleLegalType,
      vehicleClass: assigned[0].vehicleClass as VehicleClass,
      vehicleType: assigned[0].vehicleType as FleetVehicleType,
    };
  }

  return null;
}

/** Vor atomarer Fahrer-Zuweisung (Markt + Reservierung). */
export async function assertFleetDriverMatchesRide(
  ride: RideRequest,
  driverId: string,
  companyId: string,
): Promise<{ ok: true } | { ok: false; code: "no_matching_vehicle_available" }> {
  const capability = await getFleetDriverCapability(driverId, companyId);
  if (!capability || !isRideCompatibleWithCapability(ride, capability)) {
    return { ok: false, code: "no_matching_vehicle_available" };
  }
  return { ok: true };
}
