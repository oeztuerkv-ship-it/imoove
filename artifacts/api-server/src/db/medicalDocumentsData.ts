import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { MedicalOcrConfidence, MedicalOcrExtracted } from "../lib/medical/medicalOcrNormalize";
import { getDb } from "./client";
import { medicalDocumentsTable } from "./schema";

export const MEDICAL_DOCUMENT_TYPES = ["transport_sheet", "signature_image", "other"] as const;
export type MedicalDocumentType = (typeof MEDICAL_DOCUMENT_TYPES)[number];

export type MedicalDocumentRow = {
  id: string;
  caseId: string;
  rideId: string | null;
  documentType: MedicalDocumentType;
  storageKey: string;
  mimeType: string;
  ocrProvider: string;
  ocrModel: string;
  ocrRawJson: Record<string, unknown>;
  ocrExtractedJson: MedicalOcrExtracted;
  ocrConfidenceJson: MedicalOcrConfidence;
  createdAt: string;
};

function isDocumentType(v: string): v is MedicalDocumentType {
  return (MEDICAL_DOCUMENT_TYPES as readonly string[]).includes(v);
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function mapExtracted(raw: unknown): MedicalOcrExtracted {
  const r = asRecord(raw);
  return {
    patientDisplayName: typeof r.patientDisplayName === "string" ? r.patientDisplayName : "",
    patientReference: typeof r.patientReference === "string" ? r.patientReference : "",
    insuranceName: typeof r.insuranceName === "string" ? r.insuranceName : "",
    insuranceIk: typeof r.insuranceIk === "string" ? r.insuranceIk : "",
    partnerIkNumber: typeof r.partnerIkNumber === "string" ? r.partnerIkNumber : "",
    transportDate: typeof r.transportDate === "string" ? r.transportDate : null,
    validFrom: typeof r.validFrom === "string" ? r.validFrom : null,
    validUntil: typeof r.validUntil === "string" ? r.validUntil : null,
    documentKind: isDocumentType(String(r.documentKind ?? "")) ? (r.documentKind as MedicalDocumentType) : "transport_sheet",
  };
}

function mapConfidence(raw: unknown): MedicalOcrConfidence {
  const r = asRecord(raw);
  const out: MedicalOcrConfidence = {};
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === "number" && Number.isFinite(v)) {
      out[k as keyof MedicalOcrConfidence] = Math.max(0, Math.min(1, v));
    }
  }
  return out;
}

function mapRow(r: typeof medicalDocumentsTable.$inferSelect): MedicalDocumentRow {
  return {
    id: r.id,
    caseId: r.case_id,
    rideId: r.ride_id ?? null,
    documentType: isDocumentType(r.document_type) ? r.document_type : "transport_sheet",
    storageKey: r.storage_key ?? "",
    mimeType: r.mime_type ?? "",
    ocrProvider: r.ocr_provider ?? "",
    ocrModel: r.ocr_model ?? "",
    ocrRawJson: asRecord(r.ocr_raw_json),
    ocrExtractedJson: mapExtracted(r.ocr_extracted_json),
    ocrConfidenceJson: mapConfidence(r.ocr_confidence_json),
    createdAt: r.created_at.toISOString(),
  };
}

export async function insertMedicalDocument(input: {
  caseId: string;
  rideId?: string | null;
  documentType?: MedicalDocumentType;
  storageKey: string;
  mimeType: string;
  ocrProvider?: string;
  ocrModel?: string;
  ocrRawJson?: Record<string, unknown>;
  ocrExtractedJson?: MedicalOcrExtracted;
  ocrConfidenceJson?: MedicalOcrConfidence;
}): Promise<MedicalDocumentRow> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");

  const id = `mdoc-${randomUUID()}`;
  const docType =
    input.documentType && isDocumentType(input.documentType) ? input.documentType : "transport_sheet";

  await db.insert(medicalDocumentsTable).values({
    id,
    case_id: input.caseId.trim(),
    ride_id: input.rideId?.trim() || null,
    document_type: docType,
    storage_key: input.storageKey.trim(),
    mime_type: input.mimeType.trim().slice(0, 120),
    ocr_provider: (input.ocrProvider ?? "").trim().slice(0, 80),
    ocr_model: (input.ocrModel ?? "").trim().slice(0, 120),
    ocr_raw_json: input.ocrRawJson ?? {},
    ocr_extracted_json: input.ocrExtractedJson ?? mapExtracted({}),
    ocr_confidence_json: input.ocrConfidenceJson ?? {},
  });

  const created = await findMedicalDocumentById(id);
  if (!created) throw new Error("medical_document_insert_failed");
  return created;
}

export async function findMedicalDocumentById(id: string): Promise<MedicalDocumentRow | null> {
  const db = getDb();
  if (!db) return null;
  const tid = id.trim();
  if (!tid) return null;
  const rows = await db.select().from(medicalDocumentsTable).where(eq(medicalDocumentsTable.id, tid)).limit(1);
  const r = rows[0];
  return r ? mapRow(r) : null;
}

export async function findLatestMedicalDocumentByCaseId(caseId: string): Promise<MedicalDocumentRow | null> {
  const db = getDb();
  if (!db) return null;
  const cid = caseId.trim();
  if (!cid) return null;
  const rows = await db
    .select()
    .from(medicalDocumentsTable)
    .where(eq(medicalDocumentsTable.case_id, cid))
    .orderBy(desc(medicalDocumentsTable.created_at))
    .limit(1);
  const r = rows[0];
  return r ? mapRow(r) : null;
}

export async function findLatestMedicalDocumentByRideId(rideId: string): Promise<MedicalDocumentRow | null> {
  const db = getDb();
  if (!db) return null;
  const rid = rideId.trim();
  if (!rid) return null;
  const rows = await db
    .select()
    .from(medicalDocumentsTable)
    .where(eq(medicalDocumentsTable.ride_id, rid))
    .orderBy(desc(medicalDocumentsTable.created_at))
    .limit(1);
  const r = rows[0];
  return r ? mapRow(r) : null;
}

export async function listMedicalDocumentsByCaseId(caseId: string, limit = 20): Promise<MedicalDocumentRow[]> {
  const db = getDb();
  if (!db) return [];
  const cid = caseId.trim();
  if (!cid) return [];
  const cap = Math.min(Math.max(1, limit), 200);
  const rows = await db
    .select()
    .from(medicalDocumentsTable)
    .where(eq(medicalDocumentsTable.case_id, cid))
    .orderBy(desc(medicalDocumentsTable.created_at))
    .limit(cap);
  return rows.map(mapRow);
}
