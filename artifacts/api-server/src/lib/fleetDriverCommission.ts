import { and, eq } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "../db/client";
import { fleetDriversTable } from "../db/schema";
import type { FinancePricingContext } from "./financeCalculationService";

/** NULL = kein Fahrer-Override (Mandant gilt). */
export async function getFleetDriverCommissionRateOverride(
  fleetDriverId: string,
  companyId: string,
): Promise<number | null> {
  const driverId = fleetDriverId.trim();
  const cid = companyId.trim();
  if (!driverId || !cid || !isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({ commission_rate: fleetDriversTable.commission_rate })
    .from(fleetDriversTable)
    .where(and(eq(fleetDriversTable.id, driverId), eq(fleetDriversTable.company_id, cid)))
    .limit(1);
  const r = rows[0]?.commission_rate;
  if (typeof r !== "number" || !Number.isFinite(r) || r < 0 || r > 1) return null;
  return r;
}

export function applyFleetDriverCommissionOverride(
  base: FinancePricingContext,
  driverRate: number | null,
): FinancePricingContext {
  if (driverRate == null || base.commissionType === "none" || base.commissionType === "fixed") {
    return base;
  }
  return {
    ...base,
    commissionType: "percentage",
    commissionValue: Math.min(1, Math.max(0, driverRate)),
  };
}
