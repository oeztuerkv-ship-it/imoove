import { drivingRouteBetween, type PriceRoutingSource, type RouteGeoPoint } from "./fixedPriceRouteQuote";
import { logger } from "./logger";

const OSRM_BASE = "https://router.project-osrm.org";
const FETCH_TIMEOUT_MS = 12_000;

export type DriverNavRouteStep = {
  /** Volltext (rückwärtskompatibel), z. B. „Rechts abbiegen auf Hauptstraße“. */
  instruction: string;
  /** Kurzes Manöver ohne Straßenname, z. B. „Rechts abbiegen“. */
  maneuver: string;
  /** Straßenname aus OSRM `name`, sonst null. */
  roadName: string | null;
  distanceM: number;
  lat: number;
  lon: number;
};

export type DriverNavRouteQuoteOk = {
  ok: true;
  distanceKm: number;
  durationMinutes: number;
  /** Google Distance Matrix (wie Preis) oder OSRM — Quelle der angezeigten km/ETA. */
  routingSource: PriceRoutingSource;
  /** Geometrie/Abblendungen: OSRM (Matrix liefert keine Polyline). */
  geometrySource: "osrm";
  polyline: [number, number][];
  steps: DriverNavRouteStep[];
};

export type DriverNavRouteQuoteErr = {
  ok: false;
  error: string;
  message: string;
  routingSource: "error";
};

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "OnrodaApi/1.0 (driver-nav-route)",
      },
    });
    if (!res.ok) throw new Error(`http_${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function maneuverActionToGerman(type: string, modifier?: string): string {
  if (type === "arrive") return "Ziel erreicht";
  if (type === "depart") return "Fahrt beginnen";
  if (type === "continue") return "Geradeaus weiter";
  if (type === "merge") return "Einfahren";
  if (type === "on ramp") return "Auffahrt nehmen";
  if (type === "off ramp") return "Ausfahrt nehmen";
  if (type === "roundabout" || type === "rotary") return "Kreisverkehr";
  if (type === "turn") {
    if (modifier === "right") return "Rechts abbiegen";
    if (modifier === "left") return "Links abbiegen";
    if (modifier === "straight") return "Geradeaus";
    if (modifier === "sharp right") return "Scharf rechts";
    if (modifier === "sharp left") return "Scharf links";
    if (modifier === "uturn") return "Wenden";
    if (modifier === "slight right") return "Leicht rechts";
    if (modifier === "slight left") return "Leicht links";
  }
  return "Weiterfahren";
}

function maneuverToGerman(type: string, modifier?: string, name?: string): string {
  const action = maneuverActionToGerman(type, modifier);
  const road = name?.trim();
  if (!road) return action;
  if (type === "arrive") return action;
  if (type === "off ramp") return action;
  if (type === "turn" && modifier === "uturn") return action;
  return `${action} auf ${road}`;
}

function mapOsrmStepToDriverNav(s: {
  maneuver: { type: string; modifier?: string; location: [number, number] };
  distance: number;
  name?: string;
}): DriverNavRouteStep {
  const roadName = s.name?.trim() || null;
  const maneuver = maneuverActionToGerman(s.maneuver.type, s.maneuver.modifier);
  return {
    instruction: maneuverToGerman(s.maneuver.type, s.maneuver.modifier, s.name),
    maneuver,
    roadName,
    distanceM: Math.round(s.distance),
    lat: s.maneuver.location[1],
    lon: s.maneuver.location[0],
  };
}

async function osrmGeometryWithSteps(
  from: RouteGeoPoint,
  to: RouteGeoPoint,
): Promise<{ polyline: [number, number][]; steps: DriverNavRouteStep[] } | null> {
  const coordPath = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  const url = `${OSRM_BASE}/route/v1/driving/${coordPath}?overview=full&geometries=geojson&steps=true`;
  try {
    const data = (await fetchJson(url)) as {
      routes?: {
        distance: number;
        duration: number;
        geometry?: { coordinates?: [number, number][] };
        legs?: {
          steps?: {
            maneuver: { type: string; modifier?: string; location: [number, number] };
            distance: number;
            name?: string;
          }[];
        }[];
      }[];
    };
    const route = data.routes?.[0];
    if (!route) return null;
    const polyline: [number, number][] =
      route.geometry?.coordinates?.map(([lon, lat]) => [lat, lon] as [number, number]) ?? [];
    if (polyline.length < 2) return null;
    type OsrmStep = {
      maneuver: { type: string; modifier?: string; location: [number, number] };
      distance: number;
      name?: string;
    };
    const rawSteps: OsrmStep[] = (route.legs?.[0]?.steps as OsrmStep[]) ?? [];
    const steps: DriverNavRouteStep[] = rawSteps.map((s) => mapOsrmStepToDriverNav(s));
    return { polyline, steps };
  } catch {
    return null;
  }
}

/**
 * Fahrer-Navi: km/ETA wie Preis-Routen (Google Distance Matrix → OSRM),
 * Polyline/Steps von OSRM (Matrix ohne Geometrie). Keine Directions-API.
 */
export async function buildDriverNavRouteQuote(
  from: RouteGeoPoint,
  to: RouteGeoPoint,
): Promise<DriverNavRouteQuoteOk | DriverNavRouteQuoteErr> {
  const metrics = await drivingRouteBetween(from, to);
  if ("ok" in metrics && metrics.ok === false) {
    return metrics;
  }
  const route = metrics as { distanceKm: number; durationMinutes: number; routingSource: PriceRoutingSource };

  const geometry = await osrmGeometryWithSteps(from, to);
  if (!geometry) {
    logger.warn(
      {
        event: "driver_nav_route.geometry_failed",
        routingSource: route.routingSource,
        from: from.displayName,
        to: to.displayName,
      },
      "[driver-nav-route] OSRM geometry unavailable after metrics ok",
    );
    return {
      ok: false,
      error: "route_geometry_unavailable",
      message: "Routenverlauf konnte nicht geladen werden. Bitte erneut versuchen.",
      routingSource: "error",
    };
  }

  logger.info(
    {
      event: "driver_nav_route.ok",
      routingSource: route.routingSource,
      geometrySource: "osrm",
      distanceKm: route.distanceKm,
      durationMinutes: route.durationMinutes,
      polylinePoints: geometry.polyline.length,
      stepCount: geometry.steps.length,
    },
    "[driver-nav-route] metrics + geometry ok",
  );

  return {
    ok: true,
    distanceKm: route.distanceKm,
    durationMinutes: route.durationMinutes,
    routingSource: route.routingSource,
    geometrySource: "osrm",
    polyline: geometry.polyline,
    steps: geometry.steps,
  };
}
