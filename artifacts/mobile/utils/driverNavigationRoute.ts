import { type Href, router } from "expo-router";

import type { RequestStatus, RideRequest } from "@/context/RideRequestContext";

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

/** Expo-Router-Ziel: ein Screen, kein Zurück-Swipe durch alte Navigation-Instanzen. */
export function buildDriverNavigationHref(
  ride: RideRequest,
  driverId: string,
  driverCoords?: { lat: number; lon: number } | null,
): Href {
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
      pathname: "/driver/navigation",
      params: {
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
      },
    } as Href;
  }

  return {
    pathname: "/driver/navigation",
    params: {
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
    },
  } as Href;
}

/**
 * Stack auf genau eine Fahrer-Route setzen (Session-Restore, Auto-Navi).
 * Verhindert Zurück-Swipe zu alter Navigation / Dashboard-Kombination.
 */
export function replaceDriverStackExclusive(href: Href): void {
  const applyReplace = () => {
    router.replace(href);
  };

  try {
    if (typeof router.dismissTo === "function") {
      router.dismissTo(href);
      return;
    }
  } catch {
    /* fallback */
  }

  try {
    if (typeof router.canDismiss === "function" && router.canDismiss()) {
      router.dismissAll();
      queueMicrotask(applyReplace);
      return;
    }
  } catch {
    /* fallback */
  }

  try {
    while (router.canGoBack()) {
      router.back();
    }
  } catch {
    /* ignore */
  }
  applyReplace();
}
