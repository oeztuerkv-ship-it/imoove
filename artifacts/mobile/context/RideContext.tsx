import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { calculateFare, calculateOnrodaFixFare, ceilToTenth, type FareBreakdown } from "@/utils/fareCalculator";
import { getApiBaseUrl } from "@/utils/apiBase";
import { type GeoLocation, type RouteResult, getRoute } from "@/utils/routing";

export type VehicleType = "standard" | "xl" | "wheelchair" | "onroda";
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
    id: "onroda",
    name: "Onroda",
    description: "Fixpreis-Garantie",
    multiplier: 1.0,
    minSeats: 4,
    icon: "car-side",
  },
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
  totalFare: number;
  vehicleType: VehicleType;
  paymentMethod: PaymentMethod;
  scheduledTime: string | null;
  createdAt: string;
  status: "completed" | "cancelled";
}

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
  setOrigin: (loc: GeoLocation) => void;
  setDestination: (loc: GeoLocation | null) => void;
  setSelectedVehicle: (v: VehicleType | null) => void;
  setPaymentMethod: (m: PaymentMethod | null) => void;
  setIsExempted: (v: boolean) => void;
  setScheduledTime: (t: Date | null) => void;
  fetchRoute: () => Promise<void>;
  startRide: () => void;
  cancelRide: () => void;
  completeRide: () => void;
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

export function isTripWithinStuttgartEsslingenTariffArea(origin: GeoLocation, destination: GeoLocation | null): boolean {
  if (!destination) return false;
  return isTariffAreaLocation(origin) && isTariffAreaLocation(destination);
}

export function isOnrodaFixRouteEligible(origin: GeoLocation, destination: GeoLocation | null): boolean {
  return !isTripWithinStuttgartEsslingenTariffArea(origin, destination);
}

export function RideProvider({ children }: { children: React.ReactNode }) {
  const [origin, setOrigin] = useState<GeoLocation>(DEFAULT_ORIGIN);
  const [destination, setDestination] = useState<GeoLocation | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType | null>(null);
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
      const onrodaFixAllowed = selectedVehicle === "onroda" ? isOnrodaFixRouteEligible(origin, destination) : false;
      if (API_BASE) {
        try {
          const u = new URL(`${API_BASE}/fare-estimate`);
          u.searchParams.set("distanceKm", String(result.distanceKm));
          u.searchParams.set("vehicle", selectedVehicle === "onroda" && !onrodaFixAllowed ? "standard" : selectedVehicle);
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
              fareKind: selectedVehicle === "onroda" && onrodaFixAllowed ? "onroda_fix" : "taxameter",
            });
            return;
          }
        } catch {
          /* fallback auf lokale Berechnung */
        }
      }
      if (selectedVehicle === "onroda" && onrodaFixAllowed) {
        setFareBreakdown(calculateOnrodaFixFare(result.distanceKm));
        return;
      }
      const vehicle = VEHICLES.find((v) => v.id === selectedVehicle);
      if (!vehicle) {
        setFareBreakdown(null);
        return;
      }
      const breakdown = calculateFare(result.distanceKm);
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
  }, [origin, destination, selectedVehicle]);

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

  const completeRide = useCallback(() => {
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
        status: "completed",
      };
      const updated = [entry, ...history].slice(0, 50);
      setHistory(updated);
      saveHistory(updated);
    }
    setRideStatus("completed");
  }, [destination, route, fareBreakdown, selectedVehicle, paymentMethod, scheduledTime, origin, history, saveHistory]);

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
  }, []);

  return (
    <RideContext.Provider value={{
      origin, destination, selectedVehicle, paymentMethod, isExempted, scheduledTime,
      route, fareBreakdown, finalFare, rideStatus, isLoadingRoute, routeError, history,
      setOrigin, setDestination, setSelectedVehicle, setPaymentMethod, setIsExempted, setScheduledTime,
      fetchRoute, startRide, cancelRide, completeRide, resetRide, loadHistory,
    }}>
      {children}
    </RideContext.Provider>
  );
}

export function useRide(): RideContextValue {
  const ctx = useContext(RideContext);
  if (!ctx) throw new Error("useRide must be used within RideProvider");
  return ctx;
}
