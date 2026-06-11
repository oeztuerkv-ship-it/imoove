import { eq } from "drizzle-orm";
import type { RideRequest } from "../domain/rideRequest";
import { getDb, isPostgresConfigured } from "../db/client";
import { rideFinancialsTable, transportVouchersTable } from "../db/schema";

const LOCKED_INVOICE_STATUSES = new Set(["created", "sent", "paid"]);
const LOCKED_VOUCHER_STATUSES = new Set(["billed", "paid"]);

export type MedicalUploadBillingLockResult =
  | { locked: false }
  | { locked: true; reason: "invoice_status" | "financial_locked" | "kv_voucher" };

function invoiceStatusFromRide(ride: RideRequest): string {
  const meta = ride.partnerBookingMeta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return "";
  const raw = (meta as Record<string, unknown>).invoice_status;
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export async function evaluateMedicalUploadBillingLock(ride: RideRequest): Promise<MedicalUploadBillingLockResult> {
  if (ride.status !== "completed") return { locked: false };

  const invoiceStatus = invoiceStatusFromRide(ride);
  if (LOCKED_INVOICE_STATUSES.has(invoiceStatus)) {
    return { locked: true, reason: "invoice_status" };
  }

  if (isPostgresConfigured()) {
    const db = getDb();
    if (db) {
      const finRows = await db
        .select({ lockedAt: rideFinancialsTable.locked_at })
        .from(rideFinancialsTable)
        .where(eq(rideFinancialsTable.ride_id, ride.id))
        .limit(1);
      if (finRows[0]?.lockedAt) {
        return { locked: true, reason: "financial_locked" };
      }

      const voucherRows = await db
        .select({ status: transportVouchersTable.status })
        .from(transportVouchersTable)
        .where(eq(transportVouchersTable.ride_id, ride.id))
        .limit(1);
      const vst = String(voucherRows[0]?.status ?? "").trim().toLowerCase();
      if (LOCKED_VOUCHER_STATUSES.has(vst)) {
        return { locked: true, reason: "kv_voucher" };
      }
    }
  }

  return { locked: false };
}
