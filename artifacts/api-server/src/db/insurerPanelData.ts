import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { PartnerBookingMeta } from "../domain/partnerBookingMeta";
import { parsePartnerBookingMeta } from "../domain/partnerBookingMeta";
import type { RideRequest } from "../domain/rideRequest";
import { getDb } from "./client";
import { adminCompaniesTable, insurerCostCentersTable, insurerRideTransportDocumentsTable, rideFinancialsTable, ridesTable } from "./schema";
import { findRide, listRidesForCompany, updateRide } from "./ridesData";

const OPEN: NonNullable<RideRequest["status"]>[] = [
  "draft",
  "scheduled",
  "requested",
  "searching_driver",
  "offered",
  "pending",
];

const ACTIVE: NonNullable<RideRequest["status"]>[] = [
  "accepted",
  "driver_arriving",
  "driver_waiting",
  "passenger_onboard",
  "in_progress",
  "arrived",
];

function passengerDisplayFromMeta(meta: PartnerBookingMeta | null | undefined, billingReference: string | null | undefined): string {
  const m = meta?.insurer?.passengerRef?.trim() || meta?.medical?.patientReference?.trim() || "";
  if (m) return m;
  const b = (billingReference ?? "").trim();
  if (b) return b;
  return "—";
}

export type InsurerDashboardStats = {
  openRides: number;
  activeRides: number;
  completedRides: number;
};

export async function getInsurerDashboardStats(companyId: string): Promise<InsurerDashboardStats> {
  const db = getDb();
  if (!db) {
    const rides = await listRidesForCompany(companyId);
    const comp = (r: RideRequest) => r.status === "completed";
    return {
      openRides: rides.filter((r) => OPEN.includes(r.status)).length,
      activeRides: rides.filter((r) => ACTIVE.includes(r.status)).length,
      completedRides: rides.filter(comp).length,
    };
  }
  const cOpen = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ridesTable)
    .where(and(eq(ridesTable.company_id, companyId), inArray(ridesTable.status, OPEN)));
  const cAct = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ridesTable)
    .where(and(eq(ridesTable.company_id, companyId), inArray(ridesTable.status, ACTIVE)));
  const cDone = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ridesTable)
    .where(and(eq(ridesTable.company_id, companyId), eq(ridesTable.status, "completed")));
  return {
    openRides: Number(cOpen[0]?.n ?? 0),
    activeRides: Number(cAct[0]?.n ?? 0),
    completedRides: Number(cDone[0]?.n ?? 0),
  };
}

export type InsurerRideListRow = {
  id: string;
  status: string;
  createdAt: string;
  scheduledAt: string | null;
  fromLabel: string;
  toLabel: string;
  passengerLabel: string;
  costCenterId: string | null;
  costCenterCode: string | null;
  costCenterLabel: string | null;
  serviceProviderCompanyId: string | null;
  serviceProviderCompanyName: string | null;
  billingReference: string | null;
};

export async function listInsurerRideRows(companyId: string): Promise<InsurerRideListRow[]> {
  const db = getDb();
  if (!db) {
    const rides = await listRidesForCompany(companyId);
    return rides.map((r) => {
      const meta = r.partnerBookingMeta;
      return {
        id: r.id,
        status: r.status,
        createdAt: r.createdAt,
        scheduledAt: r.scheduledAt ?? null,
        fromLabel: r.from,
        toLabel: r.to,
        passengerLabel: passengerDisplayFromMeta(meta, r.billingReference ?? null),
        costCenterId: meta?.insurer?.costCenterId ?? null,
        costCenterCode: null,
        costCenterLabel: null,
        serviceProviderCompanyId: null,
        serviceProviderCompanyName: null,
        billingReference: r.billingReference ?? null,
      };
    });
  }
  const rideRows = await db
    .select()
    .from(ridesTable)
    .where(eq(ridesTable.company_id, companyId))
    .orderBy(desc(ridesTable.created_at));
  const rideIds = rideRows.map((r) => r.id);
  if (rideIds.length === 0) return [];
  const allCc = await db
    .select()
    .from(insurerCostCentersTable)
    .where(eq(insurerCostCentersTable.company_id, companyId));
  const ccById = new Map(allCc.map((c) => [c.id, c]));
  const finRows = await db
    .select()
    .from(rideFinancialsTable)
    .where(inArray(rideFinancialsTable.ride_id, rideIds));
  const finByRide = new Map<string, (typeof finRows)[0]>();
  for (const f of finRows) {
    if (!finByRide.has(f.ride_id)) finByRide.set(f.ride_id, f);
  }
  const spIds = [...new Set(finRows.map((f) => f.service_provider_company_id).filter((x): x is string => Boolean(x)))];
  const spNames = new Map<string, string>();
  if (spIds.length > 0) {
    const sps = await db.select().from(adminCompaniesTable).where(inArray(adminCompaniesTable.id, spIds));
    for (const s of sps) spNames.set(s.id, s.name);
  }
  return rideRows.map((r) => {
    const meta = parsePartnerBookingMeta(r.partner_booking_meta) ?? null;
    const costCenterId = meta?.insurer?.costCenterId?.trim() || null;
    const cc = costCenterId ? ccById.get(costCenterId) : undefined;
    const fin = finByRide.get(r.id);
    const spId = fin?.service_provider_company_id ?? null;
    return {
      id: r.id,
      status: r.status,
      createdAt: r.created_at.toISOString(),
      scheduledAt: r.scheduled_at ? r.scheduled_at.toISOString() : null,
      fromLabel: r.from_label,
      toLabel: r.to_label,
      passengerLabel: passengerDisplayFromMeta(meta, r.billing_reference),
      costCenterId,
      costCenterCode: cc ? cc.code : null,
      costCenterLabel: cc ? cc.label : null,
      serviceProviderCompanyId: spId,
      serviceProviderCompanyName: spId ? (spNames.get(spId) ?? null) : null,
      billingReference: r.billing_reference,
    } satisfies InsurerRideListRow;
  });
}

export type InsurerCostCenterRow = {
  id: string;
  code: string;
  label: string;
  isActive: boolean;
  createdAt: string;
};

export async function listInsurerCostCenters(companyId: string): Promise<InsurerCostCenterRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(insurerCostCentersTable)
    .where(eq(insurerCostCentersTable.company_id, companyId))
    .orderBy(desc(insurerCostCentersTable.created_at));
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    label: r.label,
    isActive: r.is_active,
    createdAt: r.created_at.toISOString(),
  }));
}

export async function insertInsurerCostCenter(
  companyId: string,
  input: { code: string; label: string },
): Promise<{ ok: true; row: InsurerCostCenterRow } | { ok: false; error: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const code = input.code.trim();
  if (!code) return { ok: false, error: "code_required" };
  const id = randomUUID();
  const now = new Date();
  try {
    await db.insert(insurerCostCentersTable).values({
      id,
      company_id: companyId,
      code,
      label: (input.label ?? "").trim(),
      is_active: true,
      created_at: now,
      updated_at: now,
    });
  } catch {
    return { ok: false, error: "code_duplicate_or_invalid" };
  }
  return {
    ok: true,
    row: {
      id,
      code,
      label: (input.label ?? "").trim(),
      isActive: true,
      createdAt: now.toISOString(),
    },
  };
}

export async function patchInsurerCostCenter(
  companyId: string,
  id: string,
  patch: { label?: string; isActive?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const now = new Date();
  const setObj: { label?: string; is_active?: boolean; updated_at: Date } = { updated_at: now };
  if (typeof patch.label === "string") setObj.label = patch.label;
  if (typeof patch.isActive === "boolean") setObj.is_active = patch.isActive;
  const u = await db
    .update(insurerCostCentersTable)
    .set(setObj)
    .where(and(eq(insurerCostCentersTable.id, id), eq(insurerCostCentersTable.company_id, companyId)))
    .returning({ id: insurerCostCentersTable.id });
  if (u.length === 0) return { ok: false, error: "not_found" };
  return { ok: true };
}

export async function patchRideInsurerOrgMeta(
  companyId: string,
  rideId: string,
  input: { costCenterId: string | null; passengerRef: string | null },
): Promise<{ ok: true; ride: RideRequest } | { ok: false; error: string }> {
  const r = await findRide(rideId);
  if (!r || (r.companyId ?? null) !== companyId) return { ok: false, error: "ride_not_found" };
  if (input.costCenterId) {
    const db = getDb();
    if (db) {
      const cc = await db
        .select({ id: insurerCostCentersTable.id })
        .from(insurerCostCentersTable)
        .where(
          and(
            eq(insurerCostCentersTable.id, input.costCenterId),
            eq(insurerCostCentersTable.company_id, companyId),
            eq(insurerCostCentersTable.is_active, true),
          ),
        )
        .limit(1);
      if (!cc[0]) return { ok: false, error: "cost_center_invalid" };
    }
  }
  const prev = r.partnerBookingMeta;
  const base: PartnerBookingMeta = prev ?? { flow: "medical_patient" };
  const next: PartnerBookingMeta = {
    ...base,
    insurer: {
      ...(base.insurer ?? {}),
      costCenterId: input.costCenterId,
      passengerRef: input.passengerRef,
    },
  };
  const updated = await updateRide(rideId, { partnerBookingMeta: next });
  if (!updated) return { ok: false, error: "update_failed" };
  return { ok: true, ride: updated };
}

export type InsurerTransportDocRow = {
  id: string;
  rideId: string;
  originalFilename: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
};

export async function listTransportDocsForRide(
  companyId: string,
  rideId: string,
): Promise<InsurerTransportDocRow[]> {
  const db = getDb();
  if (!db) return [];
  const r = await findRide(rideId);
  if (!r || (r.companyId ?? null) !== companyId) return [];
  const rows = await db
    .select()
    .from(insurerRideTransportDocumentsTable)
    .where(
      and(
        eq(insurerRideTransportDocumentsTable.company_id, companyId),
        eq(insurerRideTransportDocumentsTable.ride_id, rideId),
      ),
    )
    .orderBy(desc(insurerRideTransportDocumentsTable.created_at));
  return rows.map((x) => ({
    id: x.id,
    rideId: x.ride_id,
    originalFilename: x.original_filename,
    contentType: x.content_type,
    byteSize: x.byte_size,
    createdAt: x.created_at.toISOString(),
  }));
}

export async function insertInsurerTransportDocument(
  companyId: string,
  rideId: string,
  panelUserId: string,
  input: { storageKey: string; originalFilename: string; contentType: string; byteSize: number },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const r = await findRide(rideId);
  if (!r || (r.companyId ?? null) !== companyId) return { ok: false, error: "ride_not_found" };
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };
  const id = randomUUID();
  const now = new Date();
  await db.insert(insurerRideTransportDocumentsTable).values({
    id,
    company_id: companyId,
    ride_id: rideId,
    storage_key: input.storageKey,
    original_filename: input.originalFilename,
    content_type: input.contentType,
    byte_size: input.byteSize,
    created_by_panel_user_id: panelUserId,
    created_at: now,
  });
  return { ok: true, id };
}

export async function getInsurerTransportDocumentFile(
  companyId: string,
  docId: string,
): Promise<{
  storageKey: string;
  contentType: string;
  originalFilename: string;
} | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(insurerRideTransportDocumentsTable)
    .where(
      and(
        eq(insurerRideTransportDocumentsTable.id, docId),
        eq(insurerRideTransportDocumentsTable.company_id, companyId),
      ),
    )
    .limit(1);
  const d = rows[0];
  if (!d) return null;
  return {
    storageKey: d.storage_key,
    contentType: d.content_type,
    originalFilename: d.original_filename,
  };
}
