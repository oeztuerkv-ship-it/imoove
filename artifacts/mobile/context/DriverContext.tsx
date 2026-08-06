import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";
import { getApiBaseUrl } from "@/utils/apiBase";
import {
  isDriverPresenceOnlineModeRunning,
  stopDriverPresenceEntirely,
} from "@/utils/driverBackgroundLocation";
import { acceptDriverGpsFix } from "@/utils/gpsOutlierFilter";
import {
  syncDriverExpoPushTokenIfStale,
  syncDriverExpoPushTokenWithRetry,
  unregisterDriverExpoPushToken,
} from "@/utils/syncDriverExpoPushToken";

const STORAGE_KEY = "@Onroda_driver_session";
/** Aligns with ONLINE headless Markt-Ping (2 min); Push-Token-Resync bleibt aktiv. */
const DRIVER_HEARTBEAT_MS = 120_000;
const API_BASE = getApiBaseUrl() || "https://api.onroda.de/api";

async function syncFleetMarketAvailability(authToken: string, available: boolean): Promise<void> {
  const tok = authToken.trim();
  if (!tok) throw new Error("missing_auth_token");
  const res = await fetch(`${API_BASE}/fleet-driver/v1/market-availability`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${tok}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ available }),
  });
  if (!res.ok) {
    let code = `http_${res.status}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (typeof data.error === "string" && data.error.trim()) code = data.error.trim();
    } catch {
      /* ignore */
    }
    throw new Error(code);
  }
}

/** Lesbare Meldung zu `POST /fleet-auth/login` — siehe `getFleetLoginCompanyDenyReason` / `fleetAuth.ts`. */
function fleetLoginUserMessage(errorCode: string): string {
  switch (errorCode) {
    case "invalid_credentials":
      return "E-Mail oder Passwort ist falsch.";
    case "company_not_found":
      return "Anmeldung derzeit nicht möglich. Bitte wenden Sie sich an Ihren Betrieb.";
    case "company_inactive":
    case "company_blocked":
    case "contract_not_active":
      return "Ihr Unternehmen ist noch nicht freigeschaltet. Bitte wenden Sie sich an Ihren Betrieb.";
    case "fleet_login_only_taxi_company":
      return "Fahrer-Login steht nur Taxi-Unternehmen zur Verfügung.";
    case "driver_suspended":
    case "driver_access_suspended":
      return "Ihr Fahrer-Zugang ist pausiert. Bitte den Betrieb kontaktieren.";
    case "driver_account_inactive":
      return "Ihr Fahrerkonto ist deaktiviert. Bitte Ihr Unternehmen oder den Support kontaktieren.";
    case "rate_limited":
      return "Zu viele Anmeldeversuche. Bitte einen Moment warten und erneut versuchen.";
    case "email_and_password_required":
      return "Bitte E-Mail und Passwort eingeben.";
    case "fleet_jwt_not_configured":
    case "database_not_configured":
      return "Dienst vorübergehend nicht verfügbar. Bitte später erneut versuchen.";
    case "company_access_blocked":
      return "Unternehmenszugang blockiert. Bitte den Betrieb oder den Support (Vertrag / Sperre / Aktivierung).";
    case "panel_email_not_fleet_driver":
      return "Diese E-Mail ist für das Partner-Portal (Unternehmer) registriert. Bitte melden Sie sich dort an oder nutzen Sie die vom Unternehmen angelegte Fahrer-E-Mail mit Einmal-Passwort.";
    default:
      return errorCode || "Anmeldung fehlgeschlagen.";
  }
}

const DEFAULT_NICHT_FREI_MSG =
  "Sie sind noch nicht freigeschaltet. Bitte wenden Sie sich an Ihren Betrieb. Die Anmeldung ist möglich; Aufträge sind bis zur Freigabe gesperrt.";

const ME_SYNC_FAILED_TITLE = "Profil-Sync fehlgeschlagen";

type FleetMeFetchResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; errorCode: string; message: string };

function fleetMeUserMessage(errorCode: string, status: number, rawText: string): string {
  switch (errorCode) {
    case "invalid_token":
      return "Profil konnte nicht geladen werden: Sitzung wird vom Server nicht akzeptiert (invalid_token). Bitte erneut anmelden. Bleibt das bestehen, Betrieb oder Onroda informieren — kein Freigabe-Problem.";
    case "token_revoked":
      return "Ihre Sitzung ist abgelaufen. Bitte erneut anmelden.";
    case "unauthorized":
      return "Profil konnte nicht geladen werden: kein gültiger Fahrer-Token.";
    case "not_found":
      return "Profil konnte nicht geladen werden: Fahrer auf dem Server nicht gefunden.";
    case "driver_account_inactive":
      return "Ihr Fahrerkonto ist deaktiviert.";
    case "driver_access_suspended":
      return "Ihr Fahrerzugang ist gesperrt.";
    default:
      if (status === 503) {
        return "Profil konnte nicht geladen werden: Server-Datenbank nicht verfügbar.";
      }
      if (rawText.trim().startsWith("<")) {
        return `Profil konnte nicht geladen werden: Server antwortete mit HTML (HTTP ${status}).`;
      }
      return `Profil konnte nicht geladen werden (HTTP ${status}${errorCode ? `, ${errorCode}` : ""}). Das ist kein Freigabe-Hinweis — bitte erneut anmelden.`;
  }
}

async function fetchFleetDriverMe(token: string): Promise<FleetMeFetchResult> {
  try {
    const res = await fetch(`${API_BASE}/fleet-driver/v1/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const rawText = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    } catch {
      data = {};
    }
    if (!res.ok || data.ok !== true || !data.driver) {
      const errorCode = typeof data.error === "string" ? data.error : "";
      return {
        ok: false,
        status: res.status,
        errorCode,
        message: fleetMeUserMessage(errorCode, res.status, rawText),
      };
    }
    return { ok: true, data };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      status: 0,
      errorCode: "network_error",
      message:
        raw.includes("Network request failed") || raw.includes("NSLocalizedDescription")
          ? "Profil konnte nicht geladen werden — keine Verbindung zum Server."
          : `Profil konnte nicht geladen werden: ${raw}`,
    };
  }
}

function applyFleetMeSyncFailure(profile: DriverProfile, message: string): DriverProfile {
  return {
    ...profile,
    einsatzbereit: false,
    // Lokalen Markt-Schalter nicht killen — sonst schreibt ein Folge-Effect/Sync false in die DB,
    // obwohl der Fahrer ONLINE war und nur /me kurz fehlschlug.
    meSyncError: message,
    notFreigegebenMessage: message,
    blockBannerTitle: ME_SYNC_FAILED_TITLE,
    driverBlockKind: "other",
  };
}

function normalizeDriverPlaceholder(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed || trimmed === "—" || trimmed === "-") return "";
  return trimmed;
}

export type DriverOfferStats = {
  periodDays: number;
  offersSent: number;
  offersAccepted: number;
  offersRejected: number;
  acceptanceRatePercent: number | null;
  rejectionRatePercent: number | null;
  dispatchRejectStreak: number;
};

export type DriverCancellationSuspension = {
  active: boolean;
  suspendedUntil: string | null;
  message: string | null;
  cancellationsInWindow: number;
  windowDays: number;
  threshold: number;
};

const DEFAULT_CANCELLATION_SUSPENSION: DriverCancellationSuspension = {
  active: false,
  suspendedUntil: null,
  message: null,
  cancellationsInWindow: 0,
  windowDays: 7,
  threshold: 5,
};

function normalizeCancellationSuspensionFromMe(raw: unknown): DriverCancellationSuspension {
  const o = (raw ?? {}) as Record<string, unknown>;
  const threshold =
    typeof o.threshold === "number" && Number.isFinite(o.threshold) && o.threshold > 0
      ? Math.round(o.threshold)
      : DEFAULT_CANCELLATION_SUSPENSION.threshold;
  const windowDays =
    typeof o.windowDays === "number" && Number.isFinite(o.windowDays) && o.windowDays > 0
      ? Math.round(o.windowDays)
      : DEFAULT_CANCELLATION_SUSPENSION.windowDays;
  const cancellationsInWindow =
    typeof o.cancellationsInWindow === "number" && Number.isFinite(o.cancellationsInWindow)
      ? Math.max(0, Math.round(o.cancellationsInWindow))
      : 0;
  const suspendedUntil =
    typeof o.suspendedUntil === "string" && o.suspendedUntil.trim() ? o.suspendedUntil.trim() : null;
  const message = typeof o.message === "string" && o.message.trim() ? o.message.trim() : null;
  return {
    active: o.active === true,
    suspendedUntil,
    message,
    cancellationsInWindow,
    windowDays,
    threshold,
  };
}

const DEFAULT_OFFER_STATS: DriverOfferStats = {
  periodDays: 30,
  offersSent: 0,
  offersAccepted: 0,
  offersRejected: 0,
  acceptanceRatePercent: null,
  rejectionRatePercent: null,
  dispatchRejectStreak: 0,
};

function normalizeOfferStatsFromMe(raw: unknown): DriverOfferStats {
  const o = (raw ?? {}) as Record<string, unknown>;
  const periodDays =
    typeof o.periodDays === "number" && Number.isFinite(o.periodDays) && o.periodDays > 0
      ? Math.round(o.periodDays)
      : DEFAULT_OFFER_STATS.periodDays;
  const num = (key: keyof DriverOfferStats) => {
    const v = o[key];
    return typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0;
  };
  const nullableRate = (key: "acceptanceRatePercent" | "rejectionRatePercent") => {
    const v = o[key];
    return typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
  };
  return {
    periodDays,
    offersSent: num("offersSent"),
    offersAccepted: num("offersAccepted"),
    offersRejected: num("offersRejected"),
    acceptanceRatePercent: nullableRate("acceptanceRatePercent"),
    rejectionRatePercent: nullableRate("rejectionRatePercent"),
    dispatchRejectStreak: num("dispatchRejectStreak"),
  };
}

function mergeFleetDriverMeIntoProfile(prev: DriverProfile, me: Record<string, unknown>): DriverProfile {
  const d = (me.driver ?? {}) as Record<string, unknown>;
  const av = (me.assignedVehicle ?? {}) as Record<string, unknown>;
  const assignedPlate =
    typeof av.licensePlate === "string" && av.licensePlate.trim()
      ? av.licensePlate.trim()
      : typeof av.plate === "string" && av.plate.trim()
        ? av.plate.trim()
        : typeof av.license_plate === "string" && av.license_plate.trim()
          ? av.license_plate.trim()
          : "";
  const assignedKonzession =
    typeof me.konzessionNumber === "string" && me.konzessionNumber.trim()
      ? me.konzessionNumber.trim()
      : typeof av.konzessionNumber === "string" && av.konzessionNumber.trim()
        ? av.konzessionNumber.trim()
        : typeof av.konzession_number === "string" && av.konzession_number.trim()
          ? av.konzession_number.trim()
          : typeof me.companyConcessionNumber === "string" && me.companyConcessionNumber.trim()
            ? me.companyConcessionNumber.trim()
            : "";
  const einsatzbereit = me.einsatzbereit === true;
  const isMarketOnline = me.isMarketOnline === true;
  const notFreigegebenMessage =
    typeof me.notFreigegebenMessage === "string" && me.notFreigegebenMessage.trim()
      ? me.notFreigegebenMessage.trim()
      : einsatzbereit
        ? ""
        : DEFAULT_NICHT_FREI_MSG;
  const blockBannerTitle =
    typeof me.blockBannerTitle === "string" && me.blockBannerTitle.trim()
      ? me.blockBannerTitle.trim()
      : "";
  const driverBlockKind =
    typeof me.driverBlockKind === "string" && me.driverBlockKind.trim() ? me.driverBlockKind.trim() : "";
  const accessStatus = String(d.accessStatus ?? "");
  const cc = (me.companyCommission ?? {}) as Record<string, unknown>;
  const commissionRate =
    typeof cc.rate === "number" && Number.isFinite(cc.rate) && cc.rate >= 0 ? cc.rate : 0.1;
  const commissionRatePercent =
    typeof cc.ratePercent === "number" && Number.isFinite(cc.ratePercent)
      ? cc.ratePercent
      : Math.round(commissionRate * 1000) / 10;
  const minCommissionEur =
    typeof cc.minCommissionEur === "number" && Number.isFinite(cc.minCommissionEur)
      ? cc.minCommissionEur
      : null;
  const medicalTransportAuthorized = me.medicalTransportAuthorized === true;
  const featureKkModule = me.featureKkModule === true;
  const permissionKkModule = me.permissionKkModule === true;
  const isOwner = me.isOwner === true;
  const kkModuleAuthorized = me.kkModuleAuthorized === true;
  const dispatchPriorityRaw = String(me.dispatchPriority ?? d.dispatchPriority ?? "B")
    .trim()
    .toUpperCase();
  const dispatchPriority: DriverProfile["dispatchPriority"] =
    dispatchPriorityRaw === "A" || dispatchPriorityRaw === "B" ? dispatchPriorityRaw : "B";
  const ratingCount =
    typeof d.ratingCount === "number" && Number.isFinite(d.ratingCount) && d.ratingCount >= 0
      ? Math.round(d.ratingCount)
      : prev.ratingCount;
  const ratingAverage =
    typeof d.ratingAverage === "number" && Number.isFinite(d.ratingAverage) ? d.ratingAverage : null;
  const avatarHasPhoto = me.avatarHasPhoto === true;
  const avatarShowToCustomer = me.avatarShowToCustomer === true;
  const avatarPreviewUrl =
    typeof me.avatarPreviewUrl === "string" && me.avatarPreviewUrl.trim()
      ? me.avatarPreviewUrl.trim()
      : null;
  const avatarCustomerUrl =
    typeof me.avatarCustomerUrl === "string" && me.avatarCustomerUrl.trim()
      ? me.avatarCustomerUrl.trim()
      : null;
  return {
    ...prev,
    id: String(d.id ?? prev.id ?? ""),
    companyId: String(d.companyId ?? prev.companyId ?? ""),
    name:
      `${String(d.firstName ?? "").trim()} ${String(d.lastName ?? "").trim()}`.trim() ||
      prev.name,
    plate: assignedPlate || normalizeDriverPlaceholder(prev.plate) || prev.plate,
    konzessionNumber:
      assignedKonzession || normalizeDriverPlaceholder(prev.konzessionNumber) || "—",
    car:
      typeof av.model === "string" && av.model.trim()
        ? av.model.trim()
        : prev.car,
    email: String(d.email ?? prev.email ?? "").trim().toLowerCase(),
    mustChangePassword: Boolean(d.mustChangePassword ?? prev.mustChangePassword),
    blockedUntil: accessStatus === "active" ? null : prev.blockedUntil,
    einsatzbereit,
    isAvailable: einsatzbereit ? isMarketOnline : false,
    notFreigegebenMessage,
    blockBannerTitle: einsatzbereit ? "" : blockBannerTitle,
    driverBlockKind: einsatzbereit ? "" : driverBlockKind,
    companyCommission: {
      rate: commissionRate,
      ratePercent: commissionRatePercent,
      minCommissionEur,
    },
    medicalTransportAuthorized,
    featureKkModule,
    permissionKkModule,
    isOwner,
    kkModuleAuthorized,
    dispatchPriority,
    rating: ratingCount > 0 && ratingAverage != null ? ratingAverage : null,
    ratingCount,
    offerStats: normalizeOfferStatsFromMe(me.offerStats),
    cancellationSuspension: normalizeCancellationSuspensionFromMe(me.cancellationSuspension),
    avatarHasPhoto,
    avatarShowToCustomer,
    avatarPreviewUrl,
    avatarCustomerUrl,
    meSyncError: "",
  };
}

function patchStoredDriver(next: DriverProfile) {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
}

function normalizeProfileFromStorage(parsed: unknown): DriverProfile {
  const p = parsed as Partial<DriverProfile> & Record<string, unknown>;
  return {
    id: String(p.id ?? ""),
    companyId: String(p.companyId ?? ""),
    name: String(p.name ?? "Fahrer"),
    email: String(p.email ?? "").trim().toLowerCase(),
    authToken: String(p.authToken ?? ""),
    mustChangePassword: Boolean(p.mustChangePassword),
    plate: String(p.plate ?? "—"),
    konzessionNumber: String(p.konzessionNumber ?? "—"),
    car: String(p.car ?? "—"),
    rating: typeof p.rating === "number" && Number.isFinite(p.rating) ? p.rating : null,
    ratingCount:
      typeof p.ratingCount === "number" && Number.isFinite(p.ratingCount) && p.ratingCount >= 0
        ? Math.round(p.ratingCount)
        : 0,
    offerStats: normalizeOfferStatsFromMe(p.offerStats),
    cancellationSuspension: normalizeCancellationSuspensionFromMe(p.cancellationSuspension),
    isAvailable: Boolean(p.isAvailable),
    blockedUntil: typeof p.blockedUntil === "string" || p.blockedUntil === null ? (p.blockedUntil as string | null) : null,
    einsatzbereit: p.einsatzbereit === true,
    notFreigegebenMessage: typeof p.notFreigegebenMessage === "string" ? p.notFreigegebenMessage : "",
    blockBannerTitle: typeof p.blockBannerTitle === "string" ? p.blockBannerTitle : "",
    driverBlockKind: typeof p.driverBlockKind === "string" ? p.driverBlockKind : "",
    companyCommission: normalizeCompanyCommissionFromStorage(p.companyCommission),
    medicalTransportAuthorized: p.medicalTransportAuthorized === true,
    featureKkModule: p.featureKkModule === true,
    permissionKkModule: p.permissionKkModule === true,
    isOwner: p.isOwner === true,
    kkModuleAuthorized: p.kkModuleAuthorized === true,
    dispatchPriority:
      p.dispatchPriority === "A" || p.dispatchPriority === "B" ? p.dispatchPriority : "B",
    avatarHasPhoto: p.avatarHasPhoto === true,
    avatarShowToCustomer: p.avatarShowToCustomer === true,
    avatarPreviewUrl:
      typeof p.avatarPreviewUrl === "string" && p.avatarPreviewUrl.trim()
        ? p.avatarPreviewUrl.trim()
        : null,
    avatarCustomerUrl:
      typeof p.avatarCustomerUrl === "string" && p.avatarCustomerUrl.trim()
        ? p.avatarCustomerUrl.trim()
        : null,
    meSyncError: typeof p.meSyncError === "string" ? p.meSyncError : "",
  };
}

function normalizeCompanyCommissionFromStorage(
  raw: unknown,
): DriverCompanyCommission {
  const cc = (raw ?? {}) as Record<string, unknown>;
  const rate =
    typeof cc.rate === "number" && Number.isFinite(cc.rate) && cc.rate >= 0 ? cc.rate : 0.1;
  return {
    rate,
    ratePercent:
      typeof cc.ratePercent === "number" && Number.isFinite(cc.ratePercent)
        ? cc.ratePercent
        : Math.round(rate * 1000) / 10,
    minCommissionEur:
      typeof cc.minCommissionEur === "number" && Number.isFinite(cc.minCommissionEur)
        ? cc.minCommissionEur
        : null,
  };
}

export type DriverCompanyCommission = {
  rate: number;
  ratePercent: number;
  minCommissionEur: number | null;
};

export interface DriverProfile {
  id: string;
  companyId: string;
  name: string;
  email: string;
  authToken: string;
  mustChangePassword: boolean;
  plate: string;
  /** Freigegebenes Zuweisungs-Fahrzeug, sonst Admin-Mandanten-Konzession (`/fleet-driver/v1/me`). */
  konzessionNumber: string;
  car: string;
  /** Kunden-Sterne-Durchschnitt (1–5); null wenn noch keine Bewertung. */
  rating: number | null;
  ratingCount: number;
  offerStats: DriverOfferStats;
  cancellationSuspension: DriverCancellationSuspension;
  isAvailable: boolean;
  blockedUntil: string | null;
  /** Wahr, wenn alle Einsatzbereit-Bedingungen erfüllt sind (siehe API `/fleet-driver/v1/me`). */
  einsatzbereit: boolean;
  notFreigegebenMessage: string;
  /** Kurztitel fürs Sperr-Banner (API). */
  blockBannerTitle: string;
  /** z. B. access_suspended | vehicle | compliance | other */
  driverBlockKind: string;
  /** ONRODA-Provisionssatz des Mandanten (aus `/fleet-driver/v1/me`). */
  companyCommission: DriverCompanyCommission;
  /** Krankenfahrt-Freigabe (aus `/fleet-driver/v1/me`). */
  medicalTransportAuthorized: boolean;
  /** Mandant: KK-Modul SaaS freigeschaltet. */
  featureKkModule: boolean;
  /** Fahrer: explizite KK-Berechtigung (Mitarbeiter). */
  permissionKkModule: boolean;
  /** Inhaber-Fahrerkonto. */
  isOwner: boolean;
  /** Effektiver KK-Modul-Zugriff (Scan/Upload). */
  kkModuleAuthorized: boolean;
  /** Premium-Dispatch A/B (Admin). */
  dispatchPriority: "A" | "B";
  /** Server-Profilfoto vorhanden. */
  avatarHasPhoto: boolean;
  /** Privacy: Foto dem Kunden bei aktiver Fahrt zeigen. */
  avatarShowToCustomer: boolean;
  /** Eigenes Preview (GET /fleet-driver/v1/me/avatar, Bearer nötig). */
  avatarPreviewUrl: string | null;
  /** Öffentliche Kunden-URL nur bei Consent; sonst null. */
  avatarCustomerUrl: string | null;
  /** Gesetzt, wenn GET /fleet-driver/v1/me nach Login/Refresh fehlschlägt (≠ Freigabe-Block). */
  meSyncError: string;
}

interface DriverContextValue {
  loading: boolean;
  isLoggedIn: boolean;
  isBlocked: boolean;
  blockedUntilDate: Date | null;
  driver: DriverProfile | null;
  refreshEinsatzbereit: () => Promise<DriverProfile | null>;
  patchAssignedVehicleSnapshot: (snap: {
    plate?: string;
    konzessionNumber?: string;
    car?: string;
  }) => void;
  patchDriverAvatarState: (snap: {
    avatarHasPhoto: boolean;
    avatarShowToCustomer: boolean;
    avatarPreviewUrl: string | null;
    avatarCustomerUrl: string | null;
  }) => void;
  login: (
    email: string,
    password: string,
  ) => Promise<
    | { ok: true; mustChangePassword: boolean; meSyncFailed?: boolean; meSyncError?: string }
    | { ok: false; error: string }
  >;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => Promise<void>;
  setAvailable: (v: boolean) => Promise<void>;
  blockDriver48h: () => Promise<void>;
  lastError: string;
}

const DriverContext = createContext<DriverContextValue>({
  loading: true,
  isLoggedIn: false,
  isBlocked: false,
  blockedUntilDate: null,
  driver: null,
  refreshEinsatzbereit: async () => null,
  patchAssignedVehicleSnapshot: () => {},
  patchDriverAvatarState: () => {},
  login: async () => ({ ok: false, error: "Anmeldung fehlgeschlagen." }),
  changePassword: async () => ({ ok: false, error: "Passwortänderung fehlgeschlagen." }),
  logout: async () => {},
  setAvailable: async () => {},
  blockDriver48h: async () => {},
  lastError: "",
});

export function DriverProvider({ children }: { children: React.ReactNode }) {
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState("");
  /** Invalidiert parallele /me-Antworten nach ONLINE/OFFLINE-Toggle (kein Stale-Overwrite). */
  const meSyncGenerationRef = React.useRef(0);
  const availabilityPatchInFlightRef = React.useRef(false);
  const driverRef = React.useRef<DriverProfile | null>(null);
  driverRef.current = driver;

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(async (raw) => {
        if (!raw || cancelled) return;
        try {
          const base = normalizeProfileFromStorage(JSON.parse(raw));
          if (!base.authToken) {
            return;
          }
          const res = await fetchFleetDriverMe(base.authToken);
          if (!res.ok) {
            const failed = applyFleetMeSyncFailure(base, res.message);
            if (!cancelled) {
              setDriver(failed);
              patchStoredDriver(failed);
              setLastError(res.message);
            }
            return;
          }
          if (!cancelled) {
            const next = mergeFleetDriverMeIntoProfile(base, res.data);
            setDriver(next);
            patchStoredDriver(next);
          }
        } catch {
          await AsyncStorage.removeItem(STORAGE_KEY);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!driver?.authToken || !driver.id || !driver.companyId) return;
    if (!driver.isAvailable || !driver.einsatzbereit) return;
    void (async () => {
      const { ensureDriverRideOfferAndroidChannel } = await import(
        "@/utils/ensureDriverRideOfferAndroidChannel"
      );
      await ensureDriverRideOfferAndroidChannel();
      await syncDriverExpoPushTokenWithRetry({
        authToken: driver.authToken,
        fleetDriverId: driver.id,
        companyId: driver.companyId,
      });
    })();
  }, [driver?.authToken, driver?.id, driver?.companyId, driver?.isAvailable, driver?.einsatzbereit]);

  useEffect(() => {
    if (!driver?.authToken || !driver.id || !driver.companyId) return;
    if (!driver.isAvailable || !driver.einsatzbereit) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void syncDriverExpoPushTokenWithRetry({
        authToken: driver.authToken,
        fleetDriverId: driver.id,
        companyId: driver.companyId,
      });
    });
    return () => sub.remove();
  }, [driver?.authToken, driver?.id, driver?.companyId, driver?.isAvailable, driver?.einsatzbereit]);

  const login = useCallback(
    async (
      email: string,
      password: string,
    ): Promise<
      | { ok: true; mustChangePassword: boolean; meSyncFailed?: boolean; meSyncError?: string }
      | { ok: false; error: string }
    > => {
    setLastError("");
    try {
      const res = await fetch(`${API_BASE}/fleet-auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const rawText = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
      } catch {
        data = {};
      }

      if (!res.ok || data?.ok !== true || !data?.token || !data?.driver) {
        const parsedError = typeof data.error === "string" ? data.error : "";
        const parsedHint = typeof data.hint === "string" ? data.hint : "";
        const parsedMessage = typeof data.message === "string" ? data.message.trim() : "";
        const bodySnippet = rawText.trim().slice(0, 400);
        const userFacing = parsedMessage
          ? parsedMessage
          : parsedError
            ? [fleetLoginUserMessage(parsedError), parsedHint].filter(Boolean).join("\n\n")
            : parsedHint
              ? parsedHint
              : `HTTP ${res.status} ${res.statusText || ""}\nURL: ${API_BASE}/fleet-auth/login\n${bodySnippet || "Anmeldung fehlgeschlagen."}`.trim();
        setLastError(userFacing);
        return { ok: false, error: userFacing };
      }
      const d = data.driver as Record<string, unknown>;
      const token = String(data.token);
      const profile: DriverProfile = {
        id: String(d.id ?? ""),
        companyId: String(d.companyId ?? ""),
        name: `${String(d.firstName ?? "").trim()} ${String(d.lastName ?? "").trim()}`.trim() || "Fahrer",
        email: String(d.email ?? "").trim().toLowerCase(),
        authToken: token,
        mustChangePassword: Boolean(data.passwordChangeRequired ?? d.mustChangePassword),
        plate: "—",
        konzessionNumber: "—",
        car: "—",
        rating: null,
        ratingCount: 0,
        offerStats: DEFAULT_OFFER_STATS,
        cancellationSuspension: DEFAULT_CANCELLATION_SUSPENSION,
        isAvailable: false,
        blockedUntil: null,
        einsatzbereit: false,
        notFreigegebenMessage: DEFAULT_NICHT_FREI_MSG,
        blockBannerTitle: "",
        driverBlockKind: "",
        meSyncError: "",
        companyCommission: { rate: 0.1, ratePercent: 10, minCommissionEur: null },
        medicalTransportAuthorized: false,
        featureKkModule: false,
        permissionKkModule: false,
        isOwner: false,
        kkModuleAuthorized: false,
        dispatchPriority: "B",
        avatarHasPhoto: false,
        avatarShowToCustomer: false,
        avatarPreviewUrl: null,
        avatarCustomerUrl: null,
      };
      setDriver(profile);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      let meSyncFailed = false;
      let meSyncError: string | undefined;
      try {
        const meResult = await fetchFleetDriverMe(token);
        if (meResult.ok) {
          const enriched = mergeFleetDriverMeIntoProfile(profile, meResult.data);
          setDriver(enriched);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(enriched));
          // Push-Sync nicht den Login blockieren (Retries + Expo können mehrere Sekunden dauern).
          void syncDriverExpoPushTokenWithRetry({
            authToken: token,
            fleetDriverId: enriched.id,
            companyId: enriched.companyId,
          });
        } else {
          meSyncFailed = true;
          meSyncError = meResult.message;
          const failed = applyFleetMeSyncFailure(profile, meResult.message);
          setDriver(failed);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(failed));
          setLastError(meResult.message);
        }
      } catch {
        const msg =
          "Profil konnte nicht geladen werden — Netzwerkfehler nach der Anmeldung. Bitte erneut versuchen.";
        meSyncFailed = true;
        meSyncError = msg;
        const failed = applyFleetMeSyncFailure(profile, msg);
        setDriver(failed);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(failed));
        setLastError(msg);
      }
      const mustChangePassword = Boolean(data.passwordChangeRequired ?? d.mustChangePassword);
      return meSyncFailed
        ? { ok: true, mustChangePassword, meSyncFailed: true, meSyncError }
        : { ok: true, mustChangePassword };
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const msg =
        raw.includes("Network request failed") || raw.includes("NSLocalizedDescription")
          ? "Verbindung zum Server fehlgeschlagen. Bitte Internet prüfen und erneut versuchen."
          : `Netzwerkfehler beim Fahrer-Login: ${raw}`;
      setLastError(msg);
      return { ok: false, error: msg };
    }
    },
    [],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!driver?.authToken) return { ok: false, error: "Nicht angemeldet." };
      if (newPassword.length < 10) {
        return { ok: false, error: "Neues Passwort muss mindestens 10 Zeichen haben." };
      }
      try {
        const res = await fetch(`${API_BASE}/fleet-driver/v1/change-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${driver.authToken}`,
          },
          body: JSON.stringify({ currentPassword, newPassword }),
        });
        const rawText = await res.text();
        let data: Record<string, unknown> = {};
        try {
          data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
        } catch {
          data = {};
        }
        if (!res.ok || data?.ok !== true) {
          const parsedError = typeof data.error === "string" ? data.error : "";
          const parsedHint = typeof data.hint === "string" ? data.hint : "";
          const bodySnippet = rawText.trim().slice(0, 400);
          const msg =
            parsedError || parsedHint
              ? [parsedError, parsedHint].filter(Boolean).join("\n\n")
              : `HTTP ${res.status} ${res.statusText || ""}\n${bodySnippet || "Passwortänderung fehlgeschlagen."}`.trim();
          return { ok: false, error: msg };
        }
        setDriver((prev) => {
          if (!prev) return prev;
          const updated = { ...prev, mustChangePassword: false };
          patchStoredDriver(updated);
          return updated;
        });
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: `Netzwerkfehler bei Passwortänderung: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
    [driver?.authToken],
  );

  const logout = useCallback(async () => {
    await stopDriverPresenceEntirely();
    const authToken = driver?.authToken?.trim();
    if (authToken) {
      try {
        await syncFleetMarketAvailability(authToken, false);
        await unregisterDriverExpoPushToken({ authToken });
        await fetch(`${API_BASE}/fleet-auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${authToken}` },
        });
      } catch {
        /* offline */
      }
    }
    setDriver(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, [driver?.authToken]);

  const refreshEinsatzbereit = useCallback(async (): Promise<DriverProfile | null> => {
    const token = driverRef.current?.authToken;
    if (!token) return null;
    const gen = meSyncGenerationRef.current;
    const meResult = await fetchFleetDriverMe(token);
    if (gen !== meSyncGenerationRef.current) return driverRef.current;
    if (!meResult.ok) {
      setLastError(meResult.message);
      let next: DriverProfile | null = null;
      setDriver((prev) => {
        if (!prev) return prev;
        next = applyFleetMeSyncFailure(prev, meResult.message);
        patchStoredDriver(next);
        return next;
      });
      return next;
    }
    let next: DriverProfile | null = null;
    setDriver((prev) => {
      if (!prev) return prev;
      // Während PATCH ONLINE/OFFLINE: Server-/me-Wert für isAvailable nicht überschreiben.
      if (availabilityPatchInFlightRef.current || gen !== meSyncGenerationRef.current) {
        next = {
          ...mergeFleetDriverMeIntoProfile(prev, meResult.data),
          isAvailable: prev.isAvailable,
        };
      } else {
        next = mergeFleetDriverMeIntoProfile(prev, meResult.data);
      }
      patchStoredDriver(next);
      return next;
    });
    return next;
  }, []);

  const patchAssignedVehicleSnapshot = useCallback(
    (snap: { plate?: string; konzessionNumber?: string; car?: string }) => {
      setDriver((prev) => {
        if (!prev) return prev;
        const plate = normalizeDriverPlaceholder(snap.plate) || undefined;
        const konzessionNumber = normalizeDriverPlaceholder(snap.konzessionNumber) || undefined;
        const car = normalizeDriverPlaceholder(snap.car) || undefined;
        if (!plate && !konzessionNumber && !car) return prev;
        const next = {
          ...prev,
          ...(plate ? { plate } : {}),
          ...(konzessionNumber ? { konzessionNumber } : {}),
          ...(car ? { car } : {}),
        };
        patchStoredDriver(next);
        return next;
      });
    },
    [],
  );

  const patchDriverAvatarState = useCallback(
    (snap: {
      avatarHasPhoto: boolean;
      avatarShowToCustomer: boolean;
      avatarPreviewUrl: string | null;
      avatarCustomerUrl: string | null;
    }) => {
      setDriver((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          avatarHasPhoto: snap.avatarHasPhoto,
          avatarShowToCustomer: snap.avatarShowToCustomer,
          avatarPreviewUrl: snap.avatarPreviewUrl,
          avatarCustomerUrl: snap.avatarCustomerUrl,
        };
        patchStoredDriver(next);
        return next;
      });
    },
    [],
  );

  const setAvailable = useCallback(async (v: boolean): Promise<void> => {
    if (!driver?.authToken) return;
    if (v && !driver.einsatzbereit) return;
    availabilityPatchInFlightRef.current = true;
    meSyncGenerationRef.current += 1;
    const patchGen = meSyncGenerationRef.current;
    setDriver((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, isAvailable: v };
      patchStoredDriver(updated);
      return updated;
    });
    try {
      await syncFleetMarketAvailability(driver.authToken, v);
      if (patchGen !== meSyncGenerationRef.current) return;
      if (v && driver.id && driver.companyId) {
        await syncDriverExpoPushTokenWithRetry({
          authToken: driver.authToken,
          fleetDriverId: driver.id,
          companyId: driver.companyId,
        });
      } else if (!v) {
        await unregisterDriverExpoPushToken({ authToken: driver.authToken });
      }
    } catch (e) {
      setDriver((prev) => {
        if (!prev) return prev;
        const reverted = { ...prev, isAvailable: !v };
        patchStoredDriver(reverted);
        return reverted;
      });
      throw e;
    } finally {
      if (patchGen === meSyncGenerationRef.current) {
        availabilityPatchInFlightRef.current = false;
      }
    }
  }, [driver?.authToken, driver?.einsatzbereit, driver?.id, driver?.companyId]);

  const blockDriver48h = useCallback(async () => {
    const until = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    setDriver((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, blockedUntil: until, isAvailable: false };
      patchStoredDriver(updated);
      return updated;
    });
  }, []);

  const blockedUntilDate = driver?.blockedUntil ? new Date(driver.blockedUntil) : null;
  const isBlocked = blockedUntilDate !== null && blockedUntilDate > new Date();

  useEffect(() => {
    if (!driver?.authToken) return;
    if (driver.einsatzbereit) return;
    if (!driver.isAvailable) return;
    // Nur lokal OFFLINE erzwingen — nicht blind PATCH false (Race mit frischem ONLINE-Toggle).
    setDriver((prev) => {
      if (!prev || prev.einsatzbereit || !prev.isAvailable) return prev;
      const updated = { ...prev, isAvailable: false };
      patchStoredDriver(updated);
      return updated;
    });
  }, [driver?.einsatzbereit, driver?.isAvailable, driver?.authToken]);

  // Kein useEffect mehr, der isAvailable → Server spiegelt: das hat nach Login-Offline
  // und bei parallelem /me Stale-false zurückgeschrieben und ONLINE wieder gekillt.

  useEffect(() => {
    if (!driver?.authToken) return;
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        void refreshEinsatzbereit();
      }
    });
    return () => sub.remove();
  }, [driver?.authToken, refreshEinsatzbereit]);

  useEffect(() => {
    if (!driver?.authToken) return;
    const t = setInterval(() => {
      void (async () => {
        const body: { lat?: number; lon?: number } = {};
        const androidOnlineFgs = await isDriverPresenceOnlineModeRunning();
        if (driver.isAvailable && !androidOnlineFgs) {
          try {
            const { getLastKnownPositionAsync } = await import("expo-location");
            const pos = await getLastKnownPositionAsync();
            if (pos?.coords && Number.isFinite(pos.coords.latitude) && Number.isFinite(pos.coords.longitude)) {
              const fix = acceptDriverGpsFix(pos.coords.latitude, pos.coords.longitude);
              if (fix) {
                body.lat = fix.lat;
                body.lon = fix.lon;
              }
            }
          } catch {
            /* GPS optional */
          }
        }
        await fetch(`${API_BASE}/fleet-driver/v1/ping`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${driver.authToken}`,
            ...(Object.keys(body).length ? { "Content-Type": "application/json" } : {}),
          },
          ...(Object.keys(body).length ? { body: JSON.stringify(body) } : {}),
        }).catch(() => {});
      })();
      if (driver.id && driver.companyId && driver.isAvailable && driver.einsatzbereit) {
        void syncDriverExpoPushTokenIfStale({
          authToken: driver.authToken,
          fleetDriverId: driver.id,
          companyId: driver.companyId,
        });
      }
    }, DRIVER_HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [driver?.authToken, driver?.isAvailable, driver?.einsatzbereit, driver?.id, driver?.companyId]);

  return (
    <DriverContext.Provider
      value={{
        loading,
        isLoggedIn: !!driver,
        isBlocked,
        blockedUntilDate,
        driver,
        refreshEinsatzbereit,
        patchAssignedVehicleSnapshot,
        patchDriverAvatarState,
        login,
        changePassword,
        logout,
        setAvailable,
        blockDriver48h,
        lastError,
      }}
    >
      {children}
    </DriverContext.Provider>
  );
}

export function useDriver() {
  return useContext(DriverContext);
}
