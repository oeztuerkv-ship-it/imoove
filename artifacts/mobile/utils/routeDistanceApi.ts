import { getApiBaseUrl } from "@/utils/apiBase";

export type PriceRoutingSource = "google" | "osrm";

export const ROUTE_NOT_COMPUTABLE_MESSAGE_DE =
  "Preis aktuell nicht berechenbar — Streckenlänge konnte nicht ermittelt werden.";

export type ServerDrivingRouteResult = {
  ok: true;
  distanceKm: number;
  durationMinutes: number;
  routingSource: PriceRoutingSource;
};

export type ServerDrivingRouteError = {
  ok: false;
  error: string;
  message: string;
  routingSource: "error";
};

type RoutePointInput = {
  displayName: string;
  lat: number;
  lon: number;
};

export async function fetchServerDrivingRoute(args: {
  fromFull: string;
  toFull: string;
  fromLat?: number;
  fromLon?: number;
  toLat?: number;
  toLon?: number;
}): Promise<ServerDrivingRouteResult | ServerDrivingRouteError> {
  const base = getApiBaseUrl();
  if (!base?.trim()) {
    return {
      ok: false,
      error: "api_not_configured",
      message: ROUTE_NOT_COMPUTABLE_MESSAGE_DE,
      routingSource: "error",
    };
  }
  const q = new URLSearchParams({
    fromFull: args.fromFull.trim(),
    toFull: args.toFull.trim(),
  });
  if (args.fromLat != null && Number.isFinite(args.fromLat)) q.set("fromLat", String(args.fromLat));
  if (args.fromLon != null && Number.isFinite(args.fromLon)) q.set("fromLon", String(args.fromLon));
  if (args.toLat != null && Number.isFinite(args.toLat)) q.set("toLat", String(args.toLat));
  if (args.toLon != null && Number.isFinite(args.toLon)) q.set("toLon", String(args.toLon));

  try {
    const res = await fetch(`${base}/public/route-distance?${q.toString()}`, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data.ok === false) {
      return {
        ok: false,
        error: typeof data.error === "string" ? data.error : "route_not_computable",
        message:
          typeof data.message === "string" ? data.message : ROUTE_NOT_COMPUTABLE_MESSAGE_DE,
        routingSource: "error",
      };
    }
    const distanceKm = Number(data.distanceKm);
    const durationMinutes = Number(data.durationMinutes);
    const routingSource = data.routingSource === "osrm" ? "osrm" : "google";
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
      return {
        ok: false,
        error: "route_not_computable",
        message: ROUTE_NOT_COMPUTABLE_MESSAGE_DE,
        routingSource: "error",
      };
    }
    return {
      ok: true,
      distanceKm,
      durationMinutes: Number.isFinite(durationMinutes) ? Math.max(1, durationMinutes) : 1,
      routingSource,
    };
  } catch {
    return {
      ok: false,
      error: "route_not_computable",
      message: ROUTE_NOT_COMPUTABLE_MESSAGE_DE,
      routingSource: "error",
    };
  }
}

/** Mehrere Etappen (Zwischenstopps) — je Leg serverseitig (Google/OSRM). */
export async function fetchServerDrivingRouteChain(
  points: RoutePointInput[],
): Promise<ServerDrivingRouteResult | ServerDrivingRouteError> {
  if (points.length < 2) {
    return {
      ok: false,
      error: "route_not_computable",
      message: ROUTE_NOT_COMPUTABLE_MESSAGE_DE,
      routingSource: "error",
    };
  }
  let distanceKm = 0;
  let durationMinutes = 0;
  let routingSource: PriceRoutingSource = "google";
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]!;
    const to = points[i + 1]!;
    const leg = await fetchServerDrivingRoute({
      fromFull: from.displayName,
      toFull: to.displayName,
      fromLat: from.lat,
      fromLon: from.lon,
      toLat: to.lat,
      toLon: to.lon,
    });
    if (!leg.ok) return leg;
    distanceKm += leg.distanceKm;
    durationMinutes += leg.durationMinutes;
    routingSource = leg.routingSource;
  }
  return {
    ok: true,
    distanceKm: Math.round(distanceKm * 100) / 100,
    durationMinutes: Math.max(1, durationMinutes),
    routingSource,
  };
}
