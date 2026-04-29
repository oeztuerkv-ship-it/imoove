import type { Request } from "express";
import { findFleetDriverAuthRow } from "../db/fleetDriversData";
import { verifyFleetDriverJwt } from "./fleetDriverJwt";
import type { FleetDriverJwtClaims } from "./fleetDriverJwt";
import { isSessionJwtConfigured, verifySessionJwt, type SessionClaims } from "./sessionJwt";
import type { RideRequest } from "../domain/rideRequest";
import { tryResolveAdminApiAuthPrincipal } from "../middleware/requireAdminApiBearer";

export function extractBearerAuthorization(req: Request): string | null {
  const raw = req.get("authorization")?.trim();
  if (!raw) return null;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  const t = m?.[1]?.trim();
  return t && t.length > 0 ? t : null;
}

async function normalizeFleetClaims(claims: FleetDriverJwtClaims): Promise<{ fleetDriverId: string; companyId: string } | null> {
  const row = await findFleetDriverAuthRow(claims.fleetDriverId);
  if (!row || row.company_id !== claims.companyId) return null;
  if (!row.is_active) return null;
  if (row.session_version !== claims.sessionVersion) return null;
  return { fleetDriverId: claims.fleetDriverId, companyId: claims.companyId };
}

export type RideMutateActor =
  | { kind: "customer_session"; passengerGoogleId: string }
  | { kind: "fleet_session"; fleetDriverId: string; companyId: string }
  | { kind: "admin" }
  | null;

/** Erste passende Identität: Taxi-Fahrer-JWT → Kunden-Session-JWT → Admin (Bearer oder Admin-Panel-Session). */
export async function resolveRideMutateActor(req: Request): Promise<RideMutateActor> {
  const raw = extractBearerAuthorization(req);
  if (!raw) return null;

  try {
    const claims = await verifyFleetDriverJwt(raw);
    const n = await normalizeFleetClaims(claims);
    if (n) return { kind: "fleet_session", fleetDriverId: n.fleetDriverId, companyId: n.companyId };
  } catch {
    /* weiter */
  }

  if (isSessionJwtConfigured()) {
    try {
      const c: SessionClaims = await verifySessionJwt(raw);
      const passengerGoogleId = c.googleId?.trim();
      if (passengerGoogleId) return { kind: "customer_session", passengerGoogleId };
    } catch {
      /* weiter */
    }
  }

  const admin = await tryResolveAdminApiAuthPrincipal(raw);
  if (admin) return { kind: "admin" };

  return null;
}

export async function resolveFleetActorOrNull(req: Request): Promise<{ fleetDriverId: string; companyId: string } | null> {
  const raw = extractBearerAuthorization(req);
  if (!raw) return null;
  try {
    const claims = await verifyFleetDriverJwt(raw);
    return normalizeFleetClaims(claims);
  } catch {
    return null;
  }
}

export async function resolveCustomerActorOrNull(req: Request): Promise<{ passengerGoogleId: string } | null> {
  const raw = extractBearerAuthorization(req);
  if (!raw || !isSessionJwtConfigured()) return null;
  try {
    const c = await verifySessionJwt(raw);
    const passengerGoogleId = c.googleId?.trim();
    if (!passengerGoogleId) return null;
    return { passengerGoogleId };
  } catch {
    return null;
  }
}

const MARKET_REJECT_STATUSES = new Set<RideRequest["status"]>([
  "requested",
  "searching_driver",
  "offered",
  "pending",
  "scheduled",
]);

export type PatchStatusAuthDecision =
  | { ok: true }
  | { ok: false; status: number; code: string; message?: string };

/**
 * Zuordnung: wer darf PATCH /rides/:id/status aufrufen? `canTransitionStatus`/`updateRide` bleiben unberührt.
 * - Admin: Plattform-Operator ohne Fahrzeug-/Passagier-Zwang (Dispatch / Eskalation).
 * - Kunde nur: cancelled_by_customer (mit Passagierbezug bei actor !== admin).
 * - Sonst Taxi-Fahrer-Session mit Fahrzeug-/Markt-Konsistenz.
 */
export function authorizePatchRideStatusForActor(
  nextStatus: RideRequest["status"],
  cur: RideRequest,
  actor: RideMutateActor,
  opts: { bodyDriverId: string | null },
): PatchStatusAuthDecision {
  if (!actor) return { ok: false, status: 401, code: "unauthorized" };

  if (actor.kind === "admin") return { ok: true };

  if (nextStatus === "cancelled_by_customer") {
    if (actor.kind !== "customer_session") {
      return { ok: false, status: 403, code: "patch_status_requires_customer_session" };
    }
    const p = cur.passengerId?.trim();
    if (!p || p !== actor.passengerGoogleId) {
      return { ok: false, status: 403, code: "customer_not_passenger_for_ride" };
    }
    return { ok: true };
  }

  if (actor.kind !== "fleet_session") {
    return { ok: false, status: 403, code: "patch_status_requires_fleet_driver" };
  }

  const a = actor;

  if (cur.companyId && cur.companyId !== a.companyId) {
    return { ok: false, status: 403, code: "ride_company_mismatch" };
  }

  if (nextStatus === "accepted") {
    const did = opts.bodyDriverId?.trim();
    if (!did || did !== a.fleetDriverId) return { ok: false, status: 403, code: "fleet_accept_driver_mismatch" };
    return { ok: true };
  }

  if (nextStatus === "rejected") {
    const assigned = (cur.driverId ?? "").trim();
    if (assigned && assigned === a.fleetDriverId) return { ok: true };
    if (!assigned && MARKET_REJECT_STATUSES.has(cur.status)) {
      return { ok: true };
    }
    return { ok: false, status: 403, code: "fleet_reject_forbidden_for_driver" };
  }

  const assignedDriver = (cur.driverId ?? "").trim();
  if (!assignedDriver) {
    return { ok: false, status: 403, code: "driver_not_assigned_to_ride" };
  }
  if (assignedDriver !== a.fleetDriverId) {
    return { ok: false, status: 403, code: "fleet_driver_assignment_mismatch" };
  }
  return { ok: true };
}
