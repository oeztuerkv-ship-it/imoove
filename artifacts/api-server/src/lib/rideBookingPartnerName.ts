import type { RideRequest } from "../domain/rideRequest";
import { findCompanyById } from "../db/adminData";

export function isPartnerOriginatedRide(ride: Pick<RideRequest, "authorizationSource" | "createdByPanelUserId">): boolean {
  if (ride.authorizationSource === "partner") return true;
  return Boolean(String(ride.createdByPanelUserId ?? "").trim());
}

/** Mandantenname für Panel-/Partner-Buchungen (Fahrer- & Kundenanzeige). */
export async function attachBookingPartnerNamesToRides<T extends RideRequest>(rides: T[]): Promise<T[]> {
  const cache = new Map<string, string>();
  const out: T[] = [];

  for (const ride of rides) {
    if (!isPartnerOriginatedRide(ride)) {
      out.push(ride);
      continue;
    }
    const companyId = (ride.companyId ?? "").trim();
    if (!companyId) {
      out.push(ride);
      continue;
    }
    let name = cache.get(companyId);
    if (name === undefined) {
      const co = await findCompanyById(companyId);
      name = (co?.name ?? "").trim() || (co?.billing_name ?? "").trim() || "";
      cache.set(companyId, name);
    }
    out.push(name ? ({ ...ride, bookingPartnerName: name } as T) : ride);
  }

  return out;
}
