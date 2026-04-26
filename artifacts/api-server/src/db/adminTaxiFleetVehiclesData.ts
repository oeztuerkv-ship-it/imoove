import { listAssignmentsForCompany } from "./fleetAssignmentsData";
import { listFleetDriversForCompany } from "./fleetDriversData";
import {
  findFleetVehicleInCompany,
  getFleetVehicleAdminDetail,
  listFleetVehiclesForCompany,
  type FleetVehicleRow,
} from "./fleetVehiclesData";
import { getLastRideForDriverInCompany, type LastRideSummary } from "./ridesData";

export type AdminTaxiFleetVehicleListRow = {
  vehicle: FleetVehicleRow;
  assignedDriver: { id: string; firstName: string; lastName: string; email: string } | null;
};

export type AdminTaxiFleetVehicleDetail = {
  companyId: string;
  companyName: string;
  vehicle: FleetVehicleRow;
  assignedDriver: { id: string; firstName: string; lastName: string; email: string; phone: string } | null;
  /** Näherung: letzte Fahrt des zugewiesenen Fahrers (rides hat keinen Fahrzeug-FK). */
  lastRide: LastRideSummary | null;
};

export async function listAdminTaxiFleetVehicleRows(companyId: string): Promise<AdminTaxiFleetVehicleListRow[]> {
  const [vehicles, ass, drivers] = await Promise.all([
    listFleetVehiclesForCompany(companyId),
    listAssignmentsForCompany(companyId),
    listFleetDriversForCompany(companyId),
  ]);
  const dById = new Map(drivers.map((d) => [d.id, d]));
  return vehicles.map((v) => {
    const a = ass.find((x) => x.vehicleId === v.id);
    const d = a ? dById.get(a.driverId) : null;
    return {
      vehicle: v,
      assignedDriver: d
        ? { id: d.id, firstName: d.firstName, lastName: d.lastName, email: d.email }
        : null,
    };
  });
}

export async function getAdminTaxiFleetVehicleDetail(
  companyId: string,
  vehicleId: string,
): Promise<AdminTaxiFleetVehicleDetail | null> {
  const inCo = await findFleetVehicleInCompany(vehicleId, companyId);
  if (!inCo) return null;
  const base = await getFleetVehicleAdminDetail(vehicleId);
  if (!base || base.vehicle.companyId !== companyId) return null;
  const [ass, drivers] = await Promise.all([listAssignmentsForCompany(companyId), listFleetDriversForCompany(companyId)]);
  const a = ass.find((x) => x.vehicleId === vehicleId);
  if (!a) {
    return {
      companyId,
      companyName: base.companyName,
      vehicle: base.vehicle,
      assignedDriver: null,
      lastRide: null,
    };
  }
  const d = drivers.find((x) => x.id === a.driverId);
  const assignedDriver = d
    ? {
        id: d.id,
        firstName: d.firstName,
        lastName: d.lastName,
        email: d.email,
        phone: d.phone,
      }
    : null;
  const lastRide = d ? await getLastRideForDriverInCompany(companyId, d.id) : null;
  return {
    companyId,
    companyName: base.companyName,
    vehicle: base.vehicle,
    assignedDriver,
    lastRide,
  };
}
