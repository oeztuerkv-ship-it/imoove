import { getApiBaseUrl } from "@/utils/apiBase";

export type OnrodaServiceRegion = {
  id: string;
  label: string;
  matchTerms: string[];
  isActive: boolean;
  sortOrder: number;
};

export type OnrodaAppConfig = {
  ok: true;
  version: number;
  updatedAt: string | null;
  activeCities: string[];
  serviceRegions: OnrodaServiceRegion[];
  messages: {
    outOfServiceAreaDe: string;
    bookingBlockedDe?: string;
    customerAppClosedDe?: string;
  };
  tariffs: Record<string, unknown>;
  provision: {
    defaultRate: number;
    active: boolean;
    minPercent: number | null;
    maxPercent: number | null;
  };
  dispatch: Record<string, unknown>;
  features: Record<string, unknown>;
  driverRules: Record<string, unknown>;
  bookingRules: Record<string, unknown>;
  system: Record<string, unknown>;
};

const DEFAULT: OnrodaAppConfig = {
  ok: true,
  version: 1,
  updatedAt: null,
  activeCities: ["Stuttgart", "Esslingen"],
  serviceRegions: [
    { id: "asr-stuttgart", label: "Stuttgart", matchTerms: ["stuttgart"], isActive: true, sortOrder: 1 },
    { id: "asr-esslingen", label: "Esslingen", matchTerms: ["esslingen", "esslingen am neckar"], isActive: true, sortOrder: 2 },
  ],
  messages: {
    outOfServiceAreaDe: "ONRODA ist in deiner Stadt momentan noch nicht verfügbar.",
    bookingBlockedDe: "Neue Buchungen sind vorübergehend deaktiviert.",
    customerAppClosedDe: "Die Kunden-App ist im Wartungsmodus.",
  },
  tariffs: {
    baseFare: 4.3,
    rateFirstPerKm: 3.0,
    rateAfterPerKm: 2.5,
    thresholdKm: 4,
    waitingPerHour: 38,
    onrodaFixBase: 3.5,
    onrodaFixPerKm: 2.2,
  },
  provision: { defaultRate: 0.07, active: true, minPercent: null, maxPercent: null },
  dispatch: {
    active: true,
    ownDriversFirst: true,
    exclusiveSeconds: 10,
    radiusKm: 10,
    openMarket: true,
  },
  features: {
    normalRide: true,
    preBooking: true,
    medicalRide: true,
    accessCode: true,
    companyTrip: true,
    hotelBooking: true,
    cash: true,
    invoice: true,
    onlinePayLater: false,
    driverTracking: true,
  },
  driverRules: {},
  bookingRules: {},
  system: {
    maintenanceMode: false,
    blockNewBookings: false,
    allowDriverApp: true,
    allowCustomerApp: true,
    globalNoticeDe: "",
    emergencyShutdown: false,
  },
};

let cache: { at: number; data: OnrodaAppConfig } | null = null;
const TTL_MS = 45_000;

export function getDefaultAppConfig(): OnrodaAppConfig {
  return DEFAULT;
}

export function invalidateAppConfigCache(): void {
  cache = null;
}

/**
 * Lädt `GET /api/app/config` — zentrale Plattform-Konfiguration; kurze TTL, bei Ausfall Defaults.
 */
export async function fetchAppConfig(): Promise<OnrodaAppConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return cache.data;
  }
  const base = getApiBaseUrl();
  if (!base) {
    return DEFAULT;
  }
  try {
    const res = await fetch(`${base}/app/config`, { cache: "no-store" });
    if (!res.ok) {
      return DEFAULT;
    }
    const j = (await res.json()) as Partial<OnrodaAppConfig> & { ok?: boolean };
    if (j && typeof j === "object") {
      const data: OnrodaAppConfig = {
        ...DEFAULT,
        ...j,
        ok: true,
        messages: { ...DEFAULT.messages, ...(j.messages && typeof j.messages === "object" ? j.messages : {}) },
        provision: { ...DEFAULT.provision, ...(j.provision && typeof j.provision === "object" ? j.provision : {}) },
        tariffs: { ...DEFAULT.tariffs, ...(j.tariffs && typeof j.tariffs === "object" ? j.tariffs : {}) },
        features: { ...DEFAULT.features, ...(j.features && typeof j.features === "object" ? j.features : {}) },
        system: { ...DEFAULT.system, ...(j.system && typeof j.system === "object" ? j.system : {}) },
        dispatch: { ...DEFAULT.dispatch, ...(j.dispatch && typeof j.dispatch === "object" ? j.dispatch : {}) },
        driverRules: { ...DEFAULT.driverRules, ...(j.driverRules && typeof j.driverRules === "object" ? j.driverRules : {}) },
        bookingRules: { ...DEFAULT.bookingRules, ...(j.bookingRules && typeof j.bookingRules === "object" ? j.bookingRules : {}) },
        serviceRegions: Array.isArray(j.serviceRegions) && j.serviceRegions.length > 0 ? (j.serviceRegions as OnrodaServiceRegion[]) : DEFAULT.serviceRegions,
        activeCities: Array.isArray(j.activeCities) && j.activeCities.length > 0 ? j.activeCities : DEFAULT.activeCities,
        version: typeof j.version === "number" ? j.version : 1,
        updatedAt: typeof j.updatedAt === "string" ? j.updatedAt : j.updatedAt === null ? null : DEFAULT.updatedAt,
      } as OnrodaAppConfig;
      cache = { at: Date.now(), data };
      return data;
    }
  } catch {
    /* offline */
  }
  return DEFAULT;
}

export function getOutOfServiceDe(cfg: OnrodaAppConfig): string {
  const t = cfg.messages.outOfServiceAreaDe;
  return typeof t === "string" && t.trim() ? t.trim() : DEFAULT.messages.outOfServiceAreaDe;
}

function addressMatchesServiceTerms(address: string, terms: string[]): boolean {
  const a = address.toLowerCase();
  for (const t of terms) {
    const s = String(t).trim().toLowerCase();
    if (s && a.includes(s)) return true;
  }
  return false;
}

export function clientCheckServiceArea(
  fromFull: string,
  toFull: string,
  cfg: OnrodaAppConfig,
): { ok: true } | { ok: false; message: string } {
  const from = String(fromFull ?? "").trim();
  const to = String(toFull ?? "").trim();
  const active = (cfg.serviceRegions || []).filter((r) => r.isActive);
  if (active.length === 0) {
    return { ok: true };
  }
  const startOk = active.some((r) => addressMatchesServiceTerms(from, r.matchTerms));
  const endOk = active.some((r) => addressMatchesServiceTerms(to, r.matchTerms));
  if (startOk && endOk) return { ok: true };
  return { ok: false, message: getOutOfServiceDe(cfg) };
}

export async function validateServiceAreaForBooking(
  fromFull: string,
  toFull: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const cfg = await fetchAppConfig();
  return clientCheckServiceArea(fromFull, toFull, cfg);
}

export function userFacingBookingErrorMessage(err: unknown, mapCode: (code: string) => string): string {
  if (err && typeof err === "object" && "userMessage" in err) {
    const m = (err as { userMessage?: unknown }).userMessage;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  const code = err instanceof Error ? err.message : "request_failed";
  return mapCode(code);
}
