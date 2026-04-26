import { getCompanyGovernanceGate, type CompanyGovernanceGate, companyMeetsTaxiFleetProvisioningReadiness } from "./companyGovernanceData";
import {
  findFleetDriverInCompany,
  type FleetDriverListRow,
  fleetDriverTableRowToList,
} from "./fleetDriversData";
import { listAssignmentsForCompany } from "./fleetAssignmentsData";
import { listFleetVehiclesForCompany, type FleetVehicleRow } from "./fleetVehiclesData";
import { listFleetDriversForCompany } from "./fleetDriversData";

export type DriverReadinessBlockCode =
  | "company_not_ready"
  | "driver_suspended"
  | "driver_rejected"
  | "driver_not_approved"
  | "p_schein_date_missing"
  | "p_schein_expired"
  | "p_schein_doc_missing"
  | "no_vehicle_assigned"
  | "vehicle_not_approved";

export interface DriverReadinessBlock {
  code: DriverReadinessBlockCode;
  message: string;
}

export interface DriverReadinessResult {
  ready: boolean;
  blockReasons: DriverReadinessBlock[];
}

const MSG: Record<DriverReadinessBlockCode, string> = {
  company_not_ready: "Unternehmen ist noch nicht vollständig freigegeben (Verifizierung, Nachweise, Vertrag oder Stammdaten).",
  driver_suspended: "Fahrer ist gesperrt.",
  driver_rejected: "Fahrer wurde abgelehnt.",
  driver_not_approved: "Fahrer ist noch nicht freigegeben (Onroda-Prüfung).",
  p_schein_date_missing: "P-Schein: kein Ablaufdatum hinterlegt.",
  p_schein_expired: "P-Schein: abgelaufen.",
  p_schein_doc_missing: "P-Schein: kein PDF-Nachweis hochgeladen.",
  no_vehicle_assigned: "Kein Fahrzeug zugeordnet.",
  vehicle_not_approved: "Zugeordnetes Fahrzeug ist noch nicht freigegeben.",
};

export function deriveDriverWorkflowLabel(
  d: Pick<FleetDriverListRow, "isActive" | "accessStatus" | "approvalStatus">,
): { key: string; label: string } {
  if (!d.isActive || d.accessStatus === "suspended") {
    return { key: "suspended", label: "Gesperrt" };
  }
  switch (d.approvalStatus) {
    case "rejected":
      return { key: "rejected", label: "Abgelehnt" };
    case "in_review":
      return { key: "in_review", label: "In Prüfung" };
    case "pending":
      return { key: "pending", label: "Angelegt" };
    case "approved":
      return { key: "approved", label: "Freigegeben" };
    default:
      return { key: "unknown", label: "—" };
  }
}

function pScheinDateMissing(expiry: string | null | undefined): boolean {
  if (expiry == null) return true;
  const s = String(expiry).trim();
  if (!s) return true;
  return false;
}

function pScheinDocMissing(key: string | null | undefined): boolean {
  return !key || !String(key).trim();
}

/** Ablauf: reines Kalenderdatum, UTC, einheitlich mit FleetPage-P-Schein. */
function pScheinExpiredOnlyWhenDatePresent(isoOrDate: string | null | undefined): boolean {
  if (pScheinDateMissing(isoOrDate)) return false;
  const s = String(isoOrDate).trim().slice(0, 10);
  const d = new Date(`${s}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const endOfTodayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const exp = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return exp < endOfTodayUtc;
}

/**
 * Einsatzbereitschaft: gleiche Kriterien wie in der Fachvorgabe (Mandant + Fahrer + P-Schein + Fahrzeugfreigabe).
 * `gate` = null => Unternehmen nicht ladbare/aktive Zeile => nicht einsatzbereit.
 */
export function computeDriverReadiness(
  gate: CompanyGovernanceGate | null,
  d: Pick<
    FleetDriverListRow,
    "isActive" | "accessStatus" | "approvalStatus" | "pScheinExpiry" | "pScheinDocStorageKey"
  >,
  hasVehicleAssignment: boolean,
  assignedVehicleApproval: string | null,
): DriverReadinessResult {
  const blockReasons: DriverReadinessBlock[] = [];
  if (!companyMeetsTaxiFleetProvisioningReadiness(gate)) {
    blockReasons.push({ code: "company_not_ready", message: MSG.company_not_ready });
  }
  if (!d.isActive || d.accessStatus !== "active") {
    blockReasons.push({ code: "driver_suspended", message: MSG.driver_suspended });
  }
  if (d.approvalStatus === "rejected") {
    blockReasons.push({ code: "driver_rejected", message: MSG.driver_rejected });
  } else if (d.approvalStatus === "pending" || d.approvalStatus === "in_review") {
    blockReasons.push({ code: "driver_not_approved", message: MSG.driver_not_approved });
  }
  if (pScheinDateMissing(d.pScheinExpiry)) {
    blockReasons.push({ code: "p_schein_date_missing", message: MSG.p_schein_date_missing });
  } else if (pScheinExpiredOnlyWhenDatePresent(d.pScheinExpiry)) {
    blockReasons.push({ code: "p_schein_expired", message: MSG.p_schein_expired });
  }
  if (pScheinDocMissing(d.pScheinDocStorageKey)) {
    blockReasons.push({ code: "p_schein_doc_missing", message: MSG.p_schein_doc_missing });
  }
  if (!hasVehicleAssignment) {
    blockReasons.push({ code: "no_vehicle_assigned", message: MSG.no_vehicle_assigned });
  } else if (assignedVehicleApproval !== "approved") {
    blockReasons.push({ code: "vehicle_not_approved", message: MSG.vehicle_not_approved });
  }
  return { ready: blockReasons.length === 0, blockReasons };
}

function vehicleApprovalForDriver(
  driverId: string,
  assignRows: { driverId: string; vehicleId: string }[],
  vehicles: FleetVehicleRow[],
): { has: boolean; approval: string | null } {
  const a = assignRows.find((x) => x.driverId === driverId);
  if (!a) return { has: false, approval: null };
  const v = vehicles.find((v0) => v0.id === a.vehicleId);
  return { has: true, approval: v ? String(v.approvalStatus) : null };
}

export type PanelFleetDriverView = FleetDriverListRow & {
  workflow: { key: string; label: string };
  readiness: DriverReadinessResult;
};

export async function getPanelFleetDriverViews(companyId: string): Promise<PanelFleetDriverView[]> {
  const [gate, rows, ass, veh] = await Promise.all([
    getCompanyGovernanceGate(companyId),
    listFleetDriversForCompany(companyId),
    listAssignmentsForCompany(companyId),
    listFleetVehiclesForCompany(companyId),
  ]);
  return rows.map((row) => {
    const { has, approval } = vehicleApprovalForDriver(row.id, ass, veh);
    return {
      ...row,
      workflow: deriveDriverWorkflowLabel(row),
      readiness: computeDriverReadiness(gate, row, has, approval),
    };
  });
}

export async function getFleetDriverReadinessById(
  driverId: string,
  companyId: string,
): Promise<DriverReadinessResult | { error: "not_found" }> {
  const r = await findFleetDriverInCompany(driverId, companyId);
  if (!r) return { error: "not_found" };
  const listRow = fleetDriverTableRowToList(r);
  const [gate, ass, veh] = await Promise.all([
    getCompanyGovernanceGate(companyId),
    listAssignmentsForCompany(companyId),
    listFleetVehiclesForCompany(companyId),
  ]);
  const { has, approval } = vehicleApprovalForDriver(listRow.id, ass, veh);
  return computeDriverReadiness(gate, listRow, has, approval);
}
