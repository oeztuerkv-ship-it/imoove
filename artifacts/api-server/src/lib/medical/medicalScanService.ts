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
import { findPartnerRideSeriesById } from "../../db/partnerRideSeriesData";
import { findRide, insertSupplementalRideEvent } from "../../db/ridesData";
import { ridesTable } from "../../db/schema";
import { parsePartnerBookingMeta } from "../../domain/partnerBookingMeta";
import { insertCustomerMedicalTransportScan } from "../../db/customerMedicalTransportScansData";
import { decodeValidatedMedicalTransportImage } from "../medicalTransportImage";
import { runClaudeVisionMedicalOcr } from "./claudeVisionOcr";
import {
  evaluateMedicalDateLogic,
  parseMedicalDateLogicType,
  type MedicalDateLogicResult,
  type MedicalDateLogicType,
} from "./medicalDateLogic";
import {
  evaluateMedicalInsuranceRules,
  type MedicalInsuranceRuleResult,
} from "./medicalInsuranceRules";
import { normalizeMedicalOcrPayload, parseHasSignatureOnDocument, type MedicalOcrExtracted } from "./medicalOcrNormalize";
import {
  assertMedicalTransportAuthorizedForFleetDriver,
  assertMedicalTransportPlatformAvailable,
  resolveMedicalTransportAuthorizationForFleetDriver,
} from "./medicalTransportAuthorization";
import {
  buildCustomerTransportScanMeta,
  buildDriverHintLines,
  customerTransportScanMetaToPartnerJson,
  pickPrimaryCustomerScanReasonDe,
} from "./customerTransportScanSnapshot";

export const MEDICAL_RIDE_UPLOAD_ROOT =
  (process.env.MEDICAL_RIDE_UPLOAD_DIR ?? "").trim() ||
  path.resolve(process.cwd(), "artifacts/api-server/uploads/medical-ride");

export const MEDICAL_TEST_SCAN_DISCLAIMER =
  "Testprüfung ohne Fahrt – nicht abrechnungsrelevant.";

export type MedicalScanServiceInput = {
  fleetDriverId: string;
  companyId: string;
  rideId: string;
  imageBase64: string;
  dateLogicType?: string;
  seriesId?: string;
  returnRideId?: string;
};

export type MedicalScanTestServiceInput = {
  fleetDriverId: string;
  companyId: string;
  imageBase64: string;
};

export type MedicalScanCustomerTestServiceInput = {
  customerPassengerId: string;
  imageBase64: string;
};

export type MedicalScanCustomerBookingServiceInput = {
  customerPassengerId: string;
  imageBase64: string;
};

export type MedicalScanCustomerBookingServiceResult =
  | {
      ok: true;
      scanId: string;
      trafficLight: "green" | "yellow" | "red";
      primaryReasonDe: string;
      scannedAt: string;
    }
  | { ok: false; error: string; status: number };

/** Kunden-Scan vor Buchung: OCR + persistierter Snapshot (kein Test-Modus). */
export async function runMedicalTransportDocumentScanForCustomerBooking(
  input: MedicalScanCustomerBookingServiceInput,
): Promise<MedicalScanCustomerBookingServiceResult> {
  if (!isPostgresConfigured()) {
    return { ok: false, error: "database_not_configured", status: 503 };
  }

  const customerPassengerId = input.customerPassengerId.trim();
  if (!customerPassengerId) {
    return { ok: false, error: "bad_request", status: 400 };
  }

  const platform = await assertMedicalTransportPlatformAvailable();
  if (!platform.ok) {
    return { ok: false, error: platform.error, status: 403 };
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

  const scanId = `cms-${randomUUID()}`;
  const passengerKey = customerPassengerId.replace(/[^a-zA-Z0-9._-]/g, "_");
  const rel = path.join("customer-pending", passengerKey, `${scanId}.${decoded.ext}`).replace(/\\/g, "/");
  const dest = path.join(MEDICAL_RIDE_UPLOAD_ROOT, rel);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, decoded.buffer);

  const pipeline = await runMedicalOcrPipeline({
    buffer: decoded.buffer,
    mime: decoded.mime,
    companyId: "",
    partnerIkSnapshot: "",
    dateLogicType: "today",
    rideScheduledAt: null,
    insuranceRideId: `customer-booking:${scanId}`,
  });

  const scannedAt = new Date().toISOString();
  const primaryReasonDe = pickPrimaryCustomerScanReasonDe(
    pipeline.trafficLight,
    pipeline.warnings,
    pipeline.insuranceRules,
  );
  const meta = buildCustomerTransportScanMeta({
    scanId,
    trafficLight: pipeline.trafficLight,
    scannedAt,
    primaryReasonDe,
    insuranceName: pipeline.extracted.insuranceName?.trim() ?? "",
    transportDate: pipeline.extracted.transportDate ?? null,
    driverHintLines: buildDriverHintLines(pipeline.warnings, pipeline.insuranceRules),
    storageKey: rel,
  });

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const inserted = await insertCustomerMedicalTransportScan({
    id: scanId,
    passengerId: customerPassengerId,
    trafficLight: pipeline.trafficLight,
    primaryReasonDe,
    snapshotJson: {
      ...customerTransportScanMetaToPartnerJson(meta),
      evaluation: {
        warnings: pipeline.warnings,
        extracted: pipeline.extracted,
        dateLogic: pipeline.dateLogic,
        insuranceRules: pipeline.insuranceRules,
      },
    },
    storageKey: rel,
    expiresAt,
  });

  if (!inserted) {
    return { ok: false, error: "database_not_configured", status: 503 };
  }

  return {
    ok: true,
    scanId: inserted.id,
    trafficLight: pipeline.trafficLight,
    primaryReasonDe,
    scannedAt,
  };
}

export type MedicalScanWarningDto = {
  code: string;
  message: string;
  severity: "info" | "warn" | "block_recommended";
};

type MedicalScanEvaluationCore = {
  trafficLight: "green" | "yellow" | "red";
  warnings: MedicalScanWarningDto[];
  extracted: MedicalOcrExtracted;
  dateLogic: MedicalDateLogicResult;
  insuranceRules: MedicalInsuranceRuleResult;
};

type MedicalOcrPipelineResult = MedicalScanEvaluationCore & {
  ocrRawJson: unknown;
  ocrProvider: string;
  ocrModel: string;
  ocrConfidence: ReturnType<typeof normalizeMedicalOcrPayload>["confidence"];
};

export type MedicalScanServiceResult =
  | ({
      ok: true;
      caseId: string;
      documentId: string;
      reviewId: string;
      storageKey: string;
    } & MedicalScanEvaluationCore)
  | { ok: false; error: string; status: number };

export type MedicalScanTestServiceResult =
  | ({
      ok: true;
      testMode: true;
      testDisclaimer: string;
    } & MedicalScanEvaluationCore)
  | { ok: false; error: string; status: number };

/** Feature-Flag: Testscan ohne Fahrt — nur bei explizit gesetztem MEDICAL_TEST_SCAN_ENABLED. */
export function isMedicalTestScanEnabled(): boolean {
  const v = (process.env.MEDICAL_TEST_SCAN_ENABLED ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

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

async function resolvePartnerIk(companyId: string): Promise<string> {
  if (!isPostgresConfigured()) return "";
  try {
    return (await getAdminCompanyPartnerIkNumber(companyId)) || "";
  } catch {
    return "";
  }
}

function normalizePartnerIkNumber(value: string): string {
  return value.replace(/\D/g, "").slice(0, 9);
}

/** Partner-IK stammt aus admin_companies — nicht vom Schein-Foto. */
function applyPartnerIkFromCompanyProfile(
  normalized: ReturnType<typeof normalizeMedicalOcrPayload>,
  partnerIkSnapshot: string,
): void {
  const partnerIk = normalizePartnerIkNumber(partnerIkSnapshot);
  if (!partnerIk) return;
  normalized.extracted.partnerIkNumber = partnerIk;
  normalized.confidence.partnerIkNumber = 1;
}

async function runMedicalOcrPipeline(input: {
  buffer: Buffer;
  mime: string;
  companyId: string;
  partnerIkSnapshot: string;
  dateLogicType: MedicalDateLogicType;
  rideScheduledAt: string | null;
  insuranceRideId: string;
  seriesRow?: {
    id: string;
    validFrom: string | null;
    validUntil: string | null;
    totalRides: number;
  } | null;
  returnRideScheduledAt?: Date | null;
  completedRidesInSeries?: number;
}): Promise<MedicalOcrPipelineResult> {
  const ocrResult = await runClaudeVisionMedicalOcr({
    buffer: input.buffer,
    mime: input.mime,
  });
  console.log(
    "[medical-scan-debug] ocrResult",
    JSON.stringify({ ok: ocrResult.ok, error: (ocrResult as any).error }, null, 2),
  );

  const normalized = normalizeMedicalOcrPayload(
    ocrResult.ok ? (ocrResult.rawJson.extracted ?? ocrResult.rawJson) : {},
  );
  applyPartnerIkFromCompanyProfile(normalized, input.partnerIkSnapshot);

  const dateLogicResult = evaluateMedicalDateLogic({
    dateLogicType: input.dateLogicType,
    rideScheduledAt: input.rideScheduledAt,
    series: input.seriesRow
      ? {
          id: input.seriesRow.id,
          validFrom: input.seriesRow.validFrom,
          validUntil: input.seriesRow.validUntil,
          totalRides: input.seriesRow.totalRides,
          completedRides: input.completedRidesInSeries,
        }
      : null,
    returnRideScheduledAt: input.returnRideScheduledAt ?? null,
    extracted: normalized.extracted,
  });

  const traffic = evaluateMedicalTrafficLight({
    extracted: normalized.extracted,
    confidence: normalized.confidence,
    partnerIkSnapshot: input.partnerIkSnapshot,
    dateLogicResult,
    ocrProviderSucceeded: ocrResult.ok,
    hasSignatureOnDocument: ocrResult.ok
      ? parseHasSignatureOnDocument(ocrResult.rawJson.extracted ?? ocrResult.rawJson)
      : undefined,
  });

  const insuranceRules = evaluateMedicalInsuranceRules(normalized.extracted, {
    companyId: input.companyId,
    partnerIkNumber: input.partnerIkSnapshot,
  }, {
    rideId: input.insuranceRideId,
    scheduledAt: input.rideScheduledAt,
    dateLogicType: input.dateLogicType,
  });

  return {
    trafficLight: traffic.trafficLight,
    warnings: traffic.warnings as MedicalWarning[],
    extracted: normalized.extracted,
    dateLogic: dateLogicResult,
    insuranceRules,
    ocrRawJson: ocrResult.ok ? ocrResult.rawJson : { error: ocrResult.error },
    ocrProvider: ocrResult.ok ? ocrResult.provider : "",
    ocrModel: ocrResult.ok ? ocrResult.model : "",
    ocrConfidence: normalized.confidence,
  };
}

/**
 * Testscan: OCR + Ampel + KK-Profil — ohne DB-Schreibzugriffe, ohne Ride-Events, ohne Abrechnung.
 */
export async function runMedicalTransportDocumentScanTest(
  input: MedicalScanTestServiceInput,
): Promise<MedicalScanTestServiceResult> {
  if (!isMedicalTestScanEnabled()) {
    return { ok: false, error: "test_scan_disabled", status: 403 };
  }

  const companyId = input.companyId.trim();
  const fleetDriverId = input.fleetDriverId.trim();
  if (!companyId || !fleetDriverId) {
    return { ok: false, error: "bad_request", status: 400 };
  }

  const authz = await assertMedicalTransportAuthorizedForFleetDriver(companyId, fleetDriverId);
  if (!authz.ok) {
    return { ok: false, error: authz.error, status: 403 };
  }

  return runMedicalTransportDocumentScanTestCore({
    imageBase64: input.imageBase64,
    companyId,
    partnerIkSnapshot: await resolvePartnerIk(companyId),
    insuranceRideId: "test",
  });
}

/** Kunden-Testscan ohne Mandant/Fahrt — Partner-IK nicht verfügbar bis zur Buchung. */
export async function runMedicalTransportDocumentScanTestForCustomer(
  input: MedicalScanCustomerTestServiceInput,
): Promise<MedicalScanTestServiceResult> {
  if (!isMedicalTestScanEnabled()) {
    return { ok: false, error: "test_scan_disabled", status: 403 };
  }

  const customerPassengerId = input.customerPassengerId.trim();
  if (!customerPassengerId) {
    return { ok: false, error: "bad_request", status: 400 };
  }

  const platform = await assertMedicalTransportPlatformAvailable();
  if (!platform.ok) {
    return { ok: false, error: platform.error, status: 403 };
  }

  return runMedicalTransportDocumentScanTestCore({
    imageBase64: input.imageBase64,
    companyId: "",
    partnerIkSnapshot: "",
    insuranceRideId: `customer-test:${customerPassengerId}`,
  });
}

async function runMedicalTransportDocumentScanTestCore(input: {
  imageBase64: string;
  companyId: string;
  partnerIkSnapshot: string;
  insuranceRideId: string;
}): Promise<MedicalScanTestServiceResult> {
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

  const pipeline = await runMedicalOcrPipeline({
    buffer: decoded.buffer,
    mime: decoded.mime,
    companyId: input.companyId,
    partnerIkSnapshot: input.partnerIkSnapshot,
    dateLogicType: "today",
    rideScheduledAt: null,
    insuranceRideId: input.insuranceRideId,
  });

  return {
    ok: true,
    testMode: true,
    testDisclaimer: MEDICAL_TEST_SCAN_DISCLAIMER,
    trafficLight: pipeline.trafficLight,
    warnings: pipeline.warnings,
    extracted: pipeline.extracted,
    dateLogic: pipeline.dateLogic,
    insuranceRules: pipeline.insuranceRules,
  };
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

  const authz = await assertMedicalTransportAuthorizedForFleetDriver(companyId, fleetDriverId);
  if (!authz.ok) {
    return { ok: false, error: authz.error, status: 403 };
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

  const partnerIkSnapshot = await resolvePartnerIk(companyId);

  let completedRidesInSeries: number | undefined;
  if (seriesRow) {
    completedRidesInSeries = await countCompletedRidesForSeries(seriesRow.id, companyId);
  }

  const pipeline = await runMedicalOcrPipeline({
    buffer: decoded.buffer,
    mime: decoded.mime,
    companyId,
    partnerIkSnapshot,
    dateLogicType,
    rideScheduledAt: ride.scheduledAt ?? null,
    insuranceRideId: rideId,
    seriesRow,
    returnRideScheduledAt,
    completedRidesInSeries,
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
    patientDisplayName: pipeline.extracted.patientDisplayName,
    patientReference:
      pipeline.extracted.patientReference || partnerMeta?.medical?.patientReference?.trim() || "",
    insuranceName: pipeline.extracted.insuranceName,
    insuranceIk: pipeline.extracted.insuranceIk,
    partnerIkNumber: normalizePartnerIkNumber(partnerIkSnapshot),
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
    ocrProvider: pipeline.ocrProvider,
    ocrModel: pipeline.ocrModel,
    ocrRawJson: pipeline.ocrRawJson,
    ocrExtractedJson: pipeline.extracted,
    ocrConfidenceJson: pipeline.ocrConfidence,
  });

  const review = await insertMedicalReview({
    caseId: medicalCase.id,
    documentId: document.id,
    trafficLight: pipeline.trafficLight,
    warnings: pipeline.warnings,
    dateLogicResultJson: pipeline.dateLogic,
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
      trafficLight: pipeline.trafficLight,
      warningCodes: pipeline.warnings.map((w) => w.code),
      insuranceProfile: pipeline.insuranceRules.profile,
      insuranceManualReview: pipeline.insuranceRules.manualReviewRequired,
    },
  });

  return {
    ok: true,
    caseId: medicalCase.id,
    documentId: document.id,
    reviewId: review.id,
    trafficLight: pipeline.trafficLight,
    warnings: pipeline.warnings,
    extracted: pipeline.extracted,
    dateLogic: pipeline.dateLogic,
    insuranceRules: pipeline.insuranceRules,
    storageKey: rel,
  };
}
