import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { adminCompaniesTable, fleetVehiclesTable } from "./schema";

export type FleetVehicleType = "sedan" | "station_wagon" | "van" | "wheelchair";
export type FleetVehicleLegalType = "taxi" | "rental_car";
export type FleetVehicleClass = "standard" | "xl" | "wheelchair";

export type FleetVehicleApprovalStatus =
  | "draft"
  | "pending_approval"
  | "missing_documents"
  | "approved"
  | "rejected"
  | "blocked";

/** Partner-Upload-Typ; Pflicht-Kombination für Einreichung: Konzession + Fahrzeugschein (oder nur Legacy-Uploads ohne kind). */
export const FLEET_VEHICLE_DOCUMENT_KINDS = [
  "concession",
  "registration",
  "insurance",
  "taximeter",
  "accessibility",
] as const;
export type FleetVehicleDocumentKind = (typeof FLEET_VEHICLE_DOCUMENT_KINDS)[number];

export interface VehicleDocumentRef {
  storageKey: string;
  uploadedAt?: string;
  kind?: FleetVehicleDocumentKind;
  /** Panel-Benutzer, der den Upload ausgelöst hat (Nachvollziehbarkeit für Admin). */
  uploadedByPanelUserId?: string | null;
}

export interface FleetVehicleRow {
  id: string;
  companyId: string;
  licensePlate: string;
  vin: string;
  color: string;
  model: string;
  vehicleType: FleetVehicleType;
  vehicleLegalType: FleetVehicleLegalType;
  vehicleClass: FleetVehicleClass;
  taxiOrderNumber: string;
  konzessionNumber: string;
  vehicleDocuments: VehicleDocumentRef[];
  approvalStatus: FleetVehicleApprovalStatus;
  rejectionReason: string;
  adminInternalNote: string;
  blockReason: string;
  modelYear: number | null;
  passengerSeats: number | null;
  approvalDecidedAt: string | null;
  nextInspectionDate: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function parseFleetVehicleDocumentKind(raw: unknown): FleetVehicleDocumentKind | undefined {
  if (typeof raw !== "string") return undefined;
  const k = raw.trim().toLowerCase();
  return (FLEET_VEHICLE_DOCUMENT_KINDS as readonly string[]).includes(k) ? (k as FleetVehicleDocumentKind) : undefined;
}

function parseDocuments(raw: unknown): VehicleDocumentRef[] {
  if (!Array.isArray(raw)) return [];
  const out: VehicleDocumentRef[] = [];
  for (const x of raw) {
    if (x && typeof x === "object" && "storageKey" in x && typeof (x as { storageKey: unknown }).storageKey === "string") {
      const sk = (x as { storageKey: string }).storageKey;
      const uploadedAt = "uploadedAt" in x && typeof (x as { uploadedAt?: string }).uploadedAt === "string" ? (x as { uploadedAt: string }).uploadedAt : undefined;
      const kind = parseFleetVehicleDocumentKind((x as { kind?: unknown }).kind);
      const uploadedByPanelUserId =
        "uploadedByPanelUserId" in x &&
        ((x as { uploadedByPanelUserId?: unknown }).uploadedByPanelUserId === null ||
          typeof (x as { uploadedByPanelUserId?: unknown }).uploadedByPanelUserId === "string")
          ? ((x as { uploadedByPanelUserId: string | null }).uploadedByPanelUserId ?? null)
          : undefined;
      if (sk) out.push({ storageKey: sk, uploadedAt, kind, uploadedByPanelUserId });
    }
  }
  return out;
}

/** Einreichung: beide Pflichttypen ODER ausschließlich ältere Uploads ohne `kind` (Bestand). */
export function fleetVehicleSubmitDocumentsSatisfied(docs: VehicleDocumentRef[]): boolean {
  if (!docs.length) return false;
  const hasConc = docs.some((d) => d.kind === "concession");
  const hasReg = docs.some((d) => d.kind === "registration");
  if (hasConc && hasReg) return true;
  const allUntyped = docs.every((d) => d.kind == null || d.kind === undefined);
  return allUntyped;
}

function rowToVehicle(r: typeof fleetVehiclesTable.$inferSelect): FleetVehicleRow {
  return {
    id: r.id,
    companyId: r.company_id,
    licensePlate: r.license_plate,
    vin: r.vin,
    color: r.color,
    model: r.model,
    vehicleType: r.vehicle_type as FleetVehicleType,
    vehicleLegalType: r.vehicle_legal_type as FleetVehicleLegalType,
    vehicleClass: r.vehicle_class as FleetVehicleClass,
    taxiOrderNumber: r.taxi_order_number,
    konzessionNumber: r.konzession_number ?? "",
    vehicleDocuments: parseDocuments(r.vehicle_documents),
    approvalStatus: (r.approval_status as FleetVehicleApprovalStatus) ?? "draft",
    rejectionReason: r.rejection_reason ?? "",
    adminInternalNote: r.admin_internal_note ?? "",
    blockReason: r.block_reason ?? "",
    modelYear: r.model_year ?? null,
    passengerSeats: r.passenger_seats ?? null,
    approvalDecidedAt: r.approval_decided_at ? r.approval_decided_at.toISOString() : null,
    nextInspectionDate: r.next_inspection_date ? String(r.next_inspection_date) : null,
    isActive: r.is_active,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function countActiveFleetVehicles(companyId: string): Promise<number> {
  if (!isPostgresConfigured()) return 0;
  const db = getDb();
  if (!db) return 0;
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(fleetVehiclesTable)
    .where(
      and(eq(fleetVehiclesTable.company_id, companyId), eq(fleetVehiclesTable.approval_status, "approved")),
    );
  return Number(rows[0]?.n ?? 0);
}

export async function listFleetVehiclesForCompany(companyId: string): Promise<FleetVehicleRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const rows = await db.select().from(fleetVehiclesTable).where(eq(fleetVehiclesTable.company_id, companyId));
  return rows.map(rowToVehicle);
}

/** Mandanten-sichere Abfrage; für Admin-Routen mit `/:companyId/` vor Statusänderung verwenden. */
export async function findFleetVehicleInCompany(
  id: string,
  companyId: string,
): Promise<(typeof fleetVehiclesTable.$inferSelect) | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(fleetVehiclesTable)
    .where(and(eq(fleetVehiclesTable.id, id), eq(fleetVehiclesTable.company_id, companyId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function findFleetVehicleGlobal(id: string): Promise<(typeof fleetVehiclesTable.$inferSelect) | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db.select().from(fleetVehiclesTable).where(eq(fleetVehiclesTable.id, id)).limit(1);
  return rows[0] ?? null;
}

export interface FleetVehicleAdminListRow {
  vehicle: FleetVehicleRow;
  companyName: string;
}

export async function countPendingFleetVehiclesForAdmin(): Promise<number> {
  if (!isPostgresConfigured()) return 0;
  const db = getDb();
  if (!db) return 0;
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(fleetVehiclesTable)
    .where(
      sql`${fleetVehiclesTable.approval_status} IN ('pending_approval','missing_documents')`,
    );
  return Number(rows[0]?.n ?? 0);
}

export async function listPendingFleetVehiclesForAdmin(limit?: number): Promise<FleetVehicleAdminListRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const q = db
    .select({
      v: fleetVehiclesTable,
      companyName: adminCompaniesTable.name,
    })
    .from(fleetVehiclesTable)
    .innerJoin(adminCompaniesTable, eq(fleetVehiclesTable.company_id, adminCompaniesTable.id))
    .where(sql`${fleetVehiclesTable.approval_status} IN ('pending_approval','missing_documents')`)
    .orderBy(desc(fleetVehiclesTable.updated_at));
  const rows =
    typeof limit === "number" && limit > 0
      ? await q.limit(Math.min(500, limit))
      : await q;
  return rows.map((r) => ({
    vehicle: rowToVehicle(r.v),
    companyName: r.companyName,
  }));
}

function syncIsActiveForStatus(s: FleetVehicleApprovalStatus): boolean {
  return s === "approved";
}

/** Für Admin-Freigabe: welche Lücken sollten bestätigt werden (blockiert nicht, wenn Admin explizit bestätigt). */
export function computeFleetVehicleComplianceGaps(v: Pick<FleetVehicleRow, "vehicleDocuments" | "nextInspectionDate">): string[] {
  const gaps: string[] = [];
  const docs = Array.isArray(v.vehicleDocuments) ? v.vehicleDocuments : [];
  const hasConc = docs.some((d) => d.kind === "concession");
  const hasReg = docs.some((d) => d.kind === "registration");
  const allUntyped = docs.length > 0 && docs.every((d) => d.kind == null || d.kind === undefined);
  if (docs.length < 1) {
    gaps.push("Kein Fahrzeug-PDF-Nachweis hochgeladen");
  } else if (!allUntyped) {
    if (!hasConc) gaps.push("Konzessionsnachweis (PDF) fehlt oder nicht als Typ „Konzession“ hochgeladen");
    if (!hasReg) gaps.push("Fahrzeugschein / Zulassungsbescheinigung (PDF) fehlt oder nicht als Typ „Fahrzeugschein“ hochgeladen");
  }
  const hu = v.nextInspectionDate != null ? String(v.nextInspectionDate).trim() : "";
  if (!hu) gaps.push("HU-Datum (Hauptuntersuchung) fehlt");
  return gaps;
}

export async function insertFleetVehicle(input: {
  companyId: string;
  licensePlate: string;
  vin?: string;
  color?: string;
  model?: string;
  vehicleType: FleetVehicleType;
  vehicleLegalType?: FleetVehicleLegalType;
  vehicleClass?: FleetVehicleClass;
  taxiOrderNumber?: string;
  konzessionNumber?: string;
  nextInspectionDate?: string | null;
  approvalStatus: FleetVehicleApprovalStatus;
  vehicleDocuments?: VehicleDocumentRef[];
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!isPostgresConfigured()) return { ok: false, error: "database_not_configured" };
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const plate = input.licensePlate.trim();
  if (!plate) return { ok: false, error: "license_plate_required" };
  const kz = (input.konzessionNumber ?? "").trim();
  if (!kz) return { ok: false, error: "konzession_number_required" };
  const id = `fv-${randomUUID()}`;
  const status = input.approvalStatus;
  const isActive = syncIsActiveForStatus(status);
  const docs = input.vehicleDocuments ?? [];
  const taxiNum = (input.taxiOrderNumber ?? "").trim();
  await db.insert(fleetVehiclesTable).values({
    id,
    company_id: input.companyId,
    license_plate: plate,
    vin: (input.vin ?? "").trim(),
    color: (input.color ?? "").trim(),
    model: (input.model ?? "").trim(),
    vehicle_type: input.vehicleType,
    vehicle_legal_type: input.vehicleLegalType ?? "taxi",
    vehicle_class: input.vehicleClass ?? "standard",
    taxi_order_number: taxiNum || kz,
    konzession_number: kz,
    vehicle_documents: docs,
    next_inspection_date: input.nextInspectionDate?.trim() || null,
    approval_status: status,
    is_active: isActive,
  });
  return { ok: true, id };
}

/**
 * Neue Dokumentversion anhängen (kein Entfernen durch Partner).
 * Ersetzen = erneuter Upload gleichen `kind` → zusätzlicher Eintrag; ältere Dateien bleiben in der Historie.
 */
export async function addFleetVehicleDocumentVersion(
  id: string,
  companyId: string,
  storageKey: string,
  meta: { kind: FleetVehicleDocumentKind; uploadedByPanelUserId: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cur = await findFleetVehicleInCompany(id, companyId);
  if (!cur) return { ok: false, error: "not_found" };
  if (!["draft", "rejected", "pending_approval", "missing_documents"].includes(String(cur.approval_status))) {
    return { ok: false, error: "documents_locked" };
  }
  const existing = parseDocuments(cur.vehicle_documents);
  const entry: VehicleDocumentRef = {
    storageKey,
    uploadedAt: new Date().toISOString(),
    kind: meta.kind,
    uploadedByPanelUserId: meta.uploadedByPanelUserId,
  };
  const next: VehicleDocumentRef[] = [...existing, entry];
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  await db
    .update(fleetVehiclesTable)
    .set({
      vehicle_documents: next,
      updated_at: new Date(),
    })
    .where(and(eq(fleetVehiclesTable.id, id), eq(fleetVehiclesTable.company_id, companyId)));
  return { ok: true };
}

export async function submitFleetVehicleForApproval(
  id: string,
  companyId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cur = await findFleetVehicleInCompany(id, companyId);
  if (!cur) return { ok: false, error: "not_found" };
  const st = String(cur.approval_status);
  const kz = (cur.konzession_number ?? "").trim();
  const plate = (cur.license_plate ?? "").trim();
  const docs = parseDocuments(cur.vehicle_documents);

  /** Partner legt neu mit `pending_approval` an; UI ruft danach weiter „Einreichen“ auf — idempotent mit gleichen Pflichtprüfungen. */
  if (st === "pending_approval") {
    if (!kz) return { ok: false, error: "konzession_number_required" };
    if (!plate) return { ok: false, error: "license_plate_required" };
    if (!fleetVehicleSubmitDocumentsSatisfied(docs)) return { ok: false, error: "documents_required" };
    return { ok: true };
  }

  if (st !== "draft" && st !== "rejected" && st !== "missing_documents") return { ok: false, error: "invalid_state" };
  if (!kz) return { ok: false, error: "konzession_number_required" };
  if (!plate) return { ok: false, error: "license_plate_required" };
  if (!fleetVehicleSubmitDocumentsSatisfied(docs)) return { ok: false, error: "documents_required" };
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  await db
    .update(fleetVehiclesTable)
    .set({
      approval_status: "pending_approval",
      is_active: false,
      rejection_reason: "",
      updated_at: new Date(),
    })
    .where(and(eq(fleetVehiclesTable.id, id), eq(fleetVehiclesTable.company_id, companyId)));
  return { ok: true };
}

export async function patchFleetVehicle(
  id: string,
  companyId: string,
  patch: Partial<{
    licensePlate: string;
    vin: string;
    color: string;
    model: string;
    vehicleType: FleetVehicleType;
    vehicleLegalType: FleetVehicleLegalType;
    vehicleClass: FleetVehicleClass;
    taxiOrderNumber: string;
    konzessionNumber: string;
    nextInspectionDate: string | null;
  }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cur = await findFleetVehicleInCompany(id, companyId);
  if (!cur) return { ok: false, error: "not_found" };
  const st = String(cur.approval_status);
  if (st === "pending_approval" || st === "missing_documents" || st === "approved" || st === "blocked") {
    const allowed: (keyof typeof patch)[] = ["nextInspectionDate", "color", "model"];
    const keys = Object.keys(patch) as (keyof typeof patch)[];
    for (const k of keys) {
      if (patch[k] !== undefined && !allowed.includes(k)) {
        return { ok: false, error: "field_locked" };
      }
    }
  }
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const set: Partial<typeof fleetVehiclesTable.$inferInsert> = { updated_at: new Date() };
  if (patch.licensePlate !== undefined) set.license_plate = patch.licensePlate.trim();
  if (patch.vin !== undefined) set.vin = patch.vin.trim();
  if (patch.color !== undefined) set.color = patch.color.trim();
  if (patch.model !== undefined) set.model = patch.model.trim();
  if (patch.vehicleType !== undefined) set.vehicle_type = patch.vehicleType;
  if (patch.vehicleLegalType !== undefined) set.vehicle_legal_type = patch.vehicleLegalType;
  if (patch.vehicleClass !== undefined) set.vehicle_class = patch.vehicleClass;
  if (patch.taxiOrderNumber !== undefined) set.taxi_order_number = patch.taxiOrderNumber.trim();
  if (patch.konzessionNumber !== undefined) {
    set.konzession_number = patch.konzessionNumber.trim();
    set.taxi_order_number = patch.konzessionNumber.trim();
  }
  if (patch.nextInspectionDate !== undefined) {
    set.next_inspection_date = patch.nextInspectionDate?.trim() ? patch.nextInspectionDate.trim() : null;
  }
  await db
    .update(fleetVehiclesTable)
    .set(set)
    .where(and(eq(fleetVehiclesTable.id, id), eq(fleetVehiclesTable.company_id, companyId)));
  return { ok: true };
}

export async function setFleetVehicleApprovalByAdmin(
  id: string,
  input: {
    nextStatus: "approved" | "rejected";
    rejectionReason?: string;
    adminUserId: string | null;
    /** Wenn gesetzt: Freigabe trotz fehlender Standard-Unterlagen (Admin bestätigt). */
    acknowledgeIncompleteDocuments?: boolean;
  },
): Promise<{ ok: true } | { ok: false; error: string; gaps?: string[] }> {
  const cur = await findFleetVehicleGlobal(id);
  if (!cur) return { ok: false, error: "not_found" };
  const st = String(cur.approval_status);
  if (!["pending_approval", "missing_documents"].includes(st)) {
    return { ok: false, error: "not_pending" };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const now = new Date();
  const next: FleetVehicleApprovalStatus = input.nextStatus;
  const reason = input.nextStatus === "rejected" ? (input.rejectionReason ?? "").trim() : "";
  if (input.nextStatus === "rejected" && !reason) {
    return { ok: false, error: "rejection_reason_required" };
  }
  if (input.nextStatus === "approved") {
    const row = rowToVehicle(cur);
    const gaps = computeFleetVehicleComplianceGaps(row);
    if (gaps.length > 0 && !input.acknowledgeIncompleteDocuments) {
      return { ok: false, error: "incomplete_documents_ack_required", gaps };
    }
  }
  await db
    .update(fleetVehiclesTable)
    .set({
      approval_status: next,
      is_active: syncIsActiveForStatus(next),
      rejection_reason: input.nextStatus === "rejected" ? reason : "",
      approval_decided_at: now,
      approval_decided_by_admin_id: input.adminUserId,
      updated_at: now,
    })
    .where(eq(fleetVehiclesTable.id, id));
  return { ok: true };
}

/** Admin: explizit „Unterlagen fehlen“ — Fahrzeug bleibt sichtbar, aber nicht einsatzbereit. */
export async function setFleetVehicleMissingDocumentsByAdmin(
  id: string,
  input: { adminUserId: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cur = await findFleetVehicleGlobal(id);
  if (!cur) return { ok: false, error: "not_found" };
  const st = String(cur.approval_status);
  if (!["draft", "pending_approval", "approved"].includes(st)) {
    return { ok: false, error: "invalid_state" };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const now = new Date();
  await db
    .update(fleetVehiclesTable)
    .set({
      approval_status: "missing_documents",
      is_active: false,
      updated_at: now,
      approval_decided_at: now,
      approval_decided_by_admin_id: input.adminUserId,
    })
    .where(eq(fleetVehiclesTable.id, id));
  return { ok: true };
}

/**
 * Nachträgliches Sperren aus Detailansicht, auch von nicht-pending.
 */
export async function forceBlockFleetVehicleByAdmin(
  id: string,
  input: {
    adminUserId: string | null;
    blockReason?: string;
    adminInternalNote?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cur = await findFleetVehicleGlobal(id);
  if (!cur) return { ok: false, error: "not_found" };
  if (String(cur.approval_status) === "blocked") return { ok: false, error: "already_blocked" };
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const now = new Date();
  const br = String(input.blockReason ?? "").trim().slice(0, 2000);
  const set: Partial<typeof fleetVehiclesTable.$inferInsert> = {
    approval_status: "blocked",
    is_active: false,
    block_reason: br,
    approval_decided_at: now,
    approval_decided_by_admin_id: input.adminUserId,
    updated_at: now,
  };
  if (input.adminInternalNote !== undefined) {
    set.admin_internal_note = String(input.adminInternalNote).slice(0, 4000);
  }
  await db.update(fleetVehiclesTable).set(set).where(eq(fleetVehiclesTable.id, id));
  return { ok: true };
}

/** Entsperren: Status zurück in Entwurf, nicht einsatzbereit bis erneute Freigabe. */
export async function unblockFleetVehicleByAdmin(
  id: string,
  adminUserId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cur = await findFleetVehicleGlobal(id);
  if (!cur) return { ok: false, error: "not_found" };
  if (String(cur.approval_status) !== "blocked") return { ok: false, error: "not_blocked" };
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const now = new Date();
  await db
    .update(fleetVehiclesTable)
    .set({
      approval_status: "draft",
      is_active: false,
      block_reason: "",
      approval_decided_at: now,
      approval_decided_by_admin_id: adminUserId,
      updated_at: now,
    })
    .where(eq(fleetVehiclesTable.id, id));
  return { ok: true };
}

export async function adminPatchFleetVehicleFields(
  companyId: string,
  vehicleId: string,
  patch: { adminInternalNote?: string; blockReason?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cur = await findFleetVehicleInCompany(vehicleId, companyId);
  if (!cur) return { ok: false, error: "not_found" };
  if (Object.keys(patch).length === 0) return { ok: false, error: "no_fields" };
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const set: Partial<typeof fleetVehiclesTable.$inferInsert> = { updated_at: new Date() };
  if (patch.adminInternalNote !== undefined) {
    set.admin_internal_note = String(patch.adminInternalNote).slice(0, 4000);
  }
  if (patch.blockReason !== undefined) {
    set.block_reason = String(patch.blockReason).slice(0, 2000);
  }
  await db
    .update(fleetVehiclesTable)
    .set(set)
    .where(and(eq(fleetVehiclesTable.id, vehicleId), eq(fleetVehiclesTable.company_id, companyId)));
  return { ok: true };
}

export async function listFleetVehicleDocumentStorageKeysInCompany(
  companyId: string,
  vehicleId: string,
): Promise<string[] | null> {
  const cur = await findFleetVehicleInCompany(vehicleId, companyId);
  if (!cur) return null;
  return parseDocuments(cur.vehicle_documents).map((d) => d.storageKey);
}

export async function listFleetVehicleDocumentStorageKeysAdmin(vehicleId: string): Promise<string[] | null> {
  const cur = await findFleetVehicleGlobal(vehicleId);
  if (!cur) return null;
  return parseDocuments(cur.vehicle_documents).map((d) => d.storageKey);
}

export async function getFleetVehicleAdminDetail(vehicleId: string): Promise<FleetVehicleAdminListRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({
      v: fleetVehiclesTable,
      companyName: adminCompaniesTable.name,
    })
    .from(fleetVehiclesTable)
    .innerJoin(adminCompaniesTable, eq(fleetVehiclesTable.company_id, adminCompaniesTable.id))
    .where(eq(fleetVehiclesTable.id, vehicleId))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return { vehicle: rowToVehicle(r.v), companyName: r.companyName };
}
