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
      pickupLat: String(pickupLat),
      pickupLon: String(pickupLon),
      pickupName,
      destLat: String(destLat),
      destLon: String(destLon),
      destName,
      estimatedFare: String(ride.estimatedFare ?? 0),
      paymentMethod: ride.paymentMethod ?? "",
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
    pickupLat: String(pickupLat),
    pickupLon: String(pickupLon),
    pickupName,
    destLat: String(destLat),
    destLon: String(destLon),
    destName,
    estimatedFare: String(ride.estimatedFare ?? 0),
    paymentMethod: ride.paymentMethod ?? "",
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
 */
export function replaceDriverStackExclusive(href: Href): void {
  const parsed = parseDriverHref(href);
  if (parsed?.screen === "navigation") {
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
