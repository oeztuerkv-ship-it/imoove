import type { RideRequest } from "../domain/rideRequest.js";
import { toDriverRideView } from "../domain/ridePublic.js";
import { isInstantDispatchRideStatus } from "../db/rideDispatchOfferData.js";
import { estimatePickupEtaMinutes } from "./ridePickupEta.js";
import { haversineDistanceKm } from "./serviceRegionMatch.js";

/** Offenes Sofortangebot: nur Anfahrt km/Min., keine Kundenposition oder Adressen. */
export function toDriverOpenMarketOfferView(
  r: RideRequest,
  opts: { driverLat: number | null; driverLon: number | null },
): RideRequest {
  const base = toDriverRideView(r);
  if (r.driverId || !isInstantDispatchRideStatus(r.status)) {
    return base;
  }

  let pickupReachKm: number | null = null;
  let pickupReachMinutes: number | null = null;
  if (
    opts.driverLat != null &&
    opts.driverLon != null &&
    r.fromLat != null &&
    r.fromLon != null
  ) {
    pickupReachKm =
      Math.round(haversineDistanceKm(opts.driverLat, opts.driverLon, r.fromLat, r.fromLon) * 10) / 10;
    pickupReachMinutes = estimatePickupEtaMinutes(
      opts.driverLat,
      opts.driverLon,
      r.fromLat,
      r.fromLon,
    );
  }

  return {
    ...base,
    from: "",
    fromFull: "",
    fromLat: undefined,
    fromLon: undefined,
    to: "",
    toFull: "",
    toLat: undefined,
    toLon: undefined,
    distanceKm: 0,
    durationMinutes: 0,
    customerPhone: null,
    pickupReachKm,
    pickupReachMinutes,
  } as RideRequest;
}
