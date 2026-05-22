import type { RideRequest } from "../domain/rideRequest";

export type CachedDriverLocation = { lat: number; lon: number; updatedAt: string };

/** Abholort: „Angekommen“ (gleich Mobile-UI). */
export const PICKUP_GEOFENCE_MAX_M = 300;

/** Max. Alter Fahrer-GPS für Validierung (Recovery nach kurzem Offline). */
export const DRIVER_LOCATION_MAX_AGE_MS = 120_000;

const TRIP_START_FROM = new Set<RideRequest["status"]>(["driver_waiting"]);

export type RideStatusGuardFailure = {
  ok: false;
  status: number;
  error: string;
  message: string;
  details?: Record<string, unknown>;
};

export type RideStatusGuardSuccess = { ok: true };

export type RideStatusGuardResult = RideStatusGuardSuccess | RideStatusGuardFailure;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusM = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusM * c;
}

export function pickupCoordinates(ride: RideRequest): { lat: number; lon: number } | null {
  const lat = ride.fromLat;
  const lon = ride.fromLon;
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function parseDriverCoordsFromBody(body: unknown): { lat: number; lon: number } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { driverLat?: unknown; driverLon?: unknown; lat?: unknown; lon?: unknown };
  const latRaw = b.driverLat ?? b.lat;
  const lonRaw = b.driverLon ?? b.lon;
  const lat = typeof latRaw === "number" ? latRaw : Number(latRaw);
  const lon = typeof lonRaw === "number" ? lonRaw : Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function resolveDriverPosition(
  rideId: string,
  body: unknown,
  driverLocations: Map<string, CachedDriverLocation>,
): { lat: number; lon: number; source: "body" | "cache" } | null {
  const fromBody = parseDriverCoordsFromBody(body);
  if (fromBody) return { ...fromBody, source: "body" };
  const cached = driverLocations.get(rideId);
  if (!cached) return null;
  const age = Date.now() - new Date(cached.updatedAt).getTime();
  if (!Number.isFinite(age) || age > DRIVER_LOCATION_MAX_AGE_MS) return null;
  return { lat: cached.lat, lon: cached.lon, source: "cache" };
}

function geofenceFailure(
  error: string,
  message: string,
  details: Record<string, unknown>,
): RideStatusGuardFailure {
  return { ok: false, status: 409, error, message, details };
}

/**
 * Harte Server-Validierung vor PATCH (Anti-Fraud / Betriebslogik).
 * Finanz-States bleiben in `ride_financials` (billing_status, settlement_status) — getrennt von `rides.status`.
 */
export function validateRideStatusTransition(
  cur: RideRequest,
  nextStatus: RideRequest["status"],
  ctx: {
    rideId: string;
    body: unknown;
    driverLocations: Map<string, CachedDriverLocation>;
    parsedFinalFare?: number;
  },
): RideStatusGuardResult {
  if (nextStatus === "driver_waiting") {
    const pickup = pickupCoordinates(cur);
    if (!pickup) {
      return {
        ok: false,
        status: 409,
        error: "pickup_coordinates_missing",
        message: "Abholkoordinaten fehlen — Ankunft kann nicht bestätigt werden.",
      };
    }
    const pos = resolveDriverPosition(ctx.rideId, ctx.body, ctx.driverLocations);
    if (!pos) {
      return {
        ok: false,
        status: 409,
        error: "driver_location_required",
        message: "Fahrer-Standort fehlt oder ist veraltet. Bitte GPS senden (Navigation/App).",
      };
    }
    const distM = haversineMeters(pos.lat, pos.lon, pickup.lat, pickup.lon);
    if (distM > PICKUP_GEOFENCE_MAX_M) {
      return geofenceFailure(
        "pickup_geofence_failed",
        `Abholort nicht erreicht (${Math.round(distM)} m entfernt, max. ${PICKUP_GEOFENCE_MAX_M} m).`,
        { distanceM: Math.round(distM), maxM: PICKUP_GEOFENCE_MAX_M, driverLat: pos.lat, driverLon: pos.lon },
      );
    }
  }

  if (nextStatus === "in_progress") {
    if (!TRIP_START_FROM.has(cur.status)) {
      return {
        ok: false,
        status: 409,
        error: "trip_start_requires_pickup_phase",
        message: "Fahrt zum Ziel nur nach „Angekommen“ / Warten am Abholort.",
      };
    }
    const pickup = pickupCoordinates(cur);
    const pos = resolveDriverPosition(ctx.rideId, ctx.body, ctx.driverLocations);
    if (pickup && pos) {
      const distM = haversineMeters(pos.lat, pos.lon, pickup.lat, pickup.lon);
      if (distM > PICKUP_GEOFENCE_MAX_M * 4) {
        return geofenceFailure(
          "trip_start_geofence_failed",
          "Fahrtbeginn nur in der Nähe des Abholorts möglich.",
          { distanceM: Math.round(distM) },
        );
      }
    }
  }

  if (nextStatus === "completed") {
    const preTrip =
      cur.status === "accepted" || cur.status === "driver_arriving" || cur.status === "driver_waiting";
    if (preTrip) {
      if (ctx.parsedFinalFare !== undefined && ctx.parsedFinalFare > 0.009) {
        return {
          ok: false,
          status: 400,
          error: "complete_without_trip_start",
          message: "Ohne Fahrtbeginn zum Ziel ist kein Fahrpreis zulässig. Bitte 0,00 € oder Stornierung.",
        };
      }
    } else if (cur.status === "passenger_onboard") {
      if (ctx.parsedFinalFare !== undefined && ctx.parsedFinalFare > 0.009) {
        return {
          ok: false,
          status: 400,
          error: "complete_trip_not_started",
          message: "Bitte Fahrt zum Ziel starten, bevor ein Preis abgerechnet wird.",
        };
      }
    }
  }

  return { ok: true };
}
