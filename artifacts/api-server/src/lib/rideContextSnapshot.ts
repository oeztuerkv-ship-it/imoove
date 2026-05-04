import { and, asc, desc, eq } from "drizzle-orm";
import { parsePartnerBookingMeta } from "../domain/partnerBookingMeta";
import type { RideRequest } from "../domain/rideRequest";
import { getDb } from "../db/client";
import { adminCompaniesTable, driverVehicleAssignmentsTable, fleetDriversTable, fleetVehiclesTable, rideEventsTable } from "../db/schema";
import { findRide } from "../db/ridesData";

const CANCEL_STATUSES = new Set([
  "cancelled",
  "cancelled_by_customer",
  "cancelled_by_driver",
  "cancelled_by_system",
  "rejected",
  "expired",
]);

function iso(d: Date): string {
  return d.toISOString();
}

function firstTimeToStatus(
  rows: { to_status: string | null; created_at: Date }[],
  st: string,
): string | null {
  for (const r of rows) {
    if (r.to_status === st) return iso(r.created_at);
  }
  return null;
}

function minIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function minutesBetween(aIso: string | null, bIso: string | null): number | null {
  if (!aIso || !bIso) return null;
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 60000));
}

/**
 * Fahrtkontext für Support: nur lesen, nichts erfinden; DSG: keine Diagnosen, kein Medizin-Freitext, keine Lat/Lon.
 */
export type RideContextSnapshotV1 = {
  schemaVersion: 1;
  capturedAt: string;
  time: {
    requestedAt: string | null;
    acceptedAt: string | null;
    arrivedAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
    waitingMinutes: number | null;
    delayMinutes: number | null;
  };
  pricing: {
    estimatedPrice: number | null;
    finalPrice: number | null;
    priceDifference: number | null;
    paymentMethod: string | null;
    pricingMode: string | null;
    voucherCode: string | null;
    billingReference: string | null;
    costCenterId: string | null;
  };
  status: {
    currentStatus: string | null;
    cancellationReason: string | null;
    rideKind: string | null;
    payerKind: string | null;
  };
  parties: {
    driver: { id: string | null; displayName: string | null } | null;
    company: { id: string | null; name: string | null } | null;
    vehicle: { id: string | null; licensePlate: string | null; label: string | null } | null;
  };
  route: {
    fromLabel: string | null;
    toLabel: string | null;
  };
};

export async function buildRideContextSnapshot(rideId: string): Promise<RideContextSnapshotV1 | null> {
  const db = getDb();
  if (!db) return null;

  const ride = await findRide(rideId);
  if (!ride) return null;

  const capturedAt = new Date();
  const requestedAt = ride.createdAt ? ride.createdAt : null;

  const eventRows = await db
    .select({
      to_status: rideEventsTable.to_status,
      from_status: rideEventsTable.from_status,
      event_type: rideEventsTable.event_type,
      created_at: rideEventsTable.created_at,
      payload: rideEventsTable.payload,
    })
    .from(rideEventsTable)
    .where(eq(rideEventsTable.ride_id, rideId))
    .orderBy(asc(rideEventsTable.created_at));

  const statusEvents = eventRows
    .filter((e) => e.to_status && e.event_type === "ride_status_changed")
    .map((e) => ({ to_status: e.to_status as string, created_at: e.created_at as Date }));

  const acceptedAt = firstTimeToStatus(statusEvents, "accepted");
  const a1 = firstTimeToStatus(statusEvents, "driver_arriving");
  const a2 = firstTimeToStatus(statusEvents, "driver_waiting");
  const a3 = firstTimeToStatus(statusEvents, "arrived");
  const arrivedAt = minIso(minIso(a1, a2), a3);
  const startedAt = minIso(
    firstTimeToStatus(statusEvents, "in_progress"),
    firstTimeToStatus(statusEvents, "passenger_onboard"),
  );
  const completedAt = firstTimeToStatus(statusEvents, "completed");

  let cancelledAt: string | null = null;
  for (const e of statusEvents) {
    if (e.to_status && CANCEL_STATUSES.has(e.to_status)) {
      const t = iso(e.created_at);
      cancelledAt = cancelledAt == null || t < cancelledAt ? t : cancelledAt;
    }
  }

  const tw = firstTimeToStatus(statusEvents, "driver_waiting");
  const tProg = firstTimeToStatus(statusEvents, "in_progress");
  const waitingMinutes =
    tw && tProg ? minutesBetween(tw, tProg) : tw && firstTimeToStatus(statusEvents, "passenger_onboard")
      ? minutesBetween(tw, firstTimeToStatus(statusEvents, "passenger_onboard"))
      : null;

  let delayMinutes: number | null = null;
  if (ride.scheduledAt) {
    const sched = Date.parse(ride.scheduledAt);
    if (!Number.isNaN(sched)) {
      const compare =
        firstTimeToStatus(statusEvents, "accepted") ||
        firstTimeToStatus(statusEvents, "driver_arriving") ||
        a1;
      if (compare) {
        const c = Date.parse(compare);
        if (!Number.isNaN(c) && c > sched) {
          delayMinutes = Math.max(0, Math.round((c - sched) / 60000));
        }
      }
    }
  }

  const cancelEvent = eventRows.filter((e) => e.event_type === "cancel_reason").pop();
  let cancellationReason: string | null = null;
  if (cancelEvent?.payload && typeof cancelEvent.payload === "object" && !Array.isArray(cancelEvent.payload)) {
    const p = cancelEvent.payload as { reason?: unknown };
    if (typeof p.reason === "string" && p.reason.trim()) {
      cancellationReason = p.reason.trim().slice(0, 2000);
    }
  }

  const est = ride.estimatedFare;
  const fin = ride.finalFare;
  const estimatedPrice = typeof est === "number" && Number.isFinite(est) ? est : null;
  const finalPrice = typeof fin === "number" && Number.isFinite(fin) ? fin : null;
  let priceDifference: number | null = null;
  if (estimatedPrice != null && finalPrice != null) {
    priceDifference = Math.round((finalPrice - estimatedPrice) * 100) / 100;
  }

  const meta = parsePartnerBookingMeta(ride.partnerBookingMeta ?? null);
  const costCenterId =
    meta?.insurer?.costCenterId && typeof meta.insurer.costCenterId === "string"
      ? meta.insurer.costCenterId
      : null;

  const company = await companyBlock(db, ride.companyId ?? null);
  const { driver, vehicle } = await driverAndVehicleBlock(db, ride as RideRequest);

  return {
    schemaVersion: 1,
    capturedAt: iso(capturedAt),
    time: {
      requestedAt,
      acceptedAt,
      arrivedAt,
      startedAt,
      completedAt,
      cancelledAt,
      waitingMinutes,
      delayMinutes,
    },
    pricing: {
      estimatedPrice,
      finalPrice,
      priceDifference,
      paymentMethod: ride.paymentMethod ?? null,
      pricingMode: ride.pricingMode ?? null,
      voucherCode: ride.voucherCode ?? null,
      billingReference: ride.billingReference ?? null,
      costCenterId,
    },
    status: {
      currentStatus: ride.status,
      cancellationReason,
      rideKind: ride.rideKind,
      payerKind: ride.payerKind,
    },
    parties: { driver, company, vehicle },
    route: { fromLabel: ride.from ?? null, toLabel: ride.to ?? null },
  };
}

type Db = NonNullable<ReturnType<typeof getDb>>;

async function companyBlock(
  db: Db,
  companyId: string | null,
): Promise<{ id: string | null; name: string | null } | null> {
  if (!companyId) return null;
  const [c] = await db
    .select({ id: adminCompaniesTable.id, name: adminCompaniesTable.name })
    .from(adminCompaniesTable)
    .where(eq(adminCompaniesTable.id, companyId))
    .limit(1);
  if (!c) {
    return { id: companyId, name: null };
  }
  return { id: c.id, name: c.name ?? null };
}

async function driverAndVehicleBlock(
  db: NonNullable<ReturnType<typeof getDb>>,
  ride: RideRequest,
): Promise<{
  driver: { id: string | null; displayName: string | null } | null;
  vehicle: { id: string | null; licensePlate: string | null; label: string | null } | null;
}> {
  const did = ride.driverId?.trim();
  if (!did) {
    return {
      driver: null,
      vehicle: { id: null, licensePlate: null, label: ride.vehicle || null },
    };
  }
  const [dRow] = await db
    .select({
      id: fleetDriversTable.id,
      first: fleetDriversTable.first_name,
      last: fleetDriversTable.last_name,
    })
    .from(fleetDriversTable)
    .where(eq(fleetDriversTable.id, did))
    .limit(1);

  const displayName = dRow
    ? [dRow.first, dRow.last].map((s) => String(s || "").trim()).filter(Boolean).join(" ") || null
    : null;
  const driver: { id: string | null; displayName: string | null } = {
    id: did,
    displayName: dRow ? displayName : null,
  };

  let vehicle: { id: string | null; licensePlate: string | null; label: string | null } = {
    id: null,
    licensePlate: null,
    label: ride.vehicle || null,
  };
  if (ride.companyId) {
    const [a] = await db
      .select({
        vehicleId: fleetVehiclesTable.id,
        plate: fleetVehiclesTable.license_plate,
      })
      .from(driverVehicleAssignmentsTable)
      .innerJoin(fleetVehiclesTable, eq(driverVehicleAssignmentsTable.vehicle_id, fleetVehiclesTable.id))
      .where(
        and(
          eq(driverVehicleAssignmentsTable.driver_id, did),
          eq(driverVehicleAssignmentsTable.company_id, ride.companyId!),
        ),
      )
      .orderBy(sql`${driverVehicleAssignmentsTable.assigned_at} DESC`)
      .limit(1);
    if (a) {
      vehicle = { id: a.vehicleId, licensePlate: a.plate || null, label: ride.vehicle || null };
    }
  }
  return { driver, vehicle };
}
