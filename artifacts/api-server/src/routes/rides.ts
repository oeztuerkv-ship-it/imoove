import { randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import type { RideRequest, TariffBookingSnapshotV1 } from "../domain/rideRequest";
import type { RideAccessibilityOptions } from "../domain/rideRequest";
import {
  DEFAULT_PAYER_KIND,
  DEFAULT_RIDE_KIND,
  parseOptionalBillingTag,
  parsePayerKind,
  parseRideKind,
} from "../domain/rideBillingProfile";
import { attachAccessCodeSummariesToRides } from "../db/accessCodesData";
import {
  adminReleaseRide,
  findRide,
  insertRideWithOptionalAccessCode,
  insertSupplementalRideEvent,
  listRides,
  resetRidesDemo,
  updateRide,
} from "../db/ridesData";
import { upsertRideFinancialSnapshot } from "../db/rideFinancialsData";
import {
  DEFAULT_AUTHORIZATION_SOURCE,
  normalizeAccessCodeInput,
  parseAuthorizationSource,
} from "../domain/rideAuthorization";
import { stripPartnerOnlyRideFields, toCustomerRideView } from "../domain/ridePublic";
import { getPublicFareProfile } from "../db/adminData";
import { computeTaxiPriceLikeFareEstimate, TARIFF_ENGINE_SCHEMA_VERSION } from "../lib/bookingTariffEstimate";
import { effectiveTaxiGrossEur } from "../lib/financeCalculationService";
import { anyActiveRegionRequiresClientCoordinates } from "../lib/serviceRegionMatch";
import { verifyAccessCode } from "../db/accessCodesData";
import {
  getFleetDriverCapability,
  isRideCompatibleWithCapability,
} from "../db/fleetMatchingData";
import { getFleetDriverReadinessById } from "../db/fleetDriverReadiness";
import { findFleetDriverAuthRow } from "../db/fleetDriversData";
import { isFarFutureReservation } from "../lib/dispatchStatus";
import {
  assertCustomerFromFullInActiveServiceRegion,
  assertCustomerRideOperational,
  assertPlatformNewRideAllowed,
  checkCustomerRideServiceArea,
  evaluateCustomerCancellationFeeEur,
  getOperationalConfigPayload,
  getOutOfServiceAreaMessage,
  listServiceRegionsForApi,
  resolveFinancePricingContextFromOperational,
} from "../db/appOperationalData";
import { decodeValidatedMedicalTransportImage } from "../lib/medicalTransportImage";
import { calculateMedicalBillingReadiness } from "../lib/medicalBillingReadiness";
import { createMedicalQrToken, formatMedicalQrPayload } from "../lib/medicalQrToken";
import { customerPassengerId, requireCustomerSession, type CustomerSessionRequest } from "../middleware/requireCustomerSession";
import { requireFleetDriverAuth, type FleetDriverAuthRequest } from "../middleware/requireFleetDriverAuth";

export type { RideRequest } from "../domain/rideRequest";

export interface DriverLocation {
  lat: number;
  lon: number;
  updatedAt: string;
}

const DEMO: RideRequest[] = [];

export const driverLocations = new Map<string, DriverLocation>();
export const customerLocations = new Map<string, DriverLocation>();
const customerCancelReasons = new Map<string, string>();
const customerSupportTickets = new Map<
  string,
  { ticketId: string; rideId: string; category: string; message: string; source: string; createdAt: string }[]
>();

const router = Router();

const MEDICAL_RIDE_UPLOAD_ROOT =
  (process.env.MEDICAL_RIDE_UPLOAD_DIR ?? "").trim() ||
  path.resolve(process.cwd(), "artifacts/api-server/uploads/medical-ride");

function asMedicalFlatMeta(ride: RideRequest): Record<string, unknown> | null {
  const m = ride.partnerBookingMeta;
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  const rec = m as Record<string, unknown>;
  if (rec.medical_ride !== true) return null;
  return { ...rec };
}

function timingSafeEqualUtf8(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

function mergeMedicalPartnerMeta(ride: RideRequest, patch: Record<string, unknown>): Record<string, unknown> {
  const base = asMedicalFlatMeta(ride);
  if (!base) {
    throw Object.assign(new Error("not_medical_meta"), { code: "not_medical_meta" });
  }
  const merged = { ...base, ...patch };
  const ready = calculateMedicalBillingReadiness(merged);
  merged.billing_ready = ready.billingReady;
  merged.billing_missing_reasons = ready.missingReasons;
  return merged;
}

const CODE_VERIFY_TTL_MS = 5 * 60 * 1000;
const codeVerifySessions = new Map<
  string,
  { driverId: string; normalized: string; expiresAt: number }
>();

function cleanupCodeVerifySessions(now = Date.now()): void {
  for (const [key, session] of codeVerifySessions) {
    if (session.expiresAt <= now) codeVerifySessions.delete(key);
  }
}

const ACTIVE_RIDE_STATUSES: ReadonlySet<RideRequest["status"]> = new Set([
  "scheduled",
  "requested",
  "searching_driver",
  "offered",
  "accepted",
  "driver_arriving",
  "driver_waiting",
  "passenger_onboard",
  "in_progress",
  // Legacy compatibility
  "pending",
  "arrived",
]);

/** PATCH-Body: finalFare / final_fare / status_data (String mit Komma erlaubt). */
function parseOptionalFinalFareFromBody(body: unknown): number | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;
  const nested =
    b.status_data != null && typeof b.status_data === "object" && !Array.isArray(b.status_data)
      ? (b.status_data as Record<string, unknown>)
      : null;
  const raw = b.finalFare ?? b.final_fare ?? nested?.finalFare ?? nested?.final_fare;
  if (raw == null || raw === "") return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(String(raw).trim().replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function normalizeStatusInput(raw: unknown): RideRequest["status"] | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  const allowed: RideRequest["status"][] = [
    "draft",
    "scheduled",
    "requested",
    "searching_driver",
    "offered",
    "pending",
    "accepted",
    "driver_arriving",
    "driver_waiting",
    "passenger_onboard",
    "arrived",
    "in_progress",
    "completed",
    "cancelled_by_customer",
    "cancelled_by_driver",
    "cancelled_by_system",
    "expired",
    "rejected",
    "cancelled",
  ];
  return (allowed as string[]).includes(s) ? (s as RideRequest["status"]) : null;
}

function canTransitionStatus(
  from: RideRequest["status"],
  to: RideRequest["status"],
): boolean {
  if (from === to) return true;
  const map: Partial<Record<RideRequest["status"], RideRequest["status"][]>> = {
    draft: ["requested", "cancelled_by_customer", "cancelled"],
    scheduled: [
      "accepted",
      "searching_driver",
      "cancelled_by_customer",
      "cancelled",
      "expired",
    ],
    requested: ["searching_driver", "offered", "accepted", "expired", "cancelled_by_customer", "cancelled"],
    searching_driver: ["offered", "accepted", "expired", "cancelled_by_customer", "cancelled"],
    offered: ["accepted", "searching_driver", "expired", "cancelled_by_customer", "cancelled"],
    pending: ["accepted", "driver_arriving", "driver_waiting", "in_progress", "completed", "cancelled", "rejected", "cancelled_by_customer", "cancelled_by_driver", "cancelled_by_system"],
    accepted: ["driver_arriving", "driver_waiting", "passenger_onboard", "in_progress", "cancelled_by_customer", "cancelled_by_driver", "cancelled_by_system", "cancelled"],
    driver_arriving: ["driver_waiting", "passenger_onboard", "in_progress", "cancelled_by_customer", "cancelled_by_driver", "cancelled_by_system"],
    driver_waiting: ["passenger_onboard", "in_progress", "cancelled_by_customer", "cancelled_by_driver", "cancelled_by_system"],
    passenger_onboard: ["in_progress", "completed", "cancelled_by_system"],
    arrived: ["passenger_onboard", "in_progress", "completed", "cancelled", "cancelled_by_customer", "cancelled_by_driver"],
    in_progress: ["completed", "cancelled_by_system", "cancelled"],
  };
  return (map[from] ?? []).includes(to);
}

function ceilToTenth(amount: number): number {
  const safe = Number.isFinite(amount) ? amount : 0;
  return Math.ceil((safe + Number.EPSILON) * 10) / 10;
}

function pickScheduledAtFromBody(raw: Partial<RideRequest> & Record<string, unknown>): string | null {
  const c = raw.scheduledAt;
  if (typeof c === "string" && c.trim()) return c.trim();
  const s = raw.scheduled_at;
  if (typeof s === "string" && s.trim()) return s.trim();
  return null;
}

function initialCustomerRideStatus(scheduledAt: string | null): RideRequest["status"] {
  return isFarFutureReservation(scheduledAt) ? "scheduled" : "searching_driver";
}

function optCoord(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const ADDRESS_HOUSE_NUMBER_REQUIRED_MESSAGE =
  "Bitte gib eine vollständige Adresse mit Hausnummer ein oder wähle einen eindeutigen Vorschlag aus.";

function hasHouseNumberInFirstAddressPart(address: string): boolean {
  const firstPart = String(address ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (!firstPart) return false;
  // Beispiele: "Hauptstraße 12", "Musterweg 7a", "Bahnhofstr. 12-14"
  return /\b\d{1,5}[a-z]?(?:\s*[-/]\s*\d{1,5}[a-z]?)?\b/i.test(firstPart);
}

function parseAccessibilityOptionsFromBody(raw: unknown): RideAccessibilityOptions | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const level = String(src.assistanceLevel ?? "").trim();
  const wheelchairType = String(src.wheelchairType ?? "").trim();
  const companionCountRaw = Number(src.companionCount);
  const canTransferRaw = src.canTransfer;
  const wheelchairStaysRaw = src.wheelchairStaysOccupied;
  const allowedLevels = new Set(["boarding", "to_door", "to_apartment", "none"]);
  const allowedTypes = new Set(["foldable", "electric"]);
  if (!allowedLevels.has(level) || !allowedTypes.has(wheelchairType)) return null;
  if (![0, 1, 2].includes(companionCountRaw)) return null;
  if (typeof canTransferRaw !== "boolean" || typeof wheelchairStaysRaw !== "boolean") return null;
  const noteRaw = typeof src.driverNote === "string" ? src.driverNote.trim() : "";
  return {
    assistanceLevel: level as RideAccessibilityOptions["assistanceLevel"],
    wheelchairType: wheelchairType as RideAccessibilityOptions["wheelchairType"],
    wheelchairStaysOccupied: wheelchairStaysRaw,
    canTransfer: canTransferRaw,
    companionCount: companionCountRaw as 0 | 1 | 2,
    rampRequired: Boolean(src.rampRequired),
    carryChairRequired: Boolean(src.carryChairRequired),
    elevatorAvailable: Boolean(src.elevatorAvailable),
    stairsPresent: Boolean(src.stairsPresent),
    driverNote: noteRaw ? noteRaw.slice(0, 500) : null,
  };
}

function pickMedicalMeta(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const copyString = (k: string) => {
    const v = src[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 256);
  };
  const copyBool = (k: string) => {
    const v = src[k];
    if (typeof v === "boolean") out[k] = v;
  };
  const copyNumber = (k: string) => {
    const v = src[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  };
  copyString("approval_status");
  copyString("insurance_name");
  copyString("cost_center");
  copyString("authorization_reference");
  copyString("transport_document_status");
  copyString("approval_proof_mode");
  copyString("copayment_required");
  copyString("copayment_collected_status");
  copyString("copayment_collection_method");
  copyNumber("copayment_amount_estimated");
  copyNumber("gross_ride_amount");
  copyNumber("onroda_commission_rate");
  copyNumber("onroda_commission_amount");
  copyNumber("partner_payout_amount");
  copyBool("signature_required");
  copyBool("qr_required");
  copyBool("transport_document_required");
  copyBool("billing_ready");
  copyBool("return_ride");
  copyString("return_time");
  copyString("transport_document_uri");
  return out;
}

function medicalFinanceSnapshot(gross: number): {
  gross_ride_amount: number;
  onroda_commission_rate: number;
  onroda_commission_amount: number;
  partner_payout_amount: number;
} {
  const grossSafe = Number.isFinite(gross) ? Math.max(0, gross) : 0;
  const rate = 0.07;
  const commission = Math.round(grossSafe * rate * 100) / 100;
  const payout = Math.round((grossSafe - commission) * 100) / 100;
  return {
    gross_ride_amount: grossSafe,
    onroda_commission_rate: rate,
    onroda_commission_amount: commission,
    partner_payout_amount: payout,
  };
}

router.get("/fare-config", async (_req, res, next) => {
  try {
    const profile = await getPublicFareProfile();
    res.json({ ok: true, profile });
  } catch (e) {
    next(e);
  }
});

router.get("/fare-estimate", async (req, res, next) => {
  try {
    const opPayloadEst = await getOperationalConfigPayload();
    const gateEst = assertPlatformNewRideAllowed(opPayloadEst);
    if (!gateEst.ok) {
      res.status(gateEst.status).json({ error: gateEst.error, message: gateEst.message });
      return;
    }
    const tEst = opPayloadEst.tariffs as { active?: boolean } | undefined;
    if (tEst?.active === false) {
      res.status(400).json({ error: "tariffs_inactive", message: "Tarife sind derzeit deaktiviert." });
      return;
    }
    const distanceKm = Number(req.query.distanceKm ?? 0);
    const waitingMinutes = Number(req.query.waitingMinutes ?? 0);
    const tripMinutes = Number(
      (req.query.tripMinutes as string) ?? (req.query.durationMinutes as string) ?? (req.query.routeMinutes as string) ?? 0,
    );
    const vehicle = String(req.query.vehicle ?? "standard").trim().toLowerCase();
    const fromFullQ = String(req.query.fromFull ?? req.query.from ?? "").trim();
    if (!Number.isFinite(distanceKm) || distanceKm < 0) {
      res.status(400).json({ error: "distance_km_invalid" });
      return;
    }
    const regions = await listServiceRegionsForApi();
    const fromLatQ = optCoord(
      (req.query as { fromLat?: unknown; from_lat?: unknown; pickupLat?: unknown }).fromLat ??
        (req.query as { from_lat?: unknown }).from_lat ??
        (req.query as { pickupLat?: unknown }).pickupLat,
    );
    const fromLngQ = optCoord(
      (req.query as { fromLng?: unknown; from_lon?: unknown; pickupLng?: unknown; pickupLon?: unknown }).fromLng ??
        (req.query as { from_lon?: unknown }).from_lon ??
        (req.query as { pickupLng?: unknown }).pickupLng ??
        (req.query as { pickupLon?: unknown }).pickupLon,
    );
    if (anyActiveRegionRequiresClientCoordinates(regions) && (fromLatQ == null || fromLngQ == null)) {
      res.status(400).json({
        error: "pickup_coordinates_required",
        message: "Für die Einfahrt-Regionen (Radius) werden Startkoordinaten benötigt: fromLat, fromLng (Query).",
      });
      return;
    }
    const atRaw = req.query.at;
    const at =
      typeof atRaw === "string" && atRaw.trim() ? new Date(atRaw.trim()) : new Date();
    const applyHolidaySurcharge = String(req.query.holiday ?? req.query.assumeHoliday ?? "") === "1";
    const applyAirportFlat = String(req.query.airport ?? req.query.airportStop ?? "") === "1";
    const { serviceRegionId, est } = computeTaxiPriceLikeFareEstimate(opPayloadEst, regions, {
      fromFull: fromFullQ || "",
      fromLat: fromLatQ,
      fromLon: fromLngQ,
      distanceKm,
      tripMinutes: Number.isFinite(tripMinutes) ? tripMinutes : 0,
      waitingMinutes: Math.max(0, waitingMinutes),
      vehicle,
      at,
      applyHolidaySurcharge,
      applyAirportFlat,
    });
    const profile = await getPublicFareProfile(fromFullQ || null, { lat: fromLatQ, lon: fromLngQ });
    const total = est.finalRounded;
    res.json({
      ok: true,
      engineSchemaVersion: TARIFF_ENGINE_SCHEMA_VERSION,
      serviceRegionId: serviceRegionId ?? profile.serviceRegionId ?? null,
      profile: { ...profile, serviceRegionId: serviceRegionId ?? profile.serviceRegionId ?? null },
      estimate: {
        distanceKm,
        waitingMinutes,
        tripMinutes: Number.isFinite(tripMinutes) ? tripMinutes : 0,
        vehicle,
        total,
        taxiTotal: total,
        onrodaTotal: total,
        breakdown: est.breakdown,
        engine: { subtotal: est.subtotal, afterMinFare: est.afterMinFare },
      },
    });
  } catch (e) {
    next(e);
  }
});

router.get("/rides", async (_req, res, next) => {
  try {
    const query = _req.query as { driverId?: string; companyId?: string };
    const driverId = typeof query.driverId === "string" ? query.driverId.trim() : "";
    const companyId = typeof query.companyId === "string" ? query.companyId.trim() : "";
    let rows = await listRides();
    if (driverId && companyId) {
      const capability = await getFleetDriverCapability(driverId, companyId);
      if (!capability) {
        rows = [];
      } else {
        rows = rows.filter((ride) => {
          if (ride.driverId && ride.driverId !== driverId) return false;
          if ((ride.rejectedBy ?? []).includes(driverId)) return false;
          if (!ACTIVE_RIDE_STATUSES.has(ride.status)) return false;
          return isRideCompatibleWithCapability(ride, capability);
        });
      }
    }
    const publicRows = rows.map((ride) => toCustomerRideView(stripPartnerOnlyRideFields(ride)));
    const withCodes = await attachAccessCodeSummariesToRides(publicRows);
    res.json(withCodes.map((r) => ({ ...r, cancelReason: customerCancelReasons.get(r.id) ?? null })));
  } catch (e) {
    next(e);
  }
});

router.get("/rides/:id/medical/qr-payload", requireCustomerSession, async (req, res, next) => {
  try {
    const rideId = String(req.params.id ?? "").trim();
    if (!rideId) {
      res.status(400).json({ ok: false, error: "ride_id_required" });
      return;
    }
    const sess = (req as CustomerSessionRequest).customerSession;
    if (!sess) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    const ride = await findRide(rideId);
    if (!ride) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }
    if (ride.rideKind !== "medical") {
      res.status(400).json({ ok: false, error: "not_medical_ride" });
      return;
    }
    const passenger = (ride.passengerId ?? "").trim();
    if (!passenger || passenger !== customerPassengerId(sess)) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }
    const meta = asMedicalFlatMeta(ride);
    if (!meta || typeof meta.medical_qr_token !== "string" || !meta.medical_qr_token.trim()) {
      res.status(503).json({ ok: false, error: "qr_token_missing" });
      return;
    }
    const qrValue = formatMedicalQrPayload(ride.id, meta.medical_qr_token.trim());
    res.json({
      ok: true,
      rideId: ride.id,
      qrValue,
      qrDone: meta.qr_done === true,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/rides/:id/medical/verify-qr", requireFleetDriverAuth, async (req, res, next) => {
  try {
    const rideId = String(req.params.id ?? "").trim();
    const body = req.body as { token?: unknown };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const auth = (req as FleetDriverAuthRequest).fleetDriverAuth;
    if (!rideId || !token || !auth) {
      res.status(400).json({ ok: false, error: "ride_or_token_required" });
      return;
    }
    const ride = await findRide(rideId);
    if (!ride) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }
    if (ride.rideKind !== "medical") {
      res.status(400).json({ ok: false, error: "not_medical_ride" });
      return;
    }
    const meta = asMedicalFlatMeta(ride);
    if (!meta) {
      res.status(400).json({ ok: false, error: "no_medical_meta" });
      return;
    }
    const companyId = (ride.companyId ?? "").trim();
    if (!companyId) {
      res.status(403).json({ ok: false, error: "ride_company_required" });
      return;
    }
    if (companyId !== auth.companyId) {
      res.status(403).json({ ok: false, error: "wrong_company" });
      return;
    }
    const assignedDriver = (ride.driverId ?? "").trim();
    if (!assignedDriver) {
      res.status(403).json({ ok: false, error: "driver_not_assigned" });
      return;
    }
    if (assignedDriver !== auth.fleetDriverId) {
      res.status(403).json({ ok: false, error: "not_assigned_driver" });
      return;
    }
    const expected = typeof meta.medical_qr_token === "string" ? meta.medical_qr_token.trim() : "";
    if (!expected || !timingSafeEqualUtf8(token, expected)) {
      res.status(400).json({ ok: false, error: "invalid_qr_token" });
      return;
    }
    if (meta.qr_done === true) {
      res.status(409).json({ ok: false, error: "qr_already_verified" });
      return;
    }
    const merged = mergeMedicalPartnerMeta(ride, {
      qr_done: true,
      qr_verified_at: new Date().toISOString(),
      qr_verified_by_driver_id: auth.fleetDriverId,
    });
    const nextRide = await updateRide(rideId, {
      partnerBookingMeta: merged as RideRequest["partnerBookingMeta"],
    });
    if (!nextRide) {
      res.status(500).json({ ok: false, error: "update_failed" });
      return;
    }
    void insertSupplementalRideEvent(rideId, {
      eventType: "medical_qr_verified",
      actorType: "driver",
      actorId: auth.fleetDriverId,
      payload: {},
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post("/rides/:id/medical/transport-document", requireFleetDriverAuth, async (req, res, next) => {
  try {
    const rideId = String(req.params.id ?? "").trim();
    const auth = (req as FleetDriverAuthRequest).fleetDriverAuth;
    const body = req.body as { imageBase64?: unknown };
    const b64 = typeof body.imageBase64 === "string" ? body.imageBase64.trim() : "";
    if (!rideId || !auth) {
      res.status(400).json({ ok: false, error: "bad_request" });
      return;
    }
    if (!b64) {
      res.status(400).json({ ok: false, error: "image_base64_required" });
      return;
    }
    const ride = await findRide(rideId);
    if (!ride) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }
    if (ride.rideKind !== "medical") {
      res.status(400).json({ ok: false, error: "not_medical_ride" });
      return;
    }
    const companyId = (ride.companyId ?? "").trim();
    if (!companyId) {
      res.status(403).json({ ok: false, error: "ride_company_required" });
      return;
    }
    if (companyId !== auth.companyId) {
      res.status(403).json({ ok: false, error: "wrong_company" });
      return;
    }
    const assignedDriver = (ride.driverId ?? "").trim();
    if (!assignedDriver) {
      res.status(403).json({ ok: false, error: "driver_not_assigned" });
      return;
    }
    if (assignedDriver !== auth.fleetDriverId) {
      res.status(403).json({ ok: false, error: "not_assigned_driver" });
      return;
    }
    const meta = asMedicalFlatMeta(ride);
    if (!meta) {
      res.status(400).json({ ok: false, error: "no_medical_meta" });
      return;
    }
    const decoded = decodeValidatedMedicalTransportImage(b64);
    if (!decoded.ok) {
      const code = decoded.error;
      const status = code === "payload_too_large" ? 413 : 400;
      res.status(status).json({ ok: false, error: code });
      return;
    }
    const companyKey = companyId.replace(/[^a-zA-Z0-9._-]/g, "_");
    const rel = path.join(companyKey, "rides", rideId, `${randomUUID()}.${decoded.ext}`).replace(/\\/g, "/");
    const dest = path.join(MEDICAL_RIDE_UPLOAD_ROOT, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, decoded.buffer);
    const uploadedAt = new Date().toISOString();
    const merged = mergeMedicalPartnerMeta(ride, {
      transport_document_status: "uploaded",
      transport_document_file_key: rel,
      transport_document_uploaded_at: uploadedAt,
    });
    const nextRide = await updateRide(rideId, {
      partnerBookingMeta: merged as RideRequest["partnerBookingMeta"],
    });
    if (!nextRide) {
      res.status(500).json({ ok: false, error: "update_failed" });
      return;
    }
    void insertSupplementalRideEvent(rideId, {
      eventType: "medical_transport_document_uploaded",
      actorType: "driver",
      actorId: auth.fleetDriverId,
      payload: { fileKey: rel },
    });
    res.json({ ok: true, fileKey: rel });
  } catch (e) {
    next(e);
  }
});

router.post("/rides/:id/medical/signature", requireFleetDriverAuth, async (req, res, next) => {
  try {
    const rideId = String(req.params.id ?? "").trim();
    const auth = (req as FleetDriverAuthRequest).fleetDriverAuth;
    const body = req.body as { imageBase64?: unknown };
    const b64 = typeof body.imageBase64 === "string" ? body.imageBase64.trim() : "";
    if (!rideId || !auth) {
      res.status(400).json({ ok: false, error: "bad_request" });
      return;
    }
    if (!b64) {
      res.status(400).json({ ok: false, error: "image_base64_required" });
      return;
    }
    const ride = await findRide(rideId);
    if (!ride) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }
    if (ride.rideKind !== "medical") {
      res.status(400).json({ ok: false, error: "not_medical_ride" });
      return;
    }
    const companyId = (ride.companyId ?? "").trim();
    if (!companyId) {
      res.status(403).json({ ok: false, error: "ride_company_required" });
      return;
    }
    if (companyId !== auth.companyId) {
      res.status(403).json({ ok: false, error: "wrong_company" });
      return;
    }
    const assignedDriver = (ride.driverId ?? "").trim();
    if (!assignedDriver) {
      res.status(403).json({ ok: false, error: "driver_not_assigned" });
      return;
    }
    if (assignedDriver !== auth.fleetDriverId) {
      res.status(403).json({ ok: false, error: "not_assigned_driver" });
      return;
    }
    const meta = asMedicalFlatMeta(ride);
    if (!meta) {
      res.status(400).json({ ok: false, error: "no_medical_meta" });
      return;
    }
    if (meta.signature_done === true) {
      res.status(409).json({ ok: false, error: "signature_already_saved" });
      return;
    }
    const decoded = decodeValidatedMedicalTransportImage(b64);
    if (!decoded.ok) {
      const code = decoded.error;
      const status = code === "payload_too_large" ? 413 : 400;
      res.status(status).json({ ok: false, error: code });
      return;
    }
    const companyKey = companyId.replace(/[^a-zA-Z0-9._-]/g, "_");
    const rel = path.join(companyKey, "rides", rideId, `signature-${randomUUID()}.${decoded.ext}`).replace(/\\/g, "/");
    const dest = path.join(MEDICAL_RIDE_UPLOAD_ROOT, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, decoded.buffer);
    const signedAt = new Date().toISOString();
    const merged = mergeMedicalPartnerMeta(ride, {
      signature_done: true,
      signature_file_key: rel,
      signature_signed_at: signedAt,
      signature_signed_by_driver_id: auth.fleetDriverId,
    });
    const nextRide = await updateRide(rideId, {
      partnerBookingMeta: merged as RideRequest["partnerBookingMeta"],
    });
    if (!nextRide) {
      res.status(500).json({ ok: false, error: "update_failed" });
      return;
    }
    void insertSupplementalRideEvent(rideId, {
      eventType: "medical_signature_captured",
      actorType: "driver",
      actorId: auth.fleetDriverId,
      payload: { fileKey: rel },
    });
    res.json({ ok: true, fileKey: rel, signedAt });
  } catch (e) {
    next(e);
  }
});

router.post("/rides/:rideId/support", async (req, res) => {
  const rideId = String(req.params.rideId ?? "").trim();
  if (!rideId) {
    res.status(400).json({ ok: false, error: "ride_id_required" });
    return;
  }
  const category = typeof req.body?.category === "string" ? req.body.category.trim() : "other";
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const source = typeof req.body?.source === "string" ? req.body.source.trim() : "unknown";
  if (message.length < 5) {
    res.status(400).json({ ok: false, error: "message_too_short" });
    return;
  }

  const ticketId = `cs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const entry = {
    ticketId,
    rideId,
    category: category || "other",
    message: message.slice(0, 4000),
    source: source || "unknown",
    createdAt: new Date().toISOString(),
  };
  const prev = customerSupportTickets.get(rideId) ?? [];
  prev.unshift(entry);
  customerSupportTickets.set(rideId, prev.slice(0, 50));
  console.log(`[customer-support] rideId=${rideId} ticketId=${ticketId} category=${entry.category} source=${entry.source}`);
  res.json({ ok: true, ticketId });
});

function formatEuroHtml(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return safe.toFixed(2).replace(".", ",") + " €";
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildReceiptHtmlFromRide(r: RideRequest): string {
  const date = new Date(r.createdAt);
  const dateStr = date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr = date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const amount = effectiveTaxiGrossEur(r);
  const rideNr = String(r.id).slice(0, 8).toUpperCase();
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Quittung #${escapeHtml(rideNr)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f5f5; color: #111; padding: 32px 16px; }
    .receipt { max-width: 520px; margin: 0 auto; background: #fff; border-radius: 16px; box-shadow: 0 2px 20px rgba(0,0,0,0.10); overflow: hidden; }
    .header { background: #DC2626; color: #fff; padding: 26px 26px 18px; text-align: center; }
    .logo { font-size: 24px; font-weight: 900; letter-spacing: 1.2px; margin-bottom: 4px; }
    .receipt-title { font-size: 12px; font-weight: 600; opacity: 0.9; letter-spacing: 1px; text-transform: uppercase; }
    .receipt-id { font-size: 12px; opacity: 0.75; margin-top: 6px; }
    .body { padding: 22px 26px; }
    .row { display:flex; justify-content:space-between; gap:12px; margin-bottom: 10px; }
    .k { color:#6b7280; font-size: 12px; font-weight: 600; }
    .v { color:#111827; font-size: 12px; font-weight: 600; text-align:right; }
    .route { margin-top: 14px; background:#f9fafb; border:1px solid #eef2f7; border-radius: 12px; padding: 14px; }
    .route h3 { font-size: 12px; color:#6b7280; letter-spacing:0.08em; text-transform:uppercase; margin-bottom: 10px; }
    .route .pt { font-size: 13px; font-weight: 600; margin-bottom: 8px; color:#111827; }
    .muted { color:#6b7280; font-size: 12px; font-weight: 500; }
    .total { margin-top: 14px; background:#DC2626; color:#fff; border-radius: 12px; padding: 14px 16px; display:flex; justify-content:space-between; align-items:center; }
    .total .lbl { font-size: 13px; font-weight: 700; opacity:0.9; }
    .total .amt { font-size: 22px; font-weight: 900; }
    .footer { text-align:center; padding: 16px 26px; background:#fafafa; border-top:1px solid #f0f0f0; font-size: 11px; color:#9ca3af; line-height: 1.6; }
    @media print { body { background:#fff; padding:0; } .receipt { box-shadow:none; border-radius:0; } }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="logo">ONRODA</div>
      <div class="receipt-title">Fahrtquittung</div>
      <div class="receipt-id">Nr. ${escapeHtml(rideNr)}</div>
    </div>
    <div class="body">
      <div class="row"><div><div class="k">Datum</div><div class="v">${escapeHtml(dateStr)}</div></div><div><div class="k">Uhrzeit</div><div class="v">${escapeHtml(timeStr)} Uhr</div></div></div>
      <div class="route">
        <h3>Route</h3>
        <div class="muted">Abfahrt</div>
        <div class="pt">${escapeHtml(r.from ?? "—")}</div>
        <div class="muted">Ziel</div>
        <div class="pt">${escapeHtml(r.to ?? "—")}</div>
      </div>
      <div style="margin-top: 14px;">
        <div class="row"><div class="k">Strecke</div><div class="v">${escapeHtml(String(r.distanceKm ?? 0))} km</div></div>
        <div class="row"><div class="k">Dauer</div><div class="v">${escapeHtml(String(r.durationMinutes ?? 0))} Min</div></div>
        <div class="row"><div class="k">Zahlungsart</div><div class="v">${escapeHtml(r.paymentMethod ?? "—")}</div></div>
        <div class="row"><div class="k">Produkt</div><div class="v">${escapeHtml(r.vehicle ?? "—")}</div></div>
      </div>
      <div class="total"><div class="lbl">Gesamtbetrag</div><div class="amt">${formatEuroHtml(amount)}</div></div>
    </div>
    <div class="footer">
      ONRODA · Deutschland<br/>
      Vielen Dank für Ihre Fahrt!<br/>
      Diese Quittung dient als Beleg.
    </div>
  </div>
  <script>
    window.addEventListener('load', function() { setTimeout(function() { try { window.print(); } catch(e) {} }, 250); });
  <\/script>
</body>
</html>`;
}

router.get("/rides/:rideId/receipt", async (req, res, next) => {
  try {
    const rideId = String(req.params.rideId ?? "").trim();
    if (!rideId) {
      res.status(400).json({ error: "ride_id_required" });
      return;
    }
    const ride = await findRide(rideId);
    if (!ride) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(buildReceiptHtmlFromRide(ride));
  } catch (e) {
    next(e);
  }
});

router.post("/rides/access-code/verify", async (req, res, next) => {
  try {
    const body = req.body as { accessCode?: unknown; driverId?: unknown };
    const accessCode = typeof body.accessCode === "string" ? body.accessCode.trim() : "";
    const driverId = typeof body.driverId === "string" ? body.driverId.trim() : "";
    if (!accessCode || !driverId) {
      res.status(400).json({ error: "access_code_or_driver_missing" });
      return;
    }
    const probe = await verifyAccessCode(accessCode, null);
    if (!probe.ok) {
      res.status(400).json({ error: probe.error });
      return;
    }
    cleanupCodeVerifySessions();
    const verifyToken = `acv-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    codeVerifySessions.set(verifyToken, {
      driverId,
      normalized: probe.normalized,
      expiresAt: Date.now() + CODE_VERIFY_TTL_MS,
    });
    res.json({
      ok: true,
      verifyToken,
      expiresInSeconds: Math.floor(CODE_VERIFY_TTL_MS / 1000),
      summary: { codeType: probe.codeType, label: probe.label },
    });
  } catch (e) {
    next(e);
  }
});

router.post("/rides", async (req, res, next) => {
  try {
    const raw = req.body as Partial<RideRequest> & { accessCodeVerifyToken?: unknown };
    if (!raw.customerName || String(raw.customerName).trim() === "" || !raw.passengerId) {
      res.status(401).json({ error: "Unauthorized: Bitte anmelden, um eine Fahrt zu buchen." });
      return;
    }
    if (
      raw.rideKind != null &&
      raw.rideKind !== "" &&
      (typeof raw.rideKind !== "string" || parseRideKind(raw.rideKind) === null)
    ) {
      res.status(400).json({ error: "ride_kind_invalid" });
      return;
    }
    if (
      raw.payerKind != null &&
      raw.payerKind !== "" &&
      (typeof raw.payerKind !== "string" || parsePayerKind(raw.payerKind) === null)
    ) {
      res.status(400).json({ error: "payer_kind_invalid" });
      return;
    }
    if (
      raw.authorizationSource != null &&
      raw.authorizationSource !== "" &&
      (typeof raw.authorizationSource !== "string" ||
        parseAuthorizationSource(raw.authorizationSource) === null)
    ) {
      res.status(400).json({ error: "authorization_source_invalid" });
      return;
    }
    if (
      raw.pricingMode != null &&
      raw.pricingMode !== "" &&
      raw.pricingMode !== "taxi_tariff"
    ) {
      res.status(400).json({ error: "pricing_mode_invalid" });
      return;
    }
    const fromFull = String((raw as { fromFull?: string }).fromFull ?? (raw as { from?: string }).from ?? "").trim();
    const toFull = String((raw as { toFull?: string }).toFull ?? (raw as { to?: string }).to ?? "").trim();
    if (!fromFull || !toFull) {
      res.status(400).json({ error: "from_to_required" });
      return;
    }
    if (!hasHouseNumberInFirstAddressPart(fromFull) || !hasHouseNumberInFirstAddressPart(toFull)) {
      res.status(400).json({
        error: "address_house_number_required",
        message: ADDRESS_HOUSE_NUMBER_REQUIRED_MESSAGE,
      });
      return;
    }
    const fromLatB = optCoord(
      (raw as { fromLat?: unknown; from_lat?: unknown }).fromLat ?? (raw as { from_lat?: unknown }).from_lat,
    );
    const fromLonB = optCoord(
      (raw as { fromLon?: unknown; from_lon?: unknown }).fromLon ?? (raw as { from_lon?: unknown }).from_lon,
    );
    const toLatB = optCoord(
      (raw as { toLat?: unknown; to_lat?: unknown }).toLat ?? (raw as { to_lat?: unknown }).to_lat,
    );
    const toLonB = optCoord(
      (raw as { toLon?: unknown; to_lon?: unknown }).toLon ?? (raw as { to_lon?: unknown }).to_lon,
    );
    const opPayload = await getOperationalConfigPayload();
    const sysGate = assertPlatformNewRideAllowed(opPayload);
    if (!sysGate.ok) {
      res.status(sysGate.status).json({ error: sysGate.error, message: sysGate.message });
      return;
    }
    const regions = await listServiceRegionsForApi();
    if (
      anyActiveRegionRequiresClientCoordinates(regions) &&
      (fromLatB == null || fromLonB == null || toLatB == null || toLonB == null)
    ) {
      res.status(400).json({
        error: "ride_coordinates_required",
        message: "Für Einfahrt-Regionen (Radius) sind fromLat, fromLon, toLat und toLon erforderlich.",
      });
      return;
    }
    const regGate = assertCustomerFromFullInActiveServiceRegion(fromFull, opPayload, regions, { lat: fromLatB, lon: fromLonB });
    if (!regGate.ok) {
      res.status(400).json({ error: regGate.error, message: regGate.message });
      return;
    }
    const area = await checkCustomerRideServiceArea(fromFull, toFull, { fromLat: fromLatB, fromLon: fromLonB, toLat: toLatB, toLon: toLonB });
    if (!area.ok) {
      res.status(400).json({
        error: "service_area_not_covered",
        message: getOutOfServiceAreaMessage(opPayload),
      });
      return;
    }
    const tBook = opPayload.tariffs as { active?: boolean } | undefined;
    if (tBook?.active === false) {
      res.status(400).json({ error: "tariffs_inactive", message: "Tarife sind derzeit deaktiviert." });
      return;
    }
    const distanceKmB = Number((raw as { distanceKm?: unknown }).distanceKm ?? (raw as { distance_km?: unknown }).distance_km);
    if (!Number.isFinite(distanceKmB) || distanceKmB < 0) {
      res.status(400).json({ error: "distance_km_invalid" });
      return;
    }
    const tripMRaw = Number(
      (raw as { tripMinutes?: unknown }).tripMinutes ??
        (raw as { trip_minutes?: unknown }).trip_minutes ??
        (raw as { durationMinutes?: unknown }).durationMinutes ??
        (raw as { duration_minutes?: unknown }).duration_minutes ??
        0,
    );
    const tripMinutesB = Number.isFinite(tripMRaw) ? Math.max(0, tripMRaw) : 0;
    const waitMRaw = Number(
      (raw as { waitingMinutes?: unknown }).waitingMinutes ?? (raw as { waiting_minutes?: unknown }).waiting_minutes ?? 0,
    );
    const waitingMinutesB = Number.isFinite(waitMRaw) ? Math.max(0, waitMRaw) : 0;
    const vehicleB = String((raw as { vehicle?: unknown }).vehicle ?? "standard").trim().toLowerCase() || "standard";
    const accessibilityRaw = (raw as { accessibilityOptions?: unknown; accessibility_options?: unknown })
      .accessibilityOptions ?? (raw as { accessibility_options?: unknown }).accessibility_options;
    let accessibilityOptions: RideAccessibilityOptions | null = null;
    if (accessibilityRaw != null) {
      accessibilityOptions = parseAccessibilityOptionsFromBody(accessibilityRaw);
      if (!accessibilityOptions) {
        res.status(400).json({ error: "accessibility_options_invalid" });
        return;
      }
    }
    if (vehicleB.includes("rollstuhl") || vehicleB.includes("wheelchair")) {
      if (!accessibilityOptions) {
        res.status(400).json({ error: "accessibility_options_required_for_wheelchair" });
        return;
      }
    }
    const atBooking = new Date();
    const { serviceRegionId, est: estBook } = computeTaxiPriceLikeFareEstimate(opPayload, regions, {
      fromFull,
      fromLat: fromLatB,
      fromLon: fromLonB,
      distanceKm: distanceKmB,
      tripMinutes: tripMinutesB,
      waitingMinutes: waitingMinutesB,
      vehicle: vehicleB,
      at: atBooking,
    });
    const finalPriceB = estBook.finalRounded;
    const durationInt = Math.max(0, Math.round(tripMinutesB));
    const bodyForAssert: Record<string, unknown> = {
      ...(raw as object as Record<string, unknown>),
      estimatedFare: finalPriceB,
      estimated_fare: finalPriceB,
      distanceKm: distanceKmB,
      distance_km: distanceKmB,
      durationMinutes: durationInt,
      duration_minutes: durationInt,
    };
    const opCheck = assertCustomerRideOperational(bodyForAssert, opPayload);
    if (!opCheck.ok) {
      res.status(400).json({ error: opCheck.error, message: opCheck.message });
      return;
    }
    const rideKind = parseRideKind(raw.rideKind) ?? DEFAULT_RIDE_KIND;
    const payerKind = parsePayerKind(raw.payerKind) ?? DEFAULT_PAYER_KIND;
    const authorizationSource =
      parseAuthorizationSource(raw.authorizationSource) ?? DEFAULT_AUTHORIZATION_SOURCE;
    const scheduledAtNormalized = pickScheduledAtFromBody(raw as Partial<RideRequest> & Record<string, unknown>);
    const customerPhoneClean = String(
      (raw as { customerPhone?: unknown }).customerPhone ??
        (raw as { passengerPhone?: unknown }).passengerPhone ??
        (raw as { phone?: unknown }).phone ??
        "",
    ).trim();
    const partnerMetaRaw =
      (raw as { partnerBookingMeta?: unknown; partner_booking_meta?: unknown; medicalMeta?: unknown })
        .partnerBookingMeta ??
      (raw as { partner_booking_meta?: unknown }).partner_booking_meta ??
      (raw as { medicalMeta?: unknown }).medicalMeta;
    const medicalMeta = pickMedicalMeta(partnerMetaRaw);
    const normalizedPartnerMeta: Record<string, unknown> =
      rideKind === "medical"
        ? {
            ...medicalMeta,
            medical_ride: true,
            medical_qr_token: createMedicalQrToken(),
            approval_status:
              typeof medicalMeta.approval_status === "string" ? medicalMeta.approval_status : "pending",
            payer_kind:
              payerKind === "insurance" || payerKind === "passenger" || payerKind === "company"
                ? payerKind
                : "insurance",
            signature_required:
              typeof medicalMeta.signature_required === "boolean" ? medicalMeta.signature_required : true,
            signature_done: false,
            signature_file_key: "",
            signature_signed_at: "",
            qr_required: typeof medicalMeta.qr_required === "boolean" ? medicalMeta.qr_required : true,
            qr_done: false,
            transport_document_required:
              typeof medicalMeta.transport_document_required === "boolean"
                ? medicalMeta.transport_document_required
                : true,
            transport_document_status:
              typeof medicalMeta.transport_document_status === "string"
                ? medicalMeta.transport_document_status
                : "missing",
            approval_proof_mode:
              typeof medicalMeta.approval_proof_mode === "string"
                ? medicalMeta.approval_proof_mode
                : "none",
            transport_document_file_key: "",
            transport_document_uploaded_at: "",
            copayment_required:
              typeof medicalMeta.copayment_required === "string"
                ? medicalMeta.copayment_required
                : "unknown",
            copayment_amount_estimated:
              typeof medicalMeta.copayment_amount_estimated === "number"
                ? medicalMeta.copayment_amount_estimated
                : 0,
            copayment_collected_status:
              typeof medicalMeta.copayment_collected_status === "string"
                ? medicalMeta.copayment_collected_status
                : "open",
            copayment_collection_method:
              typeof medicalMeta.copayment_collection_method === "string"
                ? medicalMeta.copayment_collection_method
                : "unknown",
            ...medicalFinanceSnapshot(finalPriceB),
          }
        : {};
    if (rideKind === "medical") {
      const ready = calculateMedicalBillingReadiness(normalizedPartnerMeta);
      normalizedPartnerMeta.billing_ready = ready.billingReady;
      normalizedPartnerMeta.billing_missing_reasons = ready.missingReasons;
    }
    const snapB: TariffBookingSnapshotV1 = {
      engineSchemaVersion: TARIFF_ENGINE_SCHEMA_VERSION,
      serviceRegionId,
      finalPriceEur: finalPriceB,
      subtotal: estBook.subtotal,
      afterMinFare: estBook.afterMinFare,
      breakdown: { ...estBook.breakdown },
      distanceKm: distanceKmB,
      tripMinutes: tripMinutesB,
      waitingMinutes: waitingMinutesB,
      vehicle: vehicleB,
      at: atBooking.toISOString(),
    };
    const newReq: RideRequest = {
      ...(raw as RideRequest),
      id: `REQ-${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: initialCustomerRideStatus(scheduledAtNormalized),
      scheduledAt: scheduledAtNormalized,
      rejectedBy: [],
      driverId: null,
      customerPhone: customerPhoneClean || null,
      partnerBookingMeta: normalizedPartnerMeta,
      rideKind,
      payerKind,
      voucherCode: parseOptionalBillingTag(raw.voucherCode, 64),
      billingReference: parseOptionalBillingTag(raw.billingReference, 256),
      authorizationSource,
      accessCodeId: null,
      pricingMode: "taxi_tariff",
      distanceKm: distanceKmB,
      durationMinutes: durationInt,
      estimatedFare: finalPriceB,
      vehicle: vehicleB,
      accessibilityOptions,
      tariffSnapshot: snapB,
    };
    const accessCodeRaw = (raw as { accessCode?: unknown }).accessCode;
    const accessCodePlain = typeof accessCodeRaw === "string" ? accessCodeRaw : undefined;
    const accessCodeVerifyToken =
      typeof raw.accessCodeVerifyToken === "string" ? raw.accessCodeVerifyToken.trim() : "";
    const driverIdForCodeRide =
      typeof raw.driverId === "string" ? raw.driverId.trim() : "";
    const normalizedCode = accessCodePlain ? normalizeAccessCodeInput(accessCodePlain) : null;
    if (normalizedCode && driverIdForCodeRide) {
      cleanupCodeVerifySessions();
      const session = accessCodeVerifyToken
        ? codeVerifySessions.get(accessCodeVerifyToken)
        : null;
      const isSessionValid =
        !!session &&
        session.expiresAt > Date.now() &&
        session.driverId === driverIdForCodeRide &&
        session.normalized === normalizedCode;
      if (!isSessionValid) {
        res.status(409).json({ error: "access_code_verify_required" });
        return;
      }
      codeVerifySessions.delete(accessCodeVerifyToken);
    }
    const ins = await insertRideWithOptionalAccessCode(newReq, accessCodePlain);
    if (!ins.ok) {
      res.status(400).json({ error: ins.error });
      return;
    }
    const created = await findRide(newReq.id);
    if (!created) {
      res.status(500).json({ error: "ride_insert_inconsistent" });
      return;
    }
    const pcCreated = resolveFinancePricingContextFromOperational(created, opPayload, regions);
    void upsertRideFinancialSnapshot({
      ride: created,
      pricingContext: pcCreated,
      reason: "ride_created",
    });
    const [withSummary] = await attachAccessCodeSummariesToRides([stripPartnerOnlyRideFields(created)]);
    res.status(201).json(withSummary);
  } catch (e) {
    next(e);
  }
});

router.patch("/rides/:id/status", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, driverId, cancelReason } = req.body as {
      status: unknown;
      driverId?: string;
      cancelReason?: string;
    };
    const parsedFinalFare = parseOptionalFinalFareFromBody(req.body);
    const nextStatus = normalizeStatusInput(status);
    if (!nextStatus) {
      res.status(400).json({ error: "status_invalid" });
      return;
    }
    const cur = await findRide(id);
    if (!cur) {
      res.status(404).json({ error: "not found" });
      return;
    }
    if (!canTransitionStatus(cur.status, nextStatus)) {
      res.status(409).json({ error: "status_transition_invalid", from: cur.status, to: nextStatus });
      return;
    }
    const cancelReasonClean = typeof cancelReason === "string" ? cancelReason.trim() : "";
    if (nextStatus === "cancelled_by_customer" && !cancelReasonClean) {
      res.status(400).json({ error: "cancel_reason_required" });
      return;
    }
    let companyIdOnAccept: string | undefined;
    if (nextStatus === "accepted" && driverId) {
      const driverAuth = await findFleetDriverAuthRow(driverId);
      const capabilityCompanyId = cur.companyId ?? driverAuth?.company_id ?? null;
      if (!capabilityCompanyId) {
        res.status(409).json({
          error: "ride_not_assignable",
          message: "Fahrt/Fahrer konnten keinem Unternehmen zugeordnet werden.",
        });
        return;
      }
      if (cur.companyId && driverAuth?.company_id && cur.companyId !== driverAuth.company_id) {
        res.status(409).json({
          error: "ride_company_mismatch",
          message: "Diese Fahrt gehört zu einem anderen Unternehmen.",
        });
        return;
      }
      const readinessR = await getFleetDriverReadinessById(driverId, capabilityCompanyId);
      if (!("error" in readinessR) && !readinessR.ready) {
        res.status(409).json({
          error: "driver_not_einsatzbereit",
          blockReasons: readinessR.blockReasons,
          message: "Fahrer ist derzeit nicht einsatzbereit (Freigabe, P-Schein, Fahrzeug oder Unternehmen).",
        });
        return;
      }
      const capability = await getFleetDriverCapability(driverId, capabilityCompanyId);
      if (!capability || !isRideCompatibleWithCapability(cur, capability)) {
        res.status(409).json({
          error: "no_matching_vehicle_available",
          message: "Aktuell kein passendes Fahrzeug verfügbar",
        });
        return;
      }
      companyIdOnAccept = capabilityCompanyId;
    }

    let finalFareForPatch: number | undefined = parsedFinalFare;
    let customerCancelFeeAudit: { feeEur: number; reason: string } | null = null;
    if (nextStatus === "cancelled_by_customer") {
      const opPayloadCancel = await getOperationalConfigPayload();
      const ev = await evaluateCustomerCancellationFeeEur(
        {
          status: cur.status,
          scheduledAt: cur.scheduledAt ?? null,
          createdAt: cur.createdAt,
          fromFull: cur.fromFull,
        },
        opPayloadCancel,
      );
      customerCancelFeeAudit = ev;
      if (ev.feeEur > 0) {
        const chosen = parsedFinalFare !== undefined ? parsedFinalFare : ev.feeEur;
        if (chosen < ev.feeEur - 1e-9) {
          res.status(400).json({
            error: "cancel_fee_too_low",
            message: `Für dieses Storno ist mindestens ${ev.feeEur.toFixed(2)} EUR als Endpreis vorgesehen.`,
            minFinalFareEur: ev.feeEur,
          });
          return;
        }
        const cap = Math.max(cur.estimatedFare ?? 0, ev.feeEur);
        finalFareForPatch = Math.min(Math.max(chosen, ev.feeEur), cap);
      }
    } else if (nextStatus === "completed") {
      if (cur.tariffSnapshot) {
        const v = Number(cur.tariffSnapshot.finalPriceEur);
        if (!Number.isFinite(v) || v < 0) {
          res.status(400).json({ error: "tariff_snapshot_invalid" });
          return;
        }
      }
      const mergedFinal =
        parsedFinalFare !== undefined && Number.isFinite(parsedFinalFare)
          ? parsedFinalFare
          : cur.finalFare != null && Number.isFinite(Number(cur.finalFare))
            ? Number(cur.finalFare)
            : undefined;
      finalFareForPatch = effectiveTaxiGrossEur({
        ...cur,
        finalFare: mergedFinal,
      } as RideRequest);
    }

    const updated = await updateRide(id, {
      status: nextStatus,
      ...(finalFareForPatch !== undefined ? { finalFare: finalFareForPatch } : {}),
      ...(driverId != null ? { driverId } : {}),
      ...(companyIdOnAccept != null ? { companyId: companyIdOnAccept } : {}),
    });
    if (!updated) {
      res.status(500).json({ error: "update_failed" });
      return;
    }
    if (cancelReasonClean) {
      const isCancel = [
        "cancelled",
        "cancelled_by_customer",
        "cancelled_by_driver",
        "cancelled_by_system",
        "rejected",
        "expired",
      ].includes(nextStatus);
      if (isCancel) {
        const crActor =
          nextStatus === "cancelled_by_customer"
            ? { actorType: "passenger" as const, actorId: null as string | null }
            : nextStatus === "cancelled_by_driver"
              ? { actorType: "driver" as const, actorId: driverId ?? null }
              : { actorType: "system" as const, actorId: null as string | null };
        await insertSupplementalRideEvent(id, {
          eventType: "cancel_reason",
          fromStatus: cur.status,
          toStatus: nextStatus,
          actorType: crActor.actorType,
          actorId: crActor.actorId,
          payload: {
            reason: cancelReasonClean,
            nextStatus,
            ...(nextStatus === "cancelled_by_customer" && customerCancelFeeAudit
              ? {
                  cancellationFeeEur: customerCancelFeeAudit.feeEur,
                  cancellationFeeRule: customerCancelFeeAudit.reason,
                  appliedFinalFareEur: finalFareForPatch ?? null,
                }
              : {}),
          },
        });
      }
    }
    if (nextStatus === "cancelled_by_customer") {
      customerCancelReasons.set(id, cancelReasonClean);
    }
    if (nextStatus === "completed") {
      const opPayloadComplete = await getOperationalConfigPayload();
      const regionsComplete = await listServiceRegionsForApi();
      const pcComplete = resolveFinancePricingContextFromOperational(updated, opPayloadComplete, regionsComplete);
      const finance = await upsertRideFinancialSnapshot({
        ride: updated,
        pricingContext: pcComplete,
        reason: "ride_completed_status_transition",
      });
      if (!finance.ok) {
        res.status(500).json({ error: finance.error });
        return;
      }
    }
    if (nextStatus === "completed" || nextStatus === "cancelled_by_driver" || nextStatus === "cancelled" || nextStatus === "cancelled_by_system") {
      customerCancelReasons.delete(id);
    }
    res.json({ ...stripPartnerOnlyRideFields(updated), cancelReason: customerCancelReasons.get(id) ?? null });
  } catch (e) {
    next(e);
  }
});

/** Admin: Fahrt wieder auf Markt / zur Disposition (Fahrer entfernen, Status pending). */
router.patch("/rides/:id/release", async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await adminReleaseRide(id);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(stripPartnerOnlyRideFields(updated));
  } catch (e) {
    next(e);
  }
});

router.post("/rides/:id/driver-location", (req, res) => {
  const { id } = req.params;
  const { lat, lon } = req.body as { lat: number; lon: number };
  if (typeof lat !== "number" || typeof lon !== "number") {
    res.status(400).json({ error: "lat and lon required" });
    return;
  }
  const loc: DriverLocation = { lat, lon, updatedAt: new Date().toISOString() };
  driverLocations.set(id, loc);
  res.json(loc);
});

router.get("/rides/:id/driver-location", (req, res) => {
  const { id } = req.params;
  const loc = driverLocations.get(id);
  if (!loc) {
    res.status(404).json({ error: "no location yet" });
    return;
  }
  res.json(loc);
});

router.post("/rides/:id/customer-location", (req, res) => {
  const { id } = req.params;
  const { lat, lon } = req.body as { lat: number; lon: number };
  if (typeof lat !== "number" || typeof lon !== "number") {
    res.status(400).json({ error: "lat and lon required" });
    return;
  }
  const loc: DriverLocation = { lat, lon, updatedAt: new Date().toISOString() };
  customerLocations.set(id, loc);
  res.json(loc);
});

router.get("/rides/:id/customer-location", (req, res) => {
  const { id } = req.params;
  const loc = customerLocations.get(id);
  if (!loc) {
    res.status(404).json({ error: "no location yet" });
    return;
  }
  res.json(loc);
});

router.post("/rides/:id/reject", async (req, res, next) => {
  try {
    const { id } = req.params;
    const driverIdRaw = (req.body as { driverId?: unknown }).driverId;
    const driverId = typeof driverIdRaw === "string" ? driverIdRaw.trim() : "";
    if (!driverId) {
      res.status(400).json({ error: "driver_id_required" });
      return;
    }
    const cur = await findRide(id);
    if (!cur) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const existing = cur.rejectedBy ?? [];
    const rejectIsNew = !existing.includes(driverId);
    const rejectedBy = existing.includes(driverId) ? existing : [...existing, driverId];
    const updated = await updateRide(id, { rejectedBy });
    if (!updated) {
      res.status(500).json({ error: "update_failed" });
      return;
    }
    if (rejectIsNew) {
      await insertSupplementalRideEvent(id, {
        eventType: "driver_rejected",
        fromStatus: cur.status,
        toStatus: cur.status,
        actorType: "driver",
        actorId: driverId,
        payload: { driverId },
      });
    }
    res.json(stripPartnerOnlyRideFields(updated));
  } catch (e) {
    next(e);
  }
});

router.post("/rides/:id/driver-cancel", async (req, res, next) => {
  try {
    const { id } = req.params;
    const driverIdRaw = (req.body as { driverId?: unknown }).driverId;
    const driverId = typeof driverIdRaw === "string" ? driverIdRaw.trim() : "";
    const cur = await findRide(id);
    if (!cur) {
      res.status(404).json({ error: "not found" });
      return;
    }
    // Bereits final durch Kunde/System beendet -> nicht erneut in Suchpool schieben.
    if (
      cur.status === "cancelled_by_customer" ||
      cur.status === "cancelled_by_system" ||
      cur.status === "cancelled_by_driver" ||
      cur.status === "cancelled" ||
      cur.status === "completed"
    ) {
      res.json(stripPartnerOnlyRideFields(cur));
      return;
    }
    const existing = cur.rejectedBy ?? [];
    const rejectedBy = driverId
      ? (existing.includes(driverId) ? existing : [...existing, driverId])
      : existing;
    const revertStatus: RideRequest["status"] =
      cur.scheduledAt && isFarFutureReservation(cur.scheduledAt) ? "scheduled" : "searching_driver";
    const updated = await updateRide(id, {
      status: revertStatus,
      driverId: null,
      rejectedBy,
    });
    if (!updated) {
      res.status(500).json({ error: "update_failed" });
      return;
    }
    res.json(stripPartnerOnlyRideFields(updated));
  } catch (e) {
    next(e);
  }
});

router.post("/rides/:id/driver-hard-cancel", async (req, res, next) => {
  try {
    const { id } = req.params;
    const driverIdRaw = (req.body as { driverId?: unknown }).driverId;
    const driverId = typeof driverIdRaw === "string" ? driverIdRaw.trim() : "";
    const cur = await findRide(id);
    if (!cur) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const updated = await updateRide(id, {
      status: "cancelled_by_driver",
      driverId: null,
      rejectedBy: driverId ? [...new Set([...(cur.rejectedBy ?? []), driverId])] : (cur.rejectedBy ?? []),
    });
    if (!updated) {
      res.status(500).json({ error: "update_failed" });
      return;
    }
    res.json(stripPartnerOnlyRideFields(updated));
  } catch (e) {
    next(e);
  }
});

router.delete("/rides/demo", async (_req, res, next) => {
  try {
    await resetRidesDemo([...DEMO]);
    driverLocations.clear();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
