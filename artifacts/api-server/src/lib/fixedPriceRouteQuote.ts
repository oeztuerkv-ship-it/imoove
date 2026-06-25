import { assertPlatformNewRideAllowed, getOperationalConfigPayload } from "../db/appOperationalData";
import { checkFixedPriceBooking } from "./fixedPriceBooking";
import { haversineDistanceKm } from "./serviceRegionMatch";

const PHOTON_BASE = "https://photon.komoot.io/api";
const OSRM_BASE = "https://router.project-osrm.org";
const DE_BBOX = "5.866,47.270,15.042,55.059";
const BIAS_LAT = 48.7395;
const BIAS_LON = 9.3072;
const FETCH_TIMEOUT_MS = 12_000;

export type RouteGeoPoint = {
  displayName: string;
  lat: number;
  lon: number;
  city?: string | null;
};

export type DrivingRouteResult = {
  distanceKm: number;
  durationMinutes: number;
  routingSource: "osrm" | "haversine";
};

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    town?: string;
    village?: string;
    district?: string;
    county?: string;
    country?: string;
    countrycode?: string;
  };
};

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "OnrodaApi/1.0 (route-quote)",
      },
    });
    if (!res.ok) throw new Error(`http_${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function photonLabel(f: PhotonFeature): string {
  const p = f.properties;
  const parts: string[] = [];
  if (p.street) {
    parts.push(p.housenumber ? `${p.street} ${p.housenumber}` : p.street);
  } else if (p.name) {
    parts.push(p.name);
  }
  const city = p.city ?? p.town ?? p.village ?? p.district ?? p.county;
  if (city && !parts.includes(city)) parts.push(city);
  if (p.countrycode && p.countrycode.toLowerCase() !== "de" && p.country) {
    parts.push(p.country);
  }
  return parts.filter(Boolean).join(", ") || (p.name ?? "");
}

function photonCity(f: PhotonFeature): string | null {
  const p = f.properties;
  const city = p.city ?? p.town ?? p.village ?? p.district ?? p.county ?? null;
  return city ? String(city).trim() : null;
}

export async function geocodeAddressPhoton(query: string): Promise<RouteGeoPoint | null> {
  const q = String(query ?? "").trim();
  if (q.length < 2) return null;
  const url =
    `${PHOTON_BASE}?q=${encodeURIComponent(q)}` +
    `&limit=1&lat=${BIAS_LAT}&lon=${BIAS_LON}&bbox=${DE_BBOX}`;
  let data: { features?: PhotonFeature[] };
  try {
    data = (await fetchJson(url)) as { features?: PhotonFeature[] };
  } catch {
    return null;
  }
  const f = data.features?.[0];
  if (!f?.geometry?.coordinates) return null;
  const [lon, lat] = f.geometry.coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    displayName: photonLabel(f) || q,
    lat,
    lon,
    city: photonCity(f),
  };
}

export async function resolveRouteGeoPoint(
  full: string,
  lat?: number | null,
  lon?: number | null,
  city?: string | null,
): Promise<RouteGeoPoint | null> {
  const displayName = String(full ?? "").trim();
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return {
      displayName: displayName || `${lat}, ${lon}`,
      lat: Number(lat),
      lon: Number(lon),
      city: city ?? null,
    };
  }
  if (!displayName) return null;
  return geocodeAddressPhoton(displayName);
}

export async function drivingRouteBetween(
  from: RouteGeoPoint,
  to: RouteGeoPoint,
): Promise<DrivingRouteResult> {
  const coordPath = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  const url = `${OSRM_BASE}/route/v1/driving/${coordPath}?overview=false`;
  try {
    const data = (await fetchJson(url)) as {
      routes?: { distance: number; duration: number }[];
    };
    const route = data.routes?.[0];
    if (route && Number.isFinite(route.distance) && route.distance > 0) {
      return {
        distanceKm: Math.round((route.distance / 1000) * 100) / 100,
        durationMinutes: Math.max(1, Math.round(route.duration / 60)),
        routingSource: "osrm",
      };
    }
  } catch {
    /* fallback */
  }
  const distanceKm =
    Math.round(haversineDistanceKm(from.lat, from.lon, to.lat, to.lon) * 100) / 100;
  const durationMinutes = Math.max(1, Math.round((distanceKm / 45) * 60));
  return { distanceKm, durationMinutes, routingSource: "haversine" };
}

export type FixedPriceQuoteSuccess = {
  ok: true;
  from: RouteGeoPoint;
  to: RouteGeoPoint;
  route: DrivingRouteResult;
  quote:
    | {
        eligible: true;
        pricingMode: "fixed_price";
        priceEur: number;
        basePriceEur: number;
        vehicleSurchargeEur: number;
        distanceKm: number;
        baseFeeEur: number;
        perKmEur: number;
        distanceChargeEur: number;
      }
    | {
        eligible: false;
        reason: string;
        message: string;
      };
};

export type FixedPriceQuoteError = {
  ok: false;
  error: string;
  message: string;
};

export async function buildFixedPriceQuote(args: {
  fromFull: string;
  toFull: string;
  fromLat?: number | null;
  fromLon?: number | null;
  toLat?: number | null;
  toLon?: number | null;
  fromCity?: string | null;
  toCity?: string | null;
  vehicle?: string;
}): Promise<FixedPriceQuoteSuccess | FixedPriceQuoteError> {
  const fromFull = String(args.fromFull ?? "").trim();
  const toFull = String(args.toFull ?? "").trim();
  if (!fromFull || !toFull) {
    return { ok: false, error: "from_to_required", message: "Bitte Start und Ziel angeben." };
  }

  const opPayload = await getOperationalConfigPayload();
  const gate = assertPlatformNewRideAllowed(opPayload);
  if (!gate.ok) {
    return {
      ok: false,
      error: gate.error,
      message: gate.message ?? "Buchungen sind derzeit nicht möglich.",
    };
  }

  const [from, to] = await Promise.all([
    resolveRouteGeoPoint(fromFull, args.fromLat, args.fromLon, args.fromCity),
    resolveRouteGeoPoint(toFull, args.toLat, args.toLon, args.toCity),
  ]);

  if (!from) {
    return {
      ok: false,
      error: "from_not_found",
      message: "Startadresse konnte nicht gefunden werden.",
    };
  }
  if (!to) {
    return {
      ok: false,
      error: "to_not_found",
      message: "Zieladresse konnte nicht gefunden werden.",
    };
  }

  const route = await drivingRouteBetween(from, to);
  const vehicle = typeof args.vehicle === "string" && args.vehicle.trim() ? args.vehicle.trim() : "standard";
  const result = checkFixedPriceBooking({
    opPayload,
    from: { displayName: from.displayName, city: from.city ?? args.fromCity ?? null },
    to: { displayName: to.displayName, city: to.city ?? args.toCity ?? null },
    distanceKm: route.distanceKm,
    vehicle,
  });

  if (!result.eligible) {
    return {
      ok: true,
      from,
      to,
      route,
      quote: {
        eligible: false,
        reason: result.reason,
        message: result.message,
      },
    };
  }

  return {
    ok: true,
    from,
    to,
    route,
    quote: {
      eligible: true,
      pricingMode: "fixed_price",
      priceEur: result.priceEur,
      basePriceEur: result.basePriceEur,
      vehicleSurchargeEur: result.vehicleSurchargeEur,
      distanceKm: result.distanceKm,
      baseFeeEur: result.baseFeeEur,
      perKmEur: result.perKmEur,
      distanceChargeEur: result.distanceChargeEur,
    },
  };
}

export async function buildRouteDistanceQuote(args: {
  fromFull: string;
  toFull: string;
  fromLat?: number | null;
  fromLon?: number | null;
  toLat?: number | null;
  toLon?: number | null;
  fromCity?: string | null;
  toCity?: string | null;
}): Promise<
  | { ok: true; from: RouteGeoPoint; to: RouteGeoPoint; route: DrivingRouteResult }
  | FixedPriceQuoteError
> {
  const fromFull = String(args.fromFull ?? "").trim();
  const toFull = String(args.toFull ?? "").trim();
  if (!fromFull || !toFull) {
    return { ok: false, error: "from_to_required", message: "Bitte Start und Ziel angeben." };
  }
  const [from, to] = await Promise.all([
    resolveRouteGeoPoint(fromFull, args.fromLat, args.fromLon, args.fromCity),
    resolveRouteGeoPoint(toFull, args.toLat, args.toLon, args.toCity),
  ]);
  if (!from) {
    return { ok: false, error: "from_not_found", message: "Startadresse konnte nicht gefunden werden." };
  }
  if (!to) {
    return { ok: false, error: "to_not_found", message: "Zieladresse konnte nicht gefunden werden." };
  }
  const route = await drivingRouteBetween(from, to);
  return { ok: true, from, to, route };
}
