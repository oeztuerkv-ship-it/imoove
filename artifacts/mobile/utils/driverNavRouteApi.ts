import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBaseUrl } from "@/utils/apiBase";
import { withNavRouteTimeout } from "@/utils/navEngine/navRouteTimeout";
import type { GeoLocation, RouteResultWithSteps, RouteStep } from "@/utils/routing";

const DRIVER_SESSION_KEY = "@Onroda_driver_session";
const API_BASE = getApiBaseUrl();

export type NavRoutingSource = "google" | "osrm" | "error" | "fallback";

/**
 * Client-Timeout für nav-route (fetch + JSON). Ohne Timeout blieb ein hängender
 * Request ewig „inFlight“ → kein Off-Route-Reroute, Guidance dauerhaft stale.
 * Server: Google Matrix (≤12 s) + OSRM (≤12 s) seriell → Client bricht früher ab
 * und die Reroute-Engine versucht nach Cooldown neu.
 */
export const DRIVER_NAV_ROUTE_CLIENT_TIMEOUT_MS = 12_000;

export type DriverNavRouteResult = RouteResultWithSteps & {
  routingSource: NavRoutingSource;
  geometrySource?: "osrm";
};

async function fleetAuthHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const raw = await AsyncStorage.getItem(DRIVER_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { authToken?: string };
      const tok = typeof parsed.authToken === "string" ? parsed.authToken.trim() : "";
      if (tok) h.Authorization = `Bearer ${tok}`;
    }
  } catch {
    /* ignore */
  }
  return h;
}

/**
 * Server-Navi-Route (gleiche km/ETA-Quelle wie Preis: Google Matrix → OSRM).
 * Polyline/Steps serverseitig von OSRM für Rest entlang der Route.
 */
export async function fetchDriverNavRoute(
  from: GeoLocation,
  to: GeoLocation,
  opts?: { timeoutMs?: number },
): Promise<DriverNavRouteResult> {
  if (!API_BASE) {
    throw new Error("api_base_missing");
  }
  const timeoutMs = opts?.timeoutMs ?? DRIVER_NAV_ROUTE_CLIENT_TIMEOUT_MS;
  const headers = await fleetAuthHeaders();
  const { res, parsed } = await withNavRouteTimeout(timeoutMs, async (signal) => {
    const r = await fetch(`${API_BASE}/fleet-driver/v1/nav-route`, {
      method: "POST",
      headers,
      signal,
      body: JSON.stringify({
        fromLat: from.lat,
        fromLon: from.lon,
        toLat: to.lat,
        toLon: to.lon,
        fromName: from.displayName,
        toName: to.displayName,
      }),
    });
    const j: unknown = await r.json().catch(() => null);
    return { res: r, parsed: j };
  });
  const body = parsed as
    | {
        ok?: boolean;
        distanceKm?: number;
        durationMinutes?: number;
        routingSource?: string;
        geometrySource?: string;
        polyline?: [number, number][];
        steps?: RouteStep[];
        error?: string;
        message?: string;
      }
    | null;
  if (!res.ok || !body || body.ok === false) {
    const err = new Error(
      typeof body?.error === "string" ? body.error : "nav_route_failed",
    ) as Error & { routingSource?: NavRoutingSource; userMessage?: string };
    err.routingSource = "error";
    if (typeof body?.message === "string") err.userMessage = body.message;
    throw err;
  }
  const source =
    body.routingSource === "google" || body.routingSource === "osrm"
      ? body.routingSource
      : "error";
  if (source === "error") {
    throw Object.assign(new Error("nav_route_source_error"), { routingSource: "error" as const });
  }
  const polyline = Array.isArray(body.polyline) ? body.polyline : [];
  const rawSteps = Array.isArray(body.steps) ? body.steps : [];
  const steps: RouteStep[] = rawSteps.map((s) => {
    const instruction = typeof s?.instruction === "string" ? s.instruction : "";
    const maneuver = typeof s?.maneuver === "string" && s.maneuver.trim() ? s.maneuver.trim() : undefined;
    const roadName =
      typeof s?.roadName === "string" && s.roadName.trim() ? s.roadName.trim() : null;
    return {
      instruction,
      ...(maneuver ? { maneuver } : {}),
      roadName: roadName ?? null,
      distanceM: Math.max(0, Math.round(Number(s?.distanceM ?? 0))),
      lat: Number(s?.lat ?? 0),
      lon: Number(s?.lon ?? 0),
    };
  });
  return {
    distanceKm: Number(body.distanceKm ?? 0),
    durationMinutes: Math.max(1, Number(body.durationMinutes ?? 1)),
    polyline,
    steps,
    routingSource: source,
    geometrySource: "osrm",
  };
}
