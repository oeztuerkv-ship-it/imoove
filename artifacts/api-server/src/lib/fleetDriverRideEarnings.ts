import { findRide } from "../db/ridesData";
import {
  computeDriverRidePayoutSnap,
  ONRODA_DRIVER_PROVISION_RATE,
} from "./driverRidePayoutSnap";
import { getRideCompletedAtByRideId } from "./rideActualDuration";

export type FleetDriverRideEarnings = {
  rideId: string;
  gross: number;
  commission: number;
  tip: number;
  net: number;
  commissionRate: number;
  /** Fahrer-Anteil am Fahrtpreis ohne Trinkgeld (= rides.payout_amount). */
  payoutAmount: number;
  /** Snapshot beim Abschluss (rides.actual_distance_km). */
  actualDistanceKm: number | null;
  /** Snapshot beim Abschluss (rides.actual_duration_minutes). */
  actualDurationMinutes: number | null;
  fromFull: string;
  toFull: string;
  vehicle: string;
  completedAt: string | null;
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
  void input.companyId;
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

  const gross = roundMoney(Math.max(0, Number(ride.finalFare ?? 0)));
  const tip = roundMoney(Math.max(0, Number(ride.tipAmount ?? 0)));

  const storedProvision =
    ride.provisionAmount != null && Number.isFinite(Number(ride.provisionAmount))
      ? roundMoney(Number(ride.provisionAmount))
      : null;
  const storedPayout =
    ride.payoutAmount != null && Number.isFinite(Number(ride.payoutAmount))
      ? roundMoney(Number(ride.payoutAmount))
      : null;

  let commission: number;
  let payoutAmount: number;
  let commissionRate: number;

  if (storedProvision != null && storedPayout != null) {
    commission = storedProvision;
    payoutAmount = storedPayout;
    commissionRate = gross > 0 ? roundMoney(commission / gross) : ONRODA_DRIVER_PROVISION_RATE;
  } else {
    const snap = computeDriverRidePayoutSnap(gross);
    if (!snap) {
      return { ok: false, error: "final_fare_required", status: 409 };
    }
    commission = snap.provisionAmount;
    payoutAmount = snap.payoutAmount;
    commissionRate = snap.provisionRate;
  }

  const netWithTip = roundMoney(payoutAmount + tip);
  const completedAt = await getRideCompletedAtByRideId(ride.id);
  const actualDistanceKm =
    ride.actualDistanceKm != null && Number.isFinite(Number(ride.actualDistanceKm))
      ? roundMoney(Number(ride.actualDistanceKm))
      : null;
  const actualDurationMinutes =
    ride.actualDurationMinutes != null && Number.isInteger(ride.actualDurationMinutes) && ride.actualDurationMinutes > 0
      ? ride.actualDurationMinutes
      : null;

  return {
    ok: true,
    earnings: {
      rideId: ride.id,
      gross,
      commission,
      tip,
      net: netWithTip,
      commissionRate,
      payoutAmount,
      actualDistanceKm,
      actualDurationMinutes,
      fromFull: ride.fromFull || ride.from || "",
      toFull: ride.toFull || ride.to || "",
      vehicle: ride.vehicle || "standard",
      completedAt: completedAt ? completedAt.toISOString() : null,
    },
  };
}
