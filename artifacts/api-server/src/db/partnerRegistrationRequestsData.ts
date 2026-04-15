import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, sql } from "drizzle-orm";
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

export type PartnerRegistrationAdminPatch = {
  status?: RegistrationStatus;
  verificationStatus?: "pending" | "in_review" | "verified" | "rejected";
  complianceStatus?: "pending" | "complete" | "missing_documents" | "rejected";
  contractStatus?: "inactive" | "pending" | "active" | "suspended" | "terminated";
  missingDocumentsNote?: string;
  adminNote?: string;
  reviewedByAdminUserId?: string | null;
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
  return findPartnerRegistrationRequestById(id);
}

export async function attachCompanyToPartnerRegistrationRequest(
  id: string,
  companyId: string,
  adminUserId: string | null,
) {
  const db = getDb();
  if (!db) return null;
  await db
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
      and(
        eq(partnerRegistrationRequestsTable.id, id),
        eq(partnerRegistrationRequestsTable.master_data_locked, true),
      ),
    );
  await addPartnerRegistrationTimelineEvent({
    requestId: id,
    actorType: "admin",
    actorLabel: adminUserId ?? "admin",
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
  const [documents, timeline] = await Promise.all([
    listPartnerRegistrationDocuments(requestId),
    listPartnerRegistrationTimeline(requestId),
  ]);
  return { request: req, documents, timeline };
}

export async function resolvePartnerRegistrationStorageAbsolutePath(relPath: string) {
  return path.join(uploadsBaseDir(), relPath);
}
