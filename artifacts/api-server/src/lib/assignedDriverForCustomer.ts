import { and, eq, inArray, sql } from "drizzle-orm";
import type { RideRequest } from "../domain/rideRequest";
import { getDb, isPostgresConfigured } from "../db/client";
import { listAssignmentsForCompany } from "../db/fleetAssignmentsData";
import { findFleetDriverInCompany } from "../db/fleetDriversData";
import { listFleetVehiclesForCompany } from "../db/fleetVehiclesData";
import { ridesTable } from "../db/schema";

export type CustomerAssignedDriverView = {
  id: string;
  displayName: string;
  firstName: string;
  licensePlate: string | null;
  vehicleModel: string | null;
  vehicleLabel: string | null;
  /** Plattform-Anzeige bis echtes Bewertungssystem — ab 1 abgeschlossener Fahrt. */
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

async function countCompletedRidesByDriverIds(driverIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!isPostgresConfigured() || driverIds.length === 0) return out;
  const db = getDb();
  if (!db) return out;
  const rows = await db
    .select({
      driverId: ridesTable.driver_id,
      cnt: sql<number>`count(*)::int`,
    })
    .from(ridesTable)
    .where(and(inArray(ridesTable.driver_id, driverIds), eq(ridesTable.status, "completed")))
    .groupBy(ridesTable.driver_id);
  for (const row of rows) {
    const id = String(row.driverId ?? "").trim();
    if (id) out.set(id, Number(row.cnt) || 0);
  }
  return out;
}

function displayRatingForCompletedCount(completedCount: number): number | null {
  if (completedCount <= 0) return null;
  if (completedCount >= 50) return 4.9;
  if (completedCount >= 10) return 4.8;
  return 5.0;
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

  const completedByDriver = await countCompletedRidesByDriverIds(driverIds);

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

    const vehicleId = assignmentByCompany.get(companyId)?.get(driverId);
    const vehiclePack = vehicleByCompany.get(companyId);
    const licensePlate =
      vehicleId && vehiclePack ? vehiclePack.plateByVehicleId.get(vehicleId)?.trim() || null : null;
    const vehicleModel =
      vehicleId && vehiclePack ? vehiclePack.modelByVehicleId.get(vehicleId)?.trim() || null : null;
    const vehicleLabel = vehicleModel || null;

    const completedCount = completedByDriver.get(driverId) ?? 0;

    out.set(rideId, {
      id: driverId,
      displayName,
      firstName: firstName || displayName.split(" ")[0] || "Fahrer",
      licensePlate,
      vehicleModel,
      vehicleLabel,
      rating: displayRatingForCompletedCount(completedCount),
      photoUrl: null,
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
