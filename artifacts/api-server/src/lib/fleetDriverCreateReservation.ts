import type { RideRequest } from "../domain/rideRequest";
import { getOperationalConfigPayload, listServiceRegionsForApi } from "../db/appOperationalData";
import { getFleetDriverCapability } from "../db/fleetMatchingData";
import { getFleetDriverReadinessById } from "../db/fleetDriverReadiness";
import { insertRide } from "../db/ridesData";
import {
  isFarFutureReservation,
  isReservationWithinAdvanceWindow,
} from "./dispatchStatus";
import { initialDispatchTierFieldsForRide } from "./dispatchPriorityTier";
import { assertClientEstimatedFareMatchesServer, computeRideBookingPricing } from "./rideBookingPricing";

function newRideId(): string {
  return `ride-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export type FleetDriverCreateReservationInput = {
  fleetDriverId: string;
  companyId: string;
  customerName: string;
  customerPhone?: string;
  from: string;
  fromFull: string;
  to: string;
  toFull: string;
  fromLat?: number | null;
  fromLon?: number | null;
  toLat?: number | null;
  toLon?: number | null;
  scheduledAt: string;
  distanceKm?: number;
  durationMinutes?: number;
  estimatedFare?: number;
  paymentMethod?: string;
  vehicle?: string;
};

export type FleetDriverCreateReservationResult =
  | { ok: true; ride: RideRequest }
  | { ok: false; error: string };

/** Fahrer legt Walk-in-Reservierung an — direkt `scheduled_assigned` an sich selbst. */
export async function createFleetDriverReservation(
  input: FleetDriverCreateReservationInput,
): Promise<FleetDriverCreateReservationResult> {
  const fleetDriverId = input.fleetDriverId.trim();
  const companyId = input.companyId.trim();
  if (!fleetDriverId || !companyId) return { ok: false, error: "unauthorized" };

  const readiness = await getFleetDriverReadinessById(fleetDriverId, companyId);
  if ("error" in readiness || !readiness.ready) {
    return { ok: false, error: "driver_not_ready" };
  }

  const capability = await getFleetDriverCapability(fleetDriverId, companyId);
  if (!capability?.vehicleLegalType) {
    return { ok: false, error: "vehicle_not_assigned" };
  }

  const customerName = input.customerName.trim();
  const from = input.from.trim();
  const fromFull = input.fromFull.trim();
  const to = input.to.trim();
  const toFull = input.toFull.trim();
  const scheduledAt = input.scheduledAt.trim();
  if (!customerName || !from || !fromFull || !to || !toFull || !scheduledAt) {
    return { ok: false, error: "required_fields_missing" };
  }
  if (!isFarFutureReservation(scheduledAt)) {
    return { ok: false, error: "scheduled_at_too_soon" };
  }
  if (!isReservationWithinAdvanceWindow(scheduledAt)) {
    return { ok: false, error: "scheduled_at_too_far" };
  }

  const distanceKm = Number.isFinite(input.distanceKm) && (input.distanceKm ?? 0) > 0 ? Number(input.distanceKm) : 5;
  const durationMinutes =
    Number.isFinite(input.durationMinutes) && (input.durationMinutes ?? 0) > 0
      ? Number(input.durationMinutes)
      : Math.max(10, Math.round(distanceKm * 2.5));
  const paymentMethod = (input.paymentMethod ?? "cash").trim() || "cash";
  const vehicle = (input.vehicle ?? capability.vehicleClass ?? "standard").trim() || "standard";

  const opPayload = await getOperationalConfigPayload();
  const regions = await listServiceRegionsForApi();
  const pricing = computeRideBookingPricing({
    opPayload,
    regions,
    fromFull,
    fromLat: input.fromLat ?? null,
    fromLon: input.fromLon ?? null,
    distanceKm,
    tripMinutes: durationMinutes,
    waitingMinutes: 0,
    vehicle,
    at: new Date(),
  });
  const estimatedFare =
    Number.isFinite(input.estimatedFare) && (input.estimatedFare ?? 0) > 0
      ? Number(input.estimatedFare)
      : pricing.finalPrice;
  const fareChk = assertClientEstimatedFareMatchesServer(estimatedFare, pricing.finalPrice);
  if (!fareChk.ok) {
    return { ok: false, error: fareChk.error };
  }

  const customerPhone = (input.customerPhone ?? "").trim();

  const ride: RideRequest = {
    id: newRideId(),
    companyId,
    createdAt: new Date().toISOString(),
    scheduledAt,
    status: "scheduled_assigned",
    rejectedBy: [],
    driverId: fleetDriverId,
    ...initialDispatchTierFieldsForRide(scheduledAt),
    customerName,
    customerPhone: customerPhone || null,
    from,
    fromFull,
    to,
    toFull,
    fromLat: input.fromLat ?? undefined,
    fromLon: input.fromLon ?? undefined,
    toLat: input.toLat ?? undefined,
    toLon: input.toLon ?? undefined,
    distanceKm,
    durationMinutes,
    estimatedFare,
    paymentMethod,
    vehicle,
    rideKind: "standard",
    payerKind: "passenger",
    authorizationSource: "passenger_direct",
    partnerBookingMeta: {
      created_by_fleet_driver: true,
      fleet_driver_id: fleetDriverId,
    },
  };

  await insertRide(ride);
  const { applyRideChatOnFleetDriverAccept } = await import("../db/rideChatMessagesData.js");
  const rideWithChat = await applyRideChatOnFleetDriverAccept({
    ride,
    driverId: fleetDriverId,
    fleetDriverCompanyId: companyId,
    actor: { actorType: "driver", actorId: fleetDriverId },
  });
  return { ok: true, ride: rideWithChat };
}
