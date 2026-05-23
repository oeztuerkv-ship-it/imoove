import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, count, eq, sql } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "../../db/client";
import {
  getAdminCompanyPartnerIkNumber,
  insertMedicalCase,
  updateMedicalCaseStatus,
} from "../../db/medicalCasesData";
import { insertMedicalDocument } from "../../db/medicalDocumentsData";
import { insertMedicalReview } from "../../db/medicalReviewsData";
import {
  findPartnerRideSeriesById,
} from "../../db/partnerRideSeriesData";
import { findRide, insertSupplementalRideEvent } from "../../db/ridesData";
import { ridesTable } from "../../db/schema";
import { parsePartnerBookingMeta } from "../../domain/partnerBookingMeta";
import { decodeValidatedMedicalTransportImage } from "../medicalTransportImage";
import { runClaudeVisionMedicalOcr } from "./claudeVisionOcr";
import {
  evaluateMedicalDateLogic,
  parseMedicalDateLogicType,
  type MedicalDateLogicType,
} from "./medicalDateLogic";
import { normalizeMedicalOcrPayload } from "./medicalOcrNormalize";
import { evaluateMedicalTrafficLight } from "./medicalTrafficLight";

export const MEDICAL_RIDE_UPLOAD_ROOT =
  (process.env.MEDICAL_RIDE_UPLOAD_DIR ?? "").trim() ||
  path.resolve(process.cwd(), "artifacts/api-server/uploads/medical-ride");

export type MedicalScanServiceInput = {
  fleetDriverId: string;
  companyId: string;
  rideId: string;
  imageBase64: string;
  dateLogicType?: string;
  seriesId?: string;
  returnRideId?: string;
};

export type MedicalScanWarningDto = {
  code: string;
  message: string;
  severity: "info" | "warn" | "block_recommended";
};

export type MedicalScanServiceResult =
  | {
      ok: true;
      caseId: string;
      documentId: string;
      reviewId: string;
      trafficLight: "green" | "yellow" | "red";
      warnings: MedicalScanWarningDto[];
      extracted: ReturnType<typeof normalizeMedicalOcrPayload>["extracted"];
      dateLogic: ReturnType<typeof evaluateMedicalDateLogic>;
      storageKey: string;
    }
  | { ok: false; error: string; status: number };

async function countCompletedRidesForSeries(seriesId: string, companyId: string): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const sid = seriesId.trim();
  const cid = companyId.trim();
  if (!sid || !cid) return 0;
  const [row] = await db
    .select({ n: count() })
    .from(ridesTable)
    .where(
      and(
        eq(ridesTable.company_id, cid),
        eq(ridesTable.status, "completed"),
        sql`${ridesTable.partner_booking_meta}->'medical'->>'seriesId' = ${sid}`,
      ),
    );
  return Number(row?.n ?? 0);
}

/** Bild → OCR → Normalize → DateLogic → TrafficLight → DB (ohne Auto-Freigabe). */
export async function runMedicalTransportDocumentScan(
  input: MedicalScanServiceInput,
): Promise<MedicalScanServiceResult> {
  if (!isPostgresConfigured()) {
    return { ok: false, error: "database_not_configured", status: 503 };
  }

  const rideId = input.rideId.trim();
  const companyId = input.companyId.trim();
  const fleetDriverId = input.fleetDriverId.trim();
  if (!rideId || !companyId || !fleetDriverId) {
    return { ok: false, error: "bad_request", status: 400 };
  }

  const ride = await findRide(rideId);
  if (!ride) {
    return { ok: false, error: "not_found", status: 404 };
  }
  if (ride.rideKind !== "medical") {
    return { ok: false, error: "not_medical_ride", status: 400 };
  }
  if ((ride.companyId ?? "").trim() !== companyId) {
    return { ok: false, error: "wrong_company", status: 403 };
  }
  const assignedDriver = (ride.driverId ?? "").trim();
  if (!assignedDriver) {
    return { ok: false, error: "driver_not_assigned", status: 403 };
  }
  if (assignedDriver !== fleetDriverId) {
    return { ok: false, error: "not_assigned_driver", status: 403 };
  }

  const b64 = input.imageBase64.trim();
  if (!b64) {
    return { ok: false, error: "image_base64_required", status: 400 };
  }

  const decoded = decodeValidatedMedicalTransportImage(b64);
  if (!decoded.ok) {
    const status =
      decoded.error === "payload_too_large" ? 413 : decoded.error === "image_size_invalid" ? 413 : 400;
    return { ok: false, error: decoded.error, status };
  }

  const partnerMeta = parsePartnerBookingMeta(ride.partnerBookingMeta);
  const dateLogicType: MedicalDateLogicType = parseMedicalDateLogicType(
    input.dateLogicType ??
      (input.seriesId || partnerMeta?.medical?.seriesId ? "series" : undefined) ??
      (input.returnRideId || partnerMeta?.medical?.linkedRideId ? "return_trip" : undefined),
  );

  const seriesId = (input.seriesId ?? partnerMeta?.medical?.seriesId ?? "").trim() || null;
  let seriesRow = null;
  if (seriesId) {
    seriesRow = await findPartnerRideSeriesById(seriesId, companyId);
    if (!seriesRow) {
      return { ok: false, error: "series_not_found", status: 404 };
    }
  }

  const returnRideId = (input.returnRideId ?? partnerMeta?.medical?.linkedRideId ?? "").trim() || null;
  let returnRideScheduledAt: Date | null = null;
  if (returnRideId) {
    const returnRide = await findRide(returnRideId);
    if (returnRide?.scheduledAt) {
      returnRideScheduledAt = new Date(returnRide.scheduledAt);
    }
  }

  const companyKey = companyId.replace(/[^a-zA-Z0-9._-]/g, "_");
  const rel = path.join(companyKey, "rides", rideId, `scan-${randomUUID()}.${decoded.ext}`).replace(/\\/g, "/");
  const dest = path.join(MEDICAL_RIDE_UPLOAD_ROOT, rel);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, decoded.buffer);

  const partnerIkSnapshot = await getAdminCompanyPartnerIkNumber(companyId);

  const ocrResult = await runClaudeVisionMedicalOcr({
    buffer: decoded.buffer,
    mime: decoded.mime,
  });

  const ocrProviderSucceeded = ocrResult.ok;
  const ocrRawJson = ocrResult.ok ? ocrResult.rawJson : { error: ocrResult.error };
  const ocrProvider = ocrResult.ok ? ocrResult.provider : "";
  const ocrModel = ocrResult.ok ? ocrResult.model : "";

  const normalized = normalizeMedicalOcrPayload(
    ocrResult.ok ? (ocrResult.rawJson.extracted ?? ocrResult.rawJson) : {},
  );

  let completedRidesInSeries: number | undefined;
  if (seriesRow) {
    completedRidesInSeries = await countCompletedRidesForSeries(seriesRow.id, companyId);
  }

  const dateLogicResult = evaluateMedicalDateLogic({
    dateLogicType,
    rideScheduledAt: ride.scheduledAt ?? null,
    series: seriesRow
      ? {
          id: seriesRow.id,
          validFrom: seriesRow.validFrom,
          validUntil: seriesRow.validUntil,
          totalRides: seriesRow.totalRides,
          completedRides: completedRidesInSeries,
        }
      : null,
    returnRideScheduledAt,
    extracted: normalized.extracted,
  });

  const traffic = evaluateMedicalTrafficLight({
    extracted: normalized.extracted,
    confidence: normalized.confidence,
    partnerIkSnapshot,
    dateLogicResult,
    ocrProviderSucceeded,
  });

  const dateLogicContextJson: Record<string, unknown> = {
    dateLogicType,
    seriesId,
    returnRideId,
    rideScheduledAt: ride.scheduledAt ?? null,
  };

  const medicalCase = await insertMedicalCase({
    companyId,
    rideId,
    seriesId,
    patientDisplayName: normalized.extracted.patientDisplayName,
    patientReference:
      normalized.extracted.patientReference || partnerMeta?.medical?.patientReference?.trim() || "",
    insuranceName: normalized.extracted.insuranceName,
    insuranceIk: normalized.extracted.insuranceIk,
    partnerIkNumber: partnerIkSnapshot || normalized.extracted.partnerIkNumber,
    caseType: "transport_sheet",
    dateLogicType,
    dateLogicContextJson,
    status: "open",
  });

  const document = await insertMedicalDocument({
    caseId: medicalCase.id,
    rideId,
    documentType: "transport_sheet",
    storageKey: rel,
    mimeType: decoded.mime,
    ocrProvider,
    ocrModel,
    ocrRawJson,
    ocrExtractedJson: normalized.extracted,
    ocrConfidenceJson: normalized.confidence,
  });

  const review = await insertMedicalReview({
    caseId: medicalCase.id,
    documentId: document.id,
    trafficLight: traffic.trafficLight,
    warnings: traffic.warnings,
    dateLogicResultJson: dateLogicResult,
    reviewerActorKind: "system",
    reviewerActorId: fleetDriverId,
  });

  await updateMedicalCaseStatus(medicalCase.id, "reviewed");

  void insertSupplementalRideEvent(rideId, {
    eventType: "medical_scan_reviewed",
    actorType: "driver",
    actorId: fleetDriverId,
    payload: {
      caseId: medicalCase.id,
      documentId: document.id,
      reviewId: review.id,
      trafficLight: traffic.trafficLight,
      warningCodes: traffic.warnings.map((w) => w.code),
    },
  });

  return {
    ok: true,
    caseId: medicalCase.id,
    documentId: document.id,
    reviewId: review.id,
    trafficLight: traffic.trafficLight,
    warnings: traffic.warnings,
    extracted: normalized.extracted,
    dateLogic: dateLogicResult,
    storageKey: rel,
  };
}
