export interface GeoLocation {
  lat: number;
  lon: number;
  displayName: string;
  street?: string;
  city?: string;
  country?: string;
}

export interface RouteResult {
  distanceKm: number;
  durationMinutes: number;
  polyline?: [number, number][];
}

/** Öffentliche Demo-Instanz — kann rate-limiten / ausfallen; App nutzt dann Fallback (Luftlinie). */
const OSRM_BASE = "https://router.project-osrm.org";
const PHOTON    = "https://photon.komoot.io/api";

/* Fallback-Bias: Esslingen am Neckar */
const FALLBACK_LAT = 48.7395;
const FALLBACK_LON = 9.3072;

interface PhotonFeature {
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
    state?: string;
    country?: string;
    countrycode?: string;
    postcode?: string;
    osm_key?: string;
    osm_value?: string;
    type?: string;
  };
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

  /* Land nur wenn nicht Deutschland (für internationale Adressen) */
  if (p.countrycode && p.countrycode.toLowerCase() !== "de" && p.country) {
    parts.push(p.country);
  }

  return parts.filter(Boolean).join(", ") || (p.name ?? "");
}

export async function searchLocation(
  query: string,
  userPos?: { lat: number; lon: number }
): Promise<GeoLocation[]> {
  const biasLat = userPos?.lat ?? FALLBACK_LAT;
  const biasLon = userPos?.lon ?? FALLBACK_LON;
  /* Germany bounding box: minLon,minLat,maxLon,maxLat */
  const DE_BBOX = "5.866,47.270,15.042,55.059";
  const url =
    `${PHOTON}` +
    `?q=${encodeURIComponent(query)}` +
    `&limit=10` +
    `&lat=${biasLat}` +
    `&lon=${biasLon}` +
    `&bbox=${DE_BBOX}`;

  try {
    const resp = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data: { features: PhotonFeature[] } = await resp.json();

    const features = data.features ?? [];

    /* Straßen/Adressen vor Orte stellen */
    const isStreet = (f: PhotonFeature) => {
      const k = f.properties.osm_key ?? "";
      const v = f.properties.osm_value ?? "";
      return k === "highway" || !!f.properties.street || v === "house" || f.properties.type === "house";
    };

    const streets = features.filter(isStreet);
    const places  = features.filter((f) => !isStreet(f));

    return [...streets, ...places]
      .filter((f) => !f.properties.countrycode || f.properties.countrycode.toLowerCase() === "de")
      .slice(0, 7)
      .map((f) => ({
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        displayName: photonLabel(f),
        street: f.properties.street,
        city: f.properties.city ?? f.properties.town ?? f.properties.village,
        country: f.properties.country,
      }))
      .filter((loc) => loc.displayName.length > 0);
  } catch {
    return [];
  }
}

/** Luftlinie + grobe Fahrtzeit, wenn OSRM nicht erreichbar ist (Mobilfunk, Rate-Limit, Ausfall). */
function fallbackRouteResult(from: GeoLocation, to: GeoLocation): RouteResult {
  const d = haversineDistance(from.lat, from.lon, to.lat, to.lon);
  const distanceKm = Math.round(d * 100) / 100;
  const durationMinutes = Math.max(1, Math.round((distanceKm / 32) * 60));
  return {
    distanceKm,
    durationMinutes,
    polyline: [
      [from.lat, from.lon],
      [to.lat, to.lon],
    ],
  };
}

function coordsFinite(a: GeoLocation, b: GeoLocation): boolean {
  return (
    Number.isFinite(a.lat) &&
    Number.isFinite(a.lon) &&
    Number.isFinite(b.lat) &&
    Number.isFinite(b.lon)
  );
}

async function tryOsrmRoute(from: GeoLocation, to: GeoLocation, withSteps: boolean): Promise<RouteResult | RouteResultWithSteps | null> {
  if (!coordsFinite(from, to)) return null;
  const stepQs = withSteps ? "&steps=true" : "";
  const url =
    `${OSRM_BASE}/route/v1/driving/` +
    `${from.lon},${from.lat};${to.lon},${to.lat}` +
    `?overview=full&geometries=geojson${stepQs}`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "OnrodaMobile/1.0 (routing)",
      },
    });
  } catch {
    return null;
  }
  if (!resp.ok) return null;

  let data: { routes?: { distance: number; duration: number; geometry?: { coordinates?: [number, number][] }; legs?: { steps?: unknown[] }[] }[] };
  try {
    data = await resp.json();
  } catch {
    return null;
  }
  const route = data.routes?.[0];
  if (!route) return null;

  const polyline: [number, number][] =
    route.geometry?.coordinates?.map(
      ([lon, lat]: [number, number]) => [lat, lon] as [number, number],
    ) ?? [];

  const base: RouteResult = {
    distanceKm: Math.round((route.distance / 1000) * 100) / 100,
    durationMinutes: Math.round(route.duration / 60),
    polyline,
  };

  if (!withSteps) return base;

  type OsrmStep = {
    maneuver: { type: string; modifier?: string; location: [number, number] };
    distance: number;
    name?: string;
  };
  const rawSteps: OsrmStep[] = (route.legs?.[0]?.steps as OsrmStep[]) ?? [];
  const steps: RouteStep[] = rawSteps.map((s) => ({
    instruction: maneuverToGerman(s.maneuver.type, s.maneuver.modifier, s.name),
    distanceM: Math.round(s.distance),
    lat: s.maneuver.location[1],
    lon: s.maneuver.location[0],
  }));

  return { ...base, steps };
}

export async function getRoute(from: GeoLocation, to: GeoLocation): Promise<RouteResult> {
  const osrm = await tryOsrmRoute(from, to, false);
  if (osrm && !("steps" in osrm)) return osrm as RouteResult;
  return fallbackRouteResult(from, to);
}

// ─── Step-by-Step Routing ────────────────────────────────────────────────────

export interface RouteStep {
  instruction: string;
  distanceM: number;
  lat: number;
  lon: number;
}

export interface RouteResultWithSteps extends RouteResult {
  steps: RouteStep[];
}

function maneuverToGerman(type: string, modifier?: string, name?: string): string {
  const road = name ? ` auf ${name}` : "";
  if (type === "arrive")     return "Ziel erreicht";
  if (type === "depart")     return `Fahrt beginnen${road}`;
  if (type === "continue")   return `Geradeaus weiter${road}`;
  if (type === "merge")      return `Einfahren${road}`;
  if (type === "on ramp")    return `Auffahrt nehmen${road}`;
  if (type === "off ramp")   return `Ausfahrt nehmen`;
  if (type === "roundabout" || type === "rotary") return `Kreisverkehr${road}`;
  if (type === "turn") {
    if (modifier === "right")       return `Rechts abbiegen${road}`;
    if (modifier === "left")        return `Links abbiegen${road}`;
    if (modifier === "straight")    return `Geradeaus${road}`;
    if (modifier === "sharp right") return `Scharf rechts${road}`;
    if (modifier === "sharp left")  return `Scharf links${road}`;
    if (modifier === "uturn")       return "Wenden";
    if (modifier === "slight right") return `Leicht rechts${road}`;
    if (modifier === "slight left")  return `Leicht links${road}`;
  }
  return `Weiterfahren${road}`;
}

export async function getRouteWithSteps(
  from: GeoLocation,
  to: GeoLocation
): Promise<RouteResultWithSteps> {
  const osrm = await tryOsrmRoute(from, to, true);
  if (osrm && "steps" in osrm && Array.isArray((osrm as RouteResultWithSteps).steps)) {
    return osrm as RouteResultWithSteps;
  }
  const fb = fallbackRouteResult(from, to);
  const dM = Math.round(fb.distanceKm * 1000);
  return {
    ...fb,
    steps: [
      {
        instruction: maneuverToGerman("depart", undefined, undefined),
        distanceM: Math.max(0, Math.round(dM * 0.5)),
        lat: from.lat,
        lon: from.lon,
      },
      {
        instruction: maneuverToGerman("arrive", undefined, undefined),
        distanceM: Math.max(0, Math.round(dM * 0.5)),
        lat: to.lat,
        lon: to.lon,
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
