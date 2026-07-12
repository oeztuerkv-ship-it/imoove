import type { RideRequest } from "../domain/rideRequest";
import { getFleetDriverMarketOnline, getFleetDriverDispatchPriority, getFleetDriverMarketLocation } from "./fleetDriversData";
import { getFleetDriverReadinessById } from "./fleetDriverReadiness";
import { getFleetDriverCapability, isRideCompatibleWithCapability } from "./fleetMatchingData";
import { getCompanyFeatureKkModule } from "../lib/kkModuleAccess.js";
import { resolveMedicalTransportAuthorizationForFleetDriver } from "../lib/medical/medicalTransportAuthorization";
import { listRides } from "./ridesData";
import { syncDispatchTiersForRides } from "./rideDispatchTierData";
import {
  driverMatchesDispatchTier,
  isOpenInstantRideForDispatch,
  normalizeDispatchPriority,
} from "../lib/dispatchPriorityTier";
import { getDispatchRadiusKmFromConfig, isWithinDispatchRadiusKm } from "../lib/dispatchRadius";
import {
  filterRidesVisibleToFleetDriver,
  lookupAdminCompanyKinds,
} from "../lib/fleetRideDispatchPool";

const TERMINAL_MARKET_STATUSES = new Set([
  "completed",
  "cancelled",
  "cancelled_by_customer",
  "cancelled_by_driver",
  "cancelled_by_system",
  "no_driver",
  "expired",
  "rejected",
]);

const OPEN_INSTANT_STATUSES = new Set<RideRequest["status"]>([
  "pending",
  "requested",
  "searching_driver",
  "offered",
]);

export type FleetDriverMarketPoolResult =
  | {
      ok: true;
      einsatzbereit: true;
      rides: RideRequest[];
      marketOnline: boolean;
    }
  | {
      ok: true;
      einsatzbereit: false;
      rides: [];
      marketOnline: boolean;
      message: string;
      readiness?: Awaited<ReturnType<typeof getFleetDriverReadinessById>>;
    }
  | { ok: false; error: "not_found" };

/**
 * Gleiche Filterlogik wie GET /fleet-driver/v1/market-rides (Sofortpool + zugewiesene Live-Fahrten).
 */
export async function listMarketRidesForFleetDriver(
  fleetDriverId: string,
  companyId: string,
): Promise<FleetDriverMarketPoolResult> {
  const readiness = await getFleetDriverReadinessById(fleetDriverId, companyId);
  if ("error" in readiness) return { ok: false, error: "not_found" };
  if (!readiness.ready) {
    return {
      ok: true,
      einsatzbereit: false,
      rides: [],
      marketOnline: false,
      readiness,
      message:
        "Noch nicht freigegeben oder Voraussetzungen unvollständig. Aufträge sind gesperrt, bis alles erfüllt ist.",
    };
  }

  const capability = await getFleetDriverCapability(fleetDriverId, companyId);
  if (!capability?.vehicleLegalType) {
    return {
      ok: true,
      einsatzbereit: false,
      rides: [],
      marketOnline: false,
      message:
        "Kein fahrbereites Fahrzeug: Zuweisung prüfen und Freigabe durch Onroda abwarten (nur freigegebene Fahrzeuge).",
    };
  }

  const marketOnline = await getFleetDriverMarketOnline(fleetDriverId, companyId);
  const medicalTransportAuth = await resolveMedicalTransportAuthorizationForFleetDriver(
    companyId,
    fleetDriverId,
  );
  const medicalTransportAuthorized = medicalTransportAuth?.authorized ?? false;
  const companyKkModuleEnabled = await getCompanyFeatureKkModule(companyId);
  const all = await listRides();
  const rideOriginKinds = await lookupAdminCompanyKinds(
    all.map((r) => (r.companyId ?? "").trim()).filter(Boolean),
  );

  const marketRowsRaw = all.filter((ride) => {
    if (TERMINAL_MARKET_STATUSES.has(ride.status)) return false;
    if (ride.status === "scheduled" || ride.status === "scheduled_assigned") return false;
    const isAssignedToDriver = ride.driverId === fleetDriverId;
    const isAssignedToOtherDriver = !!ride.driverId && !isAssignedToDriver;
    if (isAssignedToOtherDriver) return false;
    if (
      !filterRidesVisibleToFleetDriver([ride], companyId, rideOriginKinds).length
    ) {
      return false;
    }
    if (isAssignedToDriver) {
      return (
        ride.status === "ready_for_dispatch" ||
        ride.status === "accepted" ||
        ride.status === "driver_arriving" ||
        ride.status === "driver_waiting" ||
        ride.status === "passenger_onboard" ||
        ride.status === "arrived" ||
        ride.status === "in_progress"
      );
    }
    if ((ride.rejectedBy ?? []).includes(fleetDriverId)) return false;
    if (ride.rideKind === "medical" && (!companyKkModuleEnabled || !medicalTransportAuthorized)) return false;
    const inMarket = OPEN_INSTANT_STATUSES.has(ride.status);
    if (!inMarket) return false;
    if (!marketOnline) return false;
    return isRideCompatibleWithCapability(ride, capability);
  });

  const syncedRows = await syncDispatchTiersForRides(marketRowsRaw);
  const driverPriority = await getFleetDriverDispatchPriority(fleetDriverId, companyId);
  const radiusKm = await getDispatchRadiusKmFromConfig();
  const driverLoc = await getFleetDriverMarketLocation(fleetDriverId, companyId);
  const marketRows = syncedRows.filter((ride) => {
    if (isOpenInstantRideForDispatch(ride)) {
      if (ride.fromLat == null || ride.fromLon == null) return false;
      const rideTier = normalizeDispatchPriority(ride.dispatchTier ?? "A");
      if (!driverMatchesDispatchTier(driverPriority, rideTier)) return false;
      if (!driverLoc) {
        // Fahrer ONLINE ohne GPS-Ping: Mandanten-Fahrten trotzdem anzeigen (sonst leerer Markt).
        return true;
      }
      if (!isWithinDispatchRadiusKm(driverLoc.lat, driverLoc.lon, ride.fromLat, ride.fromLon, radiusKm)) {
        return false;
      }
    }
    return true;
  });

  return {
    ok: true,
    einsatzbereit: true,
    rides: marketRows,
    marketOnline,
  };
}

/** Nur offene Sofortfahrten im Markt (ohne Zuweisung an diesen Fahrer). */
export function filterOpenInstantMarketRides(rides: RideRequest[], fleetDriverId: string): RideRequest[] {
  return rides.filter(
    (ride) => !ride.driverId && OPEN_INSTANT_STATUSES.has(ride.status) && !(ride.rejectedBy ?? []).includes(fleetDriverId),
  );
}
