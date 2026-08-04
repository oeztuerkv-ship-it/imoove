/**
 * Owner legt aus der Fahrer-App eine Funk-Sofortfahrt an (Telefon-Weiterleitung).
 * Gleiche Dispatch-Kette wie Panel `funkDispatch: true` — ohne Abrechnung.
 */
import type { RideRequest } from "../domain/rideRequest";
import { findCompanyById } from "../db/adminData";
import { getOperationalConfigPayload, listServiceRegionsForApi } from "../db/appOperationalData";
import { findFleetDriverInCompany } from "../db/fleetDriversData";
import { startFunkDispatch } from "../db/funkDispatchData";
import { insertRide, findRide } from "../db/ridesData";
import { initialDispatchTierFieldsForRide } from "./dispatchPriorityTier";
import { initialPanelRideStatus } from "./dispatchStatus";
import { buildRouteDistanceQuote, geocodePartnerPanelAddressFull } from "./fixedPriceRouteQuote";
import { computeRideBookingPricing } from "./rideBookingPricing";
import { haversineDistanceKm } from "./serviceRegionMatch";

function newRideId(): string {
  return `ride-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export type FleetDriverCreateFunkRideInput = {
  fleetDriverId: string;
  companyId: string;
  customerName: string;
  customerPhone?: string;
  from: string;
  fromFull: string;
  to: string;
  toFull: string;
  fromLat?: number | null;
  fromLon?: number | null;
  toLat?: number | null;
  toLon?: number | null;
  vehicle?: string;
};

export type FleetDriverCreateFunkRideResult =
  | { ok: true; ride: RideRequest }
  | { ok: false; error: string; message?: string };

async function resolveCoords(
  fromFull: string,
  toFull: string,
  fromLat?: number | null,
  fromLon?: number | null,
  toLat?: number | null,
  toLon?: number | null,
): Promise<{
  fromLat: number | null;
  fromLon: number | null;
  toLat: number | null;
  toLon: number | null;
}> {
  let fLat = fromLat ?? null;
  let fLon = fromLon ?? null;
  let tLat = toLat ?? null;
  let tLon = toLon ?? null;
  if (fLat == null || fLon == null) {
    const pt = await geocodePartnerPanelAddressFull(fromFull);
    if (pt) {
      fLat = pt.lat;
      fLon = pt.lon;
    }
  }
  if (tLat == null || tLon == null) {
    const pt = await geocodePartnerPanelAddressFull(toFull);
    if (pt) {
      tLat = pt.lat;
      tLon = pt.lon;
    }
  }
  return { fromLat: fLat, fromLon: fLon, toLat: tLat, toLon: tLon };
}

export async function createFleetDriverFunkRide(
  input: FleetDriverCreateFunkRideInput,
): Promise<FleetDriverCreateFunkRideResult> {
  const fleetDriverId = input.fleetDriverId.trim();
  const companyId = input.companyId.trim();
  if (!fleetDriverId || !companyId) return { ok: false, error: "unauthorized" };

  const company = await findCompanyById(companyId);
  if (String(company?.company_kind ?? "").trim().toLowerCase() !== "taxi") {
    return {
      ok: false,
      error: "funk_dispatch_taxi_only",
      message: "Funk-Zuweisung ist nur für Taxi-Unternehmen verfügbar.",
    };
  }

  const driver = await findFleetDriverInCompany(fleetDriverId, companyId);
  if (!driver) return { ok: false, error: "not_found" };
  if (!driver.is_owner) {
    return {
      ok: false,
      error: "owner_only",
      message: "Funk-Zuweisung ist nur für den Inhaber verfügbar.",
    };
  }

  const customerName = input.customerName.trim() || "Telefonkunde";
  const from = input.from.trim();
  const fromFull = input.fromFull.trim() || from;
  const to = input.to.trim();
  const toFull = input.toFull.trim() || to;
  if (!from || !fromFull || !to || !toFull) {
    return { ok: false, error: "route_fields_required" };
  }

  const coords = await resolveCoords(
    fromFull,
    toFull,
    input.fromLat,
    input.fromLon,
    input.toLat,
    input.toLon,
  );
  if (coords.fromLat == null || coords.fromLon == null) {
    return {
      ok: false,
      error: "from_not_found",
      message: "Abholadresse konnte nicht geortet werden.",
    };
  }
  if (coords.toLat == null || coords.toLon == null) {
    return {
      ok: false,
      error: "to_not_found",
      message: "Zieladresse konnte nicht geortet werden.",
    };
  }

  const quote = await buildRouteDistanceQuote({
    fromFull,
    toFull,
    fromLat: coords.fromLat,
    fromLon: coords.fromLon,
    toLat: coords.toLat,
    toLon: coords.toLon,
  });
  let distanceKm: number;
  let durationMinutes: number;
  if (quote.ok) {
    distanceKm = quote.route.distanceKm;
    durationMinutes = quote.route.durationMinutes;
  } else {
    distanceKm =
      Math.round(
        haversineDistanceKm(coords.fromLat, coords.fromLon, coords.toLat, coords.toLon) * 100,
      ) / 100;
    durationMinutes = Math.max(5, Math.round(distanceKm * 2.5));
  }

  const vehicle = (input.vehicle ?? "standard").trim().toLowerCase() || "standard";
  const opPayload = await getOperationalConfigPayload();
  const regions = await listServiceRegionsForApi();
  const pricing = computeRideBookingPricing({
    opPayload,
    regions,
    fromFull,
    fromLat: coords.fromLat,
    fromLon: coords.fromLon,
    distanceKm,
    tripMinutes: durationMinutes,
    waitingMinutes: 0,
    vehicle,
    at: new Date(),
  });

  const customerPhone = (input.customerPhone ?? "").trim();
  const ride: RideRequest = {
    id: newRideId(),
    companyId,
    createdAt: new Date().toISOString(),
    scheduledAt: null,
    status: initialPanelRideStatus(null),
    rejectedBy: [],
    driverId: null,
    dispatchMode: "funk",
    offeredToDriverId: null,
    funkOfferStartedAt: null,
    ...initialDispatchTierFieldsForRide(null),
    customerName,
    customerPhone: customerPhone || null,
    from,
    fromFull,
    fromLat: coords.fromLat,
    fromLon: coords.fromLon,
    to,
    toFull,
    toLat: coords.toLat,
    toLon: coords.toLon,
    distanceKm,
    durationMinutes,
    estimatedFare: pricing.finalPrice,
    finalFare: null,
    paymentMethod: "funk",
    vehicle,
    rideKind: "standard",
    payerKind: "passenger",
    authorizationSource: "partner",
    accessCodeId: null,
    pricingMode: pricing.pricingMode,
    tariffSnapshot: pricing.snapshot,
    partnerBookingMeta: {
      funk_dispatch: true,
      funk_no_billing: true,
      created_by_fleet_driver: true,
      fleet_driver_id: fleetDriverId,
    },
  };

  await insertRide(ride);
  const saved = (await findRide(ride.id)) ?? ride;
  const afterDispatch = await startFunkDispatch(saved);
  return { ok: true, ride: afterDispatch };
}
