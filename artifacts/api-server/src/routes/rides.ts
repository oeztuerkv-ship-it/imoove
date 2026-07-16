import { randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Router, type Request } from "express";
import type { RideRequest } from "../domain/rideRequest";
import type { RideAccessibilityOptions } from "../domain/rideRequest";
import {
  DEFAULT_PAYER_KIND,
  DEFAULT_RIDE_KIND,
  parseOptionalBillingTag,
  parsePayerKind,
  parseRideKind,
} from "../domain/rideBillingProfile";
import { attachAccessCodeSummariesToRides } from "../db/accessCodesData";
import { isPostgresConfigured } from "../db/client";
import { tryMarkCustomerReservationAssignedPushSent } from "../db/ridePushNotificationMarkers";
import {
  applyRideMutationPersistence,
  findRide,
  findRideForPassenger,
  insertRideWithOptionalAccessCode,
  insertSupplementalRideEvent,
  resetRidesDemo,
  tryFleetAcceptRideAtomic,
  updateRide,
  type RideMutationPersistenceActor,
} from "../db/ridesData";
import {
  buildRideSupportContextSnapshot,
  insertRideSupportTicket,
  listRideSupportTicketsForPassengerRide,
} from "../db/rideSupportTicketsData";
import { upsertRideFinancialSnapshot } from "../db/rideFinancialsData";
import {
  canTransitionRideStatus,
  supplementalEventForTransition,
} from "../lib/rideStatusMachine";
import { logger } from "../lib/logger";
import { logRideAntiFraudAttempt } from "../lib/rideAntiFraud";
import { evaluateFinalFarePlausibility } from "../lib/driverFinalFarePlausibility";
import {
  computeRideCompletionGpsMetrics,
  evaluateMinimumTransportForPositiveFare,
} from "../lib/rideMinimumTransportGuard";
import { rideRequiresPassengerPin } from "../lib/customerRideVerifyPin";
import { resolveReceiptDriverInfo, type ReceiptDriverInfo } from "../lib/receiptDriverInfo";
import { validateRideStatusTransition } from "../lib/rideOpsTransitionGuards";
import { markDispatchOfferAccepted } from "../db/rideDispatchOfferData";
import { applyRideChatOnFleetDriverAccept } from "../db/rideChatMessagesData";
import {
  getRideDriverLocation,
  hydrateRideDriverLocationCache,
  persistDriverLocationPing,
} from "../db/rideDriverLocationData";
import {
  DEFAULT_AUTHORIZATION_SOURCE,
  normalizeAccessCodeInput,
  parseAuthorizationSource,
} from "../domain/rideAuthorization";
import { stripPartnerOnlyRideFields, toCustomerRideView } from "../domain/ridePublic";
import { getPublicFareProfile } from "../db/adminData";
import { computeTaxiPriceLikeFareEstimate, TARIFF_ENGINE_SCHEMA_VERSION } from "../lib/bookingTariffEstimate";
import { assertClientEstimatedFareMatchesServer, bookingPriceToleranceEur, computeRideBookingPricing } from "../lib/rideBookingPricing";
import {
  isFixedPriceReservationRequest,
  shouldBypassServiceAreaForFixedPriceReservation,
  validateFixedPriceReservationEndpoints,
} from "../lib/reservationFixedPricePolicy";
import { computeFixedPriceRideBookingPricing } from "../lib/fixedPriceBooking";
import {
  buildFixedPriceQuote,
  buildRouteDistanceQuote,
} from "../lib/fixedPriceRouteQuote";
import { isRideFixedPrice, resolveFixedPriceAgreedEur } from "../lib/ridePricingModeLabels";
import { buildCustomerReceiptHtmlForRide } from "../lib/customerReceipt";
import { buildCustomerReceiptPdfForRide } from "../lib/customerReceiptPdf";
import { anyActiveRegionRequiresClientCoordinates } from "../lib/serviceRegionMatch";
import { verifyAccessCode } from "../db/accessCodesData";
import {
  getFleetDriverCapability,
  isRideCompatibleWithCapability,
} from "../db/fleetMatchingData";
import {
  evaluateFleetDriverCancellationSuspensionAfterCancel,
  rideQualifiesAsDriverPostAcceptCancel,
} from "../lib/fleetDriverCancellationSuspensionPolicy";
import { getFleetDriverReadinessById } from "../db/fleetDriverReadiness";
import {
  findFleetDriverAuthRow,
  getFleetDriverMarketOnline,
  setFleetDriverMarketOnline,
  recordFleetDriverOfferRejectStreak,
  resetFleetDriverDispatchRejectStreak,
  setReservationSuspension,
} from "../db/fleetDriversData";
import {
  isFarFutureReservation,
  isReservationWithinAdvanceWindow,
  RESERVATION_MAX_ADVANCE_MS,
} from "../lib/dispatchStatus";
import {
  DEFAULT_RESERVATION_MANUAL_ACTIVATION_DEADLINE_MINUTES_REMAINING,
  DEFAULT_RESERVATION_MANUAL_ACTIVATION_OPENS_MINUTES,
  isWithinManualReservationActivationWindow,
} from "../jobs/reservationLifecycle";
import { initialDispatchTierFieldsForRide } from "../lib/dispatchPriorityTier";
import {
  notifyDriverFollowUpOffer,
  notifyDriverRideCancelledByCustomer,
  notifyMarketOnlineDriversInstantRideOffer,
} from "../lib/driverRideExpoPush";
import { findFollowUpOfferForDriver } from "../db/fleetFollowUpOfferData";
import { maybeNotifyPassengerPickupEtaFromDriverLocation } from "../lib/rideEtaPassengerPush";
import {
  assertKkModuleAccessForFleetDriver,
  kkModuleDeniedJson,
} from "../lib/kkModuleAccess.js";
import {
  assertMedicalTransportAuthorizedForFleetDriver,
  MEDICAL_TRANSPORT_NOT_AUTHORIZED,
} from "../lib/medical/medicalTransportAuthorization";
import {
  assertCustomerFromFullInActiveServiceRegion,
  assertCustomerRideOperational,
  assertPlatformNewRideAllowed,
  checkCustomerRideServiceArea,
  evaluateCustomerCancellationFeeEur,
  getOperationalConfigPayload,
  getOutOfServiceAreaMessage,
  listServiceRegionsForApi,
  resolveFinancePricingContextForRide,
  resolveFinancePricingContextFromOperational,
} from "../db/appOperationalData";
import { computeDriverRidePayoutSnap } from "../lib/driverRidePayoutSnap";
import { decodeValidatedMedicalTransportImage } from "../lib/medicalTransportImage";
import { calculateMedicalBillingReadiness } from "../lib/medicalBillingReadiness";
import { evaluateMedicalUploadBillingLock } from "../lib/medicalUploadBillingLock";
import {
  customerTransportScanMetaToPartnerJson,
  parseCustomerMedicalScanIdFromBody,
} from "../lib/medical/customerTransportScanSnapshot";
import {
  markCustomerMedicalTransportScanConsumed,
  resolveCustomerMedicalScanForBooking,
} from "../db/customerMedicalTransportScansData";
import { createMedicalQrToken, formatMedicalQrPayload } from "../lib/medicalQrToken";
import {
  assertPassengerCanBook,
  evaluateCustomerCancellationSuspensionAfterCancel,
} from "../lib/customerCancellationSuspensionPolicy";
import {
  cancelRideStripePaymentAuthorization,
  captureRideStripePaymentIntent,
  shouldReleaseStripeAuthorizationOnRideStatus,
} from "../lib/stripeRideAuthorization.js";
import { signReceiptHtmlAccessJwt, verifyReceiptHtmlAccessJwt } from "../lib/receiptAccessJwt";
import type { RideMutateActor } from "../lib/rideRouteAuth";
import {
  authorizePatchRideStatusForActor,
  resolveRideMutateActor,
  resolveCustomerActorOrNull,
  resolveFleetActorOrNull,
  resolvePanelActorOrNull,
  extractBearerAuthorization,
} from "../lib/rideRouteAuth";
import {
  fleetDriverCompanyIdForRideCapability,
  getAdminCompanyKind,
} from "../lib/fleetRideDispatchPool";
import {
  isReservationCustomerDriverStornoLocked,
  isReservationDriverLateCancelSanctionWindow,
  msUntilScheduledPickup,
  reservationDriverLateCancelSuspensionUntil,
  RESERVATION_DRIVER_LATE_CANCEL_SUSPENSION_HOURS,
} from "../lib/rideReservationStornoDeadline";
import {
  notifyPassengerDriverAccepted,
  notifyPassengerDriverArriving,
  notifyPassengerDriverWaiting,
  notifyPassengerReservationConfirmed,
  notifyPassengerRideCancelledBySystem,
  notifyPassengerNoShow,
  notifyPassengerRideCompleted,
  notifyPassengerRideInProgress,
  notifyPassengerReservationExpired,
  shouldNotifyPassengerReservationExpired,
} from "../lib/passengerRideExpoPush";
import { broadcastRideStatusChange } from "../wsRideSocketHub";
import { resolveNoShowPolicy } from "../lib/noShowPolicy";
import {
  computeWaitingChargeForRide,
  liveWaitingMinutesSince,
  resolveWaitingEurPerHour,
} from "../lib/waitingTimeCharge";
import { isSessionJwtConfigured, verifySessionJwt } from "../lib/sessionJwt";
import { tryResolveAdminApiAuthPrincipal } from "../middleware/requireAdminApiBearer";
import { customerPassengerId, requireCustomerSession, rejectSuspendedCustomerBooking, type CustomerSessionRequest } from "../middleware/requireCustomerSession";
import { requireFleetDriverAuth, type FleetDriverAuthRequest } from "../middleware/requireFleetDriverAuth";

export type { RideRequest } from "../domain/rideRequest";

export type DriverNavPhase = "pickup" | "destination";

export interface DriverLocation {
  lat: number;
  lon: number;
  updatedAt: string;
  /** Geschätzte Restzeit aus Fahrer-Navigation (Minuten). */
  etaMinutes?: number;
  /** Reststrecke in Metern aus Fahrer-Navigation. */
  remainingDistM?: number;
  /** Ziel der Navigation: Abholung oder Fahrtziel. */
  navPhase?: DriverNavPhase;
}

function driverNavExtrasFromBody(body: unknown): Pick<DriverLocation, "etaMinutes" | "remainingDistM" | "navPhase"> {
  const b = body as Record<string, unknown>;
  const extras: Pick<DriverLocation, "etaMinutes" | "remainingDistM" | "navPhase"> = {};
  if (typeof b.etaMinutes === "number" && Number.isFinite(b.etaMinutes)) {
    extras.etaMinutes = Math.max(0, Math.round(b.etaMinutes));
  }
  if (typeof b.remainingDistM === "number" && Number.isFinite(b.remainingDistM)) {
    extras.remainingDistM = Math.max(0, Math.round(b.remainingDistM));
  }
  const phase = typeof b.navPhase === "string" ? b.navPhase.trim() : "";
  if (phase === "pickup" || phase === "destination") extras.navPhase = phase;
  return extras;
}

function mergeDriverLocationExtras(
  base: DriverLocation,
  extras: Pick<DriverLocation, "etaMinutes" | "remainingDistM" | "navPhase">,
): DriverLocation {
  return {
    ...base,
    ...(extras.etaMinutes != null ? { etaMinutes: extras.etaMinutes } : {}),
    ...(extras.remainingDistM != null ? { remainingDistM: extras.remainingDistM } : {}),
    ...(extras.navPhase ? { navPhase: extras.navPhase } : {}),
  };
}

const DEMO: RideRequest[] = [];

export const driverLocations = new Map<string, DriverLocation>();
export const customerLocations = new Map<string, DriverLocation>();
const customerCancelReasons = new Map<string, string>();

export function getCustomerCancelReasonForRide(rideId: string): string | null {
  return customerCancelReasons.get(rideId.trim()) ?? null;
}

const router = Router();

const MEDICAL_RIDE_UPLOAD_ROOT =
  (process.env.MEDICAL_RIDE_UPLOAD_DIR ?? "").trim() ||
  path.resolve(process.cwd(), "artifacts/api-server/uploads/medical-ride");

/** Demo-Krankenfahrten: synthetische Kassenfelder nur für Schulung, keine echte Abrechnung. */
const MEDICAL_DEMO_INSURANCE_LABEL = "Demonstration (KV-TEST)";
const MEDICAL_DEMO_COST_CENTER_LABEL = "TEST — nicht zur Abrechnung";

function mutationActorFromRideMutator(a: RideMutateActor | null): RideMutationPersistenceActor {
  if (!a || a.kind === "admin") return { actorType: "admin", actorId: null };
  if (a.kind === "customer_session") return { actorType: "passenger", actorId: a.passengerGoogleId };
  return { actorType: "driver", actorId: a.fleetDriverId };
}

async function tryAuthorizeReceiptRide(req: Request, rideId: string): Promise<RideRequest | null> {
  const trimmedId = rideId.trim();
  if (!trimmedId) return null;
  const ride = await findRide(trimmedId);
  if (!ride || ride.status !== "completed") return null;

  const rtRaw = typeof (req.query as { rt?: unknown }).rt === "string" ? (req.query as { rt: string }).rt.trim() : "";
  if (rtRaw) {
    try {
      const v = await verifyReceiptHtmlAccessJwt(rtRaw);
      const pax = (ride.passengerId ?? "").trim();
      if (v.rideId === trimmedId && pax && v.passengerGoogleId === pax) return ride;
    } catch {
      /* token ungültig */
    }
  }

  const bearer = extractBearerAuthorization(req);
  if (bearer && isSessionJwtConfigured()) {
    try {
      const claims = await verifySessionJwt(bearer);
      const gid = claims.googleId.trim();
      if (gid && (ride.passengerId ?? "").trim() === gid) return ride;
    } catch {
      /* kein gültiges Kunden-JWT */
    }
  }

  return null;
}

function loweredTrim(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

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

async function respondMedicalUploadLockedAfterBilling(
  res: import("express").Response,
  ride: RideRequest,
): Promise<boolean> {
  const lock = await evaluateMedicalUploadBillingLock(ride);
  if (!lock.locked) return false;
  res.status(409).json({
    ok: false,
    error: "medical_upload_locked_after_billing",
    message:
      "Nach Abrechnung können Muster-4-Nachweise nicht mehr geändert werden. Bitte das Partner-Panel oder den Support kontaktieren.",
    lockReason: lock.reason,
  });
  return true;
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
    "scheduled_assigned",
    "ready_for_dispatch",
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
    "no_show",
    "cancelled_by_customer",
    "cancelled_by_driver",
    "cancelled_by_system",
    "expired",
    "rejected",
    "cancelled",
  ];
  return (allowed as string[]).includes(s) ? (s as RideRequest["status"]) : null;
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

function hasValidLatLon(lat: number | null, lon: number | null): boolean {
  return lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function hasPoiKeyword(address: string): boolean {
  const text = String(address ?? "").trim().toLowerCase();
  if (!text) return false;
  return /\b(flughafen|hauptbahnhof|bahnhof|klinik|krankenhaus|hotel|einkaufszentrum|zentrum|messe|terminal)\b/i.test(text);
}

function isAddressAcceptedForBooking(address: string, lat: number | null, lon: number | null): boolean {
  if (hasHouseNumberInFirstAddressPart(address)) return true;
  if (hasValidLatLon(lat, lon)) return true;
  if (hasPoiKeyword(address)) return true;
  return false;
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
  copyBool("medical_demo_mode");
  if (typeof src.medical_demo_transport_source === "string" && src.medical_demo_transport_source.trim()) {
    out.medical_demo_transport_source = src.medical_demo_transport_source.trim().slice(0, 48);
  }
  return out;
}

const CUSTOMER_DRIVER_NOTE_BODY_MAX = 500;

function extractCustomerDriverNoteFromRawBody(raw: Record<string, unknown>): string {
  const pm = raw.partnerBookingMeta ?? raw.partner_booking_meta;
  if (!pm || typeof pm !== "object" || Array.isArray(pm)) return "";
  const rec = pm as Record<string, unknown>;
  const v = rec.customer_driver_note ?? rec.customerDriverNote;
  if (typeof v !== "string") return "";
  const t = v.trim();
  return t.length > 0 ? t.slice(0, CUSTOMER_DRIVER_NOTE_BODY_MAX) : "";
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
    const waitingMinutes = Number(req.query.waitingMinutes ?? 0);
    const vehicle = String(req.query.vehicle ?? "standard").trim().toLowerCase();
    const fromFullQ = String(req.query.fromFull ?? req.query.from ?? "").trim();
    const toFullQ = String(req.query.toFull ?? req.query.to ?? "").trim();
    if (!fromFullQ || !toFullQ) {
      res.status(400).json({
        error: "from_to_required",
        message: "Start und Ziel werden für die Streckenberechnung benötigt.",
        routingSource: "error",
      });
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
    const toLatQ = optCoord(
      (req.query as { toLat?: unknown; to_lat?: unknown }).toLat ??
        (req.query as { to_lat?: unknown }).to_lat,
    );
    const toLonQ = optCoord(
      (req.query as { toLon?: unknown; to_lon?: unknown }).toLon ??
        (req.query as { to_lon?: unknown }).to_lon,
    );
    if (anyActiveRegionRequiresClientCoordinates(regions) && (fromLatQ == null || fromLngQ == null)) {
      res.status(400).json({
        error: "pickup_coordinates_required",
        message: "Für die Einfahrt-Regionen (Radius) werden Startkoordinaten benötigt: fromLat, fromLng (Query).",
      });
      return;
    }
    const routeQuote = await buildRouteDistanceQuote({
      fromFull: fromFullQ,
      toFull: toFullQ,
      fromLat: fromLatQ,
      fromLon: fromLngQ,
      toLat: toLatQ,
      toLon: toLonQ,
    });
    if (!routeQuote.ok) {
      res.status(400).json(routeQuote);
      return;
    }
    const distanceKm = routeQuote.route.distanceKm;
    const tripMinutes = routeQuote.route.durationMinutes;
    const routingSource = routeQuote.routingSource;
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
      routingSource,
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

router.get("/fixed-price-estimate", async (req, res, next) => {
  try {
    const result = await buildFixedPriceQuote({
      fromFull: String(req.query.fromFull ?? req.query.from ?? ""),
      toFull: String(req.query.toFull ?? req.query.to ?? ""),
      fromLat: optCoord(
        (req.query as { fromLat?: unknown; from_lat?: unknown }).fromLat ??
          (req.query as { from_lat?: unknown }).from_lat,
      ),
      fromLon: optCoord(
        (req.query as { fromLon?: unknown; from_lon?: unknown }).fromLon ??
          (req.query as { from_lon?: unknown }).from_lon,
      ),
      toLat: optCoord(
        (req.query as { toLat?: unknown; to_lat?: unknown }).toLat ?? (req.query as { to_lat?: unknown }).to_lat,
      ),
      toLon: optCoord(
        (req.query as { toLon?: unknown; to_lon?: unknown }).toLon ?? (req.query as { to_lon?: unknown }).to_lon,
      ),
      fromCity: typeof req.query.fromCity === "string" ? req.query.fromCity.trim() : null,
      toCity: typeof req.query.toCity === "string" ? req.query.toCity.trim() : null,
      vehicle:
        typeof req.query.vehicle === "string" && req.query.vehicle.trim()
          ? req.query.vehicle.trim()
          : "standard",
    });
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    if (!result.quote.eligible) {
      res.json({
        ok: true,
        eligible: false,
        reason: result.quote.reason,
        message: result.quote.message,
        routingSource: result.routingSource,
        distanceKm: result.route.distanceKm,
        durationMinutes: result.route.durationMinutes,
      });
      return;
    }
    res.json({
      ok: true,
      eligible: true,
      routingSource: result.routingSource,
      distanceKm: result.route.distanceKm,
      durationMinutes: result.route.durationMinutes,
      pricingMode: result.quote.pricingMode,
      priceEur: result.quote.priceEur,
      basePriceEur: result.quote.basePriceEur,
      vehicleSurchargeEur: result.quote.vehicleSurchargeEur,
      baseFeeEur: result.quote.baseFeeEur,
      perKmEur: result.quote.perKmEur,
      distanceChargeEur: result.quote.distanceChargeEur,
    });
  } catch (e) {
    next(e);
  }
});

/** Storno-Hinweis für Taxi-Fahrer (Navigation) ohne globale Ride-Liste. */
router.get("/rides/:rideId/fleet-snapshot", requireFleetDriverAuth, async (req, res, next) => {
  try {
    const rideId = String(req.params.rideId ?? "").trim();
    if (!rideId) {
      res.status(400).json({ error: "ride_id_required" });
      return;
    }
    const a = (req as FleetDriverAuthRequest).fleetDriverAuth;
    if (!a) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const ride = await findRide(rideId);
    if (!ride) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const assigned = (ride.driverId ?? "").trim();
    if (assigned !== a.fleetDriverId) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    res.json({
      id: ride.id,
      status: ride.status,
      chatEnabled: Boolean(ride.chatEnabled),
      cancelReason: customerCancelReasons.get(ride.id) ?? null,
    });
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
    if (await respondMedicalUploadLockedAfterBilling(res, ride)) return;
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
    const nextRide = await updateRide(
      rideId,
      {
        partnerBookingMeta: merged as RideRequest["partnerBookingMeta"],
      },
      { mutationActor: { actorType: "driver", actorId: auth.fleetDriverId } },
    );
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
    if (await respondMedicalUploadLockedAfterBilling(res, ride)) return;
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
    const demo = meta.medical_demo_mode === true;
    const merged = mergeMedicalPartnerMeta(ride, {
      transport_document_status: "uploaded",
      transport_document_file_key: rel,
      transport_document_uploaded_at: uploadedAt,
      ...(demo
        ? {
            transport_document_not_for_billing: true,
            transport_document_demo_label: "TESTDOKUMENT / NICHT ZUR ABRECHNUNG",
          }
        : {}),
    });
    const nextRide = await updateRide(
      rideId,
      {
        partnerBookingMeta: merged as RideRequest["partnerBookingMeta"],
      },
      { mutationActor: { actorType: "driver", actorId: auth.fleetDriverId } },
    );
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
    if (await respondMedicalUploadLockedAfterBilling(res, ride)) return;
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
    const nextRide = await updateRide(
      rideId,
      {
        partnerBookingMeta: merged as RideRequest["partnerBookingMeta"],
      },
      { mutationActor: { actorType: "driver", actorId: auth.fleetDriverId } },
    );
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

router.post("/rides/:id/cash-confirmed", requireFleetDriverAuth, async (req, res, next) => {
  try {
    const rideId = String(req.params.id ?? "").trim();
    const auth = (req as FleetDriverAuthRequest).fleetDriverAuth;
    if (!rideId || !auth) {
      res.status(400).json({ ok: false, error: "bad_request" });
      return;
    }
    const ride = await findRide(rideId);
    if (!ride) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }
    if (ride.status !== "completed" && ride.status !== "no_show") {
      res.status(409).json({ ok: false, error: "cash_confirm_requires_completed_ride" });
      return;
    }
    const pm = String(ride.paymentMethod ?? "").toLowerCase();
    if (pm !== "cash" && pm !== "bar") {
      res.status(409).json({ ok: false, error: "not_cash_ride" });
      return;
    }
    const assigned = (ride.driverId ?? "").trim();
    if (!assigned || assigned !== auth.fleetDriverId) {
      res.status(403).json({ ok: false, error: "not_assigned_driver" });
      return;
    }
    const confirmedAt = new Date().toISOString();
    const updated = await updateRide(
      rideId,
      { cashConfirmedAt: confirmedAt, paymentStatus: "paid" },
      { mutationActor: { actorType: "driver", actorId: auth.fleetDriverId } },
    );
    if (!updated) {
      res.status(500).json({ ok: false, error: "update_failed" });
      return;
    }
    void insertSupplementalRideEvent(rideId, {
      eventType: "cash_payment_confirmed",
      actorType: "driver",
      actorId: auth.fleetDriverId,
      payload: { confirmedAt },
    });
    res.json({ ok: true, cashConfirmedAt: confirmedAt, paymentStatus: "paid" });
  } catch (e) {
    next(e);
  }
});

router.get("/rides/:id/waiting-charge-live", requireFleetDriverAuth, async (req, res, next) => {
  try {
    const rideId = String(req.params.id ?? "").trim();
    const auth = (req as FleetDriverAuthRequest).fleetDriverAuth;
    if (!rideId || !auth) {
      res.status(400).json({ ok: false, error: "bad_request" });
      return;
    }
    const ride = await findRide(rideId);
    if (!ride) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }
    const assigned = (ride.driverId ?? "").trim();
    if (!assigned || assigned !== auth.fleetDriverId) {
      res.status(403).json({ ok: false, error: "not_assigned_driver" });
      return;
    }
    const opPayload = await getOperationalConfigPayload();
    const br =
      opPayload.bookingRules && typeof opPayload.bookingRules === "object" && !Array.isArray(opPayload.bookingRules)
        ? (opPayload.bookingRules as Record<string, unknown>)
        : {};
    if (ride.status === "driver_waiting") {
      const live = computeWaitingChargeForRide(ride.driverWaitingStartedAt, br);
      res.json({ ok: true, mode: "live", ...live });
      return;
    }
    if (ride.waitingMinutesBilled != null && ride.waitingChargeEur != null) {
      res.json({
        ok: true,
        mode: "frozen",
        waitingMinutesBilled: ride.waitingMinutesBilled,
        waitingChargeEur: ride.waitingChargeEur,
        eurPerHour: resolveWaitingEurPerHour(br),
      });
      return;
    }
    res.json({ ok: true, mode: "none", waitingMinutesBilled: 0, waitingChargeEur: 0, eurPerHour: resolveWaitingEurPerHour(br) });
  } catch (e) {
    next(e);
  }
});

router.post("/rides/:id/driver-no-show/start", requireFleetDriverAuth, async (req, res, next) => {
  try {
    const rideId = String(req.params.id ?? "").trim();
    const auth = (req as FleetDriverAuthRequest).fleetDriverAuth;
    if (!rideId || !auth) {
      res.status(400).json({ ok: false, error: "bad_request" });
      return;
    }
    const ride = await findRide(rideId);
    if (!ride) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }
    if (ride.status !== "driver_waiting") {
      res.status(409).json({
        ok: false,
        error: "no_show_invalid_status",
        message: "No-Show nur möglich, wenn Sie am Abholort warten.",
      });
      return;
    }
    const assigned = (ride.driverId ?? "").trim();
    if (!assigned || assigned !== auth.fleetDriverId) {
      res.status(403).json({ ok: false, error: "not_assigned_driver" });
      return;
    }
    const opPayload = await getOperationalConfigPayload();
    const policy = resolveNoShowPolicy(opPayload);
    const waitingSince = ride.driverWaitingStartedAt ?? null;
    if (!waitingSince) {
      res.status(409).json({ ok: false, error: "driver_waiting_since_missing" });
      return;
    }
    const waitedMin = liveWaitingMinutesSince(waitingSince);
    if (waitedMin < policy.minWaitBeforeStartMinutes) {
      res.status(409).json({
        ok: false,
        error: "no_show_wait_too_short",
        message: `Bitte noch ${policy.minWaitBeforeStartMinutes - waitedMin} Min. am Abholort warten.`,
        waitedMinutes: waitedMin,
        requiredMinutes: policy.minWaitBeforeStartMinutes,
      });
      return;
    }
    const countdownStartedAt = new Date().toISOString();
    const updated = await updateRide(
      rideId,
      { noShowCountdownStartedAt: countdownStartedAt },
      { mutationActor: { actorType: "driver", actorId: auth.fleetDriverId } },
    );
    if (!updated) {
      res.status(500).json({ ok: false, error: "update_failed" });
      return;
    }
    const finalizeAfterMs = Date.now() + policy.countdownMinutes * 60_000;
    res.json({
      ok: true,
      countdownStartedAt,
      finalizeAfterIso: new Date(finalizeAfterMs).toISOString(),
      countdownMinutes: policy.countdownMinutes,
      feeEur: policy.feeEur,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/rides/:id/driver-no-show/finalize", requireFleetDriverAuth, async (req, res, next) => {
  try {
    const rideId = String(req.params.id ?? "").trim();
    const auth = (req as FleetDriverAuthRequest).fleetDriverAuth;
    if (!rideId || !auth) {
      res.status(400).json({ ok: false, error: "bad_request" });
      return;
    }
    const ride = await findRide(rideId);
    if (!ride) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }
    if (ride.status !== "driver_waiting") {
      res.status(409).json({ ok: false, error: "no_show_invalid_status" });
      return;
    }
    const assigned = (ride.driverId ?? "").trim();
    if (!assigned || assigned !== auth.fleetDriverId) {
      res.status(403).json({ ok: false, error: "not_assigned_driver" });
      return;
    }
    const countdownStarted = ride.noShowCountdownStartedAt ?? null;
    if (!countdownStarted) {
      res.status(409).json({
        ok: false,
        error: "no_show_countdown_not_started",
        message: "Bitte zuerst „Kunde nicht da“ starten.",
      });
      return;
    }
    const opPayload = await getOperationalConfigPayload();
    const policy = resolveNoShowPolicy(opPayload);
    const elapsedMs = Date.now() - Date.parse(countdownStarted);
    const requiredMs = policy.countdownMinutes * 60_000;
    if (!Number.isFinite(elapsedMs) || elapsedMs < requiredMs - 500) {
      const remainingSec = Math.max(1, Math.ceil((requiredMs - Math.max(0, elapsedMs)) / 1000));
      res.status(409).json({
        ok: false,
        error: "no_show_countdown_active",
        message: `Countdown läuft noch (${remainingSec} Sek.).`,
        remainingSeconds: remainingSec,
      });
      return;
    }
    const evidenceAt = new Date().toISOString();
    const updated = await updateRide(
      rideId,
      {
        status: "no_show",
        finalFare: policy.feeEur,
        noShowEvidenceAt: evidenceAt,
      },
      { mutationActor: { actorType: "driver", actorId: auth.fleetDriverId } },
    );
    if (!updated) {
      res.status(500).json({ ok: false, error: "update_failed" });
      return;
    }
    void insertSupplementalRideEvent(rideId, {
      eventType: "passenger_no_show",
      fromStatus: ride.status,
      toStatus: "no_show",
      actorType: "driver",
      actorId: auth.fleetDriverId,
      payload: {
        feeEur: policy.feeEur,
        evidenceAt,
        waitingStartedAt: ride.driverWaitingStartedAt ?? null,
        countdownStartedAt: countdownStarted,
      },
    });
    const pid = (updated.passengerId ?? "").trim();
    if (pid) void notifyPassengerNoShow(pid, updated.id);
    const opPayloadFin = await getOperationalConfigPayload();
    const regionsFin = await listServiceRegionsForApi();
    const pcFin = await resolveFinancePricingContextForRide(updated, opPayloadFin, regionsFin);
    await upsertRideFinancialSnapshot({
      ride: updated,
      pricingContext: pcFin,
      reason: "ride_no_show_status_transition",
      actorType: "driver",
      actorId: auth.fleetDriverId,
      forceRecalc: true,
    });
    res.json({
      ok: true,
      rideId: updated.id,
      status: updated.status,
      finalFare: updated.finalFare,
      evidenceAt,
    });
  } catch (e) {
    next(e);
  }
});

router.get("/rides/:rideId/support/preview", requireCustomerSession, async (req, res, next) => {
  try {
    const rideId = String(req.params.rideId ?? "").trim();
    if (!rideId) {
      res.status(400).json({ ok: false, error: "ride_id_required" });
      return;
    }
    const sess = (req as CustomerSessionRequest).customerSession;
    if (!sess) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ ok: false, error: "database_not_configured" });
      return;
    }
    const passengerId = customerPassengerId(sess);
    const ride = await findRideForPassenger(rideId, passengerId);
    if (!ride) {
      res.status(403).json({ ok: false, error: "ride_not_owned" });
      return;
    }
    const items = await listRideSupportTicketsForPassengerRide(rideId, passengerId);
    const lines = items.map((t) => `[${t.createdAtIso}] ${t.category} — ${t.status}: ${t.messageSnippet || "(ohne Text)"}`);
    res.json({ ok: true, summary: { lines } });
  } catch (e) {
    next(e);
  }
});

router.post("/rides/:rideId/support", requireCustomerSession, async (req, res, next) => {
  try {
    const rideId = String(req.params.rideId ?? "").trim();
    if (!rideId) {
      res.status(400).json({ ok: false, error: "ride_id_required" });
      return;
    }
    const sess = (req as CustomerSessionRequest).customerSession;
    if (!sess) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ ok: false, error: "database_not_configured" });
      return;
    }
    const passengerId = customerPassengerId(sess);
    const ride = await findRideForPassenger(rideId, passengerId);
    if (!ride) {
      res.status(403).json({ ok: false, error: "ride_not_owned" });
      return;
    }
    const category = typeof req.body?.category === "string" ? req.body.category.trim() : "other";
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    const source = typeof req.body?.source === "string" ? req.body.source.trim() : "mobile";
    const priorityRaw = typeof req.body?.priority === "string" ? req.body.priority.trim() : "normal";
    if (message.length > 0 && message.length < 5) {
      res.status(400).json({ ok: false, error: "message_too_short" });
      return;
    }

    const ins = await insertRideSupportTicket({
      rideId,
      passengerId,
      companyId: ride.companyId ?? null,
      category: category || "other",
      message: message ? message.slice(0, 4000) : null,
      priority: priorityRaw || "normal",
      source: source || "mobile",
      createdByActorKind: "customer",
      createdByActorId: passengerId,
      snapshot: buildRideSupportContextSnapshot(ride),
    });
    if (!ins) {
      res.status(503).json({ ok: false, error: "database_not_configured" });
      return;
    }
    console.log(`[customer-support] rideId=${rideId} ticketId=${ins.id} category=${category}`);
    res.json({ ok: true, ticketId: ins.id });
  } catch (e) {
    next(e);
  }
});

router.get("/rides/:rideId/receipt", async (req, res, next) => {
  try {
    const rideId = String(req.params.rideId ?? "").trim();
    if (!rideId) {
      res.status(400).json({ error: "ride_id_required" });
      return;
    }
    const ride = await tryAuthorizeReceiptRide(req, rideId);
    if (!ride) {
      res.status(401).json({
        error: "receipt_unauthorized",
        message: "Quittung nur mit Kunden-Session (Authorization: Bearer) oder gültigem rt-Token.",
      });
      return;
    }
    const driverInfo = await resolveReceiptDriverInfo(ride.driverId);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(await buildCustomerReceiptHtmlForRide(ride, driverInfo));
  } catch (e) {
    logger.error({ err: e, rideId: req.params.rideId }, "[receipt] html generation failed");
    next(e);
  }
});

router.get("/rides/:rideId/receipt.pdf", async (req, res, next) => {
  try {
    const rideId = String(req.params.rideId ?? "").trim();
    if (!rideId) {
      res.status(400).json({ error: "ride_id_required" });
      return;
    }
    const ride = await tryAuthorizeReceiptRide(req, rideId);
    if (!ride) {
      res.status(401).json({
        error: "receipt_unauthorized",
        message: "Quittung nur mit Kunden-Session (Authorization: Bearer) oder gültigem rt-Token.",
      });
      return;
    }
    const driverInfo = await resolveReceiptDriverInfo(ride.driverId);
    const pdf = await buildCustomerReceiptPdfForRide(ride, driverInfo);
    const rideNr = String(ride.id).slice(0, 8).toUpperCase();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="quittung-${rideNr}.pdf"`);
    res.send(pdf);
  } catch (e) {
    logger.error({ err: e, rideId: req.params.rideId }, "[receipt] pdf generation failed");
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

router.post("/rides", requireCustomerSession, rejectSuspendedCustomerBooking, async (req, res, next) => {
  try {
    const sess = (req as CustomerSessionRequest).customerSession;
    if (!sess) {
      res.status(401).json({ error: "unauthorized", ok: false });
      return;
    }
    const sessionPassengerId = customerPassengerId(sess);
    const raw = req.body as Partial<RideRequest> & { accessCodeVerifyToken?: unknown };
    if (!raw.customerName || String(raw.customerName).trim() === "") {
      res.status(400).json({ error: "customer_name_required" });
      return;
    }
    const bodyPassengerId = String(raw.passengerId ?? "").trim();
    if (bodyPassengerId && bodyPassengerId !== sessionPassengerId) {
      res.status(403).json({
        error: "passenger_id_session_mismatch",
        message: "passengerId muss zur angemeldeten Kunden-Session passen.",
      });
      return;
    }
    raw.passengerId = sessionPassengerId;
    const bookGate = await assertPassengerCanBook(sessionPassengerId);
    if (!bookGate.ok) {
      res.status(403).json({ error: bookGate.error, message: bookGate.message });
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
    const rawPricingModeStr =
      raw.pricingMode != null && raw.pricingMode !== ""
        ? String(raw.pricingMode).trim()
        : "";
    const fromFull = String((raw as { fromFull?: string }).fromFull ?? (raw as { from?: string }).from ?? "").trim();
    const toFull = String((raw as { toFull?: string }).toFull ?? (raw as { to?: string }).to ?? "").trim();
    if (!fromFull || !toFull) {
      res.status(400).json({ error: "from_to_required" });
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
    const fromAddressOk = isAddressAcceptedForBooking(fromFull, fromLatB, fromLonB);
    const toAddressOk = isAddressAcceptedForBooking(toFull, toLatB, toLonB);
    if (!fromAddressOk || !toAddressOk) {
      console.warn("RIDES_ADDRESS_VALIDATION_REJECT", {
        error: "address_house_number_required",
        fromFull,
        toFull,
        fromLat: fromLatB,
        fromLon: fromLonB,
        toLat: toLatB,
        toLon: toLonB,
        fromHasHouseNumber: hasHouseNumberInFirstAddressPart(fromFull),
        toHasHouseNumber: hasHouseNumberInFirstAddressPart(toFull),
        fromHasPoiKeyword: hasPoiKeyword(fromFull),
        toHasPoiKeyword: hasPoiKeyword(toFull),
      });
      res.status(400).json({
        error: "address_house_number_required",
        message: ADDRESS_HOUSE_NUMBER_REQUIRED_MESSAGE,
      });
      return;
    }
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
    const fromCityB =
      typeof (raw as { fromCity?: unknown }).fromCity === "string"
        ? String((raw as { fromCity?: unknown }).fromCity).trim()
        : "";
    const toCityB =
      typeof (raw as { toCity?: unknown }).toCity === "string"
        ? String((raw as { toCity?: unknown }).toCity).trim()
        : "";
    const scheduledAtForArea = pickScheduledAtFromBody(raw as Partial<RideRequest> & Record<string, unknown>);
    const fixedPriceReservation = shouldBypassServiceAreaForFixedPriceReservation(
      rawPricingModeStr,
      scheduledAtForArea,
    );
    if (rawPricingModeStr === "fixed_price" && !isFixedPriceReservationRequest(rawPricingModeStr, scheduledAtForArea)) {
      res.status(400).json({
        error: "fixed_price_reservation_only",
        message:
          "Festpreis ist nur für Reservierungen (ab 60 Minuten Vorlauf) verfügbar. Bitte einen Termin wählen oder Taxameter-Fahrt buchen.",
      });
      return;
    }
    if (!fixedPriceReservation) {
      const area = await checkCustomerRideServiceArea(fromFull, toFull, {
        fromLat: fromLatB,
        fromLon: fromLonB,
        toLat: toLatB,
        toLon: toLonB,
      });
      if (!area.ok) {
        res.status(400).json({
          error: "service_area_not_covered",
          message: getOutOfServiceAreaMessage(opPayload),
        });
        return;
      }
    } else {
      const geo = validateFixedPriceReservationEndpoints(
        { displayName: fromFull, city: fromCityB || null, lat: fromLatB, lon: fromLonB },
        { displayName: toFull, city: toCityB || null, lat: toLatB, lon: toLonB },
      );
      if (!geo.ok) {
        res.status(400).json({ error: geo.error, message: geo.message });
        return;
      }
    }
    const tBook = opPayload.tariffs as { active?: boolean } | undefined;
    if (tBook?.active === false) {
      res.status(400).json({ error: "tariffs_inactive", message: "Tarife sind derzeit deaktiviert." });
      return;
    }
    const vehicleB = String((raw as { vehicle?: unknown }).vehicle ?? "standard").trim().toLowerCase() || "standard";
    const routeQuote = await buildRouteDistanceQuote({
      fromFull,
      toFull,
      fromLat: fromLatB,
      fromLon: fromLonB,
      toLat: toLatB,
      toLon: toLonB,
      fromCity: fromCityB || null,
      toCity: toCityB || null,
    });
    if (!routeQuote.ok) {
      res.status(400).json(routeQuote);
      return;
    }
    const distanceKmB = routeQuote.route.distanceKm;
    const tripMRaw = Number(
      (raw as { tripMinutes?: unknown }).tripMinutes ??
        (raw as { trip_minutes?: unknown }).trip_minutes ??
        (raw as { durationMinutes?: unknown }).durationMinutes ??
        (raw as { duration_minutes?: unknown }).duration_minutes ??
        0,
    );
    const tripMinutesB =
      Number.isFinite(tripMRaw) && tripMRaw > 0 ? Math.max(0, tripMRaw) : routeQuote.route.durationMinutes;
    const waitMRaw = Number(
      (raw as { waitingMinutes?: unknown }).waitingMinutes ?? (raw as { waiting_minutes?: unknown }).waiting_minutes ?? 0,
    );
    const waitingMinutesB = Number.isFinite(waitMRaw) ? Math.max(0, waitMRaw) : 0;
    const paxRaw = Number((raw as { passengerCount?: unknown; passenger_count?: unknown }).passengerCount ?? (raw as { passenger_count?: unknown }).passenger_count);
    const passengerCountB = Number.isFinite(paxRaw) ? Math.max(1, Math.round(paxRaw)) : undefined;
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
    const fixedPriceAgreementAccepted =
      (raw as { fixedPriceAgreementAccepted?: unknown }).fixedPriceAgreementAccepted === true;

    let bookingPricing: ReturnType<typeof computeRideBookingPricing>;
    let serverPricingMode: string;

    if (rawPricingModeStr === "fixed_price") {
      if (!fixedPriceAgreementAccepted) {
        res.status(400).json({
          error: "fixed_price_agreement_required",
          message: "Bitte den Festpreis und die Fahrpreisvereinbarung bestätigen.",
        });
        return;
      }
      const fixedPricing = computeFixedPriceRideBookingPricing({
        opPayload,
        from: { displayName: fromFull, city: fromCityB || null },
        to: { displayName: toFull, city: toCityB || null },
        distanceKm: distanceKmB,
        tripMinutes: tripMinutesB,
        vehicle: vehicleB,
        at: atBooking,
      });
      if (!fixedPricing.ok) {
        res.status(400).json({ error: fixedPricing.error, message: fixedPricing.message });
        return;
      }
      bookingPricing = fixedPricing;
      serverPricingMode = "fixed_price";
    } else {
      bookingPricing = computeRideBookingPricing({
        opPayload,
        regions,
        fromFull,
        fromLat: fromLatB,
        fromLon: fromLonB,
        distanceKm: distanceKmB,
        tripMinutes: tripMinutesB,
        waitingMinutes: waitingMinutesB,
        vehicle: vehicleB,
        passengerCount: passengerCountB,
        at: atBooking,
      });
      serverPricingMode = bookingPricing.pricingMode;
    }
    const finalPriceB = bookingPricing.finalPrice;
    const snapB = bookingPricing.snapshot;
    if (
      rawPricingModeStr &&
      rawPricingModeStr !== serverPricingMode
    ) {
      res.status(400).json({ error: "pricing_mode_conflict" });
      return;
    }
    const clientFareRaw =
      (raw as { estimatedFare?: unknown }).estimatedFare ??
      (raw as { estimated_fare?: unknown }).estimated_fare;
    const fareMatch = assertClientEstimatedFareMatchesServer(clientFareRaw, finalPriceB);
    if (!fareMatch.ok) {
      const providedFareBreakdown =
        (raw as { fareBreakdown?: unknown; fare_breakdown?: unknown }).fareBreakdown ??
        (raw as { fare_breakdown?: unknown }).fare_breakdown ??
        null;
      const expectedFareBreakdown = {
        ...snapB.breakdown,
        finalPriceEur: finalPriceB,
      };
      const tolMismatch = bookingPriceToleranceEur(finalPriceB);
      console.warn("RIDES_ESTIMATE_MISMATCH", {
        providedEstimate: clientFareRaw ?? null,
        expectedEstimate: finalPriceB,
        toleranceEur: tolMismatch,
        distanceKm: distanceKmB,
        computedDistanceKm,
        tripMinutes: tripMinutesB,
        waitingMinutes: waitingMinutesB,
        providedFareBreakdown,
        expectedFareBreakdown,
        origin: fromFull,
        destination: toFull,
        fromLat: fromLatB,
        fromLon: fromLonB,
        toLat: toLatB,
        toLon: toLonB,
        scheduledAt: pickScheduledAtFromBody(raw as Partial<RideRequest> & Record<string, unknown>),
        pricingMode: rawPricingModeStr || null,
        vehicle: vehicleB,
      });
      res.status(400).json({ error: fareMatch.error });
      return;
    }
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
    if (scheduledAtNormalized !== null) {
      if (!isFarFutureReservation(scheduledAtNormalized)) {
        res.status(400).json({
          error: "reservation_lead_time_too_short",
          message:
            "Zeit zu knapp. Reservierungen sind erst ab 60 Minuten Vorlauf möglich. Bitte buche eine Sofortfahrt.",
        });
        return;
      }
      if (!isReservationWithinAdvanceWindow(scheduledAtNormalized)) {
        res.status(400).json({
          error: "reservation_too_far_in_advance",
          message: `Reservierungen sind maximal ${Math.round(RESERVATION_MAX_ADVANCE_MS / 86_400_000)} Tage im Voraus möglich.`,
        });
        return;
      }
    }
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
    if (process.env.NODE_ENV !== "production") {
      const rb = raw as Record<string, unknown>;
      console.log(
        "[RESNOTE] POST /rides raw.partnerBookingMeta / raw.partner_booking_meta:",
        rb.partnerBookingMeta ?? rb.partner_booking_meta,
      );
    }
    const medicalMeta = pickMedicalMeta(partnerMetaRaw);
    let normalizedPartnerMeta: Record<string, unknown> =
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
    if (serverPricingMode === "fixed_price") {
      normalizedPartnerMeta = {
        ...normalizedPartnerMeta,
        fixed_price_agreement_at: atBooking.toISOString(),
        fixed_price_agreed_eur: finalPriceB,
      };
    }
    if (rideKind === "medical") {
      if (medicalMeta.medical_demo_mode === true) {
        normalizedPartnerMeta.medical_demo_mode = true;
        normalizedPartnerMeta.medical_billing_demo_disclaimer = "TESTDOKUMENT / NICHT ZUR ABRECHNUNG";
        const insNow =
          typeof normalizedPartnerMeta.insurance_name === "string" ? normalizedPartnerMeta.insurance_name.trim() : "";
        const ccNow =
          typeof normalizedPartnerMeta.cost_center === "string" ? normalizedPartnerMeta.cost_center.trim() : "";
        if (!insNow) normalizedPartnerMeta.insurance_name = MEDICAL_DEMO_INSURANCE_LABEL;
        if (!ccNow) normalizedPartnerMeta.cost_center = MEDICAL_DEMO_COST_CENTER_LABEL;

        const demoSrcRaw = typeof medicalMeta.medical_demo_transport_source === "string" ? medicalMeta.medical_demo_transport_source : "";
        const demoSrc = demoSrcRaw.trim().toLowerCase();
        const wantsDriverUpload =
          demoSrc === "driver_upload" || demoSrc === "driver_test_upload" || demoSrc === "test_upload";

        if (wantsDriverUpload) {
          normalizedPartnerMeta.medical_demo_transport_source =
            demoSrc === "driver_test_upload" ? "driver_test_upload" : "driver_upload";
          const ds = loweredTrim(normalizedPartnerMeta.transport_document_status);
          if (!ds || ds === "missing") normalizedPartnerMeta.transport_document_status = "missing";
        } else {
          normalizedPartnerMeta.medical_demo_transport_source = demoSrcRaw.trim()
            ? demoSrcRaw.trim().slice(0, 48)
            : "synthetic_provided";
          normalizedPartnerMeta.transport_document_status = "provided";
          normalizedPartnerMeta.transport_document_provided_demo = true;
        }

        const appr = loweredTrim(normalizedPartnerMeta.approval_status);
        if (!appr || appr === "pending") normalizedPartnerMeta.approval_status = "approved";
      }
      const ready = calculateMedicalBillingReadiness(normalizedPartnerMeta);
      normalizedPartnerMeta.billing_ready = ready.billingReady;
      normalizedPartnerMeta.billing_missing_reasons = ready.missingReasons;
    }
    let medicalScanConsume: { scanId: string; passengerId: string } | null = null;
    const paymentMethodRaw = String((raw as { paymentMethod?: unknown }).paymentMethod ?? "").trim();
    const isKrankenkassePayment = paymentMethodRaw.toLowerCase().includes("krankenkasse");
    const requiresCustomerTransportScan =
      (rideKind === "medical" && normalizedPartnerMeta.medical_demo_mode !== true) ||
      (rideKind === "standard" && isKrankenkassePayment);
    if (requiresCustomerTransportScan) {
      const passengerIdForScan = String(raw.passengerId ?? "").trim();
      const customerMedicalScanId = parseCustomerMedicalScanIdFromBody(raw as Record<string, unknown>);
      if (!customerMedicalScanId) {
        res.status(422).json({ error: "medical_transport_scan_required" });
        return;
      }
      const scanBooking = await resolveCustomerMedicalScanForBooking({
        scanId: customerMedicalScanId,
        passengerId: passengerIdForScan,
      });
      if (!scanBooking.ok) {
        res.status(scanBooking.status).json({ error: scanBooking.error });
        return;
      }
      if (scanBooking.trafficLight === "red") {
        res.status(422).json({
          error: "medical_transport_scan_rejected",
          primaryReasonDe:
            scanBooking.meta.primaryReasonDe?.trim() ||
            scanBooking.meta.driverHintLines[0] ||
            null,
        });
        return;
      }
      const scanMetaJson = customerTransportScanMetaToPartnerJson(scanBooking.meta);
      if (rideKind === "medical") {
        normalizedPartnerMeta = {
          ...normalizedPartnerMeta,
          customer_transport_scan: scanMetaJson,
          transport_document_status: scanBooking.trafficLight === "green" ? "verified" : "uploaded",
          transport_document_recognition_status:
            scanBooking.trafficLight === "green" ? "recognized" : "unclear",
          transport_document_file_key: scanBooking.meta.storageKey,
          transport_document_uploaded_at: scanBooking.meta.scannedAt,
          approval_proof_mode: "customer_scan",
        };
        if (scanBooking.trafficLight === "green") {
          normalizedPartnerMeta.approval_status = "approved";
        }
        const readyAfterScan = calculateMedicalBillingReadiness(normalizedPartnerMeta);
        normalizedPartnerMeta.billing_ready = readyAfterScan.billingReady;
        normalizedPartnerMeta.billing_missing_reasons = readyAfterScan.missingReasons;
      } else {
        normalizedPartnerMeta = {
          ...normalizedPartnerMeta,
          customer_transport_scan: scanMetaJson,
        };
      }
      medicalScanConsume = { scanId: customerMedicalScanId, passengerId: passengerIdForScan };
    }
    const customerDriverNoteFromBody = extractCustomerDriverNoteFromRawBody(raw as Record<string, unknown>);
    if (customerDriverNoteFromBody) {
      normalizedPartnerMeta = { ...normalizedPartnerMeta, customer_driver_note: customerDriverNoteFromBody };
    }
    if (process.env.NODE_ENV !== "production") {
      console.log(
        "[RESNOTE] POST /rides normalizedPartnerMeta.customer_driver_note:",
        typeof normalizedPartnerMeta.customer_driver_note === "string"
          ? String(normalizedPartnerMeta.customer_driver_note).slice(0, 120)
          : "(none)",
      );
    }
    const newReq: RideRequest = {
      ...(raw as RideRequest),
      id: `REQ-${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: initialCustomerRideStatus(scheduledAtNormalized),
      scheduledAt: scheduledAtNormalized,
      rejectedBy: [],
      driverId: null,
      ...initialDispatchTierFieldsForRide(scheduledAtNormalized),
      customerPhone: customerPhoneClean || null,
      partnerBookingMeta: normalizedPartnerMeta,
      rideKind,
      payerKind,
      voucherCode: parseOptionalBillingTag(raw.voucherCode, 64),
      billingReference: parseOptionalBillingTag(raw.billingReference, 256),
      authorizationSource,
      accessCodeId: null,
      pricingMode: serverPricingMode,
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
    if (medicalScanConsume) {
      await markCustomerMedicalTransportScanConsumed(
        medicalScanConsume.scanId,
        medicalScanConsume.passengerId,
        created.id,
      );
    }
    const pcCreated = await resolveFinancePricingContextForRide(created, opPayload, regions);
    void upsertRideFinancialSnapshot({
      ride: created,
      pricingContext: pcCreated,
      reason: "ride_created",
    });
    const [withSummary] = await attachAccessCodeSummariesToRides([stripPartnerOnlyRideFields(created)]);
    void notifyMarketOnlineDriversInstantRideOffer(created);
    res.status(201).json(withSummary);
  } catch (e) {
    next(e);
  }
});


router.patch("/rides/:id/driver-note", requireCustomerSession, async (req, res, next) => {
  try {
    const sess = (req as CustomerSessionRequest).customerSession;
    if (!sess) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const { id } = req.params;
    const passengerId = customerPassengerId(sess);
    const cur = await findRideForPassenger(id, passengerId);
    if (!cur) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const editableStatuses = new Set<RideRequest["status"]>([
      "scheduled",
      "scheduled_assigned",
      "ready_for_dispatch",
      "accepted",
      "driver_arriving",
      "driver_waiting",
    ]);

    if (!editableStatuses.has(cur.status)) {
      res.status(409).json({ error: "driver_note_not_editable_for_status" });
      return;
    }
    if (cur.chatEnabled) {
      res.status(409).json({ error: "chat_active_use_chat" });
      return;
    }

    const rawNote = typeof req.body?.driverNote === "string" ? req.body.driverNote : "";
    const driverNote = rawNote.trim().slice(0, 500);

    const nextAccessibilityOptions = {
      ...(cur.accessibilityOptions && typeof cur.accessibilityOptions === "object" ? cur.accessibilityOptions : {}),
      driverNote: driverNote || null,
    };

    const currentPartnerMeta =
      cur.partnerBookingMeta && typeof cur.partnerBookingMeta === "object" && !Array.isArray(cur.partnerBookingMeta)
        ? (cur.partnerBookingMeta as Record<string, unknown>)
        : {};

    const nextPartnerBookingMeta = {
      ...currentPartnerMeta,
      customer_driver_note: driverNote || "",
    };

    const updated = await updateRide(
      id,
      {
        accessibilityOptions: nextAccessibilityOptions,
        partnerBookingMeta: nextPartnerBookingMeta,
      },
      { mutationActor: { actorType: "customer", actorId: passengerId } },
    );

    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const [withSummary] = await attachAccessCodeSummariesToRides([stripPartnerOnlyRideFields(updated)]);
    res.json(withSummary);
  } catch (e) {
    next(e);
  }
});

export async function patchRideStatusRoute(
  req: Request,
  res: import("express").Response,
  next: import("express").NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const { status, driverId, cancelReason, finalFarePlausibilityAck } = req.body as {
      status: unknown;
      driverId?: string;
      cancelReason?: string;
      finalFarePlausibilityAck?: unknown;
    };
    const plausibilityAck = finalFarePlausibilityAck === true;
    const parsedFinalFare = parseOptionalFinalFareFromBody(req.body);
    const parsedActualDistanceKm = typeof req.body?.actualDistanceKm === "number" && Number.isFinite(req.body.actualDistanceKm) && req.body.actualDistanceKm > 0 ? req.body.actualDistanceKm : undefined;
    const parsedActualDurationMinutes = typeof req.body?.actualDurationMinutes === "number" && Number.isInteger(req.body.actualDurationMinutes) && req.body.actualDurationMinutes > 0 ? req.body.actualDurationMinutes : undefined;
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

    /** Kein PATCH mit gleichem Endstatus nach Abschluss/Storno verarbeiten — vermeidet doppelte Finanzmutationen und 500 durch gesperrte Snapshots. */
    const TERMINAL_STATUS_REPLAY_SKIP: ReadonlySet<RideRequest["status"]> = new Set([
      "completed",
      "cancelled_by_customer",
      "cancelled_by_driver",
      "cancelled_by_system",
      "cancelled",
      "rejected",
      "expired",
    ]);
    if (cur.status === nextStatus && TERMINAL_STATUS_REPLAY_SKIP.has(nextStatus)) {
      res.json({
        ...stripPartnerOnlyRideFields(cur),
        cancelReason: customerCancelReasons.get(id) ?? null,
      });
      return;
    }

    if (!canTransitionRideStatus(cur.status, nextStatus)) {
      res.status(409).json({ error: "status_transition_invalid", from: cur.status, to: nextStatus });
      return;
    }
    const cancelReasonClean =
      typeof cancelReason === "string" && cancelReason.trim().length > 0
        ? cancelReason.trim()
        : "Storno durch Kunden-App (kein Grund übermittelt)";
    const bodyDriverIdTrim = typeof driverId === "string" ? driverId.trim() : "";
    const actor = await resolveRideMutateActor(req);
    const rideOriginKind = await getAdminCompanyKind(cur.companyId);
    const gate = authorizePatchRideStatusForActor(nextStatus, cur, actor, {
      bodyDriverId: bodyDriverIdTrim.length > 0 ? bodyDriverIdTrim : null,
      rideOriginCompanyKind: rideOriginKind,
    });
    if (!gate.ok) {
      if (gate.status === 401 && nextStatus === "cancelled_by_customer") {
        const bearer = extractBearerAuthorization(req);
        if (!bearer) {
          res.status(401).json({
            error: "unauthorized",
            hint: "Kunden-Storno erfordert Authorization: Bearer <session_jwt> (Google-Anmeldung).",
          });
          return;
        }
        if (!isSessionJwtConfigured()) {
          res.status(503).json({ error: "session_jwt_unconfigured" });
          return;
        }
        try {
          await verifySessionJwt(bearer);
        } catch {
          res.status(401).json({
            error: "invalid_token",
            hint: "Session abgelaufen — bitte erneut mit Google anmelden.",
          });
          return;
        }
      }
      res.status(gate.status).json({ error: gate.code });
      return;
    }

    const mutActor = mutationActorFromRideMutator(actor);

    await hydrateRideDriverLocationCache(id, driverLocations);
    const opsGuard = validateRideStatusTransition(cur, nextStatus, {
      rideId: id,
      body: req.body,
      driverLocations,
      parsedFinalFare,
    });
    if (!opsGuard.ok) {
      const fraudErrors = new Set([
        "pickup_geofence_failed",
        "driver_location_required",
        "trip_start_geofence_failed",
      ]);
      if (fraudErrors.has(opsGuard.error)) {
        void logRideAntiFraudAttempt(id, {
          eventType:
            nextStatus === "driver_waiting" ? "fake_arrival_attempt" : "trip_start_geofence_blocked",
          fromStatus: cur.status,
          targetStatus: nextStatus,
          actorType: mutActor.actorType,
          actorId: mutActor.actorId,
          error: opsGuard.error,
          details: opsGuard.details,
        });
      }
      res.status(opsGuard.status).json({
        error: opsGuard.error,
        message: opsGuard.message,
        ...(opsGuard.details ?? {}),
      });
      return;
    }

    if (
      nextStatus === "in_progress" &&
      cur.status !== "in_progress" &&
      rideRequiresPassengerPin(cur) &&
      !cur.passengerPinVerifiedAt
    ) {
      res.status(403).json({
        error: "passenger_pin_required",
        message:
          "Bitte zuerst den 4-stelligen Code vom Fahrgast eingeben. Ohne Bestätigung kann die Fahrt nicht gestartet werden.",
        passengerPinRequired: true,
        passengerPinVerified: false,
      });
      return;
    }

    // Nur Kunden-Storno im Kurzfrist-Fenster sperren. Fahrer dürfen immer stornieren
    // (bei Spät-Storno: 24h-Sperre über driver-cancel / hard-cancel).
    if (
      nextStatus === "cancelled_by_customer" &&
      actor &&
      actor.kind !== "admin" &&
      isReservationCustomerDriverStornoLocked(cur.scheduledAt)
    ) {
      const ms = msUntilScheduledPickup(cur.scheduledAt);
      res.status(403).json({
        error: "reservation_storno_locked",
        message:
          "Bei Vorbestellungen ist ein Storno durch den Kunden nur bis 60 Minuten vor der geplanten Abholzeit möglich.",
        minutesUntilPickupApprox: ms == null ? null : Math.round(ms / 60000),
      });
      return;
    }

    const isReservationPremiumActivation =
      (nextStatus === "searching_driver" ||
        (nextStatus === "ready_for_dispatch" && cur.status === "scheduled_assigned")) &&
      (cur.status === "scheduled_assigned" || cur.status === "scheduled") &&
      cur.scheduledAt != null;

    if (isReservationPremiumActivation) {
      if (actor && actor.kind !== "admin") {
        const pickupMs = new Date(cur.scheduledAt).getTime();
        if (!Number.isFinite(pickupMs)) {
          res.status(409).json({ error: "reservation_activation_invalid_schedule" });
          return;
        }
        const minsUntil = (pickupMs - Date.now()) / 60000;
        if (!isWithinManualReservationActivationWindow(minsUntil)) {
          res.status(409).json({
            error: "reservation_activation_window",
            message: `Aktivierung nur zwischen ${DEFAULT_RESERVATION_MANUAL_ACTIVATION_DEADLINE_MINUTES_REMAINING} und ${DEFAULT_RESERVATION_MANUAL_ACTIVATION_OPENS_MINUTES} Minuten vor Abholzeit möglich (20 Min. Fenster).`,
            minutesUntilPickupApprox: Math.round(minsUntil),
          });
          return;
        }
      }

      const { activateReservationsForPremiumDispatch } = await import("../jobs/reservationLifecycle.js");
      const activated = await activateReservationsForPremiumDispatch([id], new Date());
      if (activated.length === 0) {
        res.status(409).json({ error: "reservation_activation_failed" });
        return;
      }
      const activatedRide = await findRide(id);
      if (!activatedRide) {
        res.status(500).json({ error: "update_failed" });
        return;
      }
      await insertSupplementalRideEvent(id, {
        eventType: "reservation_dispatch_activated",
        fromStatus: cur.status,
        toStatus: "searching_driver",
        actorType: mutActor.actorType,
        actorId: mutActor.actorId,
        payload: { source: "manual_or_api" },
      });
      res.json({
        ...stripPartnerOnlyRideFields(activatedRide),
        cancelReason: customerCancelReasons.get(id) ?? null,
      });
      return;
    }

    let companyIdOnAccept: string | undefined;
    let fleetDriverCapabilityCompanyId: string | undefined;
    if (nextStatus === "accepted" && bodyDriverIdTrim) {
      const driverAuth = await findFleetDriverAuthRow(driverId);
      const driverCompanyId = (driverAuth?.company_id ?? "").trim();
      if (!driverCompanyId) {
        res.status(409).json({
          error: "ride_not_assignable",
          message: "Fahrt/Fahrer konnten keinem Unternehmen zugeordnet werden.",
        });
        return;
      }
      fleetDriverCapabilityCompanyId = fleetDriverCompanyIdForRideCapability({
        rideCompanyId: cur.companyId,
        rideOriginCompanyKind: rideOriginKind,
        driverCompanyId,
      });
      const capabilityCompanyId = fleetDriverCapabilityCompanyId;
      const readinessR = await getFleetDriverReadinessById(bodyDriverIdTrim, capabilityCompanyId);
      if (!("error" in readinessR) && !readinessR.ready) {
        res.status(409).json({
          error: "driver_not_einsatzbereit",
          blockReasons: readinessR.blockReasons,
          message: "Fahrer ist derzeit nicht einsatzbereit (Unternehmen, Konto gesperrt oder abgelehnt).",
        });
        return;
      }
      const marketOnline = await getFleetDriverMarketOnline(bodyDriverIdTrim, capabilityCompanyId);
      const acceptingOpenReservation = cur.status === "scheduled";
      if (!marketOnline && !acceptingOpenReservation) {
        res.status(409).json({
          error: "driver_market_offline",
          message: "Fahrer ist offline — Annahme am Auftragsmarkt nicht möglich.",
        });
        return;
      }
      const capability = await getFleetDriverCapability(bodyDriverIdTrim, capabilityCompanyId);
      if (!capability || !isRideCompatibleWithCapability(cur, capability)) {
        res.status(409).json({
          error: "no_matching_vehicle_available",
          message: "Aktuell kein passendes Fahrzeug verfügbar",
        });
        return;
      }
      if (cur.rideKind === "medical") {
        const medicalAuthz = await assertMedicalTransportAuthorizedForFleetDriver(
          capabilityCompanyId,
          bodyDriverIdTrim,
        );
        if (!medicalAuthz.ok) {
          res.status(403).json({
            error: MEDICAL_TRANSPORT_NOT_AUTHORIZED,
            message: "Krankenfahrten für dieses Unternehmen oder diesen Fahrer sind nicht freigeschaltet.",
          });
          return;
        }
        const kkAuthz = await assertKkModuleAccessForFleetDriver(capabilityCompanyId, bodyDriverIdTrim);
        if (!kkAuthz.ok) {
          res.status(403).json(kkModuleDeniedJson(kkAuthz.error));
          return;
        }
      }
      companyIdOnAccept = (cur.companyId ?? "").trim() || driverCompanyId;
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
      const preTripComplete = cur.status === "accepted" || cur.status === "driver_arriving" || cur.status === "driver_waiting";
      if (preTripComplete) {
        if (parsedFinalFare !== undefined && parsedFinalFare > 0.009) {
          res.status(400).json({
            error: "complete_without_trip_start",
            message:
              "Ohne Fahrtbeginn zum Ziel ist kein Fahrpreis zulässig. Bitte 0,00 € oder die Fahrt stornieren.",
          });
          return;
        }
        finalFareForPatch = 0;
      } else if (cur.status === "passenger_onboard") {
        if (parsedFinalFare !== undefined && parsedFinalFare > 0.009) {
          res.status(400).json({
            error: "complete_trip_not_started",
            message: "Bitte die Fahrt zum Ziel starten, bevor ein Fahrpreis abgerechnet wird.",
          });
          return;
        }
        finalFareForPatch =
          parsedFinalFare !== undefined && Number.isFinite(parsedFinalFare) ? parsedFinalFare : 0;
      } else if (isRideFixedPrice(cur.pricingMode)) {
        const agreed = resolveFixedPriceAgreedEur(cur);
        if (agreed == null) {
          res.status(400).json({
            error: "fixed_price_amount_missing",
            message: "Der vereinbarte Festpreis fehlt. Abschluss nicht möglich.",
          });
          return;
        }
        finalFareForPatch = agreed;
      } else {
        // in_progress → completed: finalFare vom Fahrer ist Pflicht (Taxameter)
        if (parsedFinalFare === undefined || !Number.isFinite(parsedFinalFare) || parsedFinalFare < 0) {
          res.status(400).json({
            error: "final_fare_required",
            message: "Bitte den Taxameter-Endpreis eingeben, bevor die Fahrt abgeschlossen wird.",
          });
          return;
        }
        const plausibility = evaluateFinalFarePlausibility(cur.estimatedFare ?? 0, parsedFinalFare);
        if (!plausibility.ok && !plausibilityAck) {
          res.status(400).json({
            error: "final_fare_plausibility_failed",
            message: `Der eingegebene Preis weicht stark von der Schätzung (${Number(cur.estimatedFare ?? 0).toFixed(2)} €) ab. Max. ohne Bestätigung: ${plausibility.maxAllowedEur.toFixed(2)} €. Taxameter-Preis erneut prüfen oder bestätigen.`,
            estimatedFareEur: cur.estimatedFare ?? null,
            maxAllowedFinalFareEur: plausibility.maxAllowedEur,
            ratio: plausibility.ratio,
          });
          return;
        }
        const waitingSurcharge = Number(cur.waitingChargeEur ?? 0);
        finalFareForPatch =
          Math.round((parsedFinalFare + (Number.isFinite(waitingSurcharge) ? waitingSurcharge : 0) + Number.EPSILON) * 100) /
          100;
      }
    }

    let tripStartWaitingPatch: Partial<RideRequest> = {};
    if (nextStatus === "in_progress" && cur.status !== "in_progress") {
      const opW = await getOperationalConfigPayload();
      const br =
        opW.bookingRules && typeof opW.bookingRules === "object" && !Array.isArray(opW.bookingRules)
          ? (opW.bookingRules as Record<string, unknown>)
          : {};
      const w = computeWaitingChargeForRide(cur.driverWaitingStartedAt, br);
      tripStartWaitingPatch = {
        driverTripStartedAt: new Date().toISOString(),
        waitingMinutesBilled: w.waitingMinutesBilled,
        waitingChargeEur: w.waitingChargeEur,
      };
    }

    let gpsActualPatch: Partial<Pick<RideRequest, "actualDistanceKm" | "actualDurationMinutes">> = {};
    if (nextStatus === "completed") {
      const completionGpsMetrics = await computeRideCompletionGpsMetrics(id, cur, tripStartWaitingPatch);
      if (completionGpsMetrics) {
        gpsActualPatch = {
          actualDistanceKm: completionGpsMetrics.distanceKm,
          actualDurationMinutes: completionGpsMetrics.durationMinutes,
        };
      }

      if (
        cur.status === "in_progress" &&
        finalFareForPatch != null &&
        Number.isFinite(finalFareForPatch) &&
        finalFareForPatch > 0.009
      ) {
        const transportGuard = evaluateMinimumTransportForPositiveFare(
          completionGpsMetrics,
          finalFareForPatch,
        );
        if (!transportGuard.ok) {
          res.status(400).json({
            error: transportGuard.error,
            message: transportGuard.message,
            actualDistanceKm: transportGuard.actualDistanceKm,
            actualDurationMinutes: transportGuard.actualDurationMinutes,
          });
          return;
        }
      }
    }

    let finalFarePlausibilityAudit:
      | { flagged: boolean; estimatedFareEur: number; finalFareEur: number; acknowledged: boolean }
      | null = null;
    if (
      nextStatus === "completed" &&
      cur.status === "in_progress" &&
      finalFareForPatch != null &&
      Number.isFinite(finalFareForPatch)
    ) {
      const pl = evaluateFinalFarePlausibility(cur.estimatedFare ?? 0, finalFareForPatch);
      if (plausibilityAck || (pl.ok && pl.flagged)) {
        finalFarePlausibilityAudit = {
          flagged: !pl.ok || pl.flagged,
          estimatedFareEur: Number(cur.estimatedFare ?? 0),
          finalFareEur: finalFareForPatch,
          acknowledged: plausibilityAck,
        };
      }
    }

    const atomicAccept =
      nextStatus === "accepted" &&
      bodyDriverIdTrim.length > 0 &&
      actor &&
      actor.kind !== "customer_session";

    let updated: RideRequest | null = null;

    if (atomicAccept) {
      const claimed = await tryFleetAcceptRideAtomic({
        rideId: id,
        driverId: bodyDriverIdTrim,
        fleetDriverCompanyId: fleetDriverCapabilityCompanyId ?? "",
      });
      if (!claimed.ok) {
        if (claimed.reason === "ride_already_claimed") {
          res.status(409).json({
            error: "ride_already_claimed",
            message: "Die Fahrt wurde bereits angenommen.",
          });
          return;
        }
        if (claimed.reason === "no_matching_vehicle") {
          res.status(409).json({
            error: "no_matching_vehicle_available",
            message: "Aktuell kein passendes Fahrzeug verfügbar",
          });
          return;
        }
        res.status(404).json({ error: "not found" });
        return;
      }
      await applyRideMutationPersistence(id, claimed.previous, claimed.ride, mutActor);
      updated = claimed.ride;
      void markDispatchOfferAccepted(bodyDriverIdTrim, id);
    } else {
      updated = await updateRide(
        id,
        {
          status: nextStatus,
          ...(finalFareForPatch !== undefined ? { finalFare: finalFareForPatch } : {}),
          ...(nextStatus === "completed" && gpsActualPatch.actualDistanceKm != null
            ? {
                actualDistanceKm: gpsActualPatch.actualDistanceKm,
                actualDurationMinutes: gpsActualPatch.actualDurationMinutes,
              }
            : {
                ...(parsedActualDistanceKm !== undefined ? { actualDistanceKm: parsedActualDistanceKm } : {}),
                ...(parsedActualDurationMinutes !== undefined
                  ? { actualDurationMinutes: parsedActualDurationMinutes }
                  : {}),
              }),
          ...(driverId != null ? { driverId } : {}),
          ...(companyIdOnAccept != null ? { companyId: companyIdOnAccept } : {}),
          ...(nextStatus === "driver_waiting" && cur.status !== "driver_waiting"
            ? { driverWaitingStartedAt: new Date().toISOString() }
            : {}),
          ...tripStartWaitingPatch,
        },
        { mutationActor: mutActor },
      );
      if (!updated) {
        res.status(500).json({ error: "update_failed" });
        return;
      }
      if (nextStatus === "accepted" && bodyDriverIdTrim) {
        void markDispatchOfferAccepted(bodyDriverIdTrim, id);
      }
    }
    const driverAcceptedOpenRide =
      bodyDriverIdTrim &&
      updated &&
      updated.driverId === bodyDriverIdTrim &&
      (updated.status === "accepted" || updated.status === "scheduled_assigned") &&
      (cur.status !== updated.status || (cur.driverId ?? "").trim() !== bodyDriverIdTrim);
    if (driverAcceptedOpenRide) {
      const resetCo = (fleetDriverCapabilityCompanyId ?? companyIdOnAccept ?? updated.companyId ?? "").trim();
      if (resetCo) {
        void resetFleetDriverDispatchRejectStreak(bodyDriverIdTrim, resetCo).catch(() => undefined);
      }
      if (updated) {
        updated = await applyRideChatOnFleetDriverAccept({
          ride: updated,
          driverId: bodyDriverIdTrim,
          fleetDriverCompanyId: fleetDriverCapabilityCompanyId,
          actor: { actorType: mutActor.actorType, actorId: mutActor.actorId },
        });
      }
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
            ? {
                actorType: "passenger" as const,
                actorId:
                  actor?.kind === "customer_session" ? actor.passengerGoogleId : (null as string | null),
              }
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
    if (
      nextStatus === "cancelled_by_customer" ||
      nextStatus === "cancelled_by_driver" ||
      nextStatus === "cancelled_by_system" ||
      nextStatus === "cancelled"
    ) {
      const opPayloadCf = await getOperationalConfigPayload();
      const regionsCf = await listServiceRegionsForApi();
      const pcCf = await resolveFinancePricingContextForRide(updated, opPayloadCf, regionsCf);
      const financeCf = await upsertRideFinancialSnapshot({
        ride: updated,
        pricingContext: pcCf,
        reason: `ride_status_${nextStatus}`,
        actorType: mutActor.actorType,
        actorId: mutActor.actorId,
      });
      if (!financeCf.ok) {
        res.status(500).json({ error: financeCf.error });
        return;
      }
    }

    let driverSettlement: {
      grossAmount: number;
      commissionRate: number;
      commissionRatePercent: number;
      commissionAmount: number;
      driverPayoutAmount: number;
    } | null = null;
    if (finalFarePlausibilityAudit) {
      await insertSupplementalRideEvent(id, {
        eventType: "final_fare_plausibility",
        fromStatus: cur.status,
        toStatus: nextStatus,
        actorType: mutActor.actorType,
        actorId: mutActor.actorId,
        payload: finalFarePlausibilityAudit,
      });
    }
    if (nextStatus === "completed") {
      const opPayloadComplete = await getOperationalConfigPayload();
      const regionsComplete = await listServiceRegionsForApi();
      const pcComplete = await resolveFinancePricingContextForRide(
        updated,
        opPayloadComplete,
        regionsComplete,
      );
      const finance = await upsertRideFinancialSnapshot({
        ride: updated,
        pricingContext: pcComplete,
        reason: "ride_completed_status_transition",
        actorType: mutActor.actorType,
        actorId: mutActor.actorId,
        forceRecalc: true, // Taxameter-Endpreis muss Finance überschreiben
      });
      if (!finance.ok) {
        res.status(500).json({ error: finance.error });
        return;
      }

      const finalFareEur = Number(updated.finalFare ?? 0);
      const payoutSnap = computeDriverRidePayoutSnap(finalFareEur);
      if (payoutSnap) {
        const withPayout = await updateRide(
          id,
          {
            provisionAmount: payoutSnap.provisionAmount,
            payoutAmount: payoutSnap.payoutAmount,
          },
          { mutationActor: mutActor },
        );
        if (withPayout) updated = withPayout;
        driverSettlement = {
          grossAmount: Math.round((Math.max(0, finalFareEur) + Number.EPSILON) * 100) / 100,
          commissionRate: payoutSnap.provisionRate,
          commissionRatePercent: Math.round(payoutSnap.provisionRate * 1000) / 10,
          commissionAmount: payoutSnap.provisionAmount,
          driverPayoutAmount: payoutSnap.payoutAmount,
        };
      }

      const captureOutcome = await captureRideStripePaymentIntent(updated);
      if (!captureOutcome.ok) {
        logger.warn(
          { rideId: id, error: captureOutcome.error },
          "[Stripe] capture after ride completed failed",
        );
        await insertSupplementalRideEvent(id, {
          eventType: "stripe_capture_failed",
          fromStatus: cur.status,
          toStatus: nextStatus,
          actorType: mutActor.actorType,
          actorId: mutActor.actorId,
          payload: { error: captureOutcome.error },
        });
      } else if (!captureOutcome.skipped) {
        await insertSupplementalRideEvent(id, {
          eventType: "stripe_capture_succeeded",
          fromStatus: cur.status,
          toStatus: nextStatus,
          actorType: mutActor.actorType,
          actorId: mutActor.actorId,
          payload: {
            capturedAmountCents: captureOutcome.capturedAmountCents,
            cappedToAuthorization: captureOutcome.cappedToAuthorization,
          },
        });
      }
    }
    if (nextStatus === "completed" || nextStatus === "cancelled_by_driver" || nextStatus === "cancelled" || nextStatus === "cancelled_by_system") {
      customerCancelReasons.delete(id);
    }
    if (updated.status === "scheduled_assigned" && cur.status === "scheduled") {
      const pid = (updated.passengerId ?? "").trim();
      if (pid) {
        const marked = await tryMarkCustomerReservationAssignedPushSent(id);
        if (marked) void notifyPassengerReservationConfirmed(pid, id);
      }
    }
    if (nextStatus === "accepted" && cur.status !== "accepted") {
      const pid = (updated.passengerId ?? "").trim();
      if (pid) void notifyPassengerDriverAccepted(pid, updated.id);
    }
    if (nextStatus === "driver_arriving" && cur.status !== "driver_arriving") {
      const pid = (updated.passengerId ?? "").trim();
      if (pid) void notifyPassengerDriverArriving(pid, updated.id);
    }
    if (nextStatus === "driver_waiting" && cur.status !== "driver_waiting") {
      const pid = (updated.passengerId ?? "").trim();
      if (pid) void notifyPassengerDriverWaiting(pid, updated.id);
    }
    if (nextStatus === "in_progress" && cur.status !== "in_progress") {
      const pid = (updated.passengerId ?? "").trim();
      if (pid) void notifyPassengerRideInProgress(pid, updated.id);
    }
    if (nextStatus === "completed" && cur.status !== "completed") {
      const pid = (updated.passengerId ?? "").trim();
      if (pid) void notifyPassengerRideCompleted(pid, updated.id);
      const fleetDriverId = (updated.driverId ?? "").trim();
      const companyId = (updated.companyId ?? "").trim();
      if (fleetDriverId && companyId) {
        const bodyLat = typeof req.body?.driverLat === "number" ? req.body.driverLat : NaN;
        const bodyLon = typeof req.body?.driverLon === "number" ? req.body.driverLon : NaN;
        const cached = driverLocations.get(id);
        const lat = Number.isFinite(bodyLat)
          ? bodyLat
          : cached && Number.isFinite(cached.lat)
            ? cached.lat
            : updated.toLat != null && Number.isFinite(updated.toLat)
              ? updated.toLat
              : NaN;
        const lon = Number.isFinite(bodyLon)
          ? bodyLon
          : cached && Number.isFinite(cached.lon)
            ? cached.lon
            : updated.toLon != null && Number.isFinite(updated.toLon)
              ? updated.toLon
              : NaN;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          void (async () => {
            const offer = await findFollowUpOfferForDriver({
              fleetDriverId,
              companyId,
              lat,
              lon,
              excludeRideId: updated.id,
              lastRideId: updated.id,
            });
            if (offer) {
              void notifyDriverFollowUpOffer(fleetDriverId, companyId, offer.ride, offer.distanceKm);
            }
          })();
        }
      }
    }
    if (nextStatus === "expired" && cur.status !== "expired") {
      const pid = (updated.passengerId ?? "").trim();
      if (pid && shouldNotifyPassengerReservationExpired(cur.status)) {
        void notifyPassengerReservationExpired(pid, updated.id);
      }
    }
    if (nextStatus === "cancelled_by_system") {
      const pid = (updated.passengerId ?? "").trim();
      if (pid) void notifyPassengerRideCancelledBySystem(pid, updated.id);
    }

    if (shouldReleaseStripeAuthorizationOnRideStatus(nextStatus) && cur.status !== nextStatus) {
      const releaseOutcome = await cancelRideStripePaymentAuthorization(updated);
      if (!releaseOutcome.ok) {
        logger.warn(
          { rideId: id, error: releaseOutcome.error },
          "[Stripe] release authorization on cancel failed",
        );
      } else if (releaseOutcome.canceled) {
        await insertSupplementalRideEvent(id, {
          eventType: "stripe_authorization_released",
          fromStatus: cur.status,
          toStatus: nextStatus,
          actorType: mutActor.actorType,
          actorId: mutActor.actorId,
          payload: {},
        });
      }
    }

    if (cur.status !== nextStatus) {
      broadcastRideStatusChange(id, nextStatus, cur.status);
      if (nextStatus === "cancelled_by_customer") {
        const fleetDriverId = (updated.driverId ?? cur.driverId ?? "").trim();
        const companyId = (updated.companyId ?? cur.companyId ?? "").trim();
        if (fleetDriverId && companyId) {
          void notifyDriverRideCancelledByCustomer(fleetDriverId, companyId, id).catch(() => undefined);
        }
      }
    }

    const opsEv = supplementalEventForTransition(cur.status, nextStatus);
    if (opsEv && cur.status !== nextStatus) {
      void insertSupplementalRideEvent(id, {
        eventType: opsEv.eventType,
        fromStatus: cur.status,
        toStatus: nextStatus,
        actorType: mutActor.actorType,
        actorId: mutActor.actorId,
        payload: {
          ...(opsEv.payload ?? {}),
          estimatedFare: cur.estimatedFare ?? null,
          finalFare: updated.finalFare ?? null,
        },
      });
    }

    res.json({
      ...stripPartnerOnlyRideFields(updated),
      cancelReason: customerCancelReasons.get(id) ?? null,
      ...(driverSettlement
        ? {
            driverSettlement: {
              grossAmount: driverSettlement.grossAmount,
              commissionRate: driverSettlement.commissionRate,
              commissionRatePercent: driverSettlement.commissionRatePercent,
              commissionAmount: driverSettlement.commissionAmount,
              driverPayoutAmount: driverSettlement.driverPayoutAmount,
            },
          }
        : {}),
    });
  } catch (e) {
    next(e);
  }
}

export type CustomerRideCancelResult =
  | { ok: true; ride: RideRequest; cancelReason: string }
  | {
      ok: false;
      status: number;
      error: string;
      message?: string;
      from?: string;
      to?: string;
    };

/** Storno durch verifizierte Kunden-Session (z. B. PATCH /customer/v1/rides/:id/cancel). */
export async function cancelRideForVerifiedCustomerSession(
  passengerGoogleId: string,
  rideId: string,
  cancelReason: string,
  parsedFinalFare?: number,
): Promise<CustomerRideCancelResult> {
  const id = rideId.trim();
  const pax = passengerGoogleId.trim();
  const cancelReasonClean =
    cancelReason.trim() || "Storno durch Kunden-App (kein Grund übermittelt)";
  if (!id || !pax) return { ok: false, status: 400, error: "ride_id_required" };

  const cur = await findRideForPassenger(id, pax);
  if (!cur) return { ok: false, status: 404, error: "not_found" };

  const nextStatus = "cancelled_by_customer" as const;
  if (cur.status === nextStatus) {
    return {
      ok: true,
      ride: cur,
      cancelReason: customerCancelReasons.get(id) ?? cancelReasonClean,
    };
  }

  if (!canTransitionRideStatus(cur.status, nextStatus)) {
    return {
      ok: false,
      status: 409,
      error: "status_transition_invalid",
      from: cur.status,
      to: nextStatus,
    };
  }

  if (isReservationCustomerDriverStornoLocked(cur.scheduledAt)) {
    return {
      ok: false,
      status: 403,
      error: "reservation_storno_locked",
      message:
        "Bei Vorbestellungen ist ein Storno durch den Kunden nur bis 60 Minuten vor der geplanten Abholzeit möglich.",
    };
  }

  const mutActor: RideMutationPersistenceActor = { actorType: "passenger", actorId: pax };
  let finalFareForPatch: number | undefined = parsedFinalFare;
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
  if (ev.feeEur > 0) {
    const chosen = parsedFinalFare !== undefined ? parsedFinalFare : ev.feeEur;
    if (chosen < ev.feeEur - 1e-9) {
      return {
        ok: false,
        status: 400,
        error: "cancel_fee_too_low",
        message: `Für dieses Storno ist mindestens ${ev.feeEur.toFixed(2)} EUR als Endpreis vorgesehen.`,
      };
    }
    const cap = Math.max(cur.estimatedFare ?? 0, ev.feeEur);
    finalFareForPatch = Math.min(Math.max(chosen, ev.feeEur), cap);
  }

  const updated = await updateRide(
    id,
    {
      status: nextStatus,
      ...(finalFareForPatch !== undefined ? { finalFare: finalFareForPatch } : {}),
    },
    { mutationActor: mutActor },
  );
  if (!updated) return { ok: false, status: 500, error: "update_failed" };

  await insertSupplementalRideEvent(id, {
    eventType: "cancel_reason",
    fromStatus: cur.status,
    toStatus: nextStatus,
    actorType: "passenger",
    actorId: pax,
    payload: {
      reason: cancelReasonClean,
      nextStatus,
      cancellationFeeEur: ev.feeEur,
      cancellationFeeRule: ev.reason,
      appliedFinalFareEur: finalFareForPatch ?? null,
    },
  });
  customerCancelReasons.set(id, cancelReasonClean);

  const opPayloadCf = await getOperationalConfigPayload();
  const regionsCf = await listServiceRegionsForApi();
  const pcCf = await resolveFinancePricingContextForRide(updated, opPayloadCf, regionsCf);
  const financeCf = await upsertRideFinancialSnapshot({
    ride: updated,
    pricingContext: pcCf,
    reason: `ride_status_${nextStatus}`,
    actorType: mutActor.actorType,
    actorId: mutActor.actorId,
  });
  if (!financeCf.ok) return { ok: false, status: 500, error: financeCf.error };

  if (cur.status !== nextStatus) {
    broadcastRideStatusChange(id, nextStatus, cur.status);
    const fleetDriverId = (updated.driverId ?? cur.driverId ?? "").trim();
    const companyId = (updated.companyId ?? cur.companyId ?? "").trim();
    if (fleetDriverId && companyId) {
      void notifyDriverRideCancelledByCustomer(fleetDriverId, companyId, id).catch(() => undefined);
    }
  }

  void evaluateCustomerCancellationSuspensionAfterCancel(pax).catch(() => undefined);

  return { ok: true, ride: updated, cancelReason: cancelReasonClean };
}

router.patch("/rides/:id/status", patchRideStatusRoute);

router.post("/rides/:id/driver-location", async (req, res, next) => {
  try {
    const fleet = await resolveFleetActorOrNull(req);
    if (!fleet) {
      res.status(401).json({ error: "unauthorized", hint: "Fleet driver Bearer token required." });
      return;
    }
    const { id } = req.params;
    const ride = await findRide(id);
    if (!ride || (ride.driverId ?? "").trim() !== fleet.fleetDriverId) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const { lat, lon } = req.body as { lat: number; lon: number };
    if (typeof lat !== "number" || typeof lon !== "number") {
      res.status(400).json({ error: "lat and lon required" });
      return;
    }
    const navExtras = driverNavExtrasFromBody(req.body);
    const persisted = await persistDriverLocationPing({
      rideId: id,
      fleetDriverId: fleet.fleetDriverId,
      lat,
      lon,
      rideStatus: ride.status,
    });
    const loc: DriverLocation = mergeDriverLocationExtras(
      persisted ?? {
        lat,
        lon,
        updatedAt: new Date().toISOString(),
      },
      navExtras,
    );
    driverLocations.set(id, loc);
    void maybeNotifyPassengerPickupEtaFromDriverLocation(ride, lat, lon, navExtras.etaMinutes).catch(
      () => undefined,
    );
    res.json(loc);
  } catch (e) {
    next(e);
  }
});

router.get("/rides/:id/driver-location", async (req, res, next) => {
  try {
    const { id } = req.params;
    const ride = await findRide(id);
    if (!ride) {
      res.status(404).json({ error: "not found" });
      return;
    }
    let loc = driverLocations.get(id) ?? null;
    if (!loc) {
      const dbLoc = await getRideDriverLocation(id);
      if (dbLoc) {
        loc = { lat: dbLoc.lat, lon: dbLoc.lon, updatedAt: dbLoc.updatedAt };
        driverLocations.set(id, loc);
      }
    }
    if (!loc) {
      res.status(404).json({ error: "no location yet" });
      return;
    }
    const fleet = await resolveFleetActorOrNull(req);
    const cust = await resolveCustomerActorOrNull(req);
    const panel = await resolvePanelActorOrNull(req);
    const assignedDriver = (ride.driverId ?? "").trim();
    const allowedFleet =
      fleet != null && assignedDriver !== "" && assignedDriver === fleet.fleetDriverId;
    const allowedPassenger = cust != null && passengerOwnsRide(ride, cust.passengerGoogleId);
    const rideCompanyId = (ride.companyId ?? "").trim();
    const allowedPanel =
      panel != null && rideCompanyId !== "" && rideCompanyId === panel.companyId.trim();
    if (!allowedFleet && !allowedPassenger && !allowedPanel) {
      res.status(401).json({
        error: "unauthorized",
        hint: "Fleet driver token, passenger session, or partner panel JWT (same company) required.",
      });
      return;
    }
    res.json(loc);
  } catch (e) {
    next(e);
  }
});

function passengerOwnsRide(ride: RideRequest, passengerGoogleId: string): boolean {
  return (ride.passengerId ?? "").trim() === passengerGoogleId.trim();
}

router.post("/rides/:id/customer-location", async (req, res, next) => {
  try {
    const cust = await resolveCustomerActorOrNull(req);
    if (!cust) {
      res.status(401).json({ error: "unauthorized", hint: "Customer session Bearer required." });
      return;
    }
    const { id } = req.params;
    const ride = await findRide(id);
    if (!ride || !passengerOwnsRide(ride, cust.passengerGoogleId)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const { lat, lon } = req.body as { lat: number; lon: number };
    if (typeof lat !== "number" || typeof lon !== "number") {
      res.status(400).json({ error: "lat and lon required" });
      return;
    }
    const loc: DriverLocation = { lat, lon, updatedAt: new Date().toISOString() };
    customerLocations.set(id, loc);
    res.json(loc);
  } catch (e) {
    next(e);
  }
});

router.get("/rides/:id/customer-location", async (req, res, next) => {
  try {
    const fleet = await resolveFleetActorOrNull(req);
    const { id } = req.params;
    const ride = await findRide(id);
    const loc = customerLocations.get(id);
    if (!loc) {
      res.status(404).json({ error: "no location yet" });
      return;
    }
    const assignedDriver = ride ? (ride.driverId ?? "").trim() : "";
    if (!fleet || !assignedDriver || fleet.fleetDriverId !== assignedDriver) {
      res.status(401).json({ error: "unauthorized", hint: "Assigned fleet driver Bearer required." });
      return;
    }
    res.json(loc);
  } catch (e) {
    next(e);
  }
});

router.post("/rides/:id/reject", requireFleetDriverAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const driverIdRaw = (req.body as { driverId?: unknown }).driverId;
    const driverId = typeof driverIdRaw === "string" ? driverIdRaw.trim() : "";
    const authFleet = (req as FleetDriverAuthRequest).fleetDriverAuth?.fleetDriverId;
    if (!driverId || !authFleet || driverId !== authFleet) {
      res.status(403).json({ error: "driver_actor_mismatch" });
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
    const updated = await updateRide(id, { rejectedBy }, { mutationActor: { actorType: "driver", actorId: driverId } });
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
      const authCompany = (req as FleetDriverAuthRequest).fleetDriverAuth?.companyId?.trim() ?? "";
      if (authCompany) {
        const streakResult = await recordFleetDriverOfferRejectStreak(driverId, authCompany);
        if (streakResult.downgraded) {
          await insertSupplementalRideEvent(id, {
            eventType: "driver_dispatch_priority_downgraded",
            fromStatus: cur.status,
            toStatus: cur.status,
            actorType: "system",
            actorId: driverId,
            payload: {
              driverId,
              streak: streakResult.streak,
              newPriority: streakResult.priority,
            },
          });
        }
      }
    }
    res.json(stripPartnerOnlyRideFields(updated));
  } catch (e) {
    next(e);
  }
});

router.post("/rides/:id/driver-cancel", requireFleetDriverAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const driverIdRaw = (req.body as { driverId?: unknown }).driverId;
    const driverFromBody = typeof driverIdRaw === "string" ? driverIdRaw.trim() : "";
    const authFleet = (req as FleetDriverAuthRequest).fleetDriverAuth?.fleetDriverId;
    if (!authFleet) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const driverId = driverFromBody || authFleet;
    if (driverFromBody && driverFromBody !== authFleet) {
      res.status(403).json({ error: "driver_actor_mismatch" });
      return;
    }
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
    const updated = await updateRide(
      id,
      {
        status: revertStatus,
        driverId: null,
        rejectedBy,
      },
      { mutationActor: { actorType: "driver", actorId: driverId } },
    );
    if (!updated) {
      res.status(500).json({ error: "update_failed" });
      return;
    }
    const authCompany = (req as FleetDriverAuthRequest).fleetDriverAuth?.companyId?.trim() ?? "";
    if (
      authCompany &&
      rideQualifiesAsDriverPostAcceptCancel(cur, driverId)
    ) {
      await insertSupplementalRideEvent(id, {
        eventType: "driver_post_accept_cancel",
        fromStatus: cur.status,
        toStatus: revertStatus,
        actorType: "driver",
        actorId: driverId,
        payload: { driverId, companyId: authCompany, cancelKind: "soft" },
      });
      void evaluateFleetDriverCancellationSuspensionAfterCancel({
        fleetDriverId: driverId,
        companyId: authCompany,
      }).catch(() => undefined);
    }
    let reservationCancelSanction: {
      suspendedUntil: string;
      hours: number;
      message: string;
    } | null = null;
    if (
      authCompany &&
      cur.scheduledAt &&
      isReservationDriverLateCancelSanctionWindow(cur.scheduledAt)
    ) {
      const until = reservationDriverLateCancelSuspensionUntil();
      await setReservationSuspension(driverId, authCompany, until);
      await setFleetDriverMarketOnline(driverId, authCompany, false).catch(() => undefined);
      reservationCancelSanction = {
        suspendedUntil: until.toISOString(),
        hours: RESERVATION_DRIVER_LATE_CANCEL_SUSPENSION_HOURS,
        message:
          "Storno möglich, aber du wirst für 24 Stunden gesperrt und erhältst in dieser Zeit keine neuen Aufträge.",
      };
      logger.warn(
        { driverId, rideId: id, companyId: authCompany, suspendedUntil: until.toISOString() },
        "[rides] reservation late driver-cancel → 24h reservation suspension",
      );
      await insertSupplementalRideEvent(id, {
        eventType: "reservation_late_driver_cancel_suspension",
        fromStatus: cur.status,
        toStatus: revertStatus,
        actorType: "driver",
        actorId: driverId,
        payload: {
          driverId,
          companyId: authCompany,
          suspendedUntil: until.toISOString(),
          hours: RESERVATION_DRIVER_LATE_CANCEL_SUSPENSION_HOURS,
        },
      });
    }
    res.json({
      ...stripPartnerOnlyRideFields(updated),
      ...(reservationCancelSanction ? { reservationCancelSanction } : {}),
    });
  } catch (e) {
    next(e);
  }
});

router.post("/rides/:id/driver-hard-cancel", requireFleetDriverAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const driverIdRaw = (req.body as { driverId?: unknown }).driverId;
    const driverFromBody = typeof driverIdRaw === "string" ? driverIdRaw.trim() : "";
    const authFleet = (req as FleetDriverAuthRequest).fleetDriverAuth?.fleetDriverId;
    if (!authFleet) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const driverId = driverFromBody || authFleet;
    if (driverFromBody && driverFromBody !== authFleet) {
      res.status(403).json({ error: "driver_actor_mismatch" });
      return;
    }
    const cur = await findRide(id);
    if (!cur) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const updated = await updateRide(
      id,
      {
        status: "cancelled_by_driver",
        driverId: null,
        rejectedBy: driverId ? [...new Set([...(cur.rejectedBy ?? []), driverId])] : (cur.rejectedBy ?? []),
      },
      { mutationActor: { actorType: "driver", actorId: driverId } },
    );
    if (!updated) {
      res.status(500).json({ error: "update_failed" });
      return;
    }
    const authCompany = (req as FleetDriverAuthRequest).fleetDriverAuth?.companyId?.trim() ?? "";
    if (
      authCompany &&
      rideQualifiesAsDriverPostAcceptCancel(cur, driverId)
    ) {
      await insertSupplementalRideEvent(id, {
        eventType: "driver_post_accept_cancel",
        fromStatus: cur.status,
        toStatus: "cancelled_by_driver",
        actorType: "driver",
        actorId: driverId,
        payload: { driverId, companyId: authCompany, cancelKind: "hard" },
      });
      void evaluateFleetDriverCancellationSuspensionAfterCancel({
        fleetDriverId: driverId,
        companyId: authCompany,
      }).catch(() => undefined);
    }
    let reservationCancelSanction: {
      suspendedUntil: string;
      hours: number;
      message: string;
    } | null = null;
    if (
      authCompany &&
      cur.scheduledAt &&
      isReservationDriverLateCancelSanctionWindow(cur.scheduledAt)
    ) {
      const until = reservationDriverLateCancelSuspensionUntil();
      await setReservationSuspension(driverId, authCompany, until);
      await setFleetDriverMarketOnline(driverId, authCompany, false).catch(() => undefined);
      reservationCancelSanction = {
        suspendedUntil: until.toISOString(),
        hours: RESERVATION_DRIVER_LATE_CANCEL_SUSPENSION_HOURS,
        message:
          "Storno möglich, aber du wirst für 24 Stunden gesperrt und erhältst in dieser Zeit keine neuen Aufträge.",
      };
      logger.warn(
        { driverId, rideId: id, companyId: authCompany, suspendedUntil: until.toISOString() },
        "[rides] reservation late driver-hard-cancel → 24h reservation suspension",
      );
      await insertSupplementalRideEvent(id, {
        eventType: "reservation_late_driver_cancel_suspension",
        fromStatus: cur.status,
        toStatus: "cancelled_by_driver",
        actorType: "driver",
        actorId: driverId,
        payload: {
          driverId,
          companyId: authCompany,
          suspendedUntil: until.toISOString(),
          hours: RESERVATION_DRIVER_LATE_CANCEL_SUSPENSION_HOURS,
        },
      });
    }
    res.json({
      ...stripPartnerOnlyRideFields(updated),
      ...(reservationCancelSanction ? { reservationCancelSanction } : {}),
    });
  } catch (e) {
    next(e);
  }
});

router.delete("/rides/demo", async (req, res, next) => {
  try {
    const bearer = extractBearerAuthorization(req);
    let adminOk = Boolean(bearer && (await tryResolveAdminApiAuthPrincipal(bearer ?? "")));
    if (
      !adminOk &&
      !String(process.env.ADMIN_API_BEARER_TOKEN ?? "").trim() &&
      process.env.NODE_ENV !== "production"
    ) {
      adminOk = true;
    }
    if (!adminOk) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    await resetRidesDemo([...DEMO]);
    driverLocations.clear();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
