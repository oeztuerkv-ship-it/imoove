import { getApiBaseUrl } from "@/utils/apiBase";

/** Eingaben für GET /api/fare-estimate (Server-Tarif-Engine). */
export type FareEstimateRouteInput = {
  distanceKm: number;
  tripMinutes: number;
  fromFull: string;
  fromLat?: number;
  fromLon?: number;
  toFull?: string;
};

export type FareEstimateApiBreakdown = {
  vehicleClassMultiplier?: number;
  baseFare?: number;
  distanceCharge?: number;
  [key: string]: unknown;
};

export type FareEstimateApiResult = {
  total: number;
  breakdown?: FareEstimateApiBreakdown;
  profile?: { baseFareEur?: number; [key: string]: unknown };
};

/**
 * Einheitliche Kunden-Schätzpreis-Quelle: nur Server (`operationalTariffEngine`).
 * Kein Client-Tarif-Fallback.
 */
export async function fetchFareEstimate(
  vehicle: string,
  route: FareEstimateRouteInput,
): Promise<FareEstimateApiResult | null> {
  const base = getApiBaseUrl();
  if (!base) return null;
  if (!Number.isFinite(route.distanceKm) || route.distanceKm < 0) return null;

  const u = new URL(`${base}/fare-estimate`);
  u.searchParams.set("distanceKm", String(route.distanceKm));
  u.searchParams.set("vehicle", vehicle);
  u.searchParams.set("fromFull", route.fromFull);
  u.searchParams.set("tripMinutes", String(Math.max(0, route.tripMinutes)));
  if (route.fromLat != null && Number.isFinite(route.fromLat) && route.fromLon != null && Number.isFinite(route.fromLon)) {
    u.searchParams.set("fromLat", String(route.fromLat));
    u.searchParams.set("fromLng", String(route.fromLon));
  }
  if (route.toFull?.trim()) u.searchParams.set("toFull", route.toFull.trim());

  try {
    const res = await fetch(u.toString(), { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data.ok !== true) return null;
    const estimate = data.estimate;
    if (!estimate || typeof estimate !== "object" || Array.isArray(estimate)) return null;
    const est = estimate as Record<string, unknown>;
    const totalRaw = est.total;
    const total = typeof totalRaw === "number" ? totalRaw : Number(totalRaw);
    if (!Number.isFinite(total)) return null;

    const profile =
      data.profile && typeof data.profile === "object" && !Array.isArray(data.profile)
        ? (data.profile as FareEstimateApiResult["profile"])
        : undefined;
    const breakdown =
      est.breakdown && typeof est.breakdown === "object" && !Array.isArray(est.breakdown)
        ? (est.breakdown as FareEstimateApiBreakdown)
        : undefined;

    return { total, breakdown, profile };
  } catch {
    return null;
  }
}

/** Schätzpreise pro Fahrzeugklasse (parallel). */
export async function fetchFareEstimatesByVehicle(
  vehicleIds: readonly string[],
  route: FareEstimateRouteInput,
): Promise<Map<string, number | null>> {
  const pairs = await Promise.all(
    vehicleIds.map(async (id) => {
      const est = await fetchFareEstimate(id, route);
      return [id, est?.total ?? null] as const;
    }),
  );
  return new Map(pairs);
}
