import { router, usePathname, useSegments } from "expo-router";
import { useEffect, useRef } from "react";

import { useDriver } from "@/context/DriverContext";
import { useRideRequests } from "@/context/RideRequestContext";
import { useUser } from "@/context/UserContext";
import {
  buildDriverNavigationHref,
  replaceDriverStackExclusive,
} from "@/utils/driverNavigationRoute";
import { setupExpoPushResponseRouting } from "@/utils/expoPushDeepLink";
import {
  pickCustomerSessionRestoreRide,
  pickDriverSessionRestoreRide,
} from "@/utils/sessionRideRestore";

const CUSTOMER_SKIP_PREFIXES = [
  "/status",
  "/ride",
  "/ride-select",
  "/new-booking",
  "/google-auth",
  "/login-success",
  "/driver/",
  "/fahrt-reservieren",
  "/reserve-ride",
  "/booking-",
];

/** Kunde in aktiver Fahrt — Fahrer-Restore darf nicht auf Navi umleiten. */
const CUSTOMER_ACTIVE_FLOW_PREFIXES = ["/status", "/ride", "/ride-select"];

const DRIVER_SKIP_PREFIXES = ["/driver/login"];

/**
 * Einmaliger Restore nach Server-Load: Kunde → Status, Fahrer mit aktiver Fahrt → Navigation (Stack reset).
 */
export function SessionRestoreCoordinator() {
  useEffect(() => setupExpoPushResponseRouting(), []);

  const pathname = usePathname();
  const segments = useSegments();
  const { profile } = useUser();
  const { isLoggedIn: isDriverLoggedIn, driver, loading: driverLoading } = useDriver();
  const {
    requests,
    driverMarketRequests,
    passengerId,
    customerRidesHydrated,
    driverMarketHydrated,
    refreshDriverMarketHard,
  } = useRideRequests();

  const customerRestoreDone = useRef(false);
  const driverRestoreDone = useRef(false);
  const driverMarketPrimed = useRef(false);

  const onDriverSurface = segments[0] === "driver";
  const customerLoggedIn =
    profile.isLoggedIn &&
    typeof profile.sessionToken === "string" &&
    profile.sessionToken.trim().length > 0;

  useEffect(() => {
    if (!customerLoggedIn) customerRestoreDone.current = false;
  }, [customerLoggedIn]);

  useEffect(() => {
    if (!isDriverLoggedIn) {
      driverRestoreDone.current = false;
      driverMarketPrimed.current = false;
    }
  }, [isDriverLoggedIn]);

  useEffect(() => {
    if (customerRestoreDone.current) return;
    if (!customerLoggedIn || isDriverLoggedIn || onDriverSurface) return;
    if (!customerRidesHydrated) return;
    if (pathname !== "/" && pathname !== "/index") {
      return;
    }
    if (CUSTOMER_SKIP_PREFIXES.some((p) => pathname.startsWith(p))) {
      customerRestoreDone.current = true;
      return;
    }

    const ride = pickCustomerSessionRestoreRide(requests, passengerId || profile.googleId || "");
    customerRestoreDone.current = true;
    if (!ride) return;
    router.replace({ pathname: "/status", params: { rideId: ride.id } } as never);
  }, [
    customerLoggedIn,
    isDriverLoggedIn,
    onDriverSurface,
    customerRidesHydrated,
    pathname,
    requests,
    passengerId,
    profile.googleId,
  ]);

  useEffect(() => {
    if (driverLoading) return;
    if (!isDriverLoggedIn || !driver?.id) return;
    if (!driverMarketHydrated) return;

    if (!driverMarketPrimed.current) {
      driverMarketPrimed.current = true;
      void refreshDriverMarketHard();
      return;
    }

    if (driverRestoreDone.current) return;
    if (DRIVER_SKIP_PREFIXES.some((p) => pathname.startsWith(p))) return;
    if (
      customerLoggedIn &&
      !onDriverSurface &&
      CUSTOMER_ACTIVE_FLOW_PREFIXES.some((p) => pathname.startsWith(p))
    ) {
      return;
    }
    if (pathname.startsWith("/driver/change-password")) {
      driverRestoreDone.current = true;
      return;
    }

    const ride = pickDriverSessionRestoreRide(driverMarketRequests, driver.id);
    driverRestoreDone.current = true;

    if (driver?.mustChangePassword) {
      replaceDriverStackExclusive("/driver/change-password");
      return;
    }

    if (ride) {
      replaceDriverStackExclusive(buildDriverNavigationHref(ride, driver.id));
      return;
    }

    if (!pathname.startsWith("/driver/dashboard")) {
      replaceDriverStackExclusive("/driver/dashboard");
    }
  }, [
    customerLoggedIn,
    onDriverSurface,
    driverLoading,
    isDriverLoggedIn,
    driver?.id,
    driver?.mustChangePassword,
    driverMarketHydrated,
    driverMarketRequests,
    pathname,
    refreshDriverMarketHard,
  ]);

  return null;
}
