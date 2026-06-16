import { getOperationalConfigPayload } from "../db/appOperationalData";
import { haversineDistanceKm } from "./serviceRegionMatch";

/** Suchradius (km) für Sofort-Dispatch — Admin `dispatch.radiusKm`, Default 10. */
export function getDispatchRadiusKm(dispatchConfig?: Record<string, unknown>): number {
  const env = Number(process.env.ONRODA_DISPATCH_RADIUS_KM);
  if (Number.isFinite(env) && env >= 1 && env <= 50) return Math.round(env * 100) / 100;
  const cfg = Number(dispatchConfig?.radiusKm);
  if (Number.isFinite(cfg) && cfg >= 1 && cfg <= 50) return Math.round(cfg * 100) / 100;
  return 10;
}

export async function getDispatchRadiusKmFromConfig(): Promise<number> {
  const op = await getOperationalConfigPayload();
  const dispatch =
    op && typeof op.dispatch === "object" && op.dispatch
      ? (op.dispatch as Record<string, unknown>)
      : undefined;
  return getDispatchRadiusKm(dispatch);
}

export function isWithinDispatchRadiusKm(
  driverLat: number | null | undefined,
  driverLon: number | null | undefined,
  pickupLat: number | null | undefined,
  pickupLon: number | null | undefined,
  radiusKm: number,
): boolean {
  if (
    driverLat == null ||
    driverLon == null ||
    pickupLat == null ||
    pickupLon == null ||
    !Number.isFinite(driverLat) ||
    !Number.isFinite(driverLon) ||
    !Number.isFinite(pickupLat) ||
    !Number.isFinite(pickupLon)
  ) {
    return false;
  }
  return haversineDistanceKm(driverLat, driverLon, pickupLat, pickupLon) <= radiusKm + 1e-6;
}
