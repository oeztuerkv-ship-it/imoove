import { assertPlatformNewRideAllowed, getOperationalConfigPayload } from "../db/appOperationalData";
import { checkFixedPriceBooking } from "./fixedPriceBooking";
import {
  getGoogleDistanceMatrixApiKey,
  getGoogleDistanceMatrixKeySource,
} from "./googlePlacesClient";
import { logger } from "./logger";

const PHOTON_BASE = "https://photon.komoot.io/api";
const OSRM_BASE = "https://router.project-osrm.org";
const GOOGLE_DISTANCE_MATRIX_BASE = "https://maps.googleapis.com/maps/api/distancematrix/json";
const DE_BBOX = "5.866,47.270,15.042,55.059";
const BIAS_LAT = 48.7395;
const BIAS_LON = 9.3072;
const FETCH_TIMEOUT_MS = 12_000;

export const ROUTE_NOT_COMPUTABLE_MESSAGE =
  "Preis aktuell nicht berechenbar — Streckenlänge konnte nicht ermittelt werden.";

export type PriceRoutingSource = "google" | "osrm";

export type RouteGeoPoint = {
  displayName: string;
  lat: number;
  lon: number;
  city?: string | null;
};

export type DrivingRouteResult = {
  distanceKm: number;
  durationMinutes: number;
  routingSource: PriceRoutingSource;
};

export type RouteQuoteError = {
  ok: false;
  error: string;
  message: string;
  routingSource: "error";
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

/** Partner-Panel: Straße + PLZ ohne Ort — mehrstufiges Geocoding (Photon). */
export async function geocodePartnerPanelAddressFull(full: string): Promise<RouteGeoPoint | null> {
  const base = String(full ?? "").trim();
  if (!base) return null;
  let pt = await geocodeAddressPhoton(base);
  if (pt) return pt;
  if (!/deutschland/i.test(base)) {
    pt = await geocodeAddressPhoton(`${base}, Deutschland`);
    if (pt) return { ...pt, displayName: base };
  }
  const plz = base.match(/\b(\d{5})\b/)?.[1];
  if (plz) {
    pt = await geocodeAddressPhoton(`${plz}, Deutschland`);
    if (pt) return { ...pt, displayName: base };
  }
  return null;
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
  return geocodePartnerPanelAddressFull(displayName);
}

async function drivingRouteGoogle(from: RouteGeoPoint, to: RouteGeoPoint): Promise<DrivingRouteResult | null> {
  const key = getGoogleDistanceMatrixApiKey();
  const keySource = getGoogleDistanceMatrixKeySource();
  if (!key) {
    logger.warn(
      { event: "price_route.google_skipped", reason: "no_api_key", keySource },
      "[price-route] Google Distance Matrix skipped — no API key configured",
    );
    return null;
  }
  const origins = encodeURIComponent(`${from.lat},${from.lon}`);
  const destinations = encodeURIComponent(`${to.lat},${to.lon}`);
  const url =
    `${GOOGLE_DISTANCE_MATRIX_BASE}?origins=${origins}` +
    `&destinations=${destinations}` +
    `&mode=driving&language=de&units=metric&key=${encodeURIComponent(key)}`;
  try {
    const data = (await fetchJson(url)) as {
      status?: string;
      error_message?: string;
      rows?: { elements?: { status?: string; distance?: { value?: number }; duration?: { value?: number } }[] }[];
    };
    if (data.status !== "OK") {
      logger.warn(
        {
          event: "price_route.google_failed",
          keySource,
          apiStatus: data.status ?? "unknown",
          errorMessage: data.error_message ?? null,
          from: from.displayName,
          to: to.displayName,
        },
        "[price-route] Google Distance Matrix API rejected request",
      );
      return null;
    }
    const el = data.rows?.[0]?.elements?.[0];
    if (!el || el.status !== "OK") {
      logger.warn(
        {
          event: "price_route.google_element_failed",
          keySource,
          elementStatus: el?.status ?? "missing",
          from: from.displayName,
          to: to.displayName,
        },
        "[price-route] Google Distance Matrix returned no route for coordinates",
      );
      return null;
    }
    const meters = Number(el.distance?.value ?? 0);
    const seconds = Number(el.duration?.value ?? 0);
    if (!Number.isFinite(meters) || meters <= 0) {
      logger.warn(
        { event: "price_route.google_invalid_distance", keySource, meters, from: from.displayName, to: to.displayName },
        "[price-route] Google Distance Matrix distance invalid",
      );
      return null;
    }
    const distanceKm = Math.round((meters / 1000) * 100) / 100;
    logger.info(
      {
        event: "price_route.google_ok",
        keySource,
        distanceKm,
        durationMinutes: Math.max(1, Math.round(seconds / 60)),
        from: from.displayName,
        to: to.displayName,
      },
      "[price-route] Google Distance Matrix route used",
    );
    return {
      distanceKm,
      durationMinutes: Math.max(1, Math.round(seconds / 60)),
      routingSource: "google",
    };
  } catch (err) {
    logger.warn(
      {
        event: "price_route.google_error",
        keySource,
        err: err instanceof Error ? err.message : String(err),
        from: from.displayName,
        to: to.displayName,
      },
      "[price-route] Google Distance Matrix request failed",
    );
    return null;
  }
}

async function drivingRouteOsrm(from: RouteGeoPoint, to: RouteGeoPoint): Promise<DrivingRouteResult | null> {
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
    /* try next */
  }
  return null;
}

/** Google primär, OSRM Fallback — kein Haversine für Preis-km. */
export async function drivingRouteBetween(
  from: RouteGeoPoint,
  to: RouteGeoPoint,
): Promise<DrivingRouteResult | RouteQuoteError> {
  const google = await drivingRouteGoogle(from, to);
  if (google) return google;
  logger.info(
    { event: "price_route.osrm_fallback", from: from.displayName, to: to.displayName },
    "[price-route] falling back to OSRM after Google unavailable or failed",
  );
  const osrm = await drivingRouteOsrm(from, to);
  if (osrm) return osrm;
  return {
    ok: false,
    error: "route_not_computable",
    message: ROUTE_NOT_COMPUTABLE_MESSAGE,
    routingSource: "error",
  };
}

export type RouteDistanceArgs = {
  fromFull: string;
  toFull: string;
  fromLat?: number | null;
  fromLon?: number | null;
  toLat?: number | null;
  toLon?: number | null;
  fromCity?: string | null;
  toCity?: string | null;
};

export type FixedPriceQuoteSuccess = {
  ok: true;
  from: RouteGeoPoint;
  to: RouteGeoPoint;
  route: DrivingRouteResult;
  routingSource: PriceRoutingSource;
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

export type FixedPriceQuoteError = RouteQuoteError;

export async function buildFixedPriceQuote(
  args: RouteDistanceArgs & { vehicle?: string },
): Promise<FixedPriceQuoteSuccess | FixedPriceQuoteError> {
  const fromFull = String(args.fromFull ?? "").trim();
  const toFull = String(args.toFull ?? "").trim();
  if (!fromFull || !toFull) {
    return {
      ok: false,
      error: "from_to_required",
      message: "Bitte Start und Ziel angeben.",
      routingSource: "error",
    };
  }

  const opPayload = await getOperationalConfigPayload();
  const gate = assertPlatformNewRideAllowed(opPayload);
  if (!gate.ok) {
    return {
      ok: false,
      error: gate.error,
      message: gate.message ?? "Buchungen sind derzeit nicht möglich.",
      routingSource: "error",
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
      routingSource: "error",
    };
  }
  if (!to) {
    return {
      ok: false,
      error: "to_not_found",
      message: "Zieladresse konnte nicht gefunden werden.",
      routingSource: "error",
    };
  }

  const routeOutcome = await drivingRouteBetween(from, to);
  if ("ok" in routeOutcome && routeOutcome.ok === false) {
    return routeOutcome;
  }
  const route = routeOutcome as DrivingRouteResult;

  const vehicle = typeof args.vehicle === "string" && args.vehicle.trim() ? args.vehicle.trim() : "standard";
  const result = checkFixedPriceBooking({
    opPayload,
    from: {
      displayName: from.displayName,
      city: from.city ?? args.fromCity ?? null,
      lat: from.lat,
      lon: from.lon,
    },
    to: {
      displayName: to.displayName,
      city: to.city ?? args.toCity ?? null,
      lat: to.lat,
      lon: to.lon,
    },
    distanceKm: route.distanceKm,
    vehicle,
  });

  if (!result.eligible) {
    return {
      ok: true,
      from,
      to,
      route,
      routingSource: route.routingSource,
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
    routingSource: route.routingSource,
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

export async function buildRouteDistanceQuote(
  args: RouteDistanceArgs,
): Promise<
  | { ok: true; from: RouteGeoPoint; to: RouteGeoPoint; route: DrivingRouteResult; routingSource: PriceRoutingSource }
  | RouteQuoteError
> {
  const fromFull = String(args.fromFull ?? "").trim();
  const toFull = String(args.toFull ?? "").trim();
  if (!fromFull || !toFull) {
    return {
      ok: false,
      error: "from_to_required",
      message: "Bitte Start und Ziel angeben.",
      routingSource: "error",
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
      routingSource: "error",
    };
  }
  if (!to) {
    return {
      ok: false,
      error: "to_not_found",
      message: "Zieladresse konnte nicht gefunden werden.",
      routingSource: "error",
    };
  }
  const routeOutcome = await drivingRouteBetween(from, to);
  if ("ok" in routeOutcome && routeOutcome.ok === false) {
    return routeOutcome;
  }
  const route = routeOutcome as DrivingRouteResult;
  return { ok: true, from, to, route, routingSource: route.routingSource };
}
