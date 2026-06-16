import { getOperationalConfigPayload, listServiceRegionsForApi, resolveFinancePricingContextForRide } from "../db/appOperationalData";
import { findRide } from "../db/ridesData";
import { previewDriverSettlementFromGross } from "./financeCalculationService";

export type FleetDriverRideEarnings = {
  rideId: string;
  gross: number;
  commission: number;
  net: number;
  commissionRate: number;
};

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function getFleetDriverRideEarnings(input: {
  rideId: string;
  fleetDriverId: string;
  companyId: string;
}): Promise<
  | { ok: true; earnings: FleetDriverRideEarnings }
  | { ok: false; error: string; status: number }
> {
  const ride = await findRide(input.rideId);
  if (!ride) {
    return { ok: false, error: "not_found", status: 404 };
  }
  if (ride.driverId !== input.fleetDriverId) {
    return { ok: false, error: "forbidden", status: 403 };
  }
  if (ride.status !== "completed") {
    return { ok: false, error: "ride_not_completed", status: 409 };
  }
  const gross = roundMoney(Math.max(0, Number(ride.finalFare ?? ride.estimatedFare ?? 0)));
  const opPayload = await getOperationalConfigPayload();
  const regions = await listServiceRegionsForApi();
  const pc = await resolveFinancePricingContextForRide(
    {
      rideKind: ride.rideKind,
      companyId: input.companyId,
      driverId: input.fleetDriverId,
      fromFull: ride.fromFull,
      fromLat: ride.fromLat,
      fromLon: ride.fromLon,
    },
    opPayload,
    regions,
  );
  const settlement = previewDriverSettlementFromGross(gross, pc);
  return {
    ok: true,
    earnings: {
      rideId: ride.id,
      gross,
      commission: settlement.commissionAmount,
      net: settlement.driverPayoutAmount,
      commissionRate: settlement.commissionRate,
    },
  };
}
