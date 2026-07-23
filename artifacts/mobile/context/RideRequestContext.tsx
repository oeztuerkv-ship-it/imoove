import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSegments } from "expo-router";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";

import { useDriver } from "@/context/DriverContext";
import { useUser } from "@/context/UserContext";
import { getApiBaseUrl } from "@/utils/apiBase";
import { parseJwtPayloadUnsafe } from "@/utils/parseJwtPayload";
import {
  countCustomerReservationBadge,
  isCustomerActiveRide,
  isCustomerCancelledStatus,
  isCustomerFinalCancelledStatus,
  isCustomerRideRequest,
} from "@/utils/customerRideListFilters";
import { notifyDriverRideCancelledByCustomer } from "@/utils/driverLiveNavigation";
import {
  filterDriverInstantMarketOffers,
  filterDriverScheduledOpenOffers,
  instantMarketOfferIdsKey,
} from "@/utils/driverInstantMarketOffers";
import { driverRideStatusUserMessage } from "@/utils/driverRideStatusErrors";
import { enqueueOfflineStatusPatch, flushOfflineStatusQueue } from "@/utils/offlineStatusQueue";
import { isDriverPushKind, setNotificationAudience, shouldPresentDriverRideOfferNotification } from "@/utils/notificationAudience";
import { requestDriverPushMarketRefresh, setDriverPushMarketRefreshHandler } from "@/utils/driverPushMarketRefresh";
import { getDriverMarketFetchLocation } from "@/utils/driverMarketFetchLocation";
import { ringForDriverInstantOffer } from "@/utils/driverInstantOfferAlarm";
import { stopRideSound } from "@/utils/notifications";
import { setRideStatusWsHandler } from "@/utils/socket";
import { subscribeInstantOfferSnooze } from "@/utils/instantOfferCountdown";

export type RequestStatus =
  | "draft"
  | "scheduled"
  | "scheduled_assigned"
  | "ready_for_dispatch"
  | "requested"
  | "searching_driver"
  | "offered"
  | "pending"
  | "accepted"
  | "driver_arriving"
  | "driver_waiting"
  | "passenger_onboard"
  | "arrived"
  | "in_progress"
  | "cancelled_by_customer"
  | "cancelled_by_driver"
  | "cancelled_by_system"
  | "expired"
  | "rejected"
  | "cancelled"
  | "completed";

/** Entspricht API `rideKind` (camelCase). */
export type RideKind = "standard" | "medical" | "voucher" | "company";

/** Entspricht API `payerKind`. */
export type PayerKind = "passenger" | "company" | "insurance" | "voucher" | "third_party";

/** Entspricht API `authorizationSource` — Direktzahlung, Code-Freigabe oder B2B/Mandant. */
export type AuthorizationSource = "passenger_direct" | "access_code" | "partner";

export type AccessCodeSummary = { codeType: string; label: string };
export type RideAccessibilityOptions = {
  assistanceLevel: "boarding" | "to_door" | "to_apartment" | "none";
  wheelchairType: "foldable" | "electric";
  wheelchairStaysOccupied: boolean;
  canTransfer: boolean;
  companionCount: 0 | 1 | 2;
  rampRequired: boolean;
  carryChairRequired: boolean;
  elevatorAvailable: boolean;
  stairsPresent: boolean;
  driverNote?: string | null;
};

/** Buchungs-Snapshot der Server-Tarif-Engine (`tariff_snapshot_json`). */
export type RideTariffSnapshot = {
  finalPriceEur?: number;
  vehicle?: string;
  breakdown?: {
    vehicleClassMultiplier?: number;
    xlFixedSurchargeEur?: number;
    xlPricingMode?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type CustomerAssignedDriver = {
  id: string;
  displayName: string;
  firstName: string;
  licensePlate: string | null;
  vehicleModel: string | null;
  vehicleLabel: string | null;
  rating: number | null;
  photoUrl: string | null;
  initials: string;
  phone: string | null;
};

export interface RideRequest {
  id: string;
  createdAt: Date;
  scheduledAt?: Date | null;
  rideKind: RideKind;
  payerKind: PayerKind;
  authorizationSource: AuthorizationSource;
  accessCodeId?: string | null;
  /** Nur API — kein Klartext-Code, nur Anzeige für Fahrer/Disposition. */
  accessCodeSummary?: AccessCodeSummary | null;
  voucherCode?: string | null;
  billingReference?: string | null;
  partnerBookingMeta?: Record<string, unknown> | null;
  from: string;
  fromFull: string;
  fromLat?: number;
  fromLon?: number;
  fromCity?: string;
  to: string;
  toFull: string;
  toLat?: number;
  toLon?: number;
  toCity?: string;
  distanceKm: number;
  durationMinutes: number;
  /** Sofort-Markt vor Annahme (API): Anfahrt ohne Abholkoordinaten. */
  pickupReachKm?: number | null;
  pickupReachMinutes?: number | null;
  estimatedFare: number;
  tariffSnapshot?: RideTariffSnapshot | null;
  pricingMode?: "taxi_tariff" | "fixed_price" | null;
  fixedPriceAgreementAccepted?: boolean;
  finalFare?: number | null;
  tipAmount?: number | null;
  tipPaidAt?: string | null;
  actualDistanceKm?: number | null;
  actualDurationMinutes?: number | null;
  paymentMethod: string;
  vehicle: string;
  customerName: string;
  customerPhone?: string | null;
  /** Partner-Mandant bei Panel-Buchung (Hotel/Firma). */
  bookingPartnerName?: string | null;
  assignedDriver?: CustomerAssignedDriver | null;
  passengerRating?: number | null;
  driverPlate?: string | null;
  accessibilityOptions?: RideAccessibilityOptions | null;
  passengerId?: string;
  /** Server: Fahrer hat Abhol-PIN verifiziert (App-Direktfahrten). */
  passengerPinVerifiedAt?: string | null;
  passengerPinRequired?: boolean;
  passengerPinVerified?: boolean;
  driverId?: string | null;
  cancelReason?: string | null;
  rejectedBy: string[];
  status: RequestStatus;
  /** Premium-Dispatch-Stufe (Sofort/Reservierung am Markt). */
  dispatchTier?: "A" | "B" | "C" | null;
  /** Zwei-Wege-Chat aktiv (nur A-Fahrer nach Annahme). */
  chatEnabled?: boolean;
}

interface RideRequestContextValue {
  requests: RideRequest[];
  /** Vorbestellungen im Planer (nur Fahrer-Session); nicht im Sofort-Markt-Feed. */
  scheduledPoolRequests: RideRequest[];
  pendingRequests: RideRequest[];
  /** Fahrer-Markt (Polling solange Fleet-JWT existiert — unabhängig von /driver/*). */
  driverMarketRequests: RideRequest[];
  driverMarketScheduledPool: RideRequest[];
  driverMarketPending: RideRequest[];
  isDriverMarketConnected: boolean;
  acceptedRequest: RideRequest | null;
  completedRequest: RideRequest | null;
  passengerAcceptedRequest: RideRequest | null;
  passengerCompletedRequest: RideRequest | null;
  lastAddedRequestId: string | null;
  isConnected: boolean;
  /** Erster Abruf Kunden-Fahrten (`GET /customer/v1/rides`) abgeschlossen — für Session-Restore. */
  customerRidesHydrated: boolean;
  /** Erster Abruf Fahrer-Markt abgeschlossen — für Session-Restore. */
  driverMarketHydrated: boolean;
  passengerId: string;
  myActiveRequests: RideRequest[];
  /** Offene Sofort-Fahrtanfragen (requested / searching_driver / offered / pending). */
  myRideRequests: RideRequest[];
  myCancelledRequests: RideRequest[];
  /** Tab „Fahrten“: nur aktive Reservierungen (scheduled / scheduled_assigned). */
  customerFahrtenBadgeCount: number;
  updateRequestPaymentMethod: (id: string, paymentMethod: string) => Promise<void>;
  updateRequestDriverNote: (id: string, driverNote: string) => Promise<void>;
  addRequest: (
    req: Omit<
      RideRequest,
      | "id"
      | "createdAt"
      | "status"
      | "rejectedBy"
      | "rideKind"
      | "payerKind"
      | "authorizationSource"
      | "accessCodeId"
      | "accessCodeSummary"
    > & {
      rideKind?: RideKind;
      payerKind?: PayerKind;
      voucherCode?: string | null;
      billingReference?: string | null;
      accessCode?: string | null;
      accessCodeVerifyToken?: string | null;
      customerMedicalScanId?: string | null;
    },
  ) => Promise<string>;
  acceptRequest: (id: string, driverId?: string) => Promise<void>;
  activateForDispatch: (id: string) => Promise<void>;
  markDriverArriving: (id: string) => Promise<void>;
  rejectRequest: (id: string) => Promise<void>;
  rejectByDriver: (id: string, driverId: string) => Promise<void>;
  cancelRequest: (id: string, finalFare?: number, cancelReason?: string) => Promise<void>;
  driverCancelRequest: (
    id: string,
    driverId: string,
  ) => Promise<{
    reservationCancelSanction?: {
      suspendedUntil: string;
      hours: number;
      message: string;
    } | null;
  } | void>;
  arriveAtCustomer: (id: string, driverCoords?: { lat: number; lon: number }) => Promise<void>;
  startDriving: (id: string, driverCoords?: { lat: number; lon: number }) => Promise<void>;
  completeRequest: (id: string, finalFare?: number) => Promise<void>;
  /** Manuelles Neuladen der Aufträge (z. B. „Erneut suchen“). */
  refreshRequests: () => Promise<void>;
  /** Fahrer-Markt: State leeren, dann frisch vom Server (nach ONLINE / Storno). */
  refreshDriverMarketHard: (opts?: { lat?: number; lon?: number }) => Promise<boolean>;
  /** Fahrer-Markt ohne Hard-Reset (z. B. nach Push — Alarm nicht unterbrechen). */
  refreshDriverMarket: (opts?: { lat?: number; lon?: number }) => Promise<boolean>;
  /** Sofort-Markt in der UI leeren (z. B. vor OFFLINE — kein Aufblitzen). */
  clearDriverMarketRequests: () => void;
  /** Kein erneutes Klingeln/Banner für diese Auftrags-ID (Abbruch, Ablehnung, Storno). */
  suppressDriverInstantOffer: (rideId: string) => void;
}

const RideRequestContext = createContext<RideRequestContextValue>({
  requests: [],
  scheduledPoolRequests: [],
  pendingRequests: [],
  driverMarketRequests: [],
  driverMarketScheduledPool: [],
  driverMarketPending: [],
  isDriverMarketConnected: false,
  acceptedRequest: null,
  completedRequest: null,
  passengerAcceptedRequest: null,
  passengerCompletedRequest: null,
  lastAddedRequestId: null,
  isConnected: false,
  customerRidesHydrated: false,
  driverMarketHydrated: false,
  passengerId: "",
  myActiveRequests: [],
  myRideRequests: [],
  myCancelledRequests: [],
  customerFahrtenBadgeCount: 0,
  updateRequestPaymentMethod: async () => {},
  updateRequestDriverNote: async () => {},
  addRequest: async () => "",
  acceptRequest: async () => {},
  activateForDispatch: async () => {},
  markDriverArriving: async () => {},
  rejectRequest: async () => {},
  rejectByDriver: async () => {},
  cancelRequest: async () => {},
  driverCancelRequest: async () => {},
  arriveAtCustomer: async () => {},
  startDriving: async () => {},
  completeRequest: async () => {},
  refreshRequests: async () => {},
  refreshDriverMarketHard: async () => false,
  refreshDriverMarket: async () => false,
  clearDriverMarketRequests: () => {},
  suppressDriverInstantOffer: () => {},
});

const API_BASE = getApiBaseUrl();
const PASSENGER_ID_KEY = "@Onroda_passenger_id";
const DRIVER_SESSION_KEY = "@Onroda_driver_session";
const USER_PROFILE_KEY = "@taxi24_user_profile";
const ENABLE_STORNO_TRACE = true;

async function readStoredDriverAuthToken(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(DRIVER_SESSION_KEY).catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { authToken?: string };
    const t = typeof parsed.authToken === "string" ? parsed.authToken.trim() : "";
    return t.length > 0 ? t : null;
  } catch {
    return null;
  }
}

async function readStoredCustomerSessionToken(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(USER_PROFILE_KEY).catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { sessionToken?: string };
    const t = typeof parsed.sessionToken === "string" ? parsed.sessionToken.trim() : "";
    return t.length > 0 ? t : null;
  } catch {
    return null;
  }
}

async function readStoredCustomerIdentity(): Promise<{ sessionToken: string | null; passengerId: string | null }> {
  const raw = await AsyncStorage.getItem(USER_PROFILE_KEY).catch(() => null);
  if (!raw) return { sessionToken: null, passengerId: null };
  try {
    const parsed = JSON.parse(raw) as { sessionToken?: string; googleId?: string };
    const sessionToken =
      typeof parsed.sessionToken === "string" && parsed.sessionToken.trim().length > 0
        ? parsed.sessionToken.trim()
        : null;
    const passengerId =
      typeof parsed.googleId === "string" && parsed.googleId.trim().length > 0
        ? parsed.googleId.trim()
        : null;
    return { sessionToken, passengerId };
  } catch {
    return { sessionToken: null, passengerId: null };
  }
}

async function resolveCustomerBearerToken(liveToken?: string | null): Promise<string | null> {
  const fromLive = typeof liveToken === "string" ? liveToken.trim() : "";
  if (fromLive.length > 0) return fromLive;
  return readStoredCustomerSessionToken();
}

/** API verlangt Bearer: Kunden-Storno nur mit Session-JWT; Fahrer-Übergänge mit Fleet-JWT. */
async function headersForRideStatusPatch(
  nextStatus: RequestStatus,
  liveCustomerToken?: string | null,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const driverTok = await readStoredDriverAuthToken();
  const customerTok = await resolveCustomerBearerToken(liveCustomerToken);
  if (nextStatus === "cancelled_by_customer") {
    if (customerTok) headers.Authorization = `Bearer ${customerTok}`;
    return headers;
  }
  if (driverTok) {
    headers.Authorization = `Bearer ${driverTok}`;
    return headers;
  }
  if (customerTok) headers.Authorization = `Bearer ${customerTok}`;
  return headers;
}

async function headersForFleetRidePost(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const driverTok = await readStoredDriverAuthToken();
  if (driverTok) headers.Authorization = `Bearer ${driverTok}`;
  return headers;
}

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function toDate(val: string | Date | undefined | null): Date | undefined | null {
  if (val == null) return val as null | undefined;
  if (val instanceof Date) return val;
  return new Date(val as string);
}

/** Endpreis aus API (camelCase/snake_case/String) — einheitlich für Polling/Mapping. */
function parseFinalFareFromApi(raw: Record<string, unknown>): number | null {
  const nested =
    raw.status_data != null && typeof raw.status_data === "object" && !Array.isArray(raw.status_data)
      ? (raw.status_data as Record<string, unknown>)
      : null;
  const candidates: unknown[] = [
    raw.finalFare,
    raw.final_fare,
    nested?.finalFare,
    nested?.final_fare,
  ];
  for (const v of candidates) {
    if (v == null || v === "") continue;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(String(v).trim().replace(/\s/g, "").replace(",", "."));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function parsePartnerBookingMetaField(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    try {
      const p = JSON.parse(t) as unknown;
      return p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeRequest(r: any): RideRequest {
  const pickNonEmpty = (...values: unknown[]): string => {
    for (const v of values) {
      if (typeof v === "string" && v.trim().length > 0) return v;
    }
    return "";
  };
  const customerName =
    r.customerName ??
    r.customer_name ??
    r.customer ??
    "Unbekannt";
  const fromFull = pickNonEmpty(r.fromFull, r.from_full, r.from_location, r.from, "—");
  const toFull = pickNonEmpty(r.toFull, r.to_full, r.to_location, r.to, "—");
  const paymentMethod =
    r.paymentMethod ??
    r.payment_method ??
    r.paymentType ??
    r.payment_type ??
    "Bar";
  const vehicle =
    r.vehicle ??
    r.vehicle_type ??
    "Standard";

  const rideKindRaw = r.rideKind ?? r.ride_kind;
  const payerKindRaw = r.payerKind ?? r.payer_kind;
  const rideKind: RideKind =
    rideKindRaw === "medical" || rideKindRaw === "voucher" || rideKindRaw === "company"
      ? rideKindRaw
      : "standard";
  const payerKind: PayerKind =
    payerKindRaw === "company" ||
    payerKindRaw === "insurance" ||
    payerKindRaw === "voucher" ||
    payerKindRaw === "third_party"
      ? payerKindRaw
      : "passenger";

  const authRaw = r.authorizationSource ?? r.authorization_source;
  const authorizationSource: AuthorizationSource =
    authRaw === "access_code"
      ? "access_code"
      : authRaw === "partner"
        ? "partner"
        : "passenger_direct";

  const summaryRaw = r.accessCodeSummary ?? r.access_code_summary;
  let accessCodeSummary: AccessCodeSummary | null = null;
  if (summaryRaw && typeof summaryRaw === "object") {
    const ct = (summaryRaw as { codeType?: string; code_type?: string }).codeType
      ?? (summaryRaw as { code_type?: string }).code_type;
    const lb = (summaryRaw as { label?: string }).label;
    if (typeof ct === "string" && typeof lb === "string") {
      accessCodeSummary = { codeType: ct, label: lb };
    }
  }
  const accessibilityRaw = r.accessibilityOptions ?? r.accessibility_options;
  const accessibilityOptions =
    accessibilityRaw && typeof accessibilityRaw === "object" && !Array.isArray(accessibilityRaw)
      ? (accessibilityRaw as RideAccessibilityOptions)
      : null;

  const assignedRaw = r.assignedDriver ?? r.assigned_driver;
  let assignedDriver: CustomerAssignedDriver | null = null;
  if (assignedRaw && typeof assignedRaw === "object" && !Array.isArray(assignedRaw)) {
    const ad = assignedRaw as Record<string, unknown>;
    const id = String(ad.id ?? "").trim();
    const displayName = String(ad.displayName ?? ad.display_name ?? "").trim();
    if (id && displayName) {
      assignedDriver = {
        id,
        displayName,
        firstName: String(ad.firstName ?? ad.first_name ?? displayName.split(" ")[0] ?? "Fahrer"),
        licensePlate:
          typeof ad.licensePlate === "string"
            ? ad.licensePlate
            : typeof ad.license_plate === "string"
              ? ad.license_plate
              : null,
        vehicleModel:
          typeof ad.vehicleModel === "string"
            ? ad.vehicleModel
            : typeof ad.vehicle_model === "string"
              ? ad.vehicle_model
              : null,
        vehicleLabel:
          typeof ad.vehicleLabel === "string"
            ? ad.vehicleLabel
            : typeof ad.vehicle_label === "string"
              ? ad.vehicle_label
              : null,
        rating: typeof ad.rating === "number" && Number.isFinite(ad.rating) ? ad.rating : null,
        photoUrl:
          typeof ad.photoUrl === "string"
            ? ad.photoUrl
            : typeof ad.photo_url === "string"
              ? ad.photo_url
              : null,
        initials: String(ad.initials ?? displayName.slice(0, 2)).trim() || "FA",
        phone:
          typeof ad.phone === "string" && ad.phone.trim()
            ? ad.phone.trim()
            : null,
      };
    }
  }

  const customerPhoneRaw = r.customerPhone ?? r.customer_phone;
  const driverPlateRaw = r.driverPlate ?? r.driver_plate ?? r.plate;
  const passengerRatingRaw = r.passengerRating ?? r.passenger_rating;

  return {
    ...r,
    id: String(r.id ?? r.ride_id ?? `REQ-${Date.now()}`),
    createdAt: toDate(r.createdAt ?? r.created_at) ?? new Date(),
    scheduledAt: (r.scheduledAt ?? r.scheduled_at) ? toDate(r.scheduledAt ?? r.scheduled_at) : null,
    rideKind,
    payerKind,
    authorizationSource,
    accessCodeId: (r.accessCodeId ?? r.access_code_id) != null ? String(r.accessCodeId ?? r.access_code_id) : null,
    accessCodeSummary,
    accessibilityOptions,
    voucherCode: (r.voucherCode ?? r.voucher_code) != null ? String(r.voucherCode ?? r.voucher_code) : null,
    billingReference:
      (r.billingReference ?? r.billing_reference) != null
        ? String(r.billingReference ?? r.billing_reference)
        : null,
    partnerBookingMeta:
      parsePartnerBookingMetaField(r.partnerBookingMeta) ??
      parsePartnerBookingMetaField(r.partner_booking_meta) ??
      null,
    from: pickNonEmpty(r.from, r.from_location, fromFull, "—"),
    fromFull,
    fromLat: r.fromLat ?? r.from_lat ?? undefined,
    fromLon: r.fromLon ?? r.from_lon ?? undefined,
    to: pickNonEmpty(r.to, r.to_location, toFull, "—"),
    toFull,
    toLat: r.toLat ?? r.to_lat ?? undefined,
    toLon: r.toLon ?? r.to_lon ?? undefined,
    distanceKm: Number(r.distanceKm ?? r.distance_km ?? 0),
    durationMinutes: Number(r.durationMinutes ?? r.duration_minutes ?? 0),
    pickupReachKm: (() => {
      const raw = r.pickupReachKm ?? r.pickup_reach_km;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? n : null;
    })(),
    pickupReachMinutes: (() => {
      const raw = r.pickupReachMinutes ?? r.pickup_reach_minutes;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 1 ? Math.round(n) : null;
    })(),
    estimatedFare: Number(r.estimatedFare ?? r.estimated_fare ?? r.totalFare ?? r.total_fare ?? 0),
    tariffSnapshot: (() => {
      const raw = r.tariffSnapshot ?? r.tariff_snapshot ?? r.tariff_snapshot_json;
      return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as RideTariffSnapshot) : null;
    })(),
    pricingMode:
      r.pricingMode === "fixed_price" || r.pricing_mode === "fixed_price"
        ? "fixed_price"
        : r.pricingMode === "taxi_tariff" || r.pricing_mode === "taxi_tariff"
          ? "taxi_tariff"
          : null,
    finalFare: parseFinalFareFromApi(r as Record<string, unknown>),
    tipAmount: (() => {
      const raw = (r as Record<string, unknown>).tipAmount ?? (r as Record<string, unknown>).tip_amount;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    })(),
    tipPaidAt:
      typeof (r as Record<string, unknown>).tipPaidAt === "string"
        ? String((r as Record<string, unknown>).tipPaidAt)
        : typeof (r as Record<string, unknown>).tip_paid_at === "string"
          ? String((r as Record<string, unknown>).tip_paid_at)
          : null,
    actualDistanceKm: r.actualDistanceKm ?? r.actual_distance_km ?? null,
    actualDurationMinutes: r.actualDurationMinutes ?? r.actual_duration_minutes ?? null,
    paymentMethod,
    vehicle,
    customerName: String(customerName),
    bookingPartnerName: (() => {
      const raw = r.bookingPartnerName ?? r.booking_partner_name;
      return typeof raw === "string" && raw.trim() ? raw.trim() : null;
    })(),
    customerPhone:
      typeof customerPhoneRaw === "string" && customerPhoneRaw.trim() ? customerPhoneRaw.trim() : null,
    assignedDriver,
    driverPlate: typeof driverPlateRaw === "string" && driverPlateRaw.trim() ? driverPlateRaw.trim() : null,
    passengerRating:
      typeof passengerRatingRaw === "number" && Number.isFinite(passengerRatingRaw)
        ? Math.min(5, Math.max(1, Math.round(passengerRatingRaw)))
        : null,
    passengerId: r.passengerId ?? r.passenger_id,
    passengerPinVerifiedAt: (() => {
      const raw = r.passengerPinVerifiedAt ?? r.passenger_pin_verified_at;
      return typeof raw === "string" && raw.trim() ? raw.trim() : null;
    })(),
    passengerPinRequired:
      typeof r.passengerPinRequired === "boolean"
        ? r.passengerPinRequired
        : typeof r.passenger_pin_required === "boolean"
          ? r.passenger_pin_required
          : undefined,
    passengerPinVerified:
      typeof r.passengerPinVerified === "boolean"
        ? r.passengerPinVerified
        : typeof r.passenger_pin_verified === "boolean"
          ? r.passenger_pin_verified
          : undefined,
    driverId: r.driverId ?? r.driver_id ?? null,
    cancelReason:
      (r.cancelReason ?? r.cancel_reason) != null
        ? String(r.cancelReason ?? r.cancel_reason)
        : null,
    status: (r.status ?? "requested") as RequestStatus,
    rejectedBy: Array.isArray(r.rejectedBy)
      ? r.rejectedBy
      : Array.isArray(r.rejected_by)
        ? r.rejected_by
        : [],
    dispatchTier: (() => {
      const t = String(r.dispatchTier ?? r.dispatch_tier ?? "A")
        .trim()
        .toUpperCase();
      return t === "A" || t === "B" || t === "C" ? t : "A";
    })(),
    chatEnabled: Boolean(r.chatEnabled ?? r.chat_enabled),
  } as RideRequest;
}

const POLL_INTERVAL_MS = 2500;

function normalizeApiErrorCode(raw: string): string {
  const t = raw.trim();
  if (!t) return "status_update_failed";
  return t.replace(/\s+/g, "_");
}

async function parseApiErrorResponse(res: Response): Promise<{ errorCode: string; errorBody: unknown }> {
  let errorCode = "status_update_failed";
  let errorBody: unknown = null;
  const text = (await res.clone().text()).trim();
  if (text.length > 0) {
    try {
      const body = JSON.parse(text) as { error?: unknown };
      errorBody = body;
      if (typeof body.error === "string" && body.error.trim()) {
        errorCode = normalizeApiErrorCode(body.error);
      }
    } catch {
      errorBody = { raw: text.slice(0, 240) };
    }
  }
  if (errorCode === "status_update_failed") {
    if (res.status === 404) errorCode = "not_found";
    else if (res.status === 401) errorCode = "unauthorized";
    else if (res.status === 403) errorCode = "forbidden";
    else if (res.status === 409) errorCode = "status_transition_invalid";
  }
  return { errorCode, errorBody };
}

function isCustomerSessionTokenExpired(token: string): boolean {
  const payload = parseJwtPayloadUnsafe(token);
  const exp = payload?.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return false;
  return exp * 1000 <= Date.now() + 30_000;
}

async function probeCustomerSessionForRide(
  token: string,
  rideId: string,
): Promise<"ok" | "unauthorized" | "not_found" | "other"> {
  if (!API_BASE) return "other";
  const res = await fetch(`${API_BASE}/customer/v1/rides/${encodeURIComponent(rideId)}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 200) return "ok";
  if (res.status === 401 || res.status === 403) return "unauthorized";
  if (res.status === 404) return "not_found";
  return "other";
}

function stornoErrorUserMessage(code: string): string | undefined {
  if (
    code === "unauthorized" ||
    code === "invalid_token" ||
    code === "session_required" ||
    code === "session_expired"
  ) {
    return "Bitte erneut mit Google anmelden (Profil → Anmelden), dann Storno wiederholen.";
  }
  if (code === "not_found") {
    return "Diese Fahrt wurde auf dem Server nicht gefunden. App neu laden oder erneut buchen.";
  }
  if (code === "customer_not_passenger_for_ride") {
    return "Diese Fahrt gehört nicht zu deinem angemeldeten Konto.";
  }
  if (code === "patch_status_requires_customer_session") {
    return "Storno ist nur mit Kunden-Anmeldung möglich, nicht im Fahrer-Modus.";
  }
  if (code === "reservation_storno_locked") {
    return "Bei Vorbestellungen ist ein Kunden-Storno nur bis 60 Minuten vor Abholung möglich.";
  }
  if (code === "status_transition_invalid") {
    return "Diese Fahrt kann im aktuellen Status nicht mehr storniert werden.";
  }
  if (code === "cancel_reason_required") {
    return "Storno konnte nicht gespeichert werden — bitte erneut versuchen.";
  }
  return undefined;
}

export function RideRequestProvider({ children }: { children: React.ReactNode }) {
  const { profile, profileHydrated } = useUser();
  const { driver: fleetDriver } = useDriver();
  const customerSessionTokenLive =
    profile.isLoggedIn && typeof profile.sessionToken === "string" && profile.sessionToken.trim().length > 0
      ? profile.sessionToken.trim()
      : null;
  const fleetAuthToken =
    typeof fleetDriver?.authToken === "string" && fleetDriver.authToken.trim().length > 0
      ? fleetDriver.authToken.trim()
      : null;
  const segments = useSegments();
  const isDriverSurface = segments[0] === "driver";
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [scheduledPoolRequests, setScheduledPoolRequests] = useState<RideRequest[]>([]);
  const [driverMarketRequests, setDriverMarketRequests] = useState<RideRequest[]>([]);
  const [driverMarketScheduledPool, setDriverMarketScheduledPool] = useState<RideRequest[]>([]);
  const [isDriverMarketConnected, setIsDriverMarketConnected] = useState(false);
  const [lastAddedRequestId, setLastAddedRequestId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [customerRidesHydrated, setCustomerRidesHydrated] = useState(false);
  const [driverMarketHydrated, setDriverMarketHydrated] = useState(false);
  const [passengerId, setPassengerId] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCountRef = useRef(0);
  /** Während POST /reject: Poll darf die Fahrt nicht zurück in den Markt legen (Ghost-Banner). */
  const rejectingRideIdsRef = useRef<Set<string>>(new Set());
  /** Abgelehnt / abgebrochen — kein erneutes „Neue Fahrt“-Alarm (z. B. nach driver-cancel → searching_driver). */
  const driverSuppressedOfferIdsRef = useRef<Set<string>>(new Set());
  const [offerSnoozeRev, setOfferSnoozeRev] = useState(0);
  useEffect(
    () =>
      subscribeInstantOfferSnooze((event) => {
        // Bugfix: bei leerem Pool blieb die ID in prev → nach Snooze kein Klingeln.
        if (event.type === "end") {
          driverMarketPrevPendingIdsRef.current.delete(event.rideId);
        }
        setOfferSnoozeRev((n) => n + 1);
      }),
    [],
  );
  const fleetDriverMarketOnlineRef = useRef(Boolean(fleetDriver?.isAvailable));
  fleetDriverMarketOnlineRef.current = Boolean(fleetDriver?.isAvailable);
  const isDriverSurfaceRef = useRef(isDriverSurface);
  isDriverSurfaceRef.current = isDriverSurface;

  useEffect(() => {
    setNotificationAudience({
      driverSurface: isDriverSurface,
      fleetSession: Boolean(fleetAuthToken),
    });
  }, [isDriverSurface, fleetAuthToken]);

  useEffect(() => {
    if (!isDriverSurface) void stopRideSound();
  }, [isDriverSurface]);
  const driverMarketPrevPendingIdsRef = useRef<Set<string>>(new Set());
  const driverMarketNotifyBootstrappedRef = useRef(false);
  const driverMarketOnlinePrevRef = useRef(Boolean(fleetDriver?.einsatzbereit && fleetDriver?.isAvailable));
  const driverMarketPrevScheduledOpenIdsRef = useRef<Set<string>>(new Set());
  const driverMarketScheduledNotifyBootstrappedRef = useRef(false);

  useEffect(() => {
    if (!profileHydrated) return;
    if (profile.isLoggedIn && profile.googleId?.trim()) {
      setPassengerId(profile.googleId.trim());
      // Nach Profil-Load: Restore erst nach erfolgreichem GET /customer/v1/rides.
      setCustomerRidesHydrated(false);
      return;
    }
    if (!profile.isLoggedIn) {
      setRequests([]);
      setScheduledPoolRequests([]);
      setPassengerId("");
      setCustomerRidesHydrated(true);
      void AsyncStorage.removeItem(PASSENGER_ID_KEY);
    }
  }, [profileHydrated, profile.isLoggedIn, profile.googleId]);

  useEffect(() => {
    (async () => {
      try {
        const identity = await readStoredCustomerIdentity();
        if (identity.passengerId) {
          setPassengerId(identity.passengerId);
          return;
        }
        const stored = await AsyncStorage.getItem(PASSENGER_ID_KEY);
        if (stored && stored.trim().length > 0) {
          setPassengerId(stored.trim());
          return;
        }
      } catch {
        /* ignore */
      }
      const fallback = uuid();
      AsyncStorage.setItem(PASSENGER_ID_KEY, fallback).catch(() => {});
      setPassengerId(fallback);
    })();
  }, []);

  const ensurePassengerId = useCallback(async (): Promise<string> => {
    const identity = await readStoredCustomerIdentity();
    if (identity.passengerId) {
      setPassengerId(identity.passengerId);
      return identity.passengerId;
    }
    if (passengerId && passengerId.trim().length > 0) return passengerId.trim();
    try {
      const stored = await AsyncStorage.getItem(PASSENGER_ID_KEY);
      if (stored && stored.trim().length > 0) {
        const resolved = stored.trim();
        setPassengerId(resolved);
        return resolved;
      }
    } catch {
      /* ignore */
    }
    const created = uuid();
    try {
      await AsyncStorage.setItem(PASSENGER_ID_KEY, created);
    } catch {
      /* ignore */
    }
    setPassengerId(created);
    return created;
  }, [passengerId]);

  const ridesFromPayload = useCallback((payload: unknown): RideRequest[] => {
    const data: any[] = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as { items?: unknown })?.items)
        ? ((payload as { items: any[] }).items ?? [])
        : (payload as { item?: unknown })?.item && typeof (payload as { item?: unknown }).item === "object"
          ? [((payload as { item: any }).item)]
      : Array.isArray((payload as { rides?: unknown })?.rides)
        ? ((payload as { rides: any[] }).rides ?? [])
        : [];
    return data.map(normalizeRequest);
  }, []);

  const readFleetAuthToken = useCallback(async (): Promise<string | null> => {
    try {
      const rawDriverSession = await AsyncStorage.getItem(DRIVER_SESSION_KEY).catch(() => null);
      if (!rawDriverSession) return null;
      const parsed = JSON.parse(rawDriverSession) as { authToken?: string };
      const tok = typeof parsed.authToken === "string" ? parsed.authToken.trim() : "";
      return tok.length > 0 ? tok : null;
    } catch {
      return null;
    }
  }, []);

  const applyDriverMarketPayload = useCallback(
    (marketRows: RideRequest[], scheduledRows: RideRequest[]) => {
      setDriverMarketRequests(marketRows);
      setDriverMarketScheduledPool(scheduledRows);
      if (isDriverSurfaceRef.current) {
        setRequests(marketRows);
        setScheduledPoolRequests(scheduledRows);
        lastCountRef.current = marketRows.length;
      }
    },
    [],
  );

  const fetchDriverMarket = useCallback(
    async (opts?: { hardReset?: boolean; lat?: number; lon?: number }): Promise<boolean> => {
      if (!API_BASE) return false;
      const token = await readFleetAuthToken();
      if (!token) return false;

      if (opts?.hardReset) {
        setDriverMarketRequests([]);
        setDriverMarketScheduledPool([]);
        setDriverMarketHydrated(false);
        if (isDriverSurfaceRef.current) {
          setRequests([]);
          setScheduledPoolRequests([]);
          lastCountRef.current = 0;
          setLastAddedRequestId(null);
        }
      }

      const bust = Date.now();
      const marketQs = new URLSearchParams({ _: String(bust) });
      const loc =
        opts?.lat != null &&
        opts?.lon != null &&
        Number.isFinite(opts.lat) &&
        Number.isFinite(opts.lon)
          ? { lat: opts.lat, lon: opts.lon }
          : getDriverMarketFetchLocation();
      if (loc) {
        marketQs.set("lat", String(loc.lat));
        marketQs.set("lon", String(loc.lon));
      }
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      };
      try {
        const [marketRes, schedRes] = await Promise.all([
          fetch(`${API_BASE}/fleet-driver/v1/market-rides?${marketQs}`, { cache: "no-store", headers }),
          fetch(`${API_BASE}/fleet-driver/v1/scheduled-rides?_=${bust}`, { cache: "no-store", headers }),
        ]);
        if (!marketRes.ok && !schedRes.ok) throw new Error("fetch failed");
        const rejecting = rejectingRideIdsRef.current;
        const normalized = marketRes.ok
          ? ridesFromPayload(await marketRes.json()).filter((r) => !rejecting.has(r.id))
          : [];
        const scheduledNorm = schedRes.ok ? ridesFromPayload(await schedRes.json()) : [];
        // Sofortmarkt nur bei ONLINE; Reservierungen/Planer immer aus scheduled-rides (unabhängig vom Toggle).
        const instantRows = fleetDriverMarketOnlineRef.current ? normalized : [];
        applyDriverMarketPayload(instantRows, scheduledNorm);
        setIsDriverMarketConnected(marketRes.ok || schedRes.ok);
        if (isDriverSurfaceRef.current) setIsConnected(marketRes.ok || schedRes.ok);
        return marketRes.ok || schedRes.ok;
      } catch {
        setIsDriverMarketConnected(false);
        if (isDriverSurfaceRef.current) setIsConnected(false);
        if (opts?.hardReset) {
          setDriverMarketRequests([]);
          setDriverMarketScheduledPool([]);
          if (isDriverSurfaceRef.current) {
            setRequests([]);
            setScheduledPoolRequests([]);
            lastCountRef.current = 0;
          }
        }
        return false;
      } finally {
        setDriverMarketHydrated(true);
      }
    },
    [applyDriverMarketPayload, readFleetAuthToken, ridesFromPayload],
  );

  const refreshDriverMarketHard = useCallback(
    (opts?: { lat?: number; lon?: number }) => fetchDriverMarket({ hardReset: true, ...opts }),
    [fetchDriverMarket],
  );

  const refreshDriverMarket = useCallback(
    (opts?: { lat?: number; lon?: number }) => fetchDriverMarket({ hardReset: false, ...opts }),
    [fetchDriverMarket],
  );

  const clearDriverMarketRequests = useCallback(() => {
    setDriverMarketRequests([]);
    if (isDriverSurfaceRef.current) {
      setRequests([]);
      lastCountRef.current = 0;
      setLastAddedRequestId(null);
    }
  }, []);

  const suppressDriverInstantOffer = useCallback((rideId: string) => {
    const id = rideId.trim();
    if (!id) return;
    driverSuppressedOfferIdsRef.current.add(id);
    driverMarketPrevPendingIdsRef.current.add(id);
    void stopRideSound();
  }, []);

  const fetchAll = useCallback(async () => {
    if (!API_BASE) {
      if (!isDriverSurfaceRef.current) setCustomerRidesHydrated(true);
      return;
    }
    try {
      const token = await readFleetAuthToken();

      const customerIdentity = await readStoredCustomerIdentity();
      const customerSessionToken = customerIdentity.sessionToken;

      if (token && isDriverSurfaceRef.current) {
        await fetchDriverMarket({ hardReset: false });
        return;
      }

      if (customerIdentity.passengerId) {
        setPassengerId(customerIdentity.passengerId);
      }
      const sessionTok = (await resolveCustomerBearerToken(customerSessionTokenLive)) ?? customerSessionToken;
      if (!sessionTok) {
        // Kein Token: Liste leeren, aber Restore-Hydration erst wenn Profil wirklich geladen
        // und kein Session-JWT in Storage — sonst Race (DEFAULT-Profil vor AsyncStorage).
        setRequests([]);
        setScheduledPoolRequests([]);
        setIsConnected(true);
        lastCountRef.current = 0;
        if (profileHydrated && !customerSessionTokenLive && !customerSessionToken) {
          setCustomerRidesHydrated(true);
        }
        return;
      }
      const res = await fetch(`${API_BASE}/customer/v1/rides`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${sessionTok}` },
      });
      if (res.status === 401 || res.status === 403) {
        setRequests([]);
        setScheduledPoolRequests([]);
        setIsConnected(false);
        lastCountRef.current = 0;
        if (!isDriverSurfaceRef.current) setCustomerRidesHydrated(true);
        return;
      }
      if (!res.ok) throw new Error("fetch failed");
      const normalized = ridesFromPayload(await res.json());
      setRequests(normalized);
      setScheduledPoolRequests([]);
      setIsConnected(true);
      if (normalized.length > lastCountRef.current) {
        const newReqs = normalized.slice(0, normalized.length - lastCountRef.current);
        const newest = newReqs[0];
        if (
          newest &&
          (newest.status === "requested" ||
            newest.status === "searching_driver" ||
            newest.status === "offered" ||
            newest.status === "pending") &&
          lastCountRef.current > 0
        ) {
          setLastAddedRequestId(newest.id);
        }
      }
      lastCountRef.current = normalized.length;
      if (!isDriverSurfaceRef.current) setCustomerRidesHydrated(true);
    } catch {
      setIsConnected(false);
    }
  }, [customerSessionTokenLive, fetchDriverMarket, profileHydrated, readFleetAuthToken, ridesFromPayload]);

  /**
   * Offline / langsames Netz: sonst bleibt Restore/Status ewig auf „nicht hydrated“.
   * Erfolgreicher GET setzt hydrated früher; dieses Soft-Deadline entblockt nach max. 10s.
   */
  useEffect(() => {
    if (!profileHydrated) return;
    if (!customerSessionTokenLive) return;
    if (customerRidesHydrated) return;
    if (isDriverSurface) return;
    const timer = setTimeout(() => {
      setCustomerRidesHydrated(true);
    }, 10_000);
    return () => clearTimeout(timer);
  }, [profileHydrated, customerSessionTokenLive, customerRidesHydrated, isDriverSurface]);

  useEffect(() => {
    fetchAll();
    pollRef.current = setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchAll]);

  /**
   * Fahrer-Route (/driver/*): Kunden-`requests` aus dem globalen Provider sofort leeren und
   * Markt hart neu laden, sobald ein Fleet-Token da ist (Login, Session-Restore, Tab-Wechsel).
   * Ohne das zeigt das Dashboard bis zum nächsten Poll (2,5s) Kunden-Fahrten als Ghost-Aufträge.
   */
  useEffect(() => {
    if (!fleetAuthToken) {
      setDriverMarketRequests([]);
      setDriverMarketScheduledPool([]);
      setIsDriverMarketConnected(false);
      setDriverMarketHydrated(false);
      driverMarketPrevPendingIdsRef.current = new Set();
      driverMarketNotifyBootstrappedRef.current = false;
      if (isDriverSurface) {
        setRequests([]);
        setScheduledPoolRequests([]);
        setIsConnected(false);
        lastCountRef.current = 0;
        setLastAddedRequestId(null);
      }
      return;
    }
    void fetchDriverMarket({ hardReset: isDriverSurface });
  }, [isDriverSurface, fleetAuthToken, fetchDriverMarket]);

  useEffect(() => {
    setDriverPushMarketRefreshHandler(() => {
      if (!fleetAuthToken) return;
      void fetchDriverMarket({ hardReset: false });
    });
    return () => setDriverPushMarketRefreshHandler(null);
  }, [fleetAuthToken, fetchDriverMarket]);

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    void import("expo-notifications").then((Notifications) => {
      sub = Notifications.addNotificationReceivedListener((notification) => {
        const data = notification.request.content.data as { kind?: unknown; rideId?: unknown } | undefined;
        const kind = data?.kind;
        if (fleetAuthToken && isDriverPushKind(kind)) {
          if (
            (kind === "instant_ride_offer" ||
              kind === "follow_up_offer" ||
              kind === "scheduled_pool_offer") &&
            typeof data?.rideId === "string" &&
            data.rideId.trim()
          ) {
            void ringForDriverInstantOffer({
              rideId: data.rideId.trim(),
            });
          }
          void fetchDriverMarket({ hardReset: false });
          return;
        }
        if (!isDriverSurface && typeof kind === "string" && !isDriverPushKind(kind)) {
          void fetchAll();
        }
      });
    });
    return () => {
      sub?.remove();
    };
  }, [fleetAuthToken, isDriverSurface, fetchDriverMarket, fetchAll]);

  useEffect(() => {
    setRideStatusWsHandler(({ rideId, status }) => {
      const id = rideId.trim();
      const next = status.trim() as RequestStatus;
      if (!id || !next) return;
      if (isCustomerFinalCancelledStatus(next)) {
        notifyDriverRideCancelledByCustomer(id);
      }
      const applyStatus = (prev: RideRequest[]) => {
        const idx = prev.findIndex((r) => r.id === id);
        if (idx < 0) return prev;
        const copy = [...prev];
        copy[idx] = { ...copy[idx], status: next };
        return copy;
      };
      setRequests(applyStatus);
      setDriverMarketRequests(applyStatus);
      if (isDriverSurfaceRef.current && fleetAuthToken) {
        void fetchDriverMarket({ hardReset: false });
      }
    });
    return () => setRideStatusWsHandler(null);
  }, [fetchDriverMarket, fleetAuthToken]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void fetchAll();
      if (fleetAuthToken) {
        void fetchDriverMarket({ hardReset: false });
      }
    });
    return () => sub.remove();
  }, [fetchAll, fetchDriverMarket, fleetAuthToken]);

  const patchStatus = useCallback(
    async (id: string, status: RequestStatus, finalFare?: number, driverId?: string, cancelReason?: string, driverCoords?: { lat: number; lon: number }) => {
      if (!API_BASE) return;
      if (ENABLE_STORNO_TRACE && status === "cancelled_by_customer") {
        console.log(`[Storno-Trace] Initiating Cancel for ID: ${id}`);
      }
      const normalizedCancelReason =
        status === "cancelled_by_customer"
          ? (typeof cancelReason === "string" && cancelReason.trim().length > 0
              ? cancelReason.trim()
              : "Storno durch Kunden-App")
          : undefined;
      if (status === "cancelled_by_customer") {
        const bearer = await resolveCustomerBearerToken(customerSessionTokenLive);
        if (!bearer) {
          if (ENABLE_STORNO_TRACE) {
            console.error("[Storno-Trace] Kein sessionToken — Google-Anmeldung erforderlich");
          }
          const err = new Error("session_required") as Error & { userMessage?: string };
          err.userMessage = stornoErrorUserMessage("session_required");
          throw err;
        }
        if (isCustomerSessionTokenExpired(bearer)) {
          const err = new Error("session_expired") as Error & { userMessage?: string };
          err.userMessage = stornoErrorUserMessage("session_expired");
          throw err;
        }
        const probe = await probeCustomerSessionForRide(bearer, id);
        if (ENABLE_STORNO_TRACE) {
          const payload = parseJwtPayloadUnsafe(bearer);
          console.log(
            `[Storno-Trace] Session sub=${String(payload?.sub ?? "?")} probe=${probe}`,
          );
        }
        if (probe === "unauthorized") {
          const err = new Error("invalid_token") as Error & { userMessage?: string };
          err.userMessage = stornoErrorUserMessage("invalid_token");
          throw err;
        }
        if (probe === "not_found") {
          const err = new Error("not_found") as Error & { userMessage?: string };
          err.userMessage =
            "Diese Fahrt gehört nicht zu deinem angemeldeten Konto (oder wurde nur lokal angelegt). Bitte mit dem gleichen Google-Konto anmelden, mit dem du gebucht hast.";
          throw err;
        }
      }
      const patchHeaders = await headersForRideStatusPatch(status, customerSessionTokenLive);
      const legacyStatusUrl = `${API_BASE}/rides/${encodeURIComponent(id)}/status`;
      const customerCancelUrl = `${API_BASE}/customer/v1/rides/${encodeURIComponent(id)}/cancel`;
      const stornoBody = JSON.stringify({
        status: "cancelled_by_customer",
        cancelReason: normalizedCancelReason,
      });
      const customerCancelBody = JSON.stringify({ cancelReason: normalizedCancelReason });

      void flushOfflineStatusQueue().catch(() => undefined);

      let res: Response;
      const defaultPatchBody = JSON.stringify({
        status,
        ...(finalFare != null ? { finalFare } : {}),
        ...(driverId != null ? { driverId } : {}),
        ...(normalizedCancelReason ? { cancelReason: normalizedCancelReason } : {}),
        ...(driverCoords ? { driverLat: driverCoords.lat, driverLon: driverCoords.lon } : {}),
      });
      if (status === "cancelled_by_customer") {
        // Dedizierte Kunden-Storno-Route (Session + passenger_id); Legacy nur bei 404.
        res = await fetch(customerCancelUrl, {
          method: "PATCH",
          headers: patchHeaders,
          body: customerCancelBody,
        });
        if (ENABLE_STORNO_TRACE) {
          console.log(
            `[Storno-Trace] Auth gesendet: ${patchHeaders.Authorization ? "ja" : "nein"}, URL: ${customerCancelUrl}, Status: ${res.status}`,
          );
        }
        if (res.status === 404) {
          if (ENABLE_STORNO_TRACE) {
            console.log(`[Storno-Trace] Customer-Cancel 404 — versuche ${legacyStatusUrl}`);
          }
          const alt = await fetch(legacyStatusUrl, {
            method: "PATCH",
            headers: patchHeaders,
            body: stornoBody,
          });
          if (alt.ok || alt.status !== 404) res = alt;
        }
      } else {
        try {
          res = await fetch(legacyStatusUrl, {
            method: "PATCH",
            headers: patchHeaders,
            body: defaultPatchBody,
          });
        } catch {
          await enqueueOfflineStatusPatch({
            rideId: id,
            url: legacyStatusUrl,
            method: "PATCH",
            headers: patchHeaders as Record<string, string>,
            body: defaultPatchBody,
          });
          return;
        }
      }
      if (!res.ok) {
        const { errorCode, errorBody } = await parseApiErrorResponse(res);
        if (ENABLE_STORNO_TRACE && status === "cancelled_by_customer") {
          console.error("[Storno-Trace] Error Body:", errorBody);
        }
        const err = new Error(errorCode) as Error & { userMessage?: string };
        const hint =
          driverRideStatusUserMessage(errorCode, errorBody) ?? stornoErrorUserMessage(errorCode);
        if (hint) err.userMessage = hint;
        throw err;
      }
      await fetchAll();
    },
    [customerSessionTokenLive, fetchAll],
  );

  const addRequest = useCallback(
    async (
      req: Omit<
        RideRequest,
        | "id"
        | "createdAt"
        | "status"
        | "rejectedBy"
        | "rideKind"
        | "payerKind"
        | "authorizationSource"
        | "accessCodeId"
        | "accessCodeSummary"
      > & {
        rideKind?: RideKind;
        payerKind?: PayerKind;
        voucherCode?: string | null;
        billingReference?: string | null;
        accessCode?: string | null;
        accessCodeVerifyToken?: string | null;
        customerMedicalScanId?: string | null;
      },
    ): Promise<string> => {
      const resolvedPassengerId = await ensurePassengerId();
      const rideKind = req.rideKind ?? "standard";
      const payerKind = req.payerKind ?? "passenger";
      const accessTrim = typeof req.accessCode === "string" ? req.accessCode.trim() : "";
      const verifyToken =
        typeof req.accessCodeVerifyToken === "string" ? req.accessCodeVerifyToken.trim() : "";
      const { accessCode: _unused, accessCodeVerifyToken: _uv, ...reqForBody } = req as typeof req & {
        accessCode?: string | null;
        accessCodeVerifyToken?: string | null;
      };
      void _unused;
      void _uv;
      const estimatedFareRaw =
        typeof reqForBody.estimatedFare === "number" &&
        Number.isFinite(reqForBody.estimatedFare) &&
        reqForBody.estimatedFare > 0
          ? reqForBody.estimatedFare
          : undefined;
      const payload = {
        ...reqForBody,
        ...(estimatedFareRaw != null ? { estimatedFare: estimatedFareRaw } : {}),
        passengerId:
          typeof reqForBody.passengerId === "string" && reqForBody.passengerId.trim().length > 0
            ? reqForBody.passengerId.trim()
            : resolvedPassengerId,
        rideKind,
        payerKind,
        voucherCode: req.voucherCode ?? undefined,
        billingReference: req.billingReference ?? undefined,
        ...(accessTrim ? { accessCode: accessTrim } : {}),
        ...(verifyToken ? { accessCodeVerifyToken: verifyToken } : {}),
      };
      if (__DEV__) {
        console.log(
          "[RESNOTE] RideRequestContext.addRequest partnerBookingMeta",
          (payload as { partnerBookingMeta?: unknown }).partnerBookingMeta,
        );
      }
      if (!API_BASE) {
        const id = `REQ-${Date.now()}`;
        const { accessCode: _oc, accessCodeVerifyToken: _ov, ...reqSansCode } = req as typeof req & {
          accessCode?: string | null;
          accessCodeVerifyToken?: string | null;
        };
        void _oc;
        void _ov;
        const sched = req.scheduledAt;
        const offlineStatus: RequestStatus =
          sched != null &&
          sched instanceof Date &&
          Number.isFinite(sched.getTime()) &&
          sched.getTime() >= Date.now() + 60 * 60 * 1000
            ? "scheduled"
            : "searching_driver";
        const newReq: RideRequest = {
          ...reqSansCode,
          passengerId:
            typeof reqSansCode.passengerId === "string" && reqSansCode.passengerId.trim().length > 0
              ? reqSansCode.passengerId.trim()
              : resolvedPassengerId,
          rideKind,
          payerKind,
          voucherCode: req.voucherCode ?? null,
          billingReference: req.billingReference ?? null,
          authorizationSource: accessTrim ? "access_code" : "passenger_direct",
          accessCodeId: accessTrim ? "local" : null,
          accessCodeSummary: accessTrim ? { codeType: "general", label: "Offline (nicht geprüft)" } : null,
          id,
          createdAt: new Date(),
          status: offlineStatus,
          rejectedBy: [],
        };
        setRequests((prev) => [newReq, ...prev]);
        setLastAddedRequestId(id);
        return id;
      }
      const sessionTok = (await resolveCustomerBearerToken(customerSessionTokenLive)) ?? "";
      if (!sessionTok) {
        throw new Error("unauthorized");
      }
      const res = await fetch(`${API_BASE}/rides`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionTok}`,
        },
        body: JSON.stringify(payload),
      });
      const rawText = await res.text();
      let created: unknown = {};
      try {
        created = rawText ? JSON.parse(rawText) : {};
      } catch {
        created = { rawText };
      }
      if (!res.ok) {
        const body = created as { error?: string; message?: string };
        const debugPayload = {
          from: payload.from,
          to: payload.to,
          fromFull: payload.fromFull,
          toFull: payload.toFull,
          fromLat: (payload as Record<string, unknown>).fromLat ?? null,
          fromLon: (payload as Record<string, unknown>).fromLon ?? null,
          toLat: (payload as Record<string, unknown>).toLat ?? null,
          toLon: (payload as Record<string, unknown>).toLon ?? null,
          scheduledAt:
            payload.scheduledAt instanceof Date
              ? payload.scheduledAt.toISOString()
              : payload.scheduledAt ?? null,
          paymentMethod: payload.paymentMethod,
          vehicle: payload.vehicle,
          pricingMode: (payload as Record<string, unknown>).pricingMode ?? null,
          rideKind: payload.rideKind,
          payerKind: payload.payerKind,
          passengerId: payload.passengerId,
          customerName: payload.customerName,
          hasAccessCode: typeof (payload as Record<string, unknown>).accessCode === "string",
        };
        const code = typeof body.error === "string" ? body.error : "request_failed";
        if (res.status >= 500) {
          console.error("RIDES_POST_DEBUG", {
            status: res.status,
            statusText: res.statusText,
            response: created,
            requestPayload: debugPayload,
          });
        } else {
          console.warn("RIDES_POST_RULE_BLOCKED", { status: res.status, code });
        }

        const err = new Error(code) as Error & { userMessage?: string };
        if (code === "prebook_lead_too_short") {
          err.userMessage = "Diese Reservierung ist zu kurzfristig. Bitte wähle eine spätere Abholzeit.";
        } else if (code === "reservation_lead_time_too_short") {
          err.userMessage =
            "Zeit zu knapp. Reservierungen sind erst ab 60 Minuten Vorlauf möglich. Bitte buche eine Sofortfahrt.";
        } else if (typeof body.message === "string" && body.message.trim()) {
          err.userMessage = body.message.trim();
        }
        throw err;
      }
      const id = (created as { id?: string }).id as string;
      setLastAddedRequestId(id);
      await fetchAll();
      return id;
    },
    [ensurePassengerId, fetchAll, customerSessionTokenLive],
  );

  const acceptRequest = useCallback(
    (id: string, driverId?: string) => patchStatus(id, "accepted", undefined, driverId),
    [patchStatus],
  );
  const activateForDispatch = useCallback((id: string) => patchStatus(id, "searching_driver"), [patchStatus]);
  const markDriverArriving = useCallback((id: string) => patchStatus(id, "driver_arriving"), [patchStatus]);
  const rejectRequest = useCallback((id: string) => patchStatus(id, "rejected"), [patchStatus]);

  const rejectByDriver = useCallback(
    async (id: string, driverId: string) => {
      if (!API_BASE) return;
      suppressDriverInstantOffer(id);
      rejectingRideIdsRef.current.add(id);
      setDriverMarketRequests((prev) => prev.filter((r) => r.id !== id));
      if (isDriverSurfaceRef.current) {
        setRequests((prev) => prev.filter((r) => r.id !== id));
      }
      try {
        const res = await fetch(`${API_BASE}/rides/${id}/reject`, {
          method: "POST",
          headers: await headersForFleetRidePost(),
          body: JSON.stringify({ driverId }),
        });
        if (!res.ok) throw new Error("reject_failed");
        await fetchDriverMarket({ hardReset: false });
        const dropRejected = (prev: RideRequest[]) =>
          prev.filter(
            (r) => r.id !== id && (!driverId.trim() || !(r.rejectedBy ?? []).includes(driverId)),
          );
        setDriverMarketRequests(dropRejected);
        if (isDriverSurfaceRef.current) setRequests(dropRejected);
      } catch {
        await fetchDriverMarket({ hardReset: false });
        setDriverMarketRequests((prev) => prev.filter((r) => r.id !== id));
        if (isDriverSurfaceRef.current) setRequests((prev) => prev.filter((r) => r.id !== id));
        throw new Error("reject_failed");
      } finally {
        rejectingRideIdsRef.current.delete(id);
      }
    },
    [fetchAll, fetchDriverMarket, suppressDriverInstantOffer],
  );

  const cancelRequest = useCallback(
    async (id: string, finalFare?: number, cancelReason?: string) => {
      const reason =
        typeof cancelReason === "string" && cancelReason.trim().length > 0
          ? cancelReason.trim()
          : "Storno durch Kunden-App";
      // Optimistisch sofort aus "aktiv" rausnehmen, damit Such-UI direkt endet.
      setRequests((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status: "cancelled_by_customer",
                cancelReason: reason,
              }
            : r,
        ),
      );
      setDriverMarketRequests((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status: "cancelled_by_customer",
                cancelReason: reason,
              }
            : r,
        ),
      );
      try {
        await patchStatus(id, "cancelled_by_customer", finalFare, undefined, reason);
        notifyDriverRideCancelledByCustomer(id, reason);
      } catch (err) {
        // Bei Fehler wieder vom Server synchronisieren, damit kein lokaler Zombie-State bleibt.
        await fetchAll();
        throw err;
      }
    },
    [fetchAll, patchStatus],
  );

  const driverCancelRequest = useCallback(
    async (id: string, driverId: string) => {
      if (!API_BASE) return;
      const did = driverId.trim();
      suppressDriverInstantOffer(id);
      const patchReleased = (r: RideRequest): RideRequest => {
        if (r.id !== id) return r;
        const rejectedBy = did && !(r.rejectedBy ?? []).includes(did) ? [...(r.rejectedBy ?? []), did] : (r.rejectedBy ?? []);
        return {
          ...r,
          status: "searching_driver" as RequestStatus,
          driverId: null,
          rejectedBy,
        };
      };
      setRequests((prev) => prev.map(patchReleased));
      setDriverMarketRequests((prev) => prev.map(patchReleased));
      const res = await fetch(`${API_BASE}/rides/${id}/driver-cancel`, {
        method: "POST",
        headers: await headersForFleetRidePost(),
        body: JSON.stringify({ driverId }),
      });
      if (!res.ok) {
        let code = "driver_cancel_failed";
        try {
          const body = (await res.json()) as { error?: unknown };
          if (typeof body.error === "string" && body.error.trim()) code = body.error.trim();
        } catch {
          /* ignore */
        }
        await fetchDriverMarket({ hardReset: true });
        throw new Error(code);
      }
      let reservationCancelSanction: {
        suspendedUntil: string;
        hours: number;
        message: string;
      } | null = null;
      try {
        const body = (await res.json()) as {
          reservationCancelSanction?: {
            suspendedUntil?: string;
            hours?: number;
            message?: string;
          };
        };
        const s = body.reservationCancelSanction;
        if (
          s &&
          typeof s.message === "string" &&
          typeof s.suspendedUntil === "string" &&
          typeof s.hours === "number"
        ) {
          reservationCancelSanction = {
            message: s.message,
            suspendedUntil: s.suspendedUntil,
            hours: s.hours,
          };
        }
      } catch {
        /* ignore */
      }
      if (isDriverSurfaceRef.current) {
        await fetchDriverMarket({ hardReset: true });
      } else {
        await fetchAll();
      }
      return { reservationCancelSanction };
    },
    [fetchAll, fetchDriverMarket, suppressDriverInstantOffer],
  );

  const arriveAtCustomer = useCallback(
    (id: string, driverCoords?: { lat: number; lon: number }) =>
      patchStatus(id, "driver_waiting", undefined, undefined, undefined, driverCoords),
    [patchStatus],
  );
  const startDriving = useCallback(
    (id: string, driverCoords?: { lat: number; lon: number }) =>
      patchStatus(id, "in_progress", undefined, undefined, undefined, driverCoords),
    [patchStatus],
  );
  const completeRequest = useCallback(
    (id: string, finalFare?: number) => patchStatus(id, "completed", finalFare),
    [patchStatus],
  );

  const updateRequestDriverNote = useCallback(
    async (id: string, driverNote: string) => {
      const token = await readStoredCustomerSessionToken();
      if (!token) throw new Error("unauthorized");
      const res = await fetch(`${API_BASE}/rides/${encodeURIComponent(id)}/driver-note`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ driverNote }),
      });
      const updated = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(updated?.error ?? "driver_note_update_failed");
      }
      await fetchAll();
    },
    [fetchAll],
  );

  const updateRequestPaymentMethod = useCallback(
    async (id: string, paymentMethod: string) => {
      if (!API_BASE) return;
      const token = await readStoredCustomerSessionToken();
      if (!token) throw new Error("unauthorized");
      const res = await fetch(`${API_BASE}/customer/v1/rides/${encodeURIComponent(id)}/payment-method`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ paymentMethod }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(typeof body.error === "string" && body.error ? body.error : "payment_method_update_failed");
      }
      await fetchAll();
    },
    [fetchAll],
  );

  const pendingRequests = requests.filter(
    (r) => r.status === "pending" || r.status === "requested" || r.status === "searching_driver" || r.status === "offered",
  );

  const driverMarketPending = driverMarketRequests.filter(
    (r) =>
      r.status === "pending" ||
      r.status === "requested" ||
      r.status === "searching_driver" ||
      r.status === "offered",
  );

  const driverMarketOnline = Boolean(fleetDriver?.einsatzbereit && fleetDriver?.isAvailable);
  const driverIdForMarket = fleetDriver?.id ?? "";

  const eligibleInstantOffers = useMemo(
    () =>
      filterDriverInstantMarketOffers(driverMarketPending, {
        driverId: driverIdForMarket,
        driverMarketOnline,
        suppressedIds: driverSuppressedOfferIdsRef.current,
      }),
    [driverMarketPending, driverIdForMarket, driverMarketOnline, offerSnoozeRev],
  );

  const eligibleInstantOffersKey = useMemo(
    () => instantMarketOfferIdsKey(eligibleInstantOffers),
    [eligibleInstantOffers],
  );

  useEffect(() => {
    if (!isDriverSurface) {
      void stopRideSound();
      driverMarketPrevPendingIdsRef.current = new Set();
      driverMarketNotifyBootstrappedRef.current = false;
      return;
    }

    const driverOnline = driverMarketOnline;
    const pool = eligibleInstantOffers;
    const currentIds = new Set(pool.map((r) => r.id));

    if (!fleetAuthToken || !driverOnline) {
      void stopRideSound();
      driverMarketPrevPendingIdsRef.current = new Set();
      driverMarketOnlinePrevRef.current = driverOnline;
      driverMarketNotifyBootstrappedRef.current = false;
      return;
    }

    if (pool.length === 0) {
      if (driverMarketHydrated) void stopRideSound();
      // Wichtig: Prev leeren — sonst bleibt Snooze-ID „gesehen“ und wacht ohne Klingeln auf.
      driverMarketPrevPendingIdsRef.current = currentIds;
      driverMarketOnlinePrevRef.current = driverOnline;
      return;
    }

    if (!driverMarketNotifyBootstrappedRef.current) {
      driverMarketPrevPendingIdsRef.current = currentIds;
      driverMarketNotifyBootstrappedRef.current = true;
      driverMarketOnlinePrevRef.current = driverOnline;
      return;
    }

    if (!driverMarketOnlinePrevRef.current && driverOnline) {
      driverMarketPrevPendingIdsRef.current = currentIds;
      driverMarketOnlinePrevRef.current = driverOnline;
      return;
    }

    driverMarketOnlinePrevRef.current = driverOnline;

    const suppressed = driverSuppressedOfferIdsRef.current;
    const newReqs = pool.filter(
      (r) => !driverMarketPrevPendingIdsRef.current.has(r.id) && !suppressed.has(r.id),
    );
    if (newReqs.length > 0) {
      const req = newReqs[0];
      const schedMs = req.scheduledAt ? new Date(req.scheduledAt as Date).getTime() : 0;
      const isFarScheduled = Number.isFinite(schedMs) && schedMs > Date.now() + 60 * 60 * 1000;
      if (!isFarScheduled && shouldPresentDriverRideOfferNotification()) {
        void ringForDriverInstantOffer({
          rideId: req.id,
          customerName: req.customerName || "Kunde",
          fromAddress: req.fromFull || req.from || "—",
          distanceKm: null,
          estimatedFare: Number.isFinite(req.estimatedFare) ? req.estimatedFare : 0,
        });
      }
    }
    driverMarketPrevPendingIdsRef.current = currentIds;
  }, [
    eligibleInstantOffersKey,
    eligibleInstantOffers,
    fleetAuthToken,
    driverMarketOnline,
    isDriverSurface,
    driverMarketHydrated,
  ]);

  const driverEinsatzbereit = Boolean(fleetDriver?.einsatzbereit);
  const eligibleScheduledOpen = useMemo(
    () => filterDriverScheduledOpenOffers(driverMarketScheduledPool, { driverId: driverIdForMarket }),
    [driverMarketScheduledPool, driverIdForMarket],
  );
  const eligibleScheduledOpenKey = useMemo(
    () => instantMarketOfferIdsKey(eligibleScheduledOpen),
    [eligibleScheduledOpen],
  );

  useEffect(() => {
    if (!isDriverSurface) {
      driverMarketPrevScheduledOpenIdsRef.current = new Set();
      driverMarketScheduledNotifyBootstrappedRef.current = false;
      return;
    }

    const pool = eligibleScheduledOpen;
    const currentIds = new Set(pool.map((r) => r.id));

    if (!fleetAuthToken || !driverEinsatzbereit) {
      driverMarketPrevScheduledOpenIdsRef.current = new Set();
      driverMarketScheduledNotifyBootstrappedRef.current = false;
      return;
    }

    if (pool.length === 0) {
      driverMarketPrevScheduledOpenIdsRef.current = currentIds;
      return;
    }

    if (!driverMarketScheduledNotifyBootstrappedRef.current) {
      driverMarketPrevScheduledOpenIdsRef.current = currentIds;
      driverMarketScheduledNotifyBootstrappedRef.current = true;
      return;
    }

    const suppressed = driverSuppressedOfferIdsRef.current;
    const newReqs = pool.filter(
      (r) => !driverMarketPrevScheduledOpenIdsRef.current.has(r.id) && !suppressed.has(r.id),
    );
    if (newReqs.length > 0 && shouldPresentDriverRideOfferNotification()) {
      const req = newReqs[0];
      void ringForDriverInstantOffer({
        rideId: req.id,
        customerName: req.customerName || "Kunde",
        fromAddress: req.fromFull || req.from || "—",
        distanceKm: null,
        estimatedFare: Number.isFinite(req.estimatedFare) ? req.estimatedFare : 0,
      });
    }
    driverMarketPrevScheduledOpenIdsRef.current = currentIds;
  }, [
    eligibleScheduledOpenKey,
    eligibleScheduledOpen,
    fleetAuthToken,
    driverEinsatzbereit,
    isDriverSurface,
  ]);

  const acceptedRequest =
    requests.find((r) =>
      r.status === "ready_for_dispatch" ||
      r.status === "accepted" ||
      r.status === "driver_arriving" ||
      r.status === "driver_waiting" ||
      r.status === "passenger_onboard" ||
      r.status === "arrived" ||
      r.status === "in_progress"
    ) ?? null;
  const completedRequest =
    requests.filter((r) => r.status === "completed").slice(-1)[0] ?? null;

  const passengerAcceptedRequest = passengerId
    ? (() => {
        const pid = passengerId;
        const candidates = requests.filter(
          (r) =>
            r.passengerId === pid &&
            (r.status === "ready_for_dispatch" ||
              r.status === "accepted" ||
              r.status === "driver_arriving" ||
              r.status === "driver_waiting" ||
              r.status === "passenger_onboard" ||
              r.status === "arrived" ||
              r.status === "in_progress"),
        );
        if (candidates.length === 0) return null;
        const lastId = lastAddedRequestId?.trim();
        if (lastId) {
          const match = candidates.find((r) => r.id === lastId);
          if (match) return match;
        }
        return [...candidates].sort((a, b) => {
          const ta =
            a.createdAt instanceof Date
              ? a.createdAt.getTime()
              : new Date(a.createdAt as string).getTime();
          const tb =
            b.createdAt instanceof Date
              ? b.createdAt.getTime()
              : new Date(b.createdAt as string).getTime();
          return tb - ta;
        })[0] ?? null;
      })()
    : null;

  const passengerCompletedRequest = passengerId
    ? requests
        .filter((r) => r.passengerId === passengerId && r.status === "completed")
        .slice(-1)[0] ?? null
    : null;

  const myActiveRequests = passengerId
    ? requests.filter((r) => r.passengerId === passengerId && isCustomerActiveRide(r))
    : [];

  const myRideRequests = passengerId
    ? requests.filter((r) => r.passengerId === passengerId && isCustomerRideRequest(r))
    : [];

  const customerFahrtenBadgeCount = passengerId
    ? countCustomerReservationBadge(requests.filter((r) => r.passengerId === passengerId))
    : 0;

  const myCancelledRequests = passengerId
    ? requests.filter((r) => r.passengerId === passengerId && isCustomerCancelledStatus(r.status))
    : [];

  return (
    <RideRequestContext.Provider
      value={{
        requests,
        scheduledPoolRequests,
        pendingRequests,
        driverMarketRequests,
        driverMarketScheduledPool,
        driverMarketPending,
        isDriverMarketConnected,
        acceptedRequest,
        completedRequest,
        passengerAcceptedRequest,
        passengerCompletedRequest,
        lastAddedRequestId,
        isConnected,
        customerRidesHydrated,
        driverMarketHydrated,
        passengerId,
        myActiveRequests,
        myRideRequests,
        myCancelledRequests,
        customerFahrtenBadgeCount,
        addRequest,
        acceptRequest,
        activateForDispatch,
        markDriverArriving,
        rejectRequest,
        rejectByDriver,
        cancelRequest,
        driverCancelRequest,
        arriveAtCustomer,
        startDriving,
        completeRequest,
        updateRequestPaymentMethod,
        updateRequestDriverNote,
        refreshRequests: fetchAll,
        refreshDriverMarketHard,
        refreshDriverMarket,
        clearDriverMarketRequests,
        suppressDriverInstantOffer,
      }}
    >
      {children}
    </RideRequestContext.Provider>
  );
}

export function useRideRequests() {
  return useContext(RideRequestContext);
}
