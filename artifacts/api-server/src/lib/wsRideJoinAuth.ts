import type { RideRequest } from "../domain/rideRequest";
import { findFleetDriverAuthRow } from "../db/fleetDriversData";
import { verifyFleetDriverJwt } from "./fleetDriverJwt";
import { isSessionJwtConfigured, verifySessionJwt } from "./sessionJwt";

export type WsJoinPrincipal =
  | { kind: "fleet"; fleetDriverId: string; companyId: string }
  | { kind: "customer"; passengerGoogleId: string }
  | { kind: "invalid" };

function stripBearer(raw: string): string {
  const s = raw.trim();
  const m = s.match(/^Bearer\s+(.+)$/i);
  return (m?.[1] ?? s).trim();
}

/** Fleet-JWT oder Kunden-Session-JWT aus dem Join-Frame auflösen. */
export async function resolveWsJoinPrincipal(rawToken: unknown): Promise<WsJoinPrincipal> {
  if (typeof rawToken !== "string") return { kind: "invalid" };
  const token = stripBearer(rawToken);
  if (!token) return { kind: "invalid" };

  try {
    const claims = await verifyFleetDriverJwt(token);
    const row = await findFleetDriverAuthRow(claims.fleetDriverId);
    if (
      !row ||
      row.company_id !== claims.companyId ||
      !row.is_active ||
      row.session_version !== claims.sessionVersion
    ) {
      return { kind: "invalid" };
    }
    return { kind: "fleet", fleetDriverId: claims.fleetDriverId, companyId: claims.companyId };
  } catch {
    /* Session prüfen */
  }

  if (!isSessionJwtConfigured()) return { kind: "invalid" };
  try {
    const c = await verifySessionJwt(token);
    const passengerGoogleId = c.googleId?.trim();
    if (!passengerGoogleId) return { kind: "invalid" };
    return { kind: "customer", passengerGoogleId };
  } catch {
    return { kind: "invalid" };
  }
}

export function wsJoinPrincipalMatchesRide(
  ride: RideRequest,
  p: Exclude<WsJoinPrincipal, { kind: "invalid" }>,
): boolean {
  if (p.kind === "customer") {
    const id = ride.passengerId?.trim();
    return Boolean(id && id === p.passengerGoogleId);
  }
  const assigned = (ride.driverId ?? "").trim();
  if (!assigned || assigned !== p.fleetDriverId) return false;
  if (ride.companyId && ride.companyId !== p.companyId) return false;
  return true;
}
