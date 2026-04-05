import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { calculateFare, type FareBreakdown } from "@/utils/fareCalculator";
import { type GeoLocation, type RouteResult, getRoute } from "@/utils/routing";

export type VehicleType = "standard" | "xl" | "wheelchair";
export type PaymentMethod = "cash" | "paypal" | "card" | "voucher" | "app";

export interface VehicleOption {
  id: VehicleType;
  name: string;
  description: string;
  multiplier: number;
  minSeats: number;
  icon: string;
}

export const VEHICLES: VehicleOption[] = [
  {
    id: "standard",
    name: "Standard",
    description: "Bis zu 4 Personen",
    multiplier: 1.0,
    minSeats: 4,
    icon: "taxi",
  },
  {
    id: "xl",
    name: "XL",
    description: "Bis zu 6 Personen",
    multiplier: 1.6,
    minSeats: 6,
    icon: "bus",
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

const DEFAULT_ORIGIN: GeoLocation = {
  lat: 48.7394,
  lon: 9.3114,
  displayName: "Esslingen am Neckar, Stadtmitte",
};

interface RideState {
  origin: GeoLocation;
  destination: GeoLocation | null;
  selectedVehicle: VehicleType;
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
  setSelectedVehicle: (v: VehicleType) => void;
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

export function RideProvider({ children }: { children: React.ReactNode }) {
  const [origin, setOrigin] = useState<GeoLocation>(DEFAULT_ORIGIN);
  const [destination, setDestination] = useState<GeoLocation | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType>("standard");
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
      const vehicle = VEHICLES.find((v) => v.id === selectedVehicle)!;
      const breakdown = calculateFare(result.distanceKm);
      const ESTIMATE_BUFFER = 1.08; // +8% Puffer über Taxameter (Schätzpreis)
      const adjusted: FareBreakdown = {
        ...breakdown,
        total: Math.round(breakdown.total * vehicle.multiplier * ESTIMATE_BUFFER * 100) / 100,
        distanceCharge: Math.round(breakdown.distanceCharge * vehicle.multiplier * 100) / 100,
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
        vehicleType: selectedVehicle,
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
        vehicleType: selectedVehicle,
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
