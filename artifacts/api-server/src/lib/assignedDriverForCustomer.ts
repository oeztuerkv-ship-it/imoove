import type { RideRequest } from "../domain/rideRequest";
import { listAssignmentsForCompany } from "../db/fleetAssignmentsData";
import { findFleetDriverInCompany } from "../db/fleetDriversData";
import { listFleetVehiclesForCompany } from "../db/fleetVehiclesData";
import { averageFleetDriverRating } from "./fleetDriverRatings";
import { buildCustomerVisibleDriverAvatarUrl } from "./fleetDriverAvatar";

export type CustomerAssignedDriverView = {
  id: string;
  displayName: string;
  firstName: string;
  licensePlate: string | null;
  vehicleModel: string | null;
  vehicleLabel: string | null;
  /** Plattform-Anzeige — Durchschnitt aus Kundenbewertungen. */
  rating: number | null;
  photoUrl: string | null;
  initials: string;
  phone: string | null;
};

function driverInitials(firstName: string, lastName: string, displayName: string): string {
  const f = firstName.trim()[0] ?? "";
  const l = lastName.trim()[0] ?? "";
  if (f && l) return `${f}${l}`.toUpperCase();
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

/**
 * Öffentliche Fahrer-Infos für Kunden (Name, Fahrzeug, Kennzeichen, Telefon für Anruf v1).
 */
export async function buildAssignedDriverMapForCustomerRides(
  rides: Array<Pick<RideRequest, "id" | "companyId" | "driverId">>,
): Promise<Map<string, CustomerAssignedDriverView>> {
  const out = new Map<string, CustomerAssignedDriverView>();
  const companyIds = Array.from(
    new Set(
      rides
        .map((r) => (r.companyId ?? "").trim())
        .filter(Boolean),
    ),
  );
  const driverIds = Array.from(
    new Set(
      rides
        .map((r) => (r.driverId ?? "").trim())
        .filter(Boolean),
    ),
  );
  if (companyIds.length === 0 || driverIds.length === 0) return out;

  const vehicleByCompany = new Map<
    string,
    { plateByVehicleId: Map<string, string>; modelByVehicleId: Map<string, string> }
  >();
  const assignmentByCompany = new Map<string, Map<string, string>>();

  await Promise.all(
    companyIds.map(async (companyId) => {
      const [assignments, vehicles] = await Promise.all([
        listAssignmentsForCompany(companyId),
        listFleetVehiclesForCompany(companyId),
      ]);
      const plateByVehicleId = new Map(vehicles.map((v) => [v.id, v.licensePlate.trim()]));
      const modelByVehicleId = new Map(vehicles.map((v) => [v.id, v.model.trim()]));
      vehicleByCompany.set(companyId, { plateByVehicleId, modelByVehicleId });
      const driverToVehicle = new Map<string, string>();
      for (const a of assignments) {
        driverToVehicle.set(a.driverId, a.vehicleId);
      }
      assignmentByCompany.set(companyId, driverToVehicle);
    }),
  );

  for (const ride of rides) {
    const rideId = (ride.id ?? "").trim();
    const companyId = (ride.companyId ?? "").trim();
    const driverId = (ride.driverId ?? "").trim();
    if (!rideId || !companyId || !driverId) continue;

    const driver = await findFleetDriverInCompany(driverId, companyId);
    if (!driver) continue;

    const firstName = String(driver.first_name ?? "").trim();
    const lastName = String(driver.last_name ?? "").trim();
    const displayName = `${firstName} ${lastName}`.trim() || "Ihr Fahrer";
    const phone = String(driver.phone ?? "").trim() || null;
    const ratingSum = Number((driver as { rating_sum?: number }).rating_sum ?? 0) || 0;
    const ratingCount = Number((driver as { rating_count?: number }).rating_count ?? 0) || 0;

    const vehicleId = assignmentByCompany.get(companyId)?.get(driverId);
    const vehiclePack = vehicleByCompany.get(companyId);
    const licensePlate =
      vehicleId && vehiclePack ? vehiclePack.plateByVehicleId.get(vehicleId)?.trim() || null : null;
    const vehicleModel =
      vehicleId && vehiclePack ? vehiclePack.modelByVehicleId.get(vehicleId)?.trim() || null : null;
    const vehicleLabel = vehicleModel || null;

    out.set(rideId, {
      id: driverId,
      displayName,
      firstName: firstName || displayName.split(" ")[0] || "Fahrer",
      licensePlate,
      vehicleModel,
      vehicleLabel,
      rating: averageFleetDriverRating(ratingSum, ratingCount),
      photoUrl: buildCustomerVisibleDriverAvatarUrl({
        driverId,
        avatarStorageKey: driver.avatar_storage_key,
        avatarShowToCustomer: driver.avatar_show_to_customer,
      }),
      initials: driverInitials(firstName, lastName, displayName),
      phone,
    });
  }

  return out;
}

export function attachAssignedDriverToCustomerRide<T extends Record<string, unknown>>(
  ride: T,
  assignedByRideId: Map<string, CustomerAssignedDriverView>,
): T {
  const rideId = typeof ride.id === "string" ? ride.id.trim() : "";
  if (!rideId) return ride;
  const assigned = assignedByRideId.get(rideId);
  if (!assigned) return ride;
  return {
    ...ride,
    assignedDriver: assigned,
    driverPlate: assigned.licensePlate ?? (ride as { driverPlate?: string }).driverPlate,
    plate: assigned.licensePlate ?? (ride as { plate?: string }).plate,
    vehicle: assigned.licensePlate ?? (ride as { vehicle?: string }).vehicle,
  } as T;
}
