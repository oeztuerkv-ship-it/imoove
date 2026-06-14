import { and, eq } from "drizzle-orm";
import type { RideRequest } from "../domain/rideRequest";
import { getDb, isPostgresConfigured } from "./client";
import { getFleetDriverReadinessById } from "./fleetDriverReadiness";
import { getFleetDriverCapability, isRideCompatibleWithCapability } from "./fleetMatchingData";
import { getCompanyFeatureKkModule } from "../lib/kkModuleAccess.js";
import { resolveMedicalTransportAuthorizationForFleetDriver } from "../lib/medical/medicalTransportAuthorization";
import { fleetDriversTable } from "./schema";
import { ensureRideDispatchTierCurrent } from "./rideDispatchTierData";
import { normalizeDispatchPriority } from "../lib/dispatchPriorityTier";

export type MarketOnlineDriverRef = { fleetDriverId: string; companyId: string };

const INSTANT_MARKET_STATUSES = new Set<RideRequest["status"]>([
  "pending",
  "requested",
  "searching_driver",
  "offered",
]);

/**
 * Fahrer mit Markt-ONLINE, Einsatzbereit und passendem Fahrzeug — gleiche Logik wie GET market-rides (Sofortpool).
 */
export async function listMarketOnlineDriversEligibleForInstantRide(
  ride: RideRequest,
): Promise<MarketOnlineDriverRef[]> {
  if (!INSTANT_MARKET_STATUSES.has(ride.status)) return [];
  if (ride.driverId) return [];

  const { ride: syncedRide } = await ensureRideDispatchTierCurrent(ride);
  ride = syncedRide;

  const rideTier = normalizeDispatchPriority(ride.dispatchTier ?? "A");

  const db = getDb();
  if (!db || !isPostgresConfigured()) return [];

  const rideCompanyId = (ride.companyId ?? "").trim();
  const rejected = new Set((ride.rejectedBy ?? []).map((id) => String(id).trim()).filter(Boolean));

  const conditions = [
    eq(fleetDriversTable.is_market_online, true),
    eq(fleetDriversTable.is_active, true),
    eq(fleetDriversTable.access_status, "active"),
    eq(fleetDriversTable.approval_status, "approved"),
    eq(fleetDriversTable.dispatch_priority, rideTier),
  ];
  if (rideCompanyId) {
    conditions.push(eq(fleetDriversTable.company_id, rideCompanyId));
  }

  const rows = await db
    .select({
      id: fleetDriversTable.id,
      companyId: fleetDriversTable.company_id,
    })
    .from(fleetDriversTable)
    .where(and(...conditions));

  const out: MarketOnlineDriverRef[] = [];
  for (const row of rows) {
    const fleetDriverId = String(row.id ?? "").trim();
    const companyId = String(row.companyId ?? "").trim();
    if (!fleetDriverId || !companyId) continue;
    if (rejected.has(fleetDriverId)) continue;

    const readiness = await getFleetDriverReadinessById(fleetDriverId, companyId);
    if ("error" in readiness || !readiness.ready) continue;

    const capability = await getFleetDriverCapability(fleetDriverId, companyId);
    if (!capability?.vehicleLegalType) continue;
    if (!isRideCompatibleWithCapability(ride, capability)) continue;

    if (ride.rideKind === "medical") {
      const companyKkEnabled = await getCompanyFeatureKkModule(companyId);
      if (!companyKkEnabled) continue;
      const medicalAuth = await resolveMedicalTransportAuthorizationForFleetDriver(companyId, fleetDriverId);
      if (!medicalAuth?.authorized) continue;
    }

    out.push({ fleetDriverId, companyId });
  }
  return out;
}
