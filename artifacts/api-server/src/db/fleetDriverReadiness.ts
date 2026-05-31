import {
  companyHasFleetVehicleWithLicensePlate,
  companyMeetsTaxiDriverAppAccess,
  getCompanyGovernanceGate,
  type CompanyGovernanceGate,
} from "./companyGovernanceData";
import { findCompanyById } from "./adminData";
import {
  findFleetDriverInCompany,
  type FleetDriverListRow,
  fleetDriverTableRowToList,
} from "./fleetDriversData";
import { listAssignmentsForCompany } from "./fleetAssignmentsData";
import { listFleetVehiclesForCompany, type FleetVehicleRow } from "./fleetVehiclesData";
import { listFleetDriversForCompany } from "./fleetDriversData";
import { medicalTransportAuthorizationFromRows } from "../lib/medical/medicalTransportAuthorization";

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
  company_not_ready:
    "Unternehmen: Plattform-Zugang, Konzession oder mindestens ein Fahrzeug-Kennzeichen fehlen noch (Onroda-Prüfung).",
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

const DRIVER_APP_NOT_READY_TITLE = "Noch nicht freigeschaltet";

const DRIVER_APP_NOT_READY_LEAD =
  "Sie sind noch nicht freigeschaltet. Bitte wenden Sie sich an Ihren Betrieb. Die Anmeldung ist möglich; Aufträge sind bis zur Freigabe gesperrt.";

const DRIVER_APP_COMPANY_NOT_READY_ONLY =
  "Ihr Unternehmen ist noch nicht freigeschaltet. Bitte wenden Sie sich an Ihren Betrieb.";

/** Kurze Stichpunkte für Fahrer-App (nur noch Konto-/Unternehmens-Blocks). */
const DRIVER_APP_MISSING_SHORT: Partial<Record<DriverReadinessBlockCode, string>> = {
  company_not_ready: "Unternehmen: Zugang, Konzession oder Kennzeichen",
};

function driverAppMissingBullets(blockReasons: DriverReadinessBlock[]): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const b of blockReasons) {
    const short = DRIVER_APP_MISSING_SHORT[b.code];
    const line = short ?? b.message;
    if (!line || seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }
  return lines;
}

function buildDriverAppNotReadyMessage(readiness: DriverReadinessResult): string {
  const codes = new Set(readiness.blockReasons.map((b) => b.code));
  const driverFacing = readiness.blockReasons.filter((b) => b.code !== "company_not_ready");
  if (codes.has("company_not_ready") && driverFacing.length === 0) {
    return DRIVER_APP_COMPANY_NOT_READY_ONLY;
  }
  const bullets = driverAppMissingBullets(driverFacing);
  if (codes.has("company_not_ready")) {
    if (bullets.length === 0) return DRIVER_APP_COMPANY_NOT_READY_ONLY;
    return `${DRIVER_APP_COMPANY_NOT_READY_ONLY}\n\nBei Ihnen:\n• ${bullets.join("\n• ")}`;
  }
  if (bullets.length === 0) return DRIVER_APP_NOT_READY_LEAD;
  return `${DRIVER_APP_NOT_READY_LEAD}\n\nEs fehlt noch:\n• ${bullets.join("\n• ")}`;
}

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
  return {
    blockBannerTitle: DRIVER_APP_NOT_READY_TITLE,
    notFreigegebenMessage: buildDriverAppNotReadyMessage(readiness),
    driverBlockKind: "compliance",
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
    case "missing_documents":
      return { key: "missing_documents", label: "Unterlagen fehlen" };
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
 * Fahrer-App-Einsatzbereit: Onroda prüft nur Unternehmens-Zugang, Konzession, Kennzeichen;
 * P-Schein, Zuweisung und Fahrzeug-Freigabe pro Fahrer sind Sache des Unternehmers.
 */
const READINESS_OVERRIDE_HARD_STOPS: ReadonlySet<DriverReadinessBlockCode> = new Set([
  "driver_suspended",
  "driver_account_inactive",
  "driver_rejected",
]);

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
    | "readinessOverrideSystem"
    | "reservationSuspendedUntil"
  >,
  _hasVehicleAssignment: boolean,
  _assignedVehicle: FleetVehicleRow | null,
  hasFleetVehicleWithLicensePlate: boolean,
): DriverReadinessResult {
  const blockReasons: DriverReadinessBlock[] = [];
  if (!companyMeetsTaxiDriverAppAccess(gate, hasFleetVehicleWithLicensePlate)) {
    blockReasons.push({ code: "company_not_ready", message: MSG.company_not_ready });
  }
  if (!d.isActive) {
    blockReasons.push({ code: "driver_account_inactive", message: MSG.driver_account_inactive });
  } else if (d.accessStatus !== "active") {
    const sr = (d.suspensionReason ?? "").trim();
    const msg = sr ? `${MSG.driver_suspended} Grund: ${sr}` : MSG.driver_suspended;
    blockReasons.push({ code: "driver_suspended", message: msg });
  }
  if (d.reservationSuspendedUntil && new Date(d.reservationSuspendedUntil) > new Date()) {
    const until = new Date(d.reservationSuspendedUntil).toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
    blockReasons.push({ code: "driver_suspended", message: `Temporäre Sperre bis ${until}: Reservierung nicht rechtzeitig aktiviert.` });
  }
  if (d.approvalStatus === "rejected") {
    blockReasons.push({ code: "driver_rejected", message: MSG.driver_rejected });
  }
  if (d.readinessOverrideSystem) {
    const filtered = blockReasons.filter((b) => READINESS_OVERRIDE_HARD_STOPS.has(b.code));
    return { ready: filtered.length === 0, blockReasons: filtered };
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
  const [gate, rows, ass, veh, hasPlate] = await Promise.all([
    getCompanyGovernanceGate(companyId),
    listFleetDriversForCompany(companyId),
    listAssignmentsForCompany(companyId),
    listFleetVehiclesForCompany(companyId),
    companyHasFleetVehicleWithLicensePlate(companyId),
  ]);
  return rows.map((row) => {
    const av = assignedVehicleForDriver(row.id, ass, veh);
    return {
      ...row,
      workflow: deriveDriverWorkflowLabel(row),
      readiness: computeDriverReadiness(gate, row, av != null, av, hasPlate),
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
  const [gate, ass, veh, hasPlate] = await Promise.all([
    getCompanyGovernanceGate(companyId),
    listAssignmentsForCompany(companyId),
    listFleetVehiclesForCompany(companyId),
    companyHasFleetVehicleWithLicensePlate(companyId),
  ]);
  const av = assignedVehicleForDriver(listRow.id, ass, veh);
  return computeDriverReadiness(gate, listRow, av != null, av, hasPlate);
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
  medicalTransportCompanyEnabled: boolean;
  medicalTransportAuthorized: boolean;
};

async function medicalTransportFieldsForDriver(
  companyId: string,
  listRow: FleetDriverListRow,
): Promise<{ medicalTransportCompanyEnabled: boolean; medicalTransportAuthorized: boolean }> {
  const company = await findCompanyById(companyId);
  const auth = medicalTransportAuthorizationFromRows(
    {
      medical_transport_enabled: listRow.medicalTransportEnabled,
      medical_transport_inherit_from_company: listRow.medicalTransportInheritFromCompany,
    },
    { medical_transport_enabled: Boolean(company?.medical_transport_enabled) },
  );
  return {
    medicalTransportCompanyEnabled: auth.companyEnabled,
    medicalTransportAuthorized: auth.authorized,
  };
}

export async function listAdminTaxiFleetDriverRows(companyId: string): Promise<AdminTaxiFleetDriverRow[]> {
  const [views, ass, veh, company] = await Promise.all([
    getPanelFleetDriverViews(companyId),
    listAssignmentsForCompany(companyId),
    listFleetVehiclesForCompany(companyId),
    findCompanyById(companyId),
  ]);
  const companyEnabled = Boolean(company?.medical_transport_enabled);
  return views.map((v) => {
    const auth = medicalTransportAuthorizationFromRows(
      {
        medical_transport_enabled: v.medicalTransportEnabled,
        medical_transport_inherit_from_company: v.medicalTransportInheritFromCompany,
      },
      { medical_transport_enabled: companyEnabled },
    );
    return {
      ...v,
      assignedVehicle: assignedVehicleMeta(v.id, ass, veh),
      pScheinDocPresent: !pScheinDocMissing(v.pScheinDocStorageKey),
      suspensionReason: v.suspensionReason,
      adminInternalNote: v.adminInternalNote,
      medicalTransportCompanyEnabled: auth.companyEnabled,
      medicalTransportAuthorized: auth.authorized,
    };
  });
}

export async function getAdminTaxiFleetDriverDetail(
  companyId: string,
  driverId: string,
): Promise<AdminTaxiFleetDriverRow | null> {
  const r = await findFleetDriverInCompany(driverId, companyId);
  if (!r) return null;
  const listRow = fleetDriverTableRowToList(r);
  const [gate, ass, veh, hasPlate, medical] = await Promise.all([
    getCompanyGovernanceGate(companyId),
    listAssignmentsForCompany(companyId),
    listFleetVehiclesForCompany(companyId),
    companyHasFleetVehicleWithLicensePlate(companyId),
    medicalTransportFieldsForDriver(companyId, listRow),
  ]);
  const av = assignedVehicleForDriver(listRow.id, ass, veh);
  const view: PanelFleetDriverView = {
    ...listRow,
    workflow: deriveDriverWorkflowLabel(listRow),
    readiness: computeDriverReadiness(gate, listRow, av != null, av, hasPlate),
  };
  return {
    ...view,
    assignedVehicle: assignedVehicleMeta(listRow.id, ass, veh),
    pScheinDocPresent: !pScheinDocMissing(listRow.pScheinDocStorageKey),
    suspensionReason: listRow.suspensionReason,
    adminInternalNote: listRow.adminInternalNote,
    medicalTransportCompanyEnabled: medical.medicalTransportCompanyEnabled,
    medicalTransportAuthorized: medical.medicalTransportAuthorized,
  };
}
