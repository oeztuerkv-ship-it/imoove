import { and, eq, isNull } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { customerMedicalTransportScansTable } from "./schema";
import type { CustomerTransportScanMeta } from "../lib/medical/customerTransportScanSnapshot";

export type CustomerMedicalTransportScanRow = {
  id: string;
  passengerId: string;
  trafficLight: "green" | "yellow" | "red";
  primaryReasonDe: string;
  snapshotJson: Record<string, unknown>;
  storageKey: string;
  expiresAt: Date;
  consumedAt: Date | null;
  consumedRideId: string | null;
  createdAt: Date;
};

function rowToScan(r: typeof customerMedicalTransportScansTable.$inferSelect): CustomerMedicalTransportScanRow {
  return {
    id: r.id,
    passengerId: r.passenger_id,
    trafficLight: r.traffic_light as CustomerMedicalTransportScanRow["trafficLight"],
    primaryReasonDe: r.primary_reason_de ?? "",
    snapshotJson: (r.snapshot_json as Record<string, unknown> | null) ?? {},
    storageKey: r.storage_key ?? "",
    expiresAt: r.expires_at,
    consumedAt: r.consumed_at ?? null,
    consumedRideId: r.consumed_ride_id ?? null,
    createdAt: r.created_at,
  };
}

export async function insertCustomerMedicalTransportScan(input: {
  id: string;
  passengerId: string;
  trafficLight: "green" | "yellow" | "red";
  primaryReasonDe: string;
  snapshotJson: Record<string, unknown>;
  storageKey: string;
  expiresAt: Date;
}): Promise<CustomerMedicalTransportScanRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const id = input.id.trim();
  if (!id) return null;
  const now = new Date();
  await db.insert(customerMedicalTransportScansTable).values({
    id,
    passenger_id: input.passengerId.trim(),
    traffic_light: input.trafficLight,
    primary_reason_de: input.primaryReasonDe.slice(0, 500),
    snapshot_json: input.snapshotJson,
    storage_key: input.storageKey,
    expires_at: input.expiresAt,
    created_at: now,
  });
  const rows = await db
    .select()
    .from(customerMedicalTransportScansTable)
    .where(eq(customerMedicalTransportScansTable.id, id))
    .limit(1);
  return rows[0] ? rowToScan(rows[0]) : null;
}

export async function findCustomerMedicalTransportScanById(
  scanId: string,
): Promise<CustomerMedicalTransportScanRow | null> {
  if (!isPostgresConfigured()) return null;
  const db = getDb();
  if (!db) return null;
  const id = scanId.trim();
  if (!id) return null;
  const rows = await db
    .select()
    .from(customerMedicalTransportScansTable)
    .where(eq(customerMedicalTransportScansTable.id, id))
    .limit(1);
  return rows[0] ? rowToScan(rows[0]) : null;
}

export type ResolveCustomerScanForBookingResult =
  | { ok: true; meta: CustomerTransportScanMeta; trafficLight: "green" | "yellow" | "red" }
  | { ok: false; error: string; status: number };

function metaFromSnapshotJson(
  json: Record<string, unknown>,
  row: CustomerMedicalTransportScanRow,
): CustomerTransportScanMeta | null {
  const scanId = typeof json.scanId === "string" ? json.scanId.trim() : "";
  if (!scanId || scanId !== row.id) return null;
  const trafficLight = row.trafficLight;
  const driverHintLines = Array.isArray(json.driverHintLines)
    ? json.driverHintLines.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 3)
    : [];
  return {
    scanId: row.id,
    trafficLight,
    scannedAt:
      typeof json.scannedAt === "string" && json.scannedAt.trim()
        ? json.scannedAt.trim()
        : row.createdAt.toISOString(),
    testMode: false,
    primaryReasonDe: row.primaryReasonDe,
    requiresDriverRecheck: trafficLight !== "green",
    insuranceName: typeof json.insuranceName === "string" ? json.insuranceName : "",
    transportDate: typeof json.transportDate === "string" ? json.transportDate : null,
    driverHintLines,
    storageKey: row.storageKey,
  };
}

export async function resolveCustomerMedicalScanForBooking(input: {
  scanId: string;
  passengerId: string;
}): Promise<ResolveCustomerScanForBookingResult> {
  const scanId = input.scanId.trim();
  const passengerId = input.passengerId.trim();
  if (!scanId || !passengerId) {
    return { ok: false, error: "medical_transport_scan_required", status: 422 };
  }
  const row = await findCustomerMedicalTransportScanById(scanId);
  if (!row) {
    return { ok: false, error: "medical_transport_scan_not_found", status: 422 };
  }
  if (row.passengerId !== passengerId) {
    return { ok: false, error: "medical_transport_scan_not_found", status: 422 };
  }
  if (row.consumedAt != null || row.consumedRideId) {
    return { ok: false, error: "medical_transport_scan_already_used", status: 422 };
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, error: "medical_transport_scan_expired", status: 422 };
  }
  const meta = metaFromSnapshotJson(row.snapshotJson, row);
  if (!meta) {
    return { ok: false, error: "medical_transport_scan_invalid", status: 422 };
  }
  return { ok: true, meta, trafficLight: row.trafficLight };
}

export async function markCustomerMedicalTransportScanConsumed(
  scanId: string,
  passengerId: string,
  rideId: string,
): Promise<boolean> {
  if (!isPostgresConfigured()) return false;
  const db = getDb();
  if (!db) return false;
  const now = new Date();
  const updated = await db
    .update(customerMedicalTransportScansTable)
    .set({ consumed_at: now, consumed_ride_id: rideId.trim() })
    .where(
      and(
        eq(customerMedicalTransportScansTable.id, scanId.trim()),
        eq(customerMedicalTransportScansTable.passenger_id, passengerId.trim()),
        isNull(customerMedicalTransportScansTable.consumed_at),
      ),
    )
    .returning({ id: customerMedicalTransportScansTable.id });
  return updated.length > 0;
}
