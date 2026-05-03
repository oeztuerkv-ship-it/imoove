import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { useOnrodaAppConfig } from "@/context/AppConfigContext";
import { pickTariffForStartAddress } from "@/lib/appConfig";
import { calculateFareFromAppConfig, appTariffFromRecord, ceilToTenth, type FareBreakdown } from "@/utils/fareCalculator";
import { getApiBaseUrl } from "@/utils/apiBase";
import { type GeoLocation, type RouteResult, getRoute } from "@/utils/routing";

export type VehicleType = "standard" | "xl" | "wheelchair";
export type RideServiceClass = "rollstuhl" | "xl" | "taxi";
export type PaymentMethod = "cash" | "paypal" | "card" | "voucher" | "app" | "access_code";

export interface VehicleOption {
  id: VehicleType;
  name: string;
  description: string;
  multiplier: number;
  minSeats: number;
  icon: string;
}

/** Karussell-Reihenfolge: Onroda zuerst, dann Taxi-Klassen. */
export const VEHICLES: VehicleOption[] = [
  {
    id: "standard",
    name: "Standard",
    description: "4 Personen",
    multiplier: 1.0,
    minSeats: 4,
    icon: "car-side",
  },
  {
    id: "xl",
    name: "XL",
    description: "bis zu 6 Personen",
    multiplier: 1.6,
    minSeats: 6,
    icon: "van-passenger",
  },
  {
    id: "wheelchair",
    name: "Rollstuhl",
    description: "Rollstuhlgerecht",
    multiplier: 1.8,
    minSeats: 1,
    icon: "wheelchair-accessibility",
  },
];

export interface RideHistoryEntry {
  id: string;
  destination: string;
  origin: string;
  distanceKm: number;
  /** Anzeige- / Abrechnungsbetrag: i. d. R. Fahrer-Endpreis, sonst Schätzung. */
  totalFare: number;
  /** Schätzpreis zur Buchung — nur gesetzt wenn sich von `totalFare` unterscheidet (z. B. Fahrer-Endpreis). */
  estimatedFare?: number;
  vehicleType: VehicleType;
  paymentMethod: PaymentMethod;
  scheduledTime: string | null;
  createdAt: string;
  status: "completed" | "cancelled";
}

/** Optionen beim Abschluss: Endpreis aus API + echte Ride-ID für History/Quittung. */
export type CompleteRideOptions = {
  finalFare?: number | null;
  serverRideId?: string;
  /** Schätzung (z. B. `estimatedFare` der Ride), für Anzeige „Schätzung war …“ */
  estimatedFare?: number | null;
};

export type RideStatus = "idle" | "searching" | "active" | "completed";

/** Standard-Abholpunkt (Karte / Reset); Reservierung setzt Origin bei manueller Auswahl. */
export const DEFAULT_ORIGIN: GeoLocation = {
  lat: 48.7394,
  lon: 9.3114,
  displayName: "Esslingen am Neckar, Stadtmitte",
};

interface RideState {
  origin: GeoLocation;
  destination: GeoLocation | null;
  selectedVehicle: VehicleType | null;
  selectedServiceClass: RideServiceClass | null;
  paymentMethod: PaymentMethod | null;
  isExempted: boolean;
  scheduledTime: Date | null;
  route: RouteResult | null;
  fareBreakdown: FareBreakdown | null;
  finalFare: number | null;
  rideStatus: RideStatus;
  isLoadingRoute: boolean;
  routeError: string | null;
  history: RideHistoryEntry[];
}

export function calculateCopayment(fullFare: number, isExempted: boolean): number {
  if (isExempted) return 0;
  let copayment = fullFare * 0.1;
  if (copayment < 5.0) {
    copayment = 5.0;
  } else if (copayment > 10.0) {
    copayment = 10.0;
  }
  if (fullFare < 5.0) {
    copayment = fullFare;
  }
  return Math.round(copayment * 100) / 100;
}

interface RideContextValue extends RideState {
  /** Nach Rollstuhl-Wahl: erst true, wenn der Kunde den Zusatz-Screen (`/ride-select`) bestätigt hat. */
  wheelchairSelectCompleted: boolean;
  setWheelchairSelectCompleted: (done: boolean) => void;
  setOrigin: (loc: GeoLocation) => void;
  setDestination: (loc: GeoLocation | null) => void;
  setSelectedVehicle: (v: VehicleType | null) => void;
  setSelectedServiceClass: (value: RideServiceClass | null) => void;
  setPaymentMethod: (m: PaymentMethod | null) => void;
  setIsExempted: (v: boolean) => void;
  setScheduledTime: (t: Date | null) => void;
  fetchRoute: () => Promise<void>;
  startRide: () => void;
  cancelRide: () => void;
  completeRide: (opts?: CompleteRideOptions) => void;
  resetRide: () => void;
  loadHistory: () => Promise<void>;
}

const RideContext = createContext<RideContextValue | null>(null);
const HISTORY_KEY = "@taxi_ride_history";
const RESET_KEY   = "@Onroda_reset_v1";
const API_BASE = getApiBaseUrl();

function normalizeForMatch(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const ESSLINGEN_COUNTY_MUNICIPALITIES = [
  "altbach", "aichwald", "beuren", "deizisau", "denkendorf", "dettingen unter teck",
  "esslingen", "frickenhausen", "grossbettlingen", "hochdorf",
  "holzmaden", "kirchheim unter teck", "koengen", "köngen",
  "lenningen", "lichtenwald", "neuhausen auf den fildern", "neidlingen", "neckartailfingen",
  "neckartenzlingen", "nuertingen", "oberboihingen", "ostfildern", "owen",
  "plochingen", "reichenbach an der fils", "schlaitdorf", "unterensingen", "weilheim an der teck",
  "wendlingen am neckar", "wolfschlugen",
];

function isStuttgart(loc: GeoLocation): boolean {
  const city = normalizeForMatch(loc.city);
  if (city.includes("stuttgart")) return true;
  return normalizeForMatch(loc.displayName).includes("stuttgart");
}

function isLeinfeldenEchterdingen(loc: GeoLocation): boolean {
  const city = normalizeForMatch(loc.city);
  if (city.includes("leinfelden-echterdingen") || city.includes("leinfelden echterdingen")) return true;
  const name = normalizeForMatch(loc.displayName);
  return name.includes("leinfelden-echterdingen") || name.includes("leinfelden echterdingen");
}

function isFilderstadt(loc: GeoLocation): boolean {
  const city = normalizeForMatch(loc.city);
  if (city.includes("filderstadt")) return true;
  return normalizeForMatch(loc.displayName).includes("filderstadt");
}

function isEsslingenCounty(loc: GeoLocation): boolean {
  const city = normalizeForMatch(loc.city);
  if (city.includes("esslingen")) return true;
  if (ESSLINGEN_COUNTY_MUNICIPALITIES.some((municipality) => city.includes(municipality))) return true;
  const name = normalizeForMatch(loc.displayName);
  if (name.includes("esslingen")) return true;
  return ESSLINGEN_COUNTY_MUNICIPALITIES.some((municipality) => name.includes(municipality));
}

function isTariffAreaLocation(loc: GeoLocation): boolean {
  return (
    isStuttgart(loc) ||
    isEsslingenCounty(loc) ||
    isLeinfeldenEchterdingen(loc) ||
    isFilderstadt(loc)
  );
}

export interface TariffAreaDebugInfo {
  originRaw: string;
  destinationRaw: string;
  originNormalized: string;
  destinationNormalized: string;
  originInTariffArea: boolean;
  destinationInTariffArea: boolean;
  isWithinTariffArea: boolean;
}

export function getTariffAreaDebugInfo(origin: GeoLocation, destination: GeoLocation | null): TariffAreaDebugInfo {
  const destinationDisplay = destination?.displayName ?? "";
  const originRaw = `${origin.displayName}${origin.city ? ` | city=${origin.city}` : ""}`;
  const destinationRaw = destination
    ? `${destination.displayName}${destination.city ? ` | city=${destination.city}` : ""}`
    : "";
  const originNormalized = normalizeForMatch(originRaw);
  const destinationNormalized = normalizeForMatch(destinationRaw);
  const originInTariffArea = isTariffAreaLocation(origin);
  const destinationInTariffArea = destination ? isTariffAreaLocation(destination) : false;
  return {
    originRaw,
    destinationRaw,
    originNormalized,
    destinationNormalized,
    originInTariffArea,
    destinationInTariffArea,
    isWithinTariffArea: destination ? originInTariffArea && destinationInTariffArea : false,
  };
}

export function isTripWithinStuttgartEsslingenTariffArea(origin: GeoLocation, destination: GeoLocation | null): boolean {
  if (!destination) return false;
  return isTariffAreaLocation(origin) && isTariffAreaLocation(destination);
}

export function isOnrodaFixRouteEligible(origin: GeoLocation, destination: GeoLocation | null): boolean {
  return !isTripWithinStuttgartEsslingenTariffArea(origin, destination);
}

/** pricing_mode für Kundenbuchungen: Onroda nutzt nur noch Taxi-Schätzpreis. */
export function effectivePricingModeForCustomerRide(_input: {
  selectedServiceClass: RideServiceClass | null;
  selectedVehicle: VehicleType | null;
  origin: GeoLocation;
  destination: GeoLocation | null;
}): "taxi_tariff" {
  return "taxi_tariff";
}

function RideProviderInner({ children }: { children: React.ReactNode }) {
  const { config: appCfg } = useOnrodaAppConfig();
  const [origin, setOrigin] = useState<GeoLocation>(DEFAULT_ORIGIN);
  const [destination, setDestination] = useState<GeoLocation | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType | null>(null);
  const [selectedServiceClass, setSelectedServiceClass] = useState<RideServiceClass | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [isExempted, setIsExempted] = useState(false);
  const [scheduledTime, setScheduledTime] = useState<Date | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [fareBreakdown, setFareBreakdown] = useState<FareBreakdown | null>(null);
  const [finalFare, setFinalFare] = useState<number | null>(null);
  const [rideStatus, setRideStatus] = useState<RideStatus>("idle");
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [history, setHistory] = useState<RideHistoryEntry[]>([]);
  const [wheelchairSelectCompleted, setWheelchairSelectCompleted] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(RESET_KEY).then((done) => {
      if (!done) {
        AsyncStorage.removeItem(HISTORY_KEY).catch(() => {});
        AsyncStorage.setItem(RESET_KEY, "1").catch(() => {});
      }
    }).catch(() => {}).finally(() => { loadHistory(); });
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);

  const saveHistory = useCallback(async (entries: RideHistoryEntry[]) => {
    try { await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(entries)); } catch {}
  }, []);

  const fetchRoute = useCallback(async () => {
    if (!destination) return;
    setIsLoadingRoute(true);
    setRouteError(null);
    try {
      const result = await getRoute(origin, destination);
      setRoute(result);
      if (!selectedVehicle) {
        setFareBreakdown(null);
        return;
      }
      const tcfg = appTariffFromRecord(
        pickTariffForStartAddress(appCfg, origin.displayName ?? "", {
          lat: origin.lat,
          lon: origin.lon,
        }),
      );
      if (API_BASE) {
        try {
          const u = new URL(`${API_BASE}/fare-estimate`);
          u.searchParams.set("distanceKm", String(result.distanceKm));
          u.searchParams.set("vehicle", selectedVehicle);
          u.searchParams.set("fromFull", String(origin.displayName ?? ""));
          if (Number.isFinite(origin.lat) && Number.isFinite(origin.lon)) {
            u.searchParams.set("fromLat", String(origin.lat));
            u.searchParams.set("fromLng", String(origin.lon));
          }
          if (destination?.displayName) u.searchParams.set("toFull", String(destination.displayName));
          u.searchParams.set("tripMinutes", String(result.durationMinutes));
          const res = await fetch(u.toString(), { cache: "no-store" });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data?.ok && Number.isFinite(data?.estimate?.total)) {
            const total = Number(data.estimate.total);
            const base = Number(data.profile?.baseFareEur ?? 0);
            setFareBreakdown({
              baseFare: base,
              distanceCharge: Math.max(0, ceilToTenth(total - base)),
              waitingCharge: 0,
              total,
              distanceKm: Math.round(result.distanceKm * 100) / 100,
              fareKind: "taxameter",
            });
            return;
          }
        } catch {
          /* fallback auf Konfig-Parameter */
        }
      }
      const vehicle = VEHICLES.find((v) => v.id === selectedVehicle);
      if (!vehicle) {
        setFareBreakdown(null);
        return;
      }
      const breakdown = calculateFareFromAppConfig(result.distanceKm, 0, tcfg);
      const ESTIMATE_BUFFER = 1.08; // +8% Puffer über Taxameter (Schätzpreis)
      const adjusted: FareBreakdown = {
        ...breakdown,
        total: ceilToTenth(breakdown.total * vehicle.multiplier * ESTIMATE_BUFFER),
        distanceCharge: ceilToTenth(breakdown.distanceCharge * vehicle.multiplier),
        fareKind: "taxameter",
      };
      setFareBreakdown(adjusted);
    } catch {
      setRouteError("Route konnte nicht berechnet werden.");
    } finally {
      setIsLoadingRoute(false);
    }
  }, [origin, destination, selectedVehicle, appCfg]);

  const startRide = useCallback(() => {
    if (!fareBreakdown) return;
    setFinalFare(fareBreakdown.total);
    setRideStatus("active");
  }, [fareBreakdown]);

  const cancelRide = useCallback(() => {
    if (destination && route && fareBreakdown) {
      const entry: RideHistoryEntry = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        destination: destination.displayName,
        origin: origin.displayName,
        distanceKm: route.distanceKm,
        totalFare: fareBreakdown.total,
        vehicleType: selectedVehicle!,
        paymentMethod: paymentMethod ?? "cash",
        scheduledTime: scheduledTime?.toISOString() ?? null,
        createdAt: new Date().toISOString(),
        status: "cancelled",
      };
      const updated = [entry, ...history].slice(0, 50);
      setHistory(updated);
      saveHistory(updated);
    }
    resetRide();
  }, [destination, route, fareBreakdown, selectedVehicle, paymentMethod, scheduledTime, origin, history, saveHistory]);

  const completeRide = useCallback(
    (opts?: CompleteRideOptions) => {
      const parsedFinal =
        opts?.finalFare != null && Number.isFinite(Number(opts.finalFare)) ? Number(opts.finalFare) : null;
      const serverEstimate =
        opts?.estimatedFare != null && Number.isFinite(Number(opts.estimatedFare))
          ? Number(opts.estimatedFare)
          : null;
      const localEstimate = fareBreakdown?.total ?? null;
      const estimateForHint = serverEstimate ?? localEstimate;
      const billed = parsedFinal ?? localEstimate;
      if (destination && route && fareBreakdown && billed != null && Number.isFinite(Number(billed))) {
        const entry: RideHistoryEntry = {
          id: opts?.serverRideId ?? Date.now().toString() + Math.random().toString(36).substring(2, 9),
          destination: destination.displayName,
          origin: origin.displayName,
          distanceKm: route.distanceKm,
          totalFare: billed,
          estimatedFare:
            parsedFinal != null && estimateForHint != null && Math.abs(estimateForHint - parsedFinal) > 0.005
              ? estimateForHint
              : undefined,
          vehicleType: selectedVehicle!,
          paymentMethod: paymentMethod ?? "cash",
          scheduledTime: scheduledTime?.toISOString() ?? null,
          createdAt: new Date().toISOString(),
          status: "completed",
        };
        const updated = [entry, ...history.filter((h) => h.id !== entry.id)].slice(0, 50);
        setHistory(updated);
        saveHistory(updated);
      }
      setRideStatus("completed");
    },
    [destination, route, fareBreakdown, selectedVehicle, paymentMethod, scheduledTime, origin, history, saveHistory],
  );

  const resetRide = useCallback(() => {
    setDestination(null);
    setRoute(null);
    setFareBreakdown(null);
    setFinalFare(null);
    setScheduledTime(null);
    setRideStatus("idle");
    setRouteError(null);
    setPaymentMethod(null);
    setSelectedVehicle(null);
    setSelectedServiceClass(null);
    setWheelchairSelectCompleted(false);
  }, []);

  return (
    <RideContext.Provider value={{
      origin, destination, selectedVehicle, selectedServiceClass, paymentMethod, isExempted, scheduledTime,
      route, fareBreakdown, finalFare, rideStatus, isLoadingRoute, routeError, history,
      wheelchairSelectCompleted, setWheelchairSelectCompleted,
      setOrigin, setDestination, setSelectedVehicle, setSelectedServiceClass, setPaymentMethod, setIsExempted, setScheduledTime,
      fetchRoute, startRide, cancelRide, completeRide, resetRide, loadHistory,
    }}>
      {children}
    </RideContext.Provider>
  );
}

/** Muss unter `AppConfigProvider` stehen (Tarif-Fallback aus `GET /api/app/config`). */
export function RideProvider({ children }: { children: React.ReactNode }) {
  return <RideProviderInner>{children}</RideProviderInner>;
}

export function useRide(): RideContextValue {
  const ctx = useContext(RideContext);
  if (!ctx) throw new Error("useRide must be used within RideProvider");
  return ctx;
}
