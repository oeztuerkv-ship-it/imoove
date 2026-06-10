import type { RideRequest } from "../domain/rideRequest";
import { haversineDistanceKm } from "../lib/serviceRegionMatch";
import { filterOpenInstantMarketRides, listMarketRidesForFleetDriver } from "./fleetDriverMarketPool";
import { findRide } from "./ridesData";

const DEFAULT_MAX_RADIUS_KM = 15;
const DIRECTION_WEIGHT_KM = 2.5;

function followUpMaxRadiusKm(): number {
  const raw = Number(process.env.ONRODA_FOLLOW_UP_MAX_RADIUS_KM ?? DEFAULT_MAX_RADIUS_KM);
  return Number.isFinite(raw) && raw >= 3 && raw <= 50 ? raw : DEFAULT_MAX_RADIUS_KM;
}

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function angleDiffDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function pickupCoords(ride: RideRequest): { lat: number; lon: number } | null {
  const lat = ride.fromLat;
  const lon = ride.fromLon;
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

export type FollowUpOfferResult = {
  ride: RideRequest;
  distanceKm: number;
  scoreKm: number;
  directionMatch: "same" | "turn" | "unknown";
};

/**
 * Nächster offener Sofortauftrag für freien Fahrer nach Fahrtabschluss.
 * Sortierung: Entfernung zum Abholort + leichte Präferenz für gleiche Fahrtrichtung.
 */
export async function findFollowUpOfferForDriver(opts: {
  fleetDriverId: string;
  companyId: string;
  lat: number;
  lon: number;
  excludeRideId?: string;
  lastRideId?: string;
}): Promise<FollowUpOfferResult | null> {
  const { fleetDriverId, companyId, lat, lon, excludeRideId, lastRideId } = opts;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const pool = await listMarketRidesForFleetDriver(fleetDriverId, companyId);
  if (!pool.ok || !pool.einsatzbereit || !pool.marketOnline) return null;

  const open = filterOpenInstantMarketRides(pool.rides, fleetDriverId);
  const exclude = (excludeRideId ?? "").trim();
  const maxKm = followUpMaxRadiusKm();

  let lastBearing: number | null = null;
  if (lastRideId) {
    const last = await findRide(lastRideId.trim());
    if (last?.fromLat != null && last.fromLon != null && last.toLat != null && last.toLon != null) {
      lastBearing = bearingDeg(last.fromLat, last.fromLon, last.toLat, last.toLon);
    }
  }

  let best: FollowUpOfferResult | null = null;

  for (const ride of open) {
    if (exclude && ride.id === exclude) continue;
    const pickup = pickupCoords(ride);
    if (!pickup) continue;

    const distanceKm = haversineDistanceKm(lat, lon, pickup.lat, pickup.lon);
    if (distanceKm > maxKm) continue;

    let directionMatch: FollowUpOfferResult["directionMatch"] = "unknown";
    let directionPenaltyKm = 0;
    if (lastBearing != null) {
      const toPickupBearing = bearingDeg(lat, lon, pickup.lat, pickup.lon);
      const diff = angleDiffDeg(lastBearing, toPickupBearing);
      if (diff <= 45) {
        directionMatch = "same";
        directionPenaltyKm = 0;
      } else if (diff >= 135) {
        directionMatch = "turn";
        directionPenaltyKm = DIRECTION_WEIGHT_KM;
      } else {
        directionMatch = "turn";
        directionPenaltyKm = DIRECTION_WEIGHT_KM * (diff / 135);
      }
    }

    const scoreKm = distanceKm + directionPenaltyKm;
    if (!best || scoreKm < best.scoreKm) {
      best = { ride, distanceKm, scoreKm, directionMatch };
    }
  }

  return best;
}
