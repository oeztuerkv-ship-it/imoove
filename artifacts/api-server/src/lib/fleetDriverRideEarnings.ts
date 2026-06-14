import { eq } from "drizzle-orm";
import { financePricingContextFromCompanyRow } from "./adminCompanyProvision";
import { getDb, isPostgresConfigured } from "../db/client";
import { findRide } from "../db/ridesData";
import { adminCompaniesTable } from "../db/schema";

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
  if (!isPostgresConfigured()) {
    const commissionRate = 0.1;
    const commission = roundMoney(gross * commissionRate);
    return {
      ok: true,
      earnings: {
        rideId: ride.id,
        gross,
        commission,
        net: roundMoney(Math.max(0, gross - commission)),
        commissionRate,
      },
    };
  }
  const db = getDb();
  const cid = input.companyId.trim();
  const rows = await db
    .select({
      commission_rate: adminCompaniesTable.commission_rate,
      commission_type: adminCompaniesTable.commission_type,
      commission_fixed_eur: adminCompaniesTable.commission_fixed_eur,
      min_commission_eur: adminCompaniesTable.min_commission_eur,
      payout_allowed: adminCompaniesTable.payout_allowed,
    })
    .from(adminCompaniesTable)
    .where(eq(adminCompaniesTable.id, cid))
    .limit(1);
  const company = rows[0];
  const ctx = financePricingContextFromCompanyRow({
    commission_type: company?.commission_type ?? "percentage",
    commission_rate: company?.commission_rate ?? 0.1,
    commission_fixed_eur: company?.commission_fixed_eur ?? 0,
    min_commission_eur: company?.min_commission_eur ?? null,
    payout_allowed: company?.payout_allowed ?? true,
  });
  let commission = 0;
  if (ctx.commissionType === "fixed") {
    commission = roundMoney(ctx.commissionValue);
  } else if (ctx.commissionType !== "none") {
    commission = roundMoney(gross * ctx.commissionValue);
  }
  if (typeof ctx.minCommissionEur === "number" && ctx.minCommissionEur > 0 && ctx.commissionType !== "none") {
    commission = roundMoney(Math.max(commission, ctx.minCommissionEur));
  }
  commission = roundMoney(Math.min(commission, gross));
  const commissionRate =
    ctx.commissionType === "percentage" || ctx.commissionType === "hybrid"
      ? ctx.commissionValue
      : gross > 0
        ? commission / gross
        : 0;
  return {
    ok: true,
    earnings: {
      rideId: ride.id,
      gross,
      commission,
      net: roundMoney(Math.max(0, gross - commission)),
      commissionRate: roundMoney(commissionRate),
    },
  };
}
