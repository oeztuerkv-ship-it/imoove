import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { MedicalDateLogicResult } from "../lib/medical/medicalDateLogic";
import type { MedicalTrafficLight, MedicalWarning } from "../lib/medical/medicalTrafficLight";
import { getDb } from "./client";
import { medicalReviewsTable } from "./schema";

export const MEDICAL_REVIEWER_ACTOR_KINDS = ["system", "driver", "panel", "admin"] as const;
export type MedicalReviewerActorKind = (typeof MEDICAL_REVIEWER_ACTOR_KINDS)[number];

export type MedicalReviewRow = {
  id: string;
  caseId: string;
  documentId: string;
  trafficLight: MedicalTrafficLight;
  warnings: MedicalWarning[];
  dateLogicResultJson: MedicalDateLogicResult;
  reviewerActorKind: MedicalReviewerActorKind;
  reviewerActorId: string | null;
  reviewedAt: string;
  autoApproved: boolean;
  createdAt: string;
};

function isTrafficLight(v: string): v is MedicalTrafficLight {
  return v === "green" || v === "yellow" || v === "red";
}

function isReviewerActorKind(v: string): v is MedicalReviewerActorKind {
  return (MEDICAL_REVIEWER_ACTOR_KINDS as readonly string[]).includes(v);
}

function mapWarnings(raw: unknown): MedicalWarning[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((w) => w && typeof w === "object" && !Array.isArray(w))
    .map((w) => {
      const rec = w as Record<string, unknown>;
      const severity =
        rec.severity === "info" || rec.severity === "warn" || rec.severity === "block_recommended"
          ? rec.severity
          : "warn";
      return {
        code: typeof rec.code === "string" ? rec.code : "unknown",
        message: typeof rec.message === "string" ? rec.message : "",
        severity,
      };
    });
}

function mapDateLogicResult(raw: unknown): MedicalDateLogicResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      type: "today",
      passed: false,
      severity: "warn",
      expectedDate: null,
      ocrDate: null,
      warningCodes: [],
      details: {},
    };
  }
  const r = raw as Record<string, unknown>;
  const typeRaw = typeof r.type === "string" ? r.type : "today";
  const type =
    typeRaw === "series" ||
    typeRaw === "return_trip" ||
    typeRaw === "long_term_treatment" ||
    typeRaw === "today"
      ? typeRaw
      : "today";
  const severity =
    r.severity === "ok" || r.severity === "warn" || r.severity === "fail" ? r.severity : "warn";
  return {
    type,
    passed: r.passed === true,
    severity,
    expectedDate: typeof r.expectedDate === "string" ? r.expectedDate : null,
    ocrDate: typeof r.ocrDate === "string" ? r.ocrDate : null,
    warningCodes: Array.isArray(r.warningCodes)
      ? r.warningCodes.filter((c): c is string => typeof c === "string")
      : [],
    details:
      r.details && typeof r.details === "object" && !Array.isArray(r.details)
        ? (r.details as Record<string, unknown>)
        : {},
  };
}

function mapRow(r: typeof medicalReviewsTable.$inferSelect): MedicalReviewRow {
  return {
    id: r.id,
    caseId: r.case_id,
    documentId: r.document_id,
    trafficLight: isTrafficLight(r.traffic_light) ? r.traffic_light : "yellow",
    warnings: mapWarnings(r.warnings_json),
    dateLogicResultJson: mapDateLogicResult(r.date_logic_result_json),
    reviewerActorKind: isReviewerActorKind(r.reviewer_actor_kind) ? r.reviewer_actor_kind : "system",
    reviewerActorId: r.reviewer_actor_id ?? null,
    reviewedAt: r.reviewed_at.toISOString(),
    autoApproved: r.auto_approved === true,
    createdAt: r.created_at.toISOString(),
  };
}

export async function insertMedicalReview(input: {
  caseId: string;
  documentId: string;
  trafficLight: MedicalTrafficLight;
  warnings: MedicalWarning[];
  dateLogicResultJson: MedicalDateLogicResult;
  reviewerActorKind?: MedicalReviewerActorKind;
  reviewerActorId?: string | null;
  reviewedAt?: Date;
  autoApproved?: boolean;
}): Promise<MedicalReviewRow> {
  const db = getDb();
  if (!db) throw new Error("database_not_configured");

  const id = `mrev-${randomUUID()}`;
  const reviewedAt = input.reviewedAt ?? new Date();
  const actorKind =
    input.reviewerActorKind && isReviewerActorKind(input.reviewerActorKind)
      ? input.reviewerActorKind
      : "system";

  await db.insert(medicalReviewsTable).values({
    id,
    case_id: input.caseId.trim(),
    document_id: input.documentId.trim(),
    traffic_light: input.trafficLight,
    warnings_json: input.warnings,
    date_logic_result_json: input.dateLogicResultJson,
    reviewer_actor_kind: actorKind,
    reviewer_actor_id: input.reviewerActorId?.trim() || null,
    reviewed_at: reviewedAt,
    auto_approved: false,
    created_at: reviewedAt,
  });

  const created = await findMedicalReviewById(id);
  if (!created) throw new Error("medical_review_insert_failed");
  return created;
}

export async function findMedicalReviewById(id: string): Promise<MedicalReviewRow | null> {
  const db = getDb();
  if (!db) return null;
  const tid = id.trim();
  if (!tid) return null;
  const rows = await db.select().from(medicalReviewsTable).where(eq(medicalReviewsTable.id, tid)).limit(1);
  const r = rows[0];
  return r ? mapRow(r) : null;
}

export async function findLatestMedicalReviewByCaseId(caseId: string): Promise<MedicalReviewRow | null> {
  const db = getDb();
  if (!db) return null;
  const cid = caseId.trim();
  if (!cid) return null;
  const rows = await db
    .select()
    .from(medicalReviewsTable)
    .where(eq(medicalReviewsTable.case_id, cid))
    .orderBy(desc(medicalReviewsTable.reviewed_at))
    .limit(1);
  const r = rows[0];
  return r ? mapRow(r) : null;
}

export async function findLatestMedicalReviewByDocumentId(documentId: string): Promise<MedicalReviewRow | null> {
  const db = getDb();
  if (!db) return null;
  const did = documentId.trim();
  if (!did) return null;
  const rows = await db
    .select()
    .from(medicalReviewsTable)
    .where(eq(medicalReviewsTable.document_id, did))
    .orderBy(desc(medicalReviewsTable.reviewed_at))
    .limit(1);
  const r = rows[0];
  return r ? mapRow(r) : null;
}

export async function listMedicalReviewsByCaseId(caseId: string, limit = 20): Promise<MedicalReviewRow[]> {
  const db = getDb();
  if (!db) return [];
  const cid = caseId.trim();
  if (!cid) return [];
  const cap = Math.min(Math.max(1, limit), 200);
  const rows = await db
    .select()
    .from(medicalReviewsTable)
    .where(eq(medicalReviewsTable.case_id, cid))
    .orderBy(desc(medicalReviewsTable.reviewed_at))
    .limit(cap);
  return rows.map(mapRow);
}
