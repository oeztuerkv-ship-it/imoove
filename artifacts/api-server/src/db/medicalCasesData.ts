import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { MedicalDateLogicType } from "../lib/medical/medicalDateLogic";
import { parseMedicalDateLogicType } from "../lib/medical/medicalDateLogic";
import { getDb } from "./client";
import { adminCompaniesTable, medicalCasesTable } from "./schema";

export const MEDICAL_CASE_TYPES = ["transport_sheet", "signature_image", "other"] as const;
export type MedicalCaseType = (typeof MEDICAL_CASE_TYPES)[number];

export const MEDICAL_CASE_STATUSES = ["open", "reviewed", "closed"] as const;
export type MedicalCaseStatus = (typeof MEDICAL_CASE_STATUSES)[number];

export type MedicalCaseRow = {
  id: string;
  companyId: string;
  rideId: string | null;
  seriesId: string | null;
  patientDisplayName: string;
  patientReference: string;
  insuranceName: string;
  insuranceIk: string;
  partnerIkNumber: string;
  caseType: MedicalCaseType;
  dateLogicType: MedicalDateLogicType;
  dateLogicContextJson: Record<string, unknown>;
  status: MedicalCaseStatus;
  createdAt: string;
  updatedAt: string;
};

function isCaseType(v: string): v is MedicalCaseType {
  return (MEDICAL_CASE_TYPES as readonly string[]).includes(v);
}

function isCaseStatus(v: string): v is MedicalCaseStatus {
  return (MEDICAL_CASE_STATUSES as readonly string[]).includes(v);
}

function mapRow(r: typeof medicalCasesTable.$inferSelect): MedicalCaseRow {
  return {
    id: r.id,
    companyId: r.company_id,
    rideId: r.ride_id ?? null,
    seriesId: r.series_id ?? null,
    patientDisplayName: r.patient_display_name ?? "",
    patientReference: r.patient_reference ?? "",
    insuranceName: r.insurance_name ?? "",
    insuranceIk: r.insurance_ik ?? "",
    partnerIkNumber: r.partner_ik_number ?? "",
    caseType: isCaseType(r.case_type) ? r.case_type : "transport_sheet",
    dateLogicType: parseMedicalDateLogicType(r.date_logic_type),
    dateLogicContextJson:
      r.date_logic_context_json && typeof r.date_logic_context_json === "object"
        ? (r.date_logic_context_json as Record<string, unknown>)
        : {},
    status: isCaseStatus(r.status) ? r.status : "open",
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function getAdminCompanyPartnerIkNumber(companyId: string): Promise<string> {
  const db = getDb();
  if (!db) return "";
  const cid = companyId.trim();
  if (!cid) return "";
  const rows = await db
    .select({ partnerIkNumber: adminCompaniesTable.partner_ik_number })
    .from(adminCompaniesTable)
    .where(eq(adminCompaniesTable.id, cid))
    .limit(1);
  return rows[0]?.partnerIkNumber?.trim() ?? "";
}

export async function insertMedicalCase(input: {
  companyId: string;
  rideId?: string | null;
  seriesId?: string | null;
  patientDisplayName?: string;
  patientReference?: string;
  insuranceName?: string;
  insuranceIk?: string;
  partnerIkNumber?: string;
  caseType?: MedicalCaseType;
  dateLogicType?: MedicalDateLogicType;
  dateLogicContextJson?: Record<string, unknown>;
  status?: MedicalCaseStatus;
}): Promise<MedicalCaseRow> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");

  const id = `mc-${randomUUID()}`;
  const now = new Date();
  const caseType = input.caseType && isCaseType(input.caseType) ? input.caseType : "transport_sheet";
  const status = input.status && isCaseStatus(input.status) ? input.status : "open";

  await db.insert(medicalCasesTable).values({
    id,
    company_id: input.companyId.trim(),
    ride_id: input.rideId?.trim() || null,
    series_id: input.seriesId?.trim() || null,
    patient_display_name: (input.patientDisplayName ?? "").trim().slice(0, 200),
    patient_reference: (input.patientReference ?? "").trim().slice(0, 120),
    insurance_name: (input.insuranceName ?? "").trim().slice(0, 200),
    insurance_ik: (input.insuranceIk ?? "").replace(/\D/g, "").slice(0, 9),
    partner_ik_number: (input.partnerIkNumber ?? "").replace(/\D/g, "").slice(0, 9),
    case_type: caseType,
    date_logic_type: input.dateLogicType ?? "today",
    date_logic_context_json: input.dateLogicContextJson ?? {},
    status,
    created_at: now,
    updated_at: now,
  });

  const created = await findMedicalCaseById(id);
  if (!created) throw new Error("medical_case_insert_failed");
  return created;
}

export async function findMedicalCaseById(id: string): Promise<MedicalCaseRow | null> {
  const db = getDb();
  if (!db) return null;
  const tid = id.trim();
  if (!tid) return null;
  const rows = await db.select().from(medicalCasesTable).where(eq(medicalCasesTable.id, tid)).limit(1);
  const r = rows[0];
  return r ? mapRow(r) : null;
}

export async function findLatestMedicalCaseByRideId(
  rideId: string,
  companyId?: string,
): Promise<MedicalCaseRow | null> {
  const db = getDb();
  if (!db) return null;
  const rid = rideId.trim();
  if (!rid) return null;

  const where =
    companyId && companyId.trim()
      ? and(eq(medicalCasesTable.ride_id, rid), eq(medicalCasesTable.company_id, companyId.trim()))
      : eq(medicalCasesTable.ride_id, rid);

  const rows = await db
    .select()
    .from(medicalCasesTable)
    .where(where)
    .orderBy(desc(medicalCasesTable.created_at))
    .limit(1);
  const r = rows[0];
  return r ? mapRow(r) : null;
}

export async function updateMedicalCaseStatus(
  id: string,
  status: MedicalCaseStatus,
): Promise<MedicalCaseRow | null> {
  const db = getDb();
  if (!db) return null;
  if (!isCaseStatus(status)) return null;
  const tid = id.trim();
  if (!tid) return null;

  await db
    .update(medicalCasesTable)
    .set({ status, updated_at: new Date() })
    .where(eq(medicalCasesTable.id, tid));

  return findMedicalCaseById(tid);
}

export async function updateMedicalCaseFields(
  id: string,
  patch: {
    patientDisplayName?: string;
    patientReference?: string;
    insuranceName?: string;
    insuranceIk?: string;
    partnerIkNumber?: string;
    dateLogicContextJson?: Record<string, unknown>;
    status?: MedicalCaseStatus;
  },
): Promise<MedicalCaseRow | null> {
  const db = getDb();
  if (!db) return null;
  const tid = id.trim();
  if (!tid) return null;

  const set: Partial<typeof medicalCasesTable.$inferInsert> = { updated_at: new Date() };
  if (patch.patientDisplayName != null) {
    set.patient_display_name = patch.patientDisplayName.trim().slice(0, 200);
  }
  if (patch.patientReference != null) {
    set.patient_reference = patch.patientReference.trim().slice(0, 120);
  }
  if (patch.insuranceName != null) {
    set.insurance_name = patch.insuranceName.trim().slice(0, 200);
  }
  if (patch.insuranceIk != null) {
    set.insurance_ik = patch.insuranceIk.replace(/\D/g, "").slice(0, 9);
  }
  if (patch.partnerIkNumber != null) {
    set.partner_ik_number = patch.partnerIkNumber.replace(/\D/g, "").slice(0, 9);
  }
  if (patch.dateLogicContextJson != null) {
    set.date_logic_context_json = patch.dateLogicContextJson;
  }
  if (patch.status != null && isCaseStatus(patch.status)) {
    set.status = patch.status;
  }

  await db.update(medicalCasesTable).set(set).where(eq(medicalCasesTable.id, tid));
  return findMedicalCaseById(tid);
}

export async function listMedicalCasesByCompany(
  companyId: string,
  limit = 50,
): Promise<MedicalCaseRow[]> {
  const db = getDb();
  if (!db) return [];
  const cid = companyId.trim();
  if (!cid) return [];
  const cap = Math.min(Math.max(1, limit), 500);

  const rows = await db
    .select()
    .from(medicalCasesTable)
    .where(eq(medicalCasesTable.company_id, cid))
    .orderBy(desc(medicalCasesTable.created_at))
    .limit(cap);

  return rows.map(mapRow);
}
