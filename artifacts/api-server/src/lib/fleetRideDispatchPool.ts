import { eq, inArray } from "drizzle-orm";
import type { RideRequest } from "../domain/rideRequest";
import { getDb, isPostgresConfigured } from "../db/client";
import { adminCompaniesTable } from "../db/schema";
import { isTaxiCompanyKind } from "./kkModuleAccess";

/**
 * Buchungs-Mandant mit eigenen Fahrern (Taxiunternehmer) → nur company_id-Match.
 * Hotel/Kunde/Partner ohne Flotte → Taxi-Dispatch-Pool (Tier A/B/C, Capability).
 */
export function rideOriginUsesTaxiOnlyDispatch(companyKind: string): boolean {
  return isTaxiCompanyKind(companyKind);
}

export async function lookupAdminCompanyKinds(companyIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(companyIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (ids.length === 0) return out;

  const db = getDb();
  if (!db || !isPostgresConfigured()) return out;

  const rows = await db
    .select({ id: adminCompaniesTable.id, kind: adminCompaniesTable.company_kind })
    .from(adminCompaniesTable)
    .where(inArray(adminCompaniesTable.id, ids));

  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    const kind = String(row.kind ?? "general").trim().toLowerCase() || "general";
    out.set(id, kind);
  }
  return out;
}

export async function getAdminCompanyKind(companyId: string | null | undefined): Promise<string> {
  const id = (companyId ?? "").trim();
  if (!id) return "general";
  const map = await lookupAdminCompanyKinds([id]);
  return map.get(id) ?? "general";
}

export function resolveRideOriginCompanyKind(
  rideCompanyId: string | null | undefined,
  kindMap: Map<string, string>,
): string {
  const id = (rideCompanyId ?? "").trim();
  if (!id) return "general";
  return kindMap.get(id) ?? "general";
}

export function fleetDriverCanSeeDispatchRide(opts: {
  rideCompanyId: string | null | undefined;
  rideOriginCompanyKind: string;
  driverCompanyId: string;
}): boolean {
  const rideCo = (opts.rideCompanyId ?? "").trim();
  const driverCo = opts.driverCompanyId.trim();
  if (!rideCo) return true;
  if (rideOriginUsesTaxiOnlyDispatch(opts.rideOriginCompanyKind)) {
    return rideCo === driverCo;
  }
  return true;
}

/** Capability/Readiness/Markt-ONLINE immer im Unternehmen des Fahrers, außer Taxi-Mandant-Fahrt. */
export function fleetDriverCompanyIdForRideCapability(opts: {
  rideCompanyId: string | null | undefined;
  rideOriginCompanyKind: string;
  driverCompanyId: string;
}): string {
  const driverCo = opts.driverCompanyId.trim();
  const rideCo = (opts.rideCompanyId ?? "").trim();
  if (rideCo && rideOriginUsesTaxiOnlyDispatch(opts.rideOriginCompanyKind)) {
    return rideCo;
  }
  return driverCo;
}

export function filterRidesVisibleToFleetDriver(
  rides: RideRequest[],
  driverCompanyId: string,
  kindMap: Map<string, string>,
): RideRequest[] {
  const driverCo = driverCompanyId.trim();
  return rides.filter((ride) => {
    const originKind = resolveRideOriginCompanyKind(ride.companyId, kindMap);
    return fleetDriverCanSeeDispatchRide({
      rideCompanyId: ride.companyId,
      rideOriginCompanyKind: originKind,
      driverCompanyId: driverCo,
    });
  });
}
