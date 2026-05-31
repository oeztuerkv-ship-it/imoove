import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { OnboardingStatus } from "../lib/companyOnboardingConstants";
import {
  isCompanyDocType,
  isCompanyVehicleType,
  isOnboardingStatus,
  normalizeCompanyDocMime,
} from "../lib/companyOnboardingConstants";
import { getDb, isPostgresConfigured } from "./client";
import {
  adminCompaniesTable,
  companyDocumentsTable,
  companyVehiclesTable,
} from "./schema";

export type CompanyOnboardingProfile = {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  country: string;
  iban: string;
  taxNumber: string;
  tradeLicenseNumber: string;
  concessionNumber: string;
  onboardingStatus: OnboardingStatus;
  onboardingApprovedAt: string | null;
  onboardingApprovedBy: string | null;
  kkModuleNotes: string;
  featureKkModule: boolean;
  partnerIkNumber: string;
  insurerBillingContacts: Array<{ insurerName?: string; insurerIk?: string; email?: string }>;
  companyKind: string;
};

export type CompanyVehicleRow = {
  id: string;
  companyId: string;
  licensePlate: string;
  vehicleType: string;
  concessionNumber: string;
  tuevDate: string | null;
  isActive: boolean;
  createdAt: string;
};

export type CompanyDocumentMeta = {
  id: string;
  companyId: string;
  vehicleId: string | null;
  docType: string;
  fileName: string;
  mimeType: string;
  uploadedAt: string;
  uploadedBy: string | null;
  fileSizeBytes: number;
};

function fmtDate(d: unknown): string | null {
  if (d == null || d === "") return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const s = String(d).trim();
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function fmtTs(d: unknown): string | null {
  if (d == null) return null;
  if (d instanceof Date) return d.toISOString();
  const s = String(d).trim();
  return s || null;
}

function rowToProfile(r: typeof adminCompaniesTable.$inferSelect): CompanyOnboardingProfile {
  const contacts = Array.isArray(r.insurer_billing_contacts_json)
    ? (r.insurer_billing_contacts_json as CompanyOnboardingProfile["insurerBillingContacts"])
    : [];
  const st = String(r.onboarding_status ?? "incomplete").trim();
  return {
    id: r.id,
    name: r.name,
    contactName: r.contact_name ?? "",
    email: r.email ?? "",
    phone: r.phone ?? "",
    addressLine1: r.address_line1 ?? "",
    addressLine2: r.address_line2 ?? "",
    postalCode: r.postal_code ?? "",
    city: r.city ?? "",
    country: r.country ?? "",
    iban: r.bank_iban ?? "",
    taxNumber: r.tax_id ?? "",
    tradeLicenseNumber: r.trade_license_number ?? "",
    concessionNumber: r.concession_number ?? "",
    onboardingStatus: isOnboardingStatus(st) ? st : "incomplete",
    onboardingApprovedAt: fmtTs(r.onboarding_approved_at),
    onboardingApprovedBy: (r.onboarding_approved_by ?? "").trim() || null,
    kkModuleNotes: r.kk_module_notes ?? "",
    featureKkModule: Boolean(r.feature_kk_module),
    partnerIkNumber: r.partner_ik_number ?? "",
    insurerBillingContacts: contacts,
    companyKind: r.company_kind ?? "general",
  };
}

function rowToVehicle(r: typeof companyVehiclesTable.$inferSelect): CompanyVehicleRow {
  return {
    id: r.id,
    companyId: r.company_id,
    licensePlate: r.license_plate,
    vehicleType: r.vehicle_type,
    concessionNumber: r.concession_number ?? "",
    tuevDate: fmtDate(r.tuev_date),
    isActive: Boolean(r.is_active),
    createdAt: fmtTs(r.created_at) ?? new Date().toISOString(),
  };
}

function rowToDocMeta(r: typeof companyDocumentsTable.$inferSelect): CompanyDocumentMeta {
  const buf = Buffer.isBuffer(r.file_data) ? r.file_data : Buffer.alloc(0);
  return {
    id: r.id,
    companyId: r.company_id,
    vehicleId: r.vehicle_id ?? null,
    docType: r.doc_type,
    fileName: r.file_name,
    mimeType: r.mime_type,
    uploadedAt: fmtTs(r.uploaded_at) ?? new Date().toISOString(),
    uploadedBy: r.uploaded_by ?? null,
    fileSizeBytes: buf.length,
  };
}

export async function getCompanyOnboardingProfile(
  companyId: string,
): Promise<CompanyOnboardingProfile | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db.select().from(adminCompaniesTable).where(eq(adminCompaniesTable.id, companyId)).limit(1);
  return rows[0] ? rowToProfile(rows[0]) : null;
}

export async function listCompanyOnboardingVehicles(companyId: string): Promise<CompanyVehicleRow[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(companyVehiclesTable)
    .where(eq(companyVehiclesTable.company_id, companyId))
    .orderBy(desc(companyVehiclesTable.created_at));
  return rows.map(rowToVehicle);
}

export async function listCompanyOnboardingDocuments(companyId: string): Promise<CompanyDocumentMeta[]> {
  if (!isPostgresConfigured()) return [];
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(companyDocumentsTable)
    .where(eq(companyDocumentsTable.company_id, companyId))
    .orderBy(desc(companyDocumentsTable.uploaded_at));
  return rows.map(rowToDocMeta);
}

export async function getCompanyOnboardingBundle(companyId: string): Promise<{
  profile: CompanyOnboardingProfile;
  vehicles: CompanyVehicleRow[];
  documents: CompanyDocumentMeta[];
} | null> {
  const profile = await getCompanyOnboardingProfile(companyId);
  if (!profile) return null;
  const [vehicles, documents] = await Promise.all([
    listCompanyOnboardingVehicles(companyId),
    listCompanyOnboardingDocuments(companyId),
  ]);
  return { profile, vehicles, documents };
}

export type CompanyOnboardingProfilePatch = Partial<{
  name: string;
  contactName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  country: string;
  iban: string;
  taxNumber: string;
  tradeLicenseNumber: string;
  concessionNumber: string;
  kkModuleNotes: string;
  featureKkModule: boolean;
  partnerIkNumber: string;
  insurerBillingContacts: CompanyOnboardingProfile["insurerBillingContacts"];
}>;

function clip(s: string, max: number): string {
  return String(s ?? "").trim().slice(0, max);
}

export async function patchCompanyOnboardingProfile(
  companyId: string,
  patch: CompanyOnboardingProfilePatch,
): Promise<{ ok: true; profile: CompanyOnboardingProfile } | { ok: false; error: string }> {
  if (!isPostgresConfigured()) return { ok: false, error: "database_not_configured" };
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };

  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) set.name = clip(patch.name, 200);
  if (patch.contactName !== undefined) set.contact_name = clip(patch.contactName, 120);
  if (patch.email !== undefined) set.email = clip(patch.email, 200);
  if (patch.phone !== undefined) set.phone = clip(patch.phone, 64);
  if (patch.addressLine1 !== undefined) set.address_line1 = clip(patch.addressLine1, 200);
  if (patch.addressLine2 !== undefined) set.address_line2 = clip(patch.addressLine2, 200);
  if (patch.postalCode !== undefined) set.postal_code = clip(patch.postalCode, 32);
  if (patch.city !== undefined) set.city = clip(patch.city, 120);
  if (patch.country !== undefined) set.country = clip(patch.country, 80);
  if (patch.iban !== undefined) set.bank_iban = clip(patch.iban, 64);
  if (patch.taxNumber !== undefined) set.tax_id = clip(patch.taxNumber, 64);
  if (patch.tradeLicenseNumber !== undefined) set.trade_license_number = clip(patch.tradeLicenseNumber, 64);
  if (patch.concessionNumber !== undefined) set.concession_number = clip(patch.concessionNumber, 64);
  if (patch.kkModuleNotes !== undefined) set.kk_module_notes = clip(patch.kkModuleNotes, 4000);
  if (patch.featureKkModule !== undefined) {
    set.feature_kk_module = Boolean(patch.featureKkModule);
    if (patch.featureKkModule) set.feature_kk_module_since = new Date();
  }
  if (patch.partnerIkNumber !== undefined) {
    set.partner_ik_number = clip(patch.partnerIkNumber.replace(/\D/g, ""), 9);
  }
  if (patch.insurerBillingContacts !== undefined) {
    set.insurer_billing_contacts_json = Array.isArray(patch.insurerBillingContacts)
      ? patch.insurerBillingContacts
      : [];
  }

  if (Object.keys(set).length === 0) return { ok: false, error: "no_changes" };

  const u = await db
    .update(adminCompaniesTable)
    .set(set)
    .where(eq(adminCompaniesTable.id, companyId))
    .returning();
  if (!u[0]) return { ok: false, error: "not_found" };
  return { ok: true, profile: rowToProfile(u[0]) };
}

export async function patchCompanyOnboardingStatus(
  companyId: string,
  input: { status: OnboardingStatus; notes?: string; approvedBy?: string | null },
): Promise<{ ok: true; profile: CompanyOnboardingProfile } | { ok: false; error: string }> {
  if (!isOnboardingStatus(input.status)) return { ok: false, error: "invalid_status" };
  if (!isPostgresConfigured()) return { ok: false, error: "database_not_configured" };
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };

  const set: Record<string, unknown> = { onboarding_status: input.status };
  if (input.notes !== undefined) set.kk_module_notes = clip(input.notes, 4000);
  if (input.status === "approved") {
    set.onboarding_approved_at = new Date();
    set.onboarding_approved_by = clip(input.approvedBy ?? "", 120) || null;
  } else {
    set.onboarding_approved_at = null;
    set.onboarding_approved_by = null;
  }

  const u = await db
    .update(adminCompaniesTable)
    .set(set)
    .where(eq(adminCompaniesTable.id, companyId))
    .returning();
  if (!u[0]) return { ok: false, error: "not_found" };
  return { ok: true, profile: rowToProfile(u[0]) };
}

export async function insertCompanyOnboardingVehicle(
  companyId: string,
  input: {
    licensePlate: string;
    vehicleType: string;
    concessionNumber?: string;
    tuevDate?: string | null;
    isActive?: boolean;
  },
): Promise<{ ok: true; vehicle: CompanyVehicleRow } | { ok: false; error: string }> {
  const plate = clip(input.licensePlate, 32);
  const vt = clip(input.vehicleType, 32);
  if (!plate) return { ok: false, error: "license_plate_required" };
  if (!isCompanyVehicleType(vt)) return { ok: false, error: "invalid_vehicle_type" };
  if (!isPostgresConfigured()) return { ok: false, error: "database_not_configured" };
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };

  const tuev = input.tuevDate != null && String(input.tuevDate).trim() !== "" ? fmtDate(input.tuevDate) : null;

  const ins = await db
    .insert(companyVehiclesTable)
    .values({
      id: randomUUID(),
      company_id: companyId,
      license_plate: plate,
      vehicle_type: vt,
      concession_number: clip(input.concessionNumber ?? "", 64),
      tuev_date: tuev,
      is_active: input.isActive !== false,
    })
    .returning();
  return ins[0] ? { ok: true, vehicle: rowToVehicle(ins[0]) } : { ok: false, error: "insert_failed" };
}

export async function patchCompanyOnboardingVehicle(
  companyId: string,
  vehicleId: string,
  patch: Partial<{
    licensePlate: string;
    vehicleType: string;
    concessionNumber: string;
    tuevDate: string | null;
    isActive: boolean;
  }>,
): Promise<{ ok: true; vehicle: CompanyVehicleRow } | { ok: false; error: string }> {
  if (!isPostgresConfigured()) return { ok: false, error: "database_not_configured" };
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };

  const set: Record<string, unknown> = {};
  if (patch.licensePlate !== undefined) {
    const plate = clip(patch.licensePlate, 32);
    if (!plate) return { ok: false, error: "license_plate_required" };
    set.license_plate = plate;
  }
  if (patch.vehicleType !== undefined) {
    const vt = clip(patch.vehicleType, 32);
    if (!isCompanyVehicleType(vt)) return { ok: false, error: "invalid_vehicle_type" };
    set.vehicle_type = vt;
  }
  if (patch.concessionNumber !== undefined) set.concession_number = clip(patch.concessionNumber, 64);
  if (patch.tuevDate !== undefined) {
    set.tuev_date =
      patch.tuevDate != null && String(patch.tuevDate).trim() !== "" ? fmtDate(patch.tuevDate) : null;
  }
  if (patch.isActive !== undefined) set.is_active = Boolean(patch.isActive);

  if (Object.keys(set).length === 0) return { ok: false, error: "no_changes" };

  const u = await db
    .update(companyVehiclesTable)
    .set(set)
    .where(and(eq(companyVehiclesTable.id, vehicleId), eq(companyVehiclesTable.company_id, companyId)))
    .returning();
  return u[0] ? { ok: true, vehicle: rowToVehicle(u[0]) } : { ok: false, error: "not_found" };
}

export async function deleteCompanyOnboardingVehicle(
  companyId: string,
  vehicleId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isPostgresConfigured()) return { ok: false, error: "database_not_configured" };
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const d = await db
    .delete(companyVehiclesTable)
    .where(and(eq(companyVehiclesTable.id, vehicleId), eq(companyVehiclesTable.company_id, companyId)))
    .returning({ id: companyVehiclesTable.id });
  return d[0] ? { ok: true } : { ok: false, error: "not_found" };
}

export async function insertCompanyOnboardingDocument(
  companyId: string,
  input: {
    docType: string;
    fileName: string;
    mimeType: string;
    fileData: Buffer;
    vehicleId?: string | null;
    uploadedBy?: string | null;
  },
): Promise<{ ok: true; document: CompanyDocumentMeta } | { ok: false; error: string }> {
  const docType = clip(input.docType, 40);
  if (!isCompanyDocType(docType)) return { ok: false, error: "invalid_doc_type" };
  const mime = normalizeCompanyDocMime(input.mimeType);
  if (!mime) return { ok: false, error: "invalid_mime_type" };
  if (!input.fileData?.length) return { ok: false, error: "file_empty" };
  if (input.fileData.length > 10 * 1024 * 1024) return { ok: false, error: "file_too_large" };

  if (!isPostgresConfigured()) return { ok: false, error: "database_not_configured" };
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };

  const vehicleId = (input.vehicleId ?? "").trim() || null;
  if (vehicleId) {
    const v = await db
      .select({ id: companyVehiclesTable.id })
      .from(companyVehiclesTable)
      .where(and(eq(companyVehiclesTable.id, vehicleId), eq(companyVehiclesTable.company_id, companyId)))
      .limit(1);
    if (!v[0]) return { ok: false, error: "vehicle_not_found" };
  }

  const ins = await db
    .insert(companyDocumentsTable)
    .values({
      id: randomUUID(),
      company_id: companyId,
      vehicle_id: vehicleId,
      doc_type: docType,
      file_name: clip(input.fileName, 255) || "upload",
      file_data: input.fileData,
      mime_type: mime,
      uploaded_by: input.uploadedBy ? clip(input.uploadedBy, 120) : null,
    })
    .returning();
  return ins[0] ? { ok: true, document: rowToDocMeta(ins[0]) } : { ok: false, error: "insert_failed" };
}

export async function getCompanyOnboardingDocumentFile(
  companyId: string,
  docId: string,
): Promise<
  | { ok: true; mimeType: string; fileName: string; buffer: Buffer }
  | { ok: false; error: string }
> {
  if (!isPostgresConfigured()) return { ok: false, error: "database_not_configured" };
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const rows = await db
    .select()
    .from(companyDocumentsTable)
    .where(and(eq(companyDocumentsTable.id, docId), eq(companyDocumentsTable.company_id, companyId)))
    .limit(1);
  const r = rows[0];
  if (!r) return { ok: false, error: "not_found" };
  const buffer = Buffer.isBuffer(r.file_data) ? r.file_data : Buffer.alloc(0);
  return { ok: true, mimeType: r.mime_type, fileName: r.file_name, buffer };
}

/** Partner reicht Onboarding zur Prüfung ein (nur incomplete → pending). */
export async function submitCompanyOnboardingForReview(
  companyId: string,
): Promise<{ ok: true; profile: CompanyOnboardingProfile } | { ok: false; error: string }> {
  const cur = await getCompanyOnboardingProfile(companyId);
  if (!cur) return { ok: false, error: "not_found" };
  if (cur.onboardingStatus === "approved") return { ok: false, error: "already_approved" };
  return patchCompanyOnboardingStatus(companyId, { status: "pending" });
}
