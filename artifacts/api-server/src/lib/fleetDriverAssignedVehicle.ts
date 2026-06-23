import type { FleetVehicleRow } from "../db/fleetVehiclesData.js";

function konzessionFromVehicleRow(vehicle: Pick<FleetVehicleRow, "konzessionNumber" | "taxiOrderNumber">): string {
  const primary = (vehicle.konzessionNumber ?? "").trim();
  if (primary) return primary;
  return (vehicle.taxiOrderNumber ?? "").trim();
}

/**
 * Fahrer-Header: Konzession aus freigegebenem Fahrzeug (Partner/Admin-Freigabe),
 * sonst Unternehmens-Konzession aus Admin-Stammdaten (`admin_companies.concession_number`).
 */
export function resolveFleetDriverKonzessionNumber(
  vehicle: Pick<FleetVehicleRow, "konzessionNumber" | "taxiOrderNumber"> | null,
  companyConcessionNumber: string,
): string {
  if (vehicle) {
    const fromVehicle = konzessionFromVehicleRow(vehicle);
    if (fromVehicle) return fromVehicle;
  }
  return companyConcessionNumber.trim();
}

/** Für `/fleet-driver/v1/me`: zuerst freigegebenes Fahrzeug, dann Zuweisung, dann Mandant. */
export function resolveFleetDriverKonzessionForMe(opts: {
  assignedVehicleApproved: FleetVehicleRow | null;
  assignedVehicleAny: FleetVehicleRow | null;
  companyConcessionNumber: string;
}): string {
  for (const vehicle of [opts.assignedVehicleApproved, opts.assignedVehicleAny]) {
    if (!vehicle) continue;
    const kz = konzessionFromVehicleRow(vehicle);
    if (kz) return kz;
  }
  return opts.companyConcessionNumber.trim();
}

export function fleetDriverAssignedVehiclePayload(
  vehicle: FleetVehicleRow,
  companyConcessionNumber: string,
) {
  const konzessionNumber = resolveFleetDriverKonzessionNumber(vehicle, companyConcessionNumber);
  return {
    vehicleId: vehicle.id,
    plate: vehicle.licensePlate,
    license_plate: vehicle.licensePlate,
    licensePlate: vehicle.licensePlate,
    konzessionNumber,
    konzession_number: konzessionNumber,
    model: vehicle.model,
    vehicleType: vehicle.vehicleType,
    vehicleClass: vehicle.vehicleClass,
  };
}
