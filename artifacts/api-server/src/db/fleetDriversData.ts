import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { adminCompaniesTable, fleetDriversTable } from "./schema";

export type FleetDriverAccessStatus = "active" | "suspended";
export type FleetDriverApprovalStatus =
  | "pending"
  | "in_review"
  | "missing_documents"
  | "approved"
  | "rejected";
export type FleetVehicleLegalType = "taxi" | "rental_car";
export type FleetVehicleClass = "standard" | "xl" | "wheelchair";

export interface FleetDriverAuthRow {
  id: string;
  company_id: string;
  session_version: number;
  is_active: boolean;
  access_status: FleetDriverAccessStatus;
}

export interface FleetDriverListRow {
  id: string;
  companyId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  accessStatus: FleetDriverAccessStatus;
  isActive: boolean;
  mustChangePassword: boolean;
  pScheinNumber: string;
  pScheinExpiry: string | null;
  pScheinDocStorageKey: string | null;
  /** Anschrift (optional, durch Unternehmer gepflegt). */
  homeAddress: string;
  driversLicenseNumber: string;
  driversLicenseExpiry: string | null;
  vehicleLegalType: FleetVehicleLegalType;
  vehicleClass: FleetVehicleClass;
  lastLoginAt: string | null;
  lastHeartbeatAt: string | null;
  createdAt: string;
  updatedAt: string;
  approvalStatus: FleetDriverApprovalStatus;
  /** Admin-gesetzter Sperrgrund (Anzeige). */
  suspensionReason: string;
  /** Interne Plattform-Notiz. */
  adminInternalNote: string;
  /** Operator: Readiness ohne Nachweis-/Fahrzeug-/Mandanten-Gate (Sperre & Freigabe bleiben). */
  readinessOverrideSystem: boolean;
}

export function normalizeFleetDriverApproval(raw: string | null | undefined): FleetDriverApprovalStatus {
  const t = String(raw ?? "")
    .toLowerCase()
    .trim();
  if (
    t === "in_review" ||
    t === "pending" ||
    t === "missing_documents" ||
    t === "rejected" ||
    t === "approved"
  )
    return t;
  return "pending";
}

/** Admin-Freigabe: zu erwartende Nachweise (blockiert nicht bei expliziter Admin-Bestätigung). */
export function computeFleetDriverComplianceGaps(
  d: Pick<FleetDriverListRow, "pScheinNumber" | "pScheinExpiry" | "pScheinDocStorageKey">,
): string[] {
  const gaps: string[] = [];
  if (!(d.pScheinNumber ?? "").trim()) gaps.push("P-Schein-Nummer fehlt");
  const exp = d.pScheinExpiry != null ? String(d.pScheinExpiry).trim() : "";
  if (!exp) gaps.push("P-Schein-Ablaufdatum fehlt");
  const doc = (d.pScheinDocStorageKey ?? "").trim();
  if (!doc) gaps.push("P-Schein-PDF-Nachweis fehlt");
  return gaps;
}

export function fleetDriverTableRowToList(r: typeof fleetDriversTable.$inferSelect): FleetDriverListRow {
  return {
    id: r.id,
    companyId: r.company_id,
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
    phone: r.phone,
    accessStatus: r.access_status as FleetDriverAccessStatus,
    isActive: r.is_active,
    mustChangePassword: r.must_change_password,
    pScheinNumber: r.p_schein_number,
    pScheinExpiry: r.p_schein_expiry ? String(r.p_schein_expiry) : null,
    pScheinDocStorageKey: r.p_schein_doc_storage_key,
    homeAddress: r.home_address ?? "",
    driversLicenseNumber: r.drivers_license_number ?? "",
    driversLicenseExpiry: r.drivers_license_expiry ? String(r.drivers_license_expiry) : null,
    vehicleLegalType: r.vehicle_legal_type as FleetVehicleLegalType,
    vehicleClass: r.vehicle_class as FleetVehicleClass,
    lastLoginAt: r.last_login_at ? r.last_login_at.toISOString() : null,
    lastHeartbeatAt: r.last_heartbeat_at ? r.last_heartbeat_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    approvalStatus: normalizeFleetDriverApproval(
      (r as { approval_status?: string | null }).approval_status ?? "approved",
    ),
    suspensionReason: (r as { suspension_reason?: string | null }).suspension_reason ?? "",
    adminInternalNote: (r as { admin_internal_note?: string | null }).admin_internal_note ?? "",
    readinessOverrideSystem: Boolean((r as { readiness_override_system?: boolean | null }).readiness_override_system),
  };
}

function rowToList(r: typeof fleetDriversTable.$inferSelect): FleetDriverListRow {
  return fleetDriverTableRowToList(r);
}

export async function getCompanyKind(companyId: string): Promise<string | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({ k: adminCompaniesTable.company_kind })
    .from(adminCompaniesTable)
    .where(eq(adminCompaniesTable.id, companyId))
    .limit(1);
  const k = rows[0]?.k;
  return typeof k === "string" ? k : null;
}

export async function findFleetDriverAuthRow(id: string): Promise<FleetDriverAuthRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({
      id: fleetDriversTable.id,
      company_id: fleetDriversTable.company_id,
      session_version: fleetDriversTable.session_version,
      is_active: fleetDriversTable.is_active,
      access_status: fleetDriversTable.access_status,
    })
    .from(fleetDriversTable)
    .where(eq(fleetDriversTable.id, id))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    company_id: r.company_id,
    session_version: r.session_version,
    is_active: r.is_active,
    access_status: r.access_status as FleetDriverAccessStatus,
  };
}

export async function findFleetDriverByEmailNormalized(
  email: string,
): Promise<(typeof fleetDriversTable.$inferSelect) | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const em = email.trim().toLowerCase();
  if (!em) return null;
  const rows = await db
    .select()
    .from(fleetDriversTable)
    .where(sql`lower(trim(${fleetDriversTable.email})) = ${em}`)
    .limit(1);
  return rows[0] ?? null;
}

export async function findFleetDriverGlobal(id: string): Promise<(typeof fleetDriversTable.$inferSelect) | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db.select().from(fleetDriversTable).where(eq(fleetDriversTable.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findFleetDriverInCompany(
  id: string,
  companyId: string,
): Promise<(typeof fleetDriversTable.$inferSelect) | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(fleetDriversTable)
    .where(and(eq(fleetDriversTable.id, id), eq(fleetDriversTable.company_id, companyId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listFleetDriversForCompany(companyId: string): Promise<FleetDriverListRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(fleetDriversTable)
    .where(eq(fleetDriversTable.company_id, companyId));
  return rows.map(rowToList);
}

export async function insertFleetDriver(input: {
  companyId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  passwordHash: string;
  mustChangePassword: boolean;
  vehicleLegalType?: FleetVehicleLegalType;
  vehicleClass?: FleetVehicleClass;
  pScheinNumber?: string;
  pScheinExpiry?: string | null;
  homeAddress?: string;
  driversLicenseNumber?: string;
  driversLicenseExpiry?: string | null;
  /** Neu angelegte Fahrer gelten im Mandanten als nutzbar; Plattform prüft Einsatz über Readiness (Nachweise/Fahrzeug). */
  approvalStatus?: FleetDriverApprovalStatus;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!isPostgresConfigured()) return { ok: false, error: "database_not_configured" };
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const email = input.email.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "email_invalid" };
  }
  const existing = await findFleetDriverByEmailNormalized(email);
  if (existing) {
    return { ok: false, error: "email_taken" };
  }
  const id = `fd-${randomUUID()}`;
  const pExp = input.pScheinExpiry?.trim();
  const dlExp = input.driversLicenseExpiry?.trim();
  await db.insert(fleetDriversTable).values({
    id,
    company_id: input.companyId,
    email,
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    phone: input.phone.trim(),
    password_hash: input.passwordHash,
    must_change_password: input.mustChangePassword,
    vehicle_legal_type: input.vehicleLegalType ?? "taxi",
    vehicle_class: input.vehicleClass ?? "standard",
    p_schein_number: (input.pScheinNumber ?? "").trim(),
    p_schein_expiry: pExp ? pExp : null,
    home_address: (input.homeAddress ?? "").trim(),
    drivers_license_number: (input.driversLicenseNumber ?? "").trim(),
    drivers_license_expiry: dlExp ? dlExp : null,
    is_active: true,
    access_status: "active",
    approval_status: input.approvalStatus ?? "approved",
    session_version: 1,
  });
  return { ok: true, id };
}

export async function patchFleetDriverProfile(
  id: string,
  companyId: string,
  patch: Partial<{
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    isActive: boolean;
    pScheinNumber: string;
    pScheinExpiry: string | null;
    pScheinDocStorageKey: string | null;
    vehicleLegalType: FleetVehicleLegalType;
    vehicleClass: FleetVehicleClass;
    homeAddress: string;
    driversLicenseNumber: string;
    driversLicenseExpiry: string | null;
  }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cur = await findFleetDriverInCompany(id, companyId);
  if (!cur) return { ok: false, error: "not_found" };
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const set: Partial<typeof fleetDriversTable.$inferInsert> = { updated_at: new Date() };
  let bumpSession = false;

  if (patch.email !== undefined) {
    const em = patch.email.trim().toLowerCase();
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      return { ok: false, error: "email_invalid" };
    }
    const other = await findFleetDriverByEmailNormalized(em);
    if (other && other.id !== id) {
      return { ok: false, error: "email_taken" };
    }
    set.email = em;
    bumpSession = true;
  }
  if (patch.isActive !== undefined) {
    set.is_active = patch.isActive;
    bumpSession = true;
  }

  if (patch.firstName !== undefined) set.first_name = patch.firstName.trim();
  if (patch.lastName !== undefined) set.last_name = patch.lastName.trim();
  if (patch.phone !== undefined) set.phone = patch.phone.trim();
  if (patch.pScheinNumber !== undefined) set.p_schein_number = patch.pScheinNumber.trim();
  if (patch.pScheinExpiry !== undefined) {
    const raw = patch.pScheinExpiry?.trim();
    set.p_schein_expiry = raw ? raw : null;
  }
  if (patch.pScheinDocStorageKey !== undefined) set.p_schein_doc_storage_key = patch.pScheinDocStorageKey;
  if (patch.vehicleLegalType !== undefined) set.vehicle_legal_type = patch.vehicleLegalType;
  if (patch.vehicleClass !== undefined) set.vehicle_class = patch.vehicleClass;
  if (patch.homeAddress !== undefined) set.home_address = patch.homeAddress.trim();
  if (patch.driversLicenseNumber !== undefined) set.drivers_license_number = patch.driversLicenseNumber.trim();
  if (patch.driversLicenseExpiry !== undefined) {
    const raw = patch.driversLicenseExpiry?.trim();
    set.drivers_license_expiry = raw ? raw : null;
  }

  if (bumpSession) {
    set.session_version = sql`${fleetDriversTable.session_version} + 1`;
  }

  await db.update(fleetDriversTable).set(set).where(and(eq(fleetDriversTable.id, id), eq(fleetDriversTable.company_id, companyId)));
  return { ok: true };
}

export async function updateFleetDriverPassword(
  id: string,
  companyId: string,
  passwordHash: string,
  mustChangePassword: boolean,
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const r = await db
    .update(fleetDriversTable)
    .set({
      password_hash: passwordHash,
      must_change_password: mustChangePassword,
      updated_at: new Date(),
      session_version: sql`${fleetDriversTable.session_version} + 1`,
    })
    .where(and(eq(fleetDriversTable.id, id), eq(fleetDriversTable.company_id, companyId)))
    .returning({ id: fleetDriversTable.id });
  return r.length > 0;
}

export async function suspendFleetDriver(id: string, companyId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const r = await db
    .update(fleetDriversTable)
    .set({
      access_status: "suspended",
      is_active: true,
      updated_at: new Date(),
      session_version: sql`${fleetDriversTable.session_version} + 1`,
    })
    .where(and(eq(fleetDriversTable.id, id), eq(fleetDriversTable.company_id, companyId)))
    .returning({ id: fleetDriversTable.id });
  return r.length > 0;
}

export async function activateFleetDriver(id: string, companyId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const r = await db
    .update(fleetDriversTable)
    .set({
      access_status: "active",
      is_active: true,
      updated_at: new Date(),
      session_version: sql`${fleetDriversTable.session_version} + 1`,
    })
    .where(and(eq(fleetDriversTable.id, id), eq(fleetDriversTable.company_id, companyId)))
    .returning({ id: fleetDriversTable.id });
  return r.length > 0;
}

/** Globale Admin-ID ohne Mandant im Pfad — nur für Legacy-Routen; nutzt `company_id` aus der Zeile. */
export async function setFleetDriverApprovalByAdmin(
  driverId: string,
  nextStatus: FleetDriverApprovalStatus,
  opts?: { rejectionReason?: string; acknowledgeIncompleteDocuments?: boolean },
): Promise<{ ok: true } | { ok: false; error: string; gaps?: string[] }> {
  const row = await findFleetDriverGlobal(driverId);
  if (!row) return { ok: false, error: "not_found" };
  const companyId = row.company_id;
  if (nextStatus === "approved") {
    return approveFleetDriverForCompany(companyId, driverId, {
      acknowledgeIncompleteDocuments: opts?.acknowledgeIncompleteDocuments === true,
    });
  }
  if (nextStatus === "rejected") {
    const reason = String(opts?.rejectionReason ?? "").trim();
    return rejectFleetDriverForCompany(companyId, driverId, reason);
  }
  if (nextStatus === "missing_documents") {
    return markFleetDriverMissingDocumentsForCompany(companyId, driverId);
  }
  return setFleetDriverApprovalStatusOnlyForCompany(companyId, driverId, nextStatus);
}

export async function approveFleetDriverForCompany(
  companyId: string,
  driverId: string,
  opts: { acknowledgeIncompleteDocuments?: boolean },
): Promise<{ ok: true } | { ok: false; error: string; gaps?: string[] }> {
  const cur = await findFleetDriverInCompany(driverId, companyId);
  if (!cur) return { ok: false, error: "not_found" };
  const st = normalizeFleetDriverApproval((cur as { approval_status?: string | null }).approval_status);
  if (!["pending", "in_review", "missing_documents"].includes(st)) {
    return { ok: false, error: "not_pending" };
  }
  const listRow = fleetDriverTableRowToList(cur);
  const gaps = computeFleetDriverComplianceGaps(listRow);
  if (gaps.length > 0 && !opts.acknowledgeIncompleteDocuments) {
    return { ok: false, error: "incomplete_documents_ack_required", gaps };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const u = await db
    .update(fleetDriversTable)
    .set({ approval_status: "approved", updated_at: new Date() })
    .where(and(eq(fleetDriversTable.id, driverId), eq(fleetDriversTable.company_id, companyId)))
    .returning({ id: fleetDriversTable.id });
  return u[0] ? { ok: true } : { ok: false, error: "not_found" };
}

export async function rejectFleetDriverForCompany(
  companyId: string,
  driverId: string,
  rejectionReason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const reason = String(rejectionReason ?? "").trim();
  if (!reason) return { ok: false, error: "rejection_reason_required" };
  const cur = await findFleetDriverInCompany(driverId, companyId);
  if (!cur) return { ok: false, error: "not_found" };
  const st = normalizeFleetDriverApproval((cur as { approval_status?: string | null }).approval_status);
  if (!["pending", "in_review", "missing_documents"].includes(st)) {
    return { ok: false, error: "not_pending" };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const u = await db
    .update(fleetDriversTable)
    .set({ approval_status: "rejected", updated_at: new Date() })
    .where(and(eq(fleetDriversTable.id, driverId), eq(fleetDriversTable.company_id, companyId)))
    .returning({ id: fleetDriversTable.id });
  return u[0] ? { ok: true } : { ok: false, error: "not_found" };
}

/** Admin: „Unterlagen fehlen“ — Fahrer bleibt im Pool, aber ohne Plattform-Freigabe. */
export async function markFleetDriverMissingDocumentsForCompany(
  companyId: string,
  driverId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cur = await findFleetDriverInCompany(driverId, companyId);
  if (!cur) return { ok: false, error: "not_found" };
  const st = normalizeFleetDriverApproval((cur as { approval_status?: string | null }).approval_status);
  if (!["pending", "in_review", "approved"].includes(st)) {
    return { ok: false, error: "invalid_state" };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const u = await db
    .update(fleetDriversTable)
    .set({ approval_status: "missing_documents", updated_at: new Date() })
    .where(and(eq(fleetDriversTable.id, driverId), eq(fleetDriversTable.company_id, companyId)))
    .returning({ id: fleetDriversTable.id });
  return u[0] ? { ok: true } : { ok: false, error: "not_found" };
}

/** Nur Statuswechsel ohne Freigabe-/Ablehnungslogik (z. B. Korrektur pending ↔ in_review). */
export async function setFleetDriverApprovalStatusOnlyForCompany(
  companyId: string,
  driverId: string,
  nextStatus: FleetDriverApprovalStatus,
): Promise<{ ok: true } | { ok: false; error: "not_found" | "invalid_status" }> {
  const allowed: FleetDriverApprovalStatus[] = ["pending", "in_review", "missing_documents"];
  if (!allowed.includes(nextStatus)) return { ok: false, error: "invalid_status" };
  const db = getDb();
  if (!db) return { ok: false, error: "not_found" };
  const u = await db
    .update(fleetDriversTable)
    .set({ approval_status: nextStatus, updated_at: new Date() })
    .where(and(eq(fleetDriversTable.id, driverId), eq(fleetDriversTable.company_id, companyId)))
    .returning({ id: fleetDriversTable.id });
  return u[0] ? { ok: true } : { ok: false, error: "not_found" };
}

/** Plattform-Admin: `approval_status` mit Mandantenbindung. */
/** Plattform-Admin: System-Readiness-Override (Tests trotz fehlender Unterlagen). */
export async function setFleetDriverReadinessOverrideSystem(
  companyId: string,
  driverId: string,
  enabled: boolean,
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const r = await db
    .update(fleetDriversTable)
    .set({ readiness_override_system: enabled, updated_at: new Date() })
    .where(and(eq(fleetDriversTable.id, driverId), eq(fleetDriversTable.company_id, companyId)))
    .returning({ id: fleetDriversTable.id });
  return r.length > 0;
}

/** @deprecated Nutze approve/reject/markMissing oder `setFleetDriverApprovalStatusOnlyForCompany`. */
export async function setFleetDriverApprovalForCompany(
  companyId: string,
  driverId: string,
  nextStatus: FleetDriverApprovalStatus,
): Promise<{ ok: true } | { ok: false; error: "not_found" | "invalid_status" }> {
  return setFleetDriverApprovalStatusOnlyForCompany(companyId, driverId, nextStatus);
}

const MAX_SUS_REASON = 2000;
const MAX_ADMIN_NOTE = 4000;

/** Plattform-Admin: Fahrer sperren inkl. Sperrgrund (Mandant gebunden). */
export async function adminSuspendFleetDriver(
  companyId: string,
  driverId: string,
  suspensionReason: string,
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const reason = String(suspensionReason ?? "")
    .trim()
    .slice(0, MAX_SUS_REASON);
  const r = await db
    .update(fleetDriversTable)
    .set({
      access_status: "suspended",
      is_active: true,
      suspension_reason: reason,
      updated_at: new Date(),
      session_version: sql`${fleetDriversTable.session_version} + 1`,
    })
    .where(and(eq(fleetDriversTable.id, driverId), eq(fleetDriversTable.company_id, companyId)))
    .returning({ id: fleetDriversTable.id });
  return r.length > 0;
}

/** Plattform-Admin: entsperren / aktivieren (Mandant gebunden). */
export async function adminActivateFleetDriver(companyId: string, driverId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const r = await db
    .update(fleetDriversTable)
    .set({
      access_status: "active",
      is_active: true,
      suspension_reason: "",
      updated_at: new Date(),
      session_version: sql`${fleetDriversTable.session_version} + 1`,
    })
    .where(and(eq(fleetDriversTable.id, driverId), eq(fleetDriversTable.company_id, companyId)))
    .returning({ id: fleetDriversTable.id });
  return r.length > 0;
}

export async function adminPatchFleetDriverAdminFields(
  companyId: string,
  driverId: string,
  patch: { adminInternalNote?: string; suspensionReason?: string },
): Promise<boolean> {
  if (patch.adminInternalNote === undefined && patch.suspensionReason === undefined) return true;
  const db = getDb();
  if (!db) return false;
  const set: Partial<typeof fleetDriversTable.$inferInsert> = { updated_at: new Date() };
  if (patch.adminInternalNote !== undefined) {
    set.admin_internal_note = String(patch.adminInternalNote).trim().slice(0, MAX_ADMIN_NOTE);
  }
  if (patch.suspensionReason !== undefined) {
    set.suspension_reason = String(patch.suspensionReason).trim().slice(0, MAX_SUS_REASON);
  }
  const r = await db
    .update(fleetDriversTable)
    .set(set)
    .where(and(eq(fleetDriversTable.id, driverId), eq(fleetDriversTable.company_id, companyId)))
    .returning({ id: fleetDriversTable.id });
  return r.length > 0;
}

export async function touchFleetDriverLogin(id: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .update(fleetDriversTable)
    .set({ last_login_at: new Date(), updated_at: new Date() })
    .where(eq(fleetDriversTable.id, id));
}

export async function touchFleetDriverHeartbeat(id: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .update(fleetDriversTable)
    .set({ last_heartbeat_at: new Date(), updated_at: new Date() })
    .where(eq(fleetDriversTable.id, id));
}

/** P-Schein-Datum liegt heute oder innerhalb der nächsten `withinDays` (UTC-Datum). */
export async function countFleetDriversPScheinExpiringSoon(
  companyId: string,
  withinDays: number,
): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const until = new Date(today);
  until.setUTCDate(until.getUTCDate() + withinDays);
  const todayStr = today.toISOString().slice(0, 10);
  const untilStr = until.toISOString().slice(0, 10);
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(fleetDriversTable)
    .where(
      and(
        eq(fleetDriversTable.company_id, companyId),
        isNotNull(fleetDriversTable.p_schein_expiry),
        gte(fleetDriversTable.p_schein_expiry, todayStr),
        lte(fleetDriversTable.p_schein_expiry, untilStr),
      ),
    );
  return Number(rows[0]?.n ?? 0);
}

export async function countFleetDriversOnline(companyId: string, withinSeconds: number): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const since = new Date(Date.now() - withinSeconds * 1000);
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(fleetDriversTable)
    .where(
      and(
        eq(fleetDriversTable.company_id, companyId),
        eq(fleetDriversTable.access_status, "active"),
        eq(fleetDriversTable.is_active, true),
        isNotNull(fleetDriversTable.last_heartbeat_at),
        gte(fleetDriversTable.last_heartbeat_at, since),
      ),
    );
  return Number(rows[0]?.n ?? 0);
}

/** Admin-Dashboard / Operator-Snapshot: Taxi-Fahrer mit offener Plattform-Freigabe. */
export type FleetDriverAdminPendingRow = {
  driverId: string;
  companyId: string;
  companyName: string;
  firstName: string;
  lastName: string;
  email: string;
  approvalStatus: string;
  updatedAt: string;
};

export async function countPendingFleetDriversForAdmin(): Promise<number> {
  if (!isPostgresConfigured()) return 0;
  const db = getDb();
  if (!db) return 0;
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(fleetDriversTable)
    .innerJoin(adminCompaniesTable, eq(fleetDriversTable.company_id, adminCompaniesTable.id))
    .where(
      and(
        eq(adminCompaniesTable.company_kind, "taxi"),
        inArray(fleetDriversTable.approval_status, ["pending", "in_review", "missing_documents"]),
      ),
    );
  return Number(rows[0]?.n ?? 0);
}

export async function listPendingFleetDriversForAdmin(limit?: number): Promise<FleetDriverAdminPendingRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const lim = typeof limit === "number" && limit > 0 ? Math.min(500, limit) : 5;
  const rows = await db
    .select({
      driverId: fleetDriversTable.id,
      companyId: fleetDriversTable.company_id,
      companyName: adminCompaniesTable.name,
      firstName: fleetDriversTable.first_name,
      lastName: fleetDriversTable.last_name,
      email: fleetDriversTable.email,
      approvalStatus: fleetDriversTable.approval_status,
      updatedAt: fleetDriversTable.updated_at,
    })
    .from(fleetDriversTable)
    .innerJoin(adminCompaniesTable, eq(fleetDriversTable.company_id, adminCompaniesTable.id))
    .where(
      and(
        eq(adminCompaniesTable.company_kind, "taxi"),
        inArray(fleetDriversTable.approval_status, ["pending", "in_review", "missing_documents"]),
      ),
    )
    .orderBy(desc(fleetDriversTable.updated_at))
    .limit(lim);
  return rows.map((r) => ({
    driverId: r.driverId,
    companyId: r.companyId,
    companyName: r.companyName,
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    approvalStatus: r.approvalStatus,
    updatedAt: r.updatedAt.toISOString(),
  }));
}
