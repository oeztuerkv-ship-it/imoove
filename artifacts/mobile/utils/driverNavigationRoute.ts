import { type Href, router } from "expo-router";

import type { RequestStatus, RideRequest } from "@/context/RideRequestContext";

/** Screens im Stack unter `app/driver/_layout.tsx` (ohne `driver/`-Prefix). */
export type DriverStackScreen =
  | "navigation"
  | "dashboard"
  | "login"
  | "change-password"
  | "inbox";

export type DriverNavigationPhase = "pickup" | "driving";

export function driverNavigationPhaseForStatus(status: RequestStatus): DriverNavigationPhase {
  if (
    status === "in_progress" ||
    status === "passenger_onboard" ||
    status === "arrived"
  ) {
    return "driving";
  }
  return "pickup";
}

export function buildDriverNavigationParams(
  ride: RideRequest,
  driverId: string,
  driverCoords?: { lat: number; lon: number } | null,
): Record<string, string> {
  const phase = driverNavigationPhaseForStatus(ride.status);
  const fromLat = driverCoords?.lat ?? ride.fromLat ?? 0;
  const fromLon = driverCoords?.lon ?? ride.fromLon ?? 0;
  const pickupLat = ride.fromLat ?? 0;
  const pickupLon = ride.fromLon ?? 0;
  const destLat = ride.toLat ?? ride.fromLat ?? 0;
  const destLon = ride.toLon ?? ride.fromLon ?? 0;
  const pickupName = ride.fromFull ?? ride.from ?? "Abholort";
  const destName = ride.toFull ?? ride.to ?? "Ziel";
  const arrived =
    ride.status === "driver_waiting" || ride.status === "passenger_onboard" ? "1" : "0";

  if (phase === "pickup") {
    return {
      rideId: ride.id,
      phase: "pickup",
      fromLat: String(fromLat),
      fromLon: String(fromLon),
      fromName: driverCoords ? "Ihr Standort" : "Standort",
      toLat: String(pickupLat),
      toLon: String(pickupLon),
      toName: pickupName,
      customerName: ride.customerName ?? "",
      bookingPartnerName: ride.bookingPartnerName?.trim() ?? "",
      pickupLat: String(pickupLat),
      pickupLon: String(pickupLon),
      pickupName,
      destLat: String(destLat),
      destLon: String(destLon),
      destName,
      estimatedFare: String(ride.estimatedFare ?? 0),
      paymentMethod: ride.paymentMethod ?? "",
      vehicle: ride.vehicle ?? "standard",
      dispatchMode: ride.dispatchMode === "funk" ? "funk" : "market",
      vehicleClassMultiplier:
        ride.tariffSnapshot?.breakdown?.vehicleClassMultiplier != null
          ? String(ride.tariffSnapshot.breakdown.vehicleClassMultiplier)
          : "",
      xlFixedSurchargeEur:
        ride.tariffSnapshot?.breakdown?.xlFixedSurchargeEur != null
          ? String(ride.tariffSnapshot.breakdown.xlFixedSurchargeEur)
          : "",
      driverId,
      arrived,
    };
  }

  return {
    rideId: ride.id,
    phase: "driving",
    fromLat: String(pickupLat),
    fromLon: String(pickupLon),
    fromName: pickupName,
    toLat: String(destLat),
    toLon: String(destLon),
    toName: destName,
    customerName: ride.customerName ?? "",
    bookingPartnerName: ride.bookingPartnerName?.trim() ?? "",
    pickupLat: String(pickupLat),
    pickupLon: String(pickupLon),
    pickupName,
    destLat: String(destLat),
    destLon: String(destLon),
    destName,
    estimatedFare: String(ride.estimatedFare ?? 0),
    paymentMethod: ride.paymentMethod ?? "",
    vehicle: ride.vehicle ?? "standard",
    dispatchMode: ride.dispatchMode === "funk" ? "funk" : "market",
    vehicleClassMultiplier:
      ride.tariffSnapshot?.breakdown?.vehicleClassMultiplier != null
        ? String(ride.tariffSnapshot.breakdown.vehicleClassMultiplier)
        : "",
    xlFixedSurchargeEur:
      ride.tariffSnapshot?.breakdown?.xlFixedSurchargeEur != null
        ? String(ride.tariffSnapshot.breakdown.xlFixedSurchargeEur)
        : "",
    driverId,
    arrived,
  };
}

/** Expo-Router-Ziel: ein Screen, kein Zurück-Swipe durch alte Navigation-Instanzen. */
export function buildDriverNavigationHref(
  ride: RideRequest,
  driverId: string,
  driverCoords?: { lat: number; lon: number } | null,
): Href {
  return {
    pathname: "/driver/navigation",
    params: buildDriverNavigationParams(ride, driverId, driverCoords),
  } as Href;
}

/** Private Merkliste — In-App-Navi ohne echte Fahrt (kein Status/Chat/Storno). */
export function buildPrivateMemoNavigationHref(input: {
  reminderId: string;
  driverId: string;
  driverLat: number;
  driverLon: number;
  pickupLat: number;
  pickupLon: number;
  pickupName: string;
  destLat: number;
  destLon: number;
  destName: string;
}): Href {
  return {
    pathname: "/driver/navigation",
    params: {
      rideId: input.reminderId,
      privateMemo: "1",
      phase: "pickup",
      fromLat: String(input.driverLat),
      fromLon: String(input.driverLon),
      fromName: "Ihr Standort",
      toLat: String(input.pickupLat),
      toLon: String(input.pickupLon),
      toName: input.pickupName,
      customerName: "Privatauftrag",
      bookingPartnerName: "",
      pickupLat: String(input.pickupLat),
      pickupLon: String(input.pickupLon),
      pickupName: input.pickupName,
      destLat: String(input.destLat),
      destLon: String(input.destLon),
      destName: input.destName,
      estimatedFare: "0",
      paymentMethod: "",
      vehicle: "standard",
      driverId: input.driverId,
      arrived: "0",
    },
  } as Href;
}

function parseDriverHref(href: Href): { screen: DriverStackScreen; params?: Record<string, string> } | null {
  const pathname =
    typeof href === "string"
      ? (href.split("?")[0]?.trim() || "/")
      : (href.pathname?.trim() || "/");
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (!normalized.startsWith("/driver/")) return null;
  const screen = normalized.slice("/driver/".length) as DriverStackScreen;
  const params =
    typeof href === "string" ? undefined : (href.params as Record<string, string> | undefined);
  return { screen, params };
}

/**
 * Stack auf genau eine Fahrer-Navi-Route (Session-Restore, keine doppelten navigation-Einträge).
 * `dismissTo` statt Root-RESET — CommonActions.reset auf dem falschen Navigator wirft in Dev.
 *
 * Ausnahme privateMemo: immer `replace`, damit Params (privateMemo=1) sicher greifen,
 * auch wenn schon ein /driver/navigation-Eintrag im Stack liegt.
 */
export function replaceDriverStackExclusive(href: Href): void {
  const parsed = parseDriverHref(href);
  if (parsed?.screen === "navigation") {
    const privateMemo = parsed.params?.privateMemo;
    const isPrivate =
      privateMemo === "1" ||
      privateMemo === "true" ||
      (typeof parsed.params?.rideId === "string" && parsed.params.rideId.startsWith("ppr-"));
    if (isPrivate) {
      router.replace(href);
      return;
    }
    router.dismissTo(href);
    return;
  }
  router.replace(href);
}

/** Einmal pro Fahrt: Navi-Stack auf einen Eintrag reduzieren (App-Neustart / Restore). */
export function resetDriverStackScreen(
  screen: DriverStackScreen,
  params?: Record<string, string>,
): void {
  const href = { pathname: `/driver/${screen}`, params } as Href;
  if (screen === "navigation") {
    router.dismissTo(href);
    return;
  }
  router.replace(href);
}

/** Phase pickup → driving: gleicher Screen, nur Params (kein zweiter Stack-Eintrag). */
export function setDriverNavigationPhaseParams(params: Record<string, string>): void {
  router.setParams(params as never);
}
