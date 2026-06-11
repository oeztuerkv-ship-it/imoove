import { findFleetDriverAuthRow } from "../db/fleetDriversData.js";
import { listAssignmentsForCompany } from "../db/fleetAssignmentsData.js";
import { findFleetVehicleInCompany } from "../db/fleetVehiclesData.js";

export type ReceiptDriverInfo = {
  driverName: string | null;
  driverPlate: string | null;
};

export async function resolveReceiptDriverInfo(
  driverId: string | null | undefined,
): Promise<ReceiptDriverInfo> {
  const id = String(driverId ?? "").trim();
  if (!id) return { driverName: null, driverPlate: null };

  const driverRow = await findFleetDriverAuthRow(id);
  if (!driverRow) return { driverName: null, driverPlate: null };

  const first = String(driverRow.first_name ?? "").trim();
  const last = String(driverRow.last_name ?? "").trim();
  const driverName = `${first} ${last}`.trim() || null;

  let driverPlate: string | null = null;
  const taxiCompanyId = String(driverRow.company_id ?? "").trim();
  if (taxiCompanyId) {
    const assignments = await listAssignmentsForCompany(taxiCompanyId);
    const assignment = assignments.find((a) => a.driverId === id);
    if (assignment) {
      const vehicle = await findFleetVehicleInCompany(assignment.vehicleId, taxiCompanyId);
      const plate = vehicle?.licensePlate?.trim();
      if (plate) driverPlate = plate;
    }
  }

  return { driverName, driverPlate };
}
