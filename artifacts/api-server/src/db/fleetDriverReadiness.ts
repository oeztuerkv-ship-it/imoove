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
  | "driver_account_inactive"
  | "driver_rejected"
  | "driver_not_approved"
  | "p_schein_date_missing"
  | "p_schein_expired"
  | "p_schein_doc_missing"
  | "no_vehicle_assigned"
  | "vehicle_not_approved"
  | "vehicle_blocked"
  | "vehicle_rejected"
  | "vehicle_pending_approval"
  | "vehicle_draft";

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
  driver_suspended: "Fahrerzugang ist gesperrt.",
  driver_account_inactive: "Fahrerkonto ist deaktiviert.",
  driver_rejected: "Fahrer wurde abgelehnt.",
  driver_not_approved: "Fahrer ist noch nicht freigegeben (Onroda-Prüfung).",
  p_schein_date_missing: "P-Schein: kein Ablaufdatum hinterlegt.",
  p_schein_expired: "P-Schein: abgelaufen.",
  p_schein_doc_missing: "P-Schein: kein PDF-Nachweis hochgeladen.",
  no_vehicle_assigned: "Kein Fahrzeug zugeordnet.",
  vehicle_not_approved: "Zugeordnetes Fahrzeug ist noch nicht freigegeben.",
  vehicle_blocked: "Zugeordnetes Fahrzeug ist von der Plattform gesperrt.",
  vehicle_rejected: "Zugeordnetes Fahrzeug wurde abgelehnt.",
  vehicle_pending_approval: "Zugeordnetes Fahrzeug wartet auf Freigabe durch Onroda.",
  vehicle_draft: "Zugeordnetes Fahrzeug ist noch nicht zur Prüfung eingereicht.",
};

/** Sichtbarkeit in Fahrer-App (Kurz-Titel fürs Banner, ausführlicher Text). */
export type FleetDriverMeBlockKind = "access_suspended" | "vehicle" | "compliance" | "other";

export function buildFleetDriverMeClientHints(
  readiness: DriverReadinessResult,
  listRow: Pick<FleetDriverListRow, "suspensionReason">,
): { notFreigegebenMessage: string; blockBannerTitle: string; driverBlockKind: FleetDriverMeBlockKind } {
  if (readiness.ready) {
    return { notFreigegebenMessage: "", blockBannerTitle: "", driverBlockKind: "other" };
  }
  const codes = new Set(readiness.blockReasons.map((b) => b.code));
  if (codes.has("driver_account_inactive")) {
    return {
      blockBannerTitle: "Konto deaktiviert",
      notFreigegebenMessage: MSG.driver_account_inactive,
      driverBlockKind: "compliance",
    };
  }
  if (codes.has("driver_suspended")) {
    return {
      blockBannerTitle: "Zugang gesperrt",
      notFreigegebenMessage: [
        "Ihr Zugang ist gesperrt. Bitte wenden Sie sich an Ihr Unternehmen.",
        listRow.suspensionReason?.trim() ? `Grund: ${String(listRow.suspensionReason).trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
      driverBlockKind: "access_suspended",
    };
  }
  const vehicleish = new Set<DriverReadinessBlockCode>([
    "no_vehicle_assigned",
    "vehicle_not_approved",
    "vehicle_blocked",
    "vehicle_rejected",
    "vehicle_pending_approval",
    "vehicle_draft",
  ]);
  if ([...codes].some((c) => vehicleish.has(c))) {
    return {
      blockBannerTitle: "Fahrzeug",
      notFreigegebenMessage: [
        "Ihr Fahrzeug ist nicht freigegeben oder gesperrt. Bitte wenden Sie sich an Ihr Unternehmen.",
        ...readiness.blockReasons.filter((b) => vehicleish.has(b.code)).map((b) => b.message),
      ].join("\n\n"),
      driverBlockKind: "vehicle",
    };
  }
  if (codes.has("company_not_ready")) {
    return {
      blockBannerTitle: "Unternehmen",
      notFreigegebenMessage: readiness.blockReasons.map((b) => b.message).join("\n\n"),
      driverBlockKind: "compliance",
    };
  }
  return {
    blockBannerTitle: "Voraussetzungen",
    notFreigegebenMessage: readiness.blockReasons.map((b) => b.message).join("\n\n"),
    driverBlockKind: "other",
  };
}

export function deriveDriverWorkflowLabel(
  d: Pick<FleetDriverListRow, "isActive" | "accessStatus" | "approvalStatus">,
): { key: string; label: string } {
  if (!d.isActive) {
    return { key: "inactive", label: "Deaktiviert" };
  }
  if (d.accessStatus === "suspended") {
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
    | "isActive"
    | "accessStatus"
    | "approvalStatus"
    | "pScheinExpiry"
    | "pScheinDocStorageKey"
    | "suspensionReason"
  >,
  hasVehicleAssignment: boolean,
  assignedVehicle: FleetVehicleRow | null,
): DriverReadinessResult {
  const blockReasons: DriverReadinessBlock[] = [];
  if (!companyMeetsTaxiFleetProvisioningReadiness(gate)) {
    blockReasons.push({ code: "company_not_ready", message: MSG.company_not_ready });
  }
  if (!d.isActive) {
    blockReasons.push({ code: "driver_account_inactive", message: MSG.driver_account_inactive });
  } else if (d.accessStatus !== "active") {
    const sr = (d.suspensionReason ?? "").trim();
    const msg = sr ? `${MSG.driver_suspended} Grund: ${sr}` : MSG.driver_suspended;
    blockReasons.push({ code: "driver_suspended", message: msg });
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
  } else if (assignedVehicle) {
    const st = String(assignedVehicle.approvalStatus);
    if (st === "approved") {
      /* kein Fahrzeug-Block */
    } else if (st === "blocked") {
      const br = (assignedVehicle.blockReason ?? "").trim();
      blockReasons.push({
        code: "vehicle_blocked",
        message: br ? `${MSG.vehicle_blocked} ${br}` : MSG.vehicle_blocked,
      });
    } else if (st === "rejected") {
      const rj = (assignedVehicle.rejectionReason ?? "").trim();
      blockReasons.push({
        code: "vehicle_rejected",
        message: rj ? `${MSG.vehicle_rejected} ${rj}` : MSG.vehicle_rejected,
      });
    } else if (st === "pending_approval") {
      blockReasons.push({ code: "vehicle_pending_approval", message: MSG.vehicle_pending_approval });
    } else if (st === "draft") {
      blockReasons.push({ code: "vehicle_draft", message: MSG.vehicle_draft });
    } else {
      blockReasons.push({ code: "vehicle_not_approved", message: MSG.vehicle_not_approved });
    }
  }
  return { ready: blockReasons.length === 0, blockReasons };
}

function assignedVehicleForDriver(
  driverId: string,
  assignRows: { driverId: string; vehicleId: string }[],
  vehicles: FleetVehicleRow[],
): FleetVehicleRow | null {
  const a = assignRows.find((x) => x.driverId === driverId);
  if (!a) return null;
  return vehicles.find((v0) => v0.id === a.vehicleId) ?? null;
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
    const av = assignedVehicleForDriver(row.id, ass, veh);
    return {
      ...row,
      workflow: deriveDriverWorkflowLabel(row),
      readiness: computeDriverReadiness(gate, row, av != null, av),
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
  const av = assignedVehicleForDriver(listRow.id, ass, veh);
  return computeDriverReadiness(gate, listRow, av != null, av);
}

function assignedVehicleMeta(
  driverId: string,
  assignRows: { driverId: string; vehicleId: string }[],
  vehicles: FleetVehicleRow[],
): { id: string; licensePlate: string; model: string; approvalStatus: string } | null {
  const a = assignRows.find((x) => x.driverId === driverId);
  if (!a) return null;
  const v = vehicles.find((v0) => v0.id === a.vehicleId);
  if (!v) return null;
  return {
    id: v.id,
    licensePlate: v.licensePlate,
    model: v.model,
    approvalStatus: v.approvalStatus,
  };
}

/** Plattform-Admin: Fahrerliste inkl. Zuweisung & Notizen; gleiche Readiness-Logik wie Panel. */
export type AdminTaxiFleetDriverRow = PanelFleetDriverView & {
  assignedVehicle: { id: string; licensePlate: string; model: string; approvalStatus: string } | null;
  pScheinDocPresent: boolean;
  suspensionReason: string;
  adminInternalNote: string;
};

export async function listAdminTaxiFleetDriverRows(companyId: string): Promise<AdminTaxiFleetDriverRow[]> {
  const [views, ass, veh] = await Promise.all([
    getPanelFleetDriverViews(companyId),
    listAssignmentsForCompany(companyId),
    listFleetVehiclesForCompany(companyId),
  ]);
  return views.map((v) => ({
    ...v,
    assignedVehicle: assignedVehicleMeta(v.id, ass, veh),
    pScheinDocPresent: !pScheinDocMissing(v.pScheinDocStorageKey),
    suspensionReason: v.suspensionReason,
    adminInternalNote: v.adminInternalNote,
  }));
}

export async function getAdminTaxiFleetDriverDetail(
  companyId: string,
  driverId: string,
): Promise<AdminTaxiFleetDriverRow | null> {
  const r = await findFleetDriverInCompany(driverId, companyId);
  if (!r) return null;
  const listRow = fleetDriverTableRowToList(r);
  const [gate, ass, veh] = await Promise.all([
    getCompanyGovernanceGate(companyId),
    listAssignmentsForCompany(companyId),
    listFleetVehiclesForCompany(companyId),
  ]);
  const av = assignedVehicleForDriver(listRow.id, ass, veh);
  const view: PanelFleetDriverView = {
    ...listRow,
    workflow: deriveDriverWorkflowLabel(listRow),
    readiness: computeDriverReadiness(gate, listRow, av != null, av),
  };
  return {
    ...view,
    assignedVehicle: assignedVehicleMeta(listRow.id, ass, veh),
    pScheinDocPresent: !pScheinDocMissing(listRow.pScheinDocStorageKey),
    suspensionReason: listRow.suspensionReason,
    adminInternalNote: listRow.adminInternalNote,
  };
}
