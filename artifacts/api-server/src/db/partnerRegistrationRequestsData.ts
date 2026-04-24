import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { findCompanyById } from "./adminData";
import { getDb } from "./client";
import {
  partnerRegistrationDocumentsTable,
  partnerRegistrationRequestsTable,
  partnerRegistrationTimelineTable,
} from "./schema";

export const PARTNER_TYPES = [
  "taxi",
  "hotel",
  "insurance",
  "medical",
  "care",
  "business",
  "voucher_partner",
  "other",
] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];

export const REGISTRATION_STATUSES = [
  "open",
  "in_review",
  "documents_required",
  "approved",
  "rejected",
  "blocked",
] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export type PartnerRegistrationInsert = {
  companyName: string;
  legalForm: string;
  partnerType: PartnerType;
  usesVouchers: boolean;
  contactFirstName: string;
  contactLastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  /** Zweite Adresszeile (optional, bei Taxi empfohlen). */
  addressLine2?: string;
  /** Inhaber / inhabende Person (Taxi-Pflicht über öffentliches Formular). */
  ownerName?: string;
  /** Dispo-Telefon (optional). */
  dispoPhone?: string;
  postalCode: string;
  city: string;
  country: string;
  taxId: string;
  vatId: string;
  concessionNumber: string;
  desiredRegion: string;
  requestedUsage: Record<string, unknown>;
  documentsMeta: Record<string, unknown>;
  notes: string;
};

const ADMIN_REG_STRING_MAX = {
  name: 200,
  short: 120,
  line: 500,
  email: 254,
  region: 200,
} as const;

function clipAdminReg(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max);
}

export type PartnerRegistrationAdminPatch = {
  status?: RegistrationStatus;
  verificationStatus?: "pending" | "in_review" | "verified" | "rejected";
  complianceStatus?: "pending" | "complete" | "missing_documents" | "rejected";
  contractStatus?: "inactive" | "pending" | "active" | "suspended" | "terminated";
  missingDocumentsNote?: string;
  adminNote?: string;
  reviewedByAdminUserId?: string | null;
  /** Anfrage-Typ (steuert u. a. `company_kind` bei Freigabe). */
  partnerType?: PartnerType;
  companyName?: string;
  legalForm?: string;
  usesVouchers?: boolean;
  contactFirstName?: string;
  contactLastName?: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  ownerName?: string;
  dispoPhone?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  taxId?: string;
  vatId?: string;
  concessionNumber?: string;
  desiredRegion?: string;
  notes?: string;
  requestedUsage?: Record<string, unknown> | null;
};

type TimelineEventInsert = {
  requestId: string;
  actorType: string;
  actorLabel: string;
  eventType: string;
  message: string;
  payload?: Record<string, unknown>;
};

type RegistrationDocInsert = {
  requestId: string;
  category: string;
  originalFileName: string;
  mimeType: string;
  contentBase64: string;
  uploadedByActorType: "partner" | "admin";
  uploadedByActorLabel: string;
};

function mapRow(r: typeof partnerRegistrationRequestsTable.$inferSelect) {
  return {
    id: r.id,
    companyName: r.company_name,
    legalForm: r.legal_form,
    partnerType: r.partner_type,
    usesVouchers: r.uses_vouchers,
    contactFirstName: r.contact_first_name,
    contactLastName: r.contact_last_name,
    email: r.email,
    phone: r.phone,
    addressLine1: r.address_line1,
    addressLine2: r.address_line2,
    ownerName: r.owner_name,
    dispoPhone: r.dispo_phone,
    postalCode: r.postal_code,
    city: r.city,
    country: r.country,
    taxId: r.tax_id,
    vatId: r.vat_id,
    concessionNumber: r.concession_number,
    desiredRegion: r.desired_region,
    requestedUsage: r.requested_usage ?? {},
    documentsMeta: r.documents_meta ?? {},
    notes: r.notes,
    registrationStatus: r.registration_status,
    verificationStatus: r.verification_status,
    complianceStatus: r.compliance_status,
    contractStatus: r.contract_status,
    missingDocumentsNote: r.missing_documents_note,
    adminNote: r.admin_note,
    masterDataLocked: r.master_data_locked,
    linkedCompanyId: r.linked_company_id,
    reviewedByAdminUserId: r.reviewed_by_admin_user_id,
    reviewedAt: r.reviewed_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

function mapDocRow(r: typeof partnerRegistrationDocumentsTable.$inferSelect) {
  return {
    id: r.id,
    requestId: r.request_id,
    category: r.category,
    originalFileName: r.original_file_name,
    mimeType: r.mime_type,
    storagePath: r.storage_path,
    fileSizeBytes: r.file_size_bytes,
    uploadedByActorType: r.uploaded_by_actor_type,
    uploadedByActorLabel: r.uploaded_by_actor_label,
    createdAt: r.created_at.toISOString(),
  };
}

function mapTimelineRow(r: typeof partnerRegistrationTimelineTable.$inferSelect) {
  return {
    id: r.id,
    requestId: r.request_id,
    actorType: r.actor_type,
    actorLabel: r.actor_label,
    eventType: r.event_type,
    message: r.message,
    payload: r.payload ?? {},
    createdAt: r.created_at.toISOString(),
  };
}

function uploadsBaseDir(): string {
  const fromEnv = (process.env.PARTNER_REGISTRATION_UPLOAD_DIR ?? "").trim();
  if (fromEnv) return fromEnv;
  return path.resolve(process.cwd(), "artifacts/api-server/uploads/partner-registration");
}

async function persistDocFile(opts: {
  requestId: string;
  originalFileName: string;
  contentBase64: string;
}): Promise<{ absPath: string; relPath: string; sizeBytes: number }> {
  const base = uploadsBaseDir();
  const safeName = opts.originalFileName
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 120) || "document.bin";
  const ext = path.extname(safeName) || ".bin";
  const dir = path.join(base, opts.requestId);
  await mkdir(dir, { recursive: true });
  const fileName = `${Date.now()}-${randomUUID()}${ext}`;
  const absPath = path.join(dir, fileName);
  const relPath = path.relative(base, absPath);
  const cleaned = opts.contentBase64.includes(",")
    ? opts.contentBase64.split(",").pop() ?? ""
    : opts.contentBase64;
  const buf = Buffer.from(cleaned, "base64");
  await writeFile(absPath, buf);
  return { absPath, relPath, sizeBytes: buf.byteLength };
}

export function isPartnerType(v: string): v is PartnerType {
  return (PARTNER_TYPES as readonly string[]).includes(v);
}

export function isRegistrationStatus(v: string): v is RegistrationStatus {
  return (REGISTRATION_STATUSES as readonly string[]).includes(v);
}

export async function createPartnerRegistrationRequest(input: PartnerRegistrationInsert) {
  const db = getDb();
  if (!db) return null;
  const id = `prr-${randomUUID()}`;
  await db.insert(partnerRegistrationRequestsTable).values({
    id,
    company_name: input.companyName,
    legal_form: input.legalForm,
    partner_type: input.partnerType,
    uses_vouchers: input.usesVouchers,
    contact_first_name: input.contactFirstName,
    contact_last_name: input.contactLastName,
    email: input.email,
    phone: input.phone,
    address_line1: input.addressLine1,
    address_line2: input.addressLine2 ?? "",
    owner_name: input.ownerName ?? "",
    dispo_phone: input.dispoPhone ?? "",
    postal_code: input.postalCode,
    city: input.city,
    country: input.country,
    tax_id: input.taxId,
    vat_id: input.vatId,
    concession_number: input.concessionNumber,
    desired_region: input.desiredRegion,
    requested_usage: input.requestedUsage,
    documents_meta: input.documentsMeta,
    notes: input.notes,
  });
  await addPartnerRegistrationTimelineEvent({
    requestId: id,
    actorType: "partner",
    actorLabel: input.email,
    eventType: "request_submitted",
    message: "Registrierungsanfrage eingegangen.",
    payload: { partnerType: input.partnerType, usesVouchers: input.usesVouchers },
  });
  const rows = await db
    .select()
    .from(partnerRegistrationRequestsTable)
    .where(eq(partnerRegistrationRequestsTable.id, id))
    .limit(1);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function listPartnerRegistrationRequestsAdmin(status?: RegistrationStatus) {
  const db = getDb();
  if (!db) return [];
  const where = status ? eq(partnerRegistrationRequestsTable.registration_status, status) : undefined;
  const rows = await db
    .select()
    .from(partnerRegistrationRequestsTable)
    .where(where)
    .orderBy(desc(partnerRegistrationRequestsTable.created_at));
  return rows.map(mapRow);
}

/** Offene Bearbeitung: noch nicht final entschieden (Freigabe / Ablehnung). */
const PENDING_REGISTRATION_STATUSES: RegistrationStatus[] = ["open", "in_review", "documents_required"];

export async function listPartnerRegistrationPendingQueueAdmin() {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(partnerRegistrationRequestsTable)
    .where(inArray(partnerRegistrationRequestsTable.registration_status, PENDING_REGISTRATION_STATUSES))
    .orderBy(desc(partnerRegistrationRequestsTable.created_at));
  return rows.map(mapRow);
}

export async function findPartnerRegistrationRequestById(id: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(partnerRegistrationRequestsTable)
    .where(eq(partnerRegistrationRequestsTable.id, id))
    .limit(1);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findLatestPartnerRegistrationRequestByEmail(email: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(partnerRegistrationRequestsTable)
    .where(sql`lower(${partnerRegistrationRequestsTable.email}) = ${email.trim().toLowerCase()}`)
    .orderBy(desc(partnerRegistrationRequestsTable.created_at))
    .limit(1);
  return rows[0] ? mapRow(rows[0]) : null;
}

function collectMasterDataPatchKeys(patch: PartnerRegistrationAdminPatch): string[] {
  const keys: string[] = [];
  if (patch.partnerType !== undefined) keys.push("partnerType");
  if (patch.companyName !== undefined) keys.push("companyName");
  if (patch.legalForm !== undefined) keys.push("legalForm");
  if (patch.usesVouchers !== undefined) keys.push("usesVouchers");
  if (patch.contactFirstName !== undefined) keys.push("contactFirstName");
  if (patch.contactLastName !== undefined) keys.push("contactLastName");
  if (patch.email !== undefined) keys.push("email");
  if (patch.phone !== undefined) keys.push("phone");
  if (patch.addressLine1 !== undefined) keys.push("addressLine1");
  if (patch.addressLine2 !== undefined) keys.push("addressLine2");
  if (patch.ownerName !== undefined) keys.push("ownerName");
  if (patch.dispoPhone !== undefined) keys.push("dispoPhone");
  if (patch.postalCode !== undefined) keys.push("postalCode");
  if (patch.city !== undefined) keys.push("city");
  if (patch.country !== undefined) keys.push("country");
  if (patch.taxId !== undefined) keys.push("taxId");
  if (patch.vatId !== undefined) keys.push("vatId");
  if (patch.concessionNumber !== undefined) keys.push("concessionNumber");
  if (patch.desiredRegion !== undefined) keys.push("desiredRegion");
  if (patch.notes !== undefined) keys.push("notes");
  if (patch.requestedUsage !== undefined) keys.push("requestedUsage");
  return keys;
}

export async function patchPartnerRegistrationRequest(id: string, patch: PartnerRegistrationAdminPatch) {
  const db = getDb();
  if (!db) return null;
  const set: Record<string, unknown> = {
    updated_at: sql`NOW()`,
  };
  if (patch.status) set.registration_status = patch.status;
  if (patch.verificationStatus) set.verification_status = patch.verificationStatus;
  if (patch.complianceStatus) set.compliance_status = patch.complianceStatus;
  if (patch.contractStatus) set.contract_status = patch.contractStatus;
  if (patch.missingDocumentsNote !== undefined) set.missing_documents_note = patch.missingDocumentsNote;
  if (patch.adminNote !== undefined) set.admin_note = patch.adminNote;
  if (patch.reviewedByAdminUserId !== undefined) set.reviewed_by_admin_user_id = patch.reviewedByAdminUserId;
  if (patch.status || patch.reviewedByAdminUserId !== undefined) set.reviewed_at = sql`NOW()`;

  if (patch.partnerType !== undefined) set.partner_type = patch.partnerType;
  if (patch.companyName !== undefined) set.company_name = clipAdminReg(patch.companyName, ADMIN_REG_STRING_MAX.name);
  if (patch.legalForm !== undefined) set.legal_form = clipAdminReg(patch.legalForm, ADMIN_REG_STRING_MAX.short);
  if (patch.usesVouchers !== undefined) set.uses_vouchers = patch.usesVouchers;
  if (patch.contactFirstName !== undefined) {
    set.contact_first_name = clipAdminReg(patch.contactFirstName, ADMIN_REG_STRING_MAX.short);
  }
  if (patch.contactLastName !== undefined) {
    set.contact_last_name = clipAdminReg(patch.contactLastName, ADMIN_REG_STRING_MAX.short);
  }
  if (patch.email !== undefined) {
    set.email = clipAdminReg(patch.email.toLowerCase(), ADMIN_REG_STRING_MAX.email);
  }
  if (patch.phone !== undefined) set.phone = clipAdminReg(patch.phone, ADMIN_REG_STRING_MAX.short);
  if (patch.addressLine1 !== undefined) set.address_line1 = clipAdminReg(patch.addressLine1, ADMIN_REG_STRING_MAX.line);
  if (patch.addressLine2 !== undefined) set.address_line2 = clipAdminReg(patch.addressLine2, ADMIN_REG_STRING_MAX.line);
  if (patch.ownerName !== undefined) set.owner_name = clipAdminReg(patch.ownerName, ADMIN_REG_STRING_MAX.name);
  if (patch.dispoPhone !== undefined) set.dispo_phone = clipAdminReg(patch.dispoPhone, ADMIN_REG_STRING_MAX.short);
  if (patch.postalCode !== undefined) set.postal_code = clipAdminReg(patch.postalCode, ADMIN_REG_STRING_MAX.short);
  if (patch.city !== undefined) set.city = clipAdminReg(patch.city, ADMIN_REG_STRING_MAX.short);
  if (patch.country !== undefined) set.country = clipAdminReg(patch.country, ADMIN_REG_STRING_MAX.short);
  if (patch.taxId !== undefined) set.tax_id = clipAdminReg(patch.taxId, ADMIN_REG_STRING_MAX.short);
  if (patch.vatId !== undefined) set.vat_id = clipAdminReg(patch.vatId, ADMIN_REG_STRING_MAX.short);
  if (patch.concessionNumber !== undefined) {
    set.concession_number = clipAdminReg(patch.concessionNumber, ADMIN_REG_STRING_MAX.short);
  }
  if (patch.desiredRegion !== undefined) {
    set.desired_region = clipAdminReg(patch.desiredRegion, ADMIN_REG_STRING_MAX.region);
  }
  if (patch.notes !== undefined) set.notes = clipAdminReg(patch.notes, ADMIN_REG_STRING_MAX.line);
  if (patch.requestedUsage !== undefined) {
    set.requested_usage = patch.requestedUsage && typeof patch.requestedUsage === "object" ? patch.requestedUsage : {};
  }

  const masterKeys = collectMasterDataPatchKeys(patch);
  const hasMasterPatch = masterKeys.length > 0;

  await db.update(partnerRegistrationRequestsTable).set(set).where(eq(partnerRegistrationRequestsTable.id, id));
  if (
    patch.status ||
    patch.missingDocumentsNote !== undefined ||
    patch.adminNote !== undefined ||
    patch.verificationStatus ||
    patch.complianceStatus ||
    patch.contractStatus
  ) {
    await addPartnerRegistrationTimelineEvent({
      requestId: id,
      actorType: "admin",
      actorLabel: patch.reviewedByAdminUserId ?? "admin",
      eventType: "admin_status_update",
      message: "Anfrage-Status/Prüffelder aktualisiert.",
      payload: {
        status: patch.status ?? null,
        verificationStatus: patch.verificationStatus ?? null,
        complianceStatus: patch.complianceStatus ?? null,
        contractStatus: patch.contractStatus ?? null,
        missingDocumentsNote: patch.missingDocumentsNote ?? null,
      },
    });
  }
  if (hasMasterPatch) {
    await addPartnerRegistrationTimelineEvent({
      requestId: id,
      actorType: "admin",
      actorLabel: patch.reviewedByAdminUserId ?? "admin",
      eventType: "admin_master_data_update",
      message: "Stammdaten oder Anfrage-Typ durch die Plattform-Administration angepasst.",
      payload: { fields: masterKeys },
    });
  }
  return findPartnerRegistrationRequestById(id);
}

export type AttachCompanyToRegistrationRequestOpts = {
  reviewedByAdminUserId?: string | null;
  /** Anzeige in Timeline (z. B. Admin-Login-Name), nicht zwingend DB-UUID. */
  eventActorLabel?: string;
};

export async function attachCompanyToPartnerRegistrationRequest(
  id: string,
  companyId: string,
  opts: AttachCompanyToRegistrationRequestOpts = {},
) {
  const db = getDb();
  if (!db) return null;
  const adminUserId = opts.reviewedByAdminUserId ?? null;
  const eventActorLabel = opts.eventActorLabel ?? "admin";
  const updated = await db
    .update(partnerRegistrationRequestsTable)
    .set({
      linked_company_id: companyId,
      registration_status: "approved",
      contract_status: "active",
      verification_status: "verified",
      compliance_status: "complete",
      reviewed_by_admin_user_id: adminUserId,
      reviewed_at: sql`NOW()`,
      updated_at: sql`NOW()`,
    })
    .where(
      and(eq(partnerRegistrationRequestsTable.id, id), isNull(partnerRegistrationRequestsTable.linked_company_id)),
    )
    .returning({ id: partnerRegistrationRequestsTable.id });
  if (!updated[0]) {
    return null;
  }
  await addPartnerRegistrationTimelineEvent({
    requestId: id,
    actorType: "admin",
    actorLabel: eventActorLabel,
    eventType: "approved_company_created",
    message: "Anfrage freigegeben und Unternehmen angelegt.",
    payload: { companyId },
  });
  return findPartnerRegistrationRequestById(id);
}

export async function addPartnerRegistrationTimelineEvent(input: TimelineEventInsert) {
  const db = getDb();
  if (!db) return null;
  const id = `prtl-${randomUUID()}`;
  await db.insert(partnerRegistrationTimelineTable).values({
    id,
    request_id: input.requestId,
    actor_type: input.actorType,
    actor_label: input.actorLabel,
    event_type: input.eventType,
    message: input.message,
    payload: input.payload ?? {},
  });
  return id;
}

export async function addPartnerRegistrationMessage(
  requestId: string,
  actorType: "partner" | "admin",
  actorLabel: string,
  message: string,
) {
  return addPartnerRegistrationTimelineEvent({
    requestId,
    actorType,
    actorLabel,
    eventType: "message",
    message,
  });
}

export async function addPartnerRegistrationDocument(input: RegistrationDocInsert) {
  const db = getDb();
  if (!db) return null;
  const id = `prdoc-${randomUUID()}`;
  const persisted = await persistDocFile({
    requestId: input.requestId,
    originalFileName: input.originalFileName,
    contentBase64: input.contentBase64,
  });
  await db.insert(partnerRegistrationDocumentsTable).values({
    id,
    request_id: input.requestId,
    category: input.category || "general",
    original_file_name: input.originalFileName,
    mime_type: input.mimeType,
    storage_path: persisted.relPath,
    file_size_bytes: persisted.sizeBytes,
    uploaded_by_actor_type: input.uploadedByActorType,
    uploaded_by_actor_label: input.uploadedByActorLabel,
  });
  await addPartnerRegistrationTimelineEvent({
    requestId: input.requestId,
    actorType: input.uploadedByActorType,
    actorLabel: input.uploadedByActorLabel,
    eventType: "document_uploaded",
    message: `Dokument hochgeladen: ${input.originalFileName}`,
    payload: { category: input.category, size: persisted.sizeBytes },
  });
  const rows = await db
    .select()
    .from(partnerRegistrationDocumentsTable)
    .where(eq(partnerRegistrationDocumentsTable.id, id))
    .limit(1);
  return rows[0] ? mapDocRow(rows[0]) : null;
}

export async function listPartnerRegistrationDocuments(requestId: string) {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(partnerRegistrationDocumentsTable)
    .where(eq(partnerRegistrationDocumentsTable.request_id, requestId))
    .orderBy(desc(partnerRegistrationDocumentsTable.created_at));
  return rows.map(mapDocRow);
}

export async function findPartnerRegistrationDocumentById(id: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(partnerRegistrationDocumentsTable)
    .where(eq(partnerRegistrationDocumentsTable.id, id))
    .limit(1);
  return rows[0] ? mapDocRow(rows[0]) : null;
}

export async function listPartnerRegistrationTimeline(requestId: string) {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(partnerRegistrationTimelineTable)
    .where(eq(partnerRegistrationTimelineTable.request_id, requestId))
    .orderBy(desc(partnerRegistrationTimelineTable.created_at));
  return rows.map(mapTimelineRow);
}

export async function getPartnerRegistrationDetailAdmin(requestId: string) {
  const req = await findPartnerRegistrationRequestById(requestId);
  if (!req) return null;
  const [documents, timeline, linkedCompany] = await Promise.all([
    listPartnerRegistrationDocuments(requestId),
    listPartnerRegistrationTimeline(requestId),
    req.linkedCompanyId ? findCompanyById(req.linkedCompanyId) : Promise.resolve(null),
  ]);
  return { request: req, documents, timeline, linkedCompany };
}

export async function resolvePartnerRegistrationStorageAbsolutePath(relPath: string) {
  return path.join(uploadsBaseDir(), relPath);
}
