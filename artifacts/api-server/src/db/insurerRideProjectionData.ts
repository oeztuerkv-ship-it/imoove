import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import type { AdminRole } from "../lib/adminConsoleRoles";
import { adminRideRowVisibleToPrincipal } from "../lib/adminConsoleRoles";
import {
  buildProofFlags,
  type InsurerExportBatchRow,
  type InsurerRideDetail,
  type InsurerRideListItem,
  type InsurerExecutionSummary,
  type InsurerMissingProofKey,
  type InsurerSortKey,
  type InsurerSummary,
  parsePlzOrtFromLabel,
} from "../lib/insurerRideDto";
import { getDb } from "./client";
import {
  adminCompaniesTable,
  billingExportBatchesTable,
  rideBillingCorrectionsTable,
  rideEventsTable,
  rideFinancialsTable,
  ridesTable,
  fleetVehiclesTable,
} from "./schema";

const CANCELLED_STATUSES = [
  "cancelled",
  "cancelled_by_customer",
  "cancelled_by_driver",
  "cancelled_by_system",
] as const;

function insurerExportDir(): string {
  const fromEnv = (process.env.ONRODA_INSURER_EXPORT_DIR ?? "").trim();
  if (fromEnv) return fromEnv;
  return path.resolve(process.cwd(), "artifacts/api-server/uploads/insurer-exports");
}

function rowAmountGross(r: { estimated_fare: number | null; final_fare: number | null }, g: number | null | undefined) {
  if (g != null && !Number.isNaN(g)) return g;
  const f = r.final_fare;
  if (f != null && !Number.isNaN(f)) return f;
  return r.estimated_fare ?? 0;
}

type ListFilters = {
  createdFrom: Date;
  createdTo: Date;
  companyId?: string;
  status?: string;
  rideId?: string;
  driverId?: string;
  amountMin?: number;
  amountMax?: number;
  exportStatus?: "any" | "exported" | "not_exported";
  hasCorrections?: boolean;
  missingProofs?: InsurerMissingProofKey[];
  sort?: InsurerSortKey;
  order?: "asc" | "desc";
  payerKind: "insurance" | "all";
};

function mapRowToListItem(
  input: {
    ride: typeof ridesTable.$inferSelect;
    companyName: string | null;
    financialGross: number | null;
    finBilling: string | null;
    finSettlement: string | null;
    vehiclePlate: string;
    lastExportBatchId: string | null;
  },
): InsurerRideListItem {
  const { ride: r, companyName, financialGross, finBilling, finSettlement, vehiclePlate, lastExportBatchId } = input;
  const fromP = parsePlzOrtFromLabel(r.from_label);
  const toP = parsePlzOrtFromLabel(r.to_label);
  const meta =
    r.partner_booking_meta && typeof r.partner_booking_meta === "object" && !Array.isArray(r.partner_booking_meta)
      ? (r.partner_booking_meta as Record<string, unknown>)
      : null;
  return {
    rideId: r.id,
    companyId: r.company_id,
    companyName: companyName || "—",
    driverId: (r.driver_id ?? "").trim() || null,
    vehiclePlate: vehiclePlate || "—",
    referenceTime: (r.scheduled_at ?? r.created_at).toISOString(),
    fromPostalCode: fromP.plz,
    fromLocality: fromP.locality,
    toPostalCode: toP.plz,
    toLocality: toP.locality,
    amountGross: rowAmountGross(r, financialGross),
    rideStatus: r.status,
    financialBillingStatus: finBilling,
    financialSettlementStatus: finSettlement,
    rideKind: r.ride_kind,
    payerKind: r.payer_kind,
    passengerPseudonymId: (r.passenger_id ?? "").trim() || null,
    billingReference: (r.billing_reference ?? "").trim() || null,
    proof: buildProofFlags({
      fromLat: r.from_lat,
      fromLon: r.from_lon,
      toLat: r.to_lat,
      toLon: r.to_lon,
      durationMinutes: r.duration_minutes,
      partnerBookingMeta: meta,
      billingReference: r.billing_reference,
    }),
    lastExportBatchId,
  };
}

function escapeLike(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function exportExistsExpr(): SQL {
  return sql`exists (
    select 1
    from ${billingExportBatchesTable}
    where ${billingExportBatchesTable.included_ride_ids} @> jsonb_build_array(${ridesTable.id})
  )`;
}

function correctionExistsExpr(): SQL {
  return sql`exists (
    select 1
    from ${rideBillingCorrectionsTable} rbc
    where rbc.ride_id = ${ridesTable.id}
  )`;
}

function amountExpr(): SQL<number> {
  return sql<number>`coalesce(${rideFinancialsTable.gross_amount}, ${ridesTable.final_fare}, ${ridesTable.estimated_fare}, 0)`;
}

function missingProofCondition(key: InsurerMissingProofKey): SQL {
  if (key === "gps") {
    return or(
      sql`${ridesTable.from_lat} is null`,
      sql`${ridesTable.from_lon} is null`,
      sql`${ridesTable.to_lat} is null`,
      sql`${ridesTable.to_lon} is null`,
    )!;
  }
  if (key === "chronology") {
    return sql`coalesce(${ridesTable.duration_minutes}, 0) <= 0`;
  }
  if (key === "confirmation") {
    return sql`coalesce(
      ${ridesTable.partner_booking_meta}->>'signatureReceived',
      ${ridesTable.partner_booking_meta}->>'patientSignatureAt',
      ${ridesTable.partner_booking_meta}->>'confirmationAt',
      ''
    ) = '' and coalesce(${ridesTable.partner_booking_meta}->>'confirmed', 'false') <> 'true'`;
  }
  return sql`coalesce(trim(${ridesTable.billing_reference}), '') = ''`;
}

function executionSummaryFromRows(input: {
  ride: typeof ridesTable.$inferSelect;
  events: Array<{
    event_type: string;
    to_status: string | null;
    created_at: Date;
  }>;
}): InsurerExecutionSummary {
  const { ride, events } = input;
  const findAt = (statuses: string[]) =>
    events.find((e) => e.to_status && statuses.includes(String(e.to_status)))?.created_at?.toISOString() ?? null;
  return {
    createdAt: ride.created_at.toISOString(),
    scheduledAt: ride.scheduled_at ? ride.scheduled_at.toISOString() : null,
    pickupAt: findAt(["driver_waiting", "passenger_onboard", "arrived", "in_progress"]),
    completedAt: findAt(["completed"]),
    cancelledAt: findAt(["cancelled", "cancelled_by_customer", "cancelled_by_driver", "cancelled_by_system"]),
    cancelledReason: null,
  };
}

export async function listInsurerRides(
  role: AdminRole,
  scopeCompanyId: string | null | undefined,
  filters: ListFilters,
  page: number,
  pageSize: number,
): Promise<{ items: InsurerRideListItem[]; total: number }> {
  const db = getDb();
  if (!db) return { items: [], total: 0 };

  const conds: SQL[] = [gte(ridesTable.created_at, filters.createdFrom), lte(ridesTable.created_at, filters.createdTo)];
  if (filters.companyId) conds.push(eq(ridesTable.company_id, filters.companyId));
  if (filters.status?.trim()) conds.push(eq(ridesTable.status, filters.status.trim()));
  if (filters.payerKind === "insurance") conds.push(eq(ridesTable.payer_kind, "insurance"));
  if (role === "insurance") conds.push(eq(ridesTable.payer_kind, "insurance"));
  if (scopeCompanyId?.trim()) conds.push(eq(ridesTable.company_id, scopeCompanyId.trim()));
  if (filters.rideId?.trim()) {
    const q = `%${escapeLike(filters.rideId.trim())}%`;
    conds.push(ilike(ridesTable.id, q));
  }
  if (filters.driverId?.trim()) {
    const q = `%${escapeLike(filters.driverId.trim())}%`;
    conds.push(ilike(ridesTable.driver_id, q));
  }
  if (typeof filters.amountMin === "number" && Number.isFinite(filters.amountMin)) {
    conds.push(sql`${amountExpr()} >= ${filters.amountMin}`);
  }
  if (typeof filters.amountMax === "number" && Number.isFinite(filters.amountMax)) {
    conds.push(sql`${amountExpr()} <= ${filters.amountMax}`);
  }
  if (filters.exportStatus === "exported") conds.push(exportExistsExpr());
  if (filters.exportStatus === "not_exported") conds.push(sql`not (${exportExistsExpr()})`);
  if (typeof filters.hasCorrections === "boolean") {
    if (filters.hasCorrections) conds.push(correctionExistsExpr());
    else conds.push(sql`not (${correctionExistsExpr()})`);
  }
  for (const missing of filters.missingProofs ?? []) conds.push(missingProofCondition(missing));

  const totalRes = await db
    .select({ c: count() })
    .from(ridesTable)
    .leftJoin(rideFinancialsTable, eq(rideFinancialsTable.ride_id, ridesTable.id))
    .where(and(...conds));
  const total = Number(totalRes[0]?.c ?? 0);

  const offset = (page - 1) * pageSize;
  const sortBy = filters.sort ?? "reference_time";
  const sortOrder = filters.order ?? "desc";
  const referenceExpr = sql`coalesce(${ridesTable.scheduled_at}, ${ridesTable.created_at})`;
  const sortExpr: SQL =
    sortBy === "amount_gross"
      ? amountExpr()
      : sortBy === "ride_status"
        ? ridesTable.status
        : sortBy === "company_name"
          ? sql`coalesce(${adminCompaniesTable.name}, '')`
          : referenceExpr;
  const orderExpr = sortOrder === "asc" ? asc(sortExpr) : desc(sortExpr);
  const tieBreakExpr = desc(ridesTable.created_at);

  const rows = await db
    .select({
      ride: ridesTable,
      companyName: adminCompaniesTable.name,
      finGross: rideFinancialsTable.gross_amount,
      finBill: rideFinancialsTable.billing_status,
      finSet: rideFinancialsTable.settlement_status,
    })
    .from(ridesTable)
    .leftJoin(adminCompaniesTable, eq(ridesTable.company_id, adminCompaniesTable.id))
    .leftJoin(rideFinancialsTable, eq(rideFinancialsTable.ride_id, ridesTable.id))
    .where(and(...conds))
    .orderBy(orderExpr, tieBreakExpr)
    .limit(pageSize)
    .offset(offset);

  const visible = rows.filter((row) => adminRideRowVisibleToPrincipal(role, scopeCompanyId, { payerKind: row.ride.payer_kind, companyId: row.ride.company_id }));
  const ids = visible.map((v) => v.ride.id);
  const exportMap = await getLatestExportBatchIdForRideIds(ids);

  const items: InsurerRideListItem[] = visible.map((row) =>
    mapRowToListItem({
      ride: row.ride,
      companyName: row.companyName,
      financialGross: row.finGross,
      finBill: row.finBill,
      finSet: row.finSet,
      vehiclePlate: (row.ride.vehicle as string) || "—",
      lastExportBatchId: exportMap.get(row.ride.id) ?? null,
    }),
  );

  return { items, total };
}

async function getLatestExportBatchIdForRideIds(rideIds: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (rideIds.length === 0) return m;
  const db = getDb();
  if (!db) return m;
  const batches = await db
    .select()
    .from(billingExportBatchesTable)
    .orderBy(desc(billingExportBatchesTable.created_at))
    .limit(200);
  for (const rid of rideIds) {
    for (const b of batches) {
      const inc = b.included_ride_ids;
      if (Array.isArray(inc) && inc.includes(rid)) {
        m.set(rid, b.id);
        break;
      }
    }
  }
  return m;
}

export async function getInsurerRideDetail(
  role: AdminRole,
  scopeCompanyId: string | null | undefined,
  rideId: string,
): Promise<InsurerRideDetail | null> {
  const db = getDb();
  if (!db) return null;
  const rRows = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
  const r = rRows[0];
  if (!r) return null;
  if (
    !adminRideRowVisibleToPrincipal(role, scopeCompanyId, {
      payerKind: r.payer_kind,
      companyId: r.company_id,
    })
  ) {
    return null;
  }

  const [co, fin, exportMap, corr, ev] = await Promise.all([
    r.company_id
      ? db.select({ name: adminCompaniesTable.name }).from(adminCompaniesTable).where(eq(adminCompaniesTable.id, r.company_id)).limit(1)
      : Promise.resolve([] as { name: string }[]),
    db.select().from(rideFinancialsTable).where(eq(rideFinancialsTable.ride_id, rideId)).limit(1),
    getLatestExportBatchIdForRideIds([rideId]),
    db
      .select()
      .from(rideBillingCorrectionsTable)
      .where(eq(rideBillingCorrectionsTable.ride_id, rideId))
      .orderBy(asc(rideBillingCorrectionsTable.created_at)),
    db
      .select({
        id: rideEventsTable.id,
        event_type: rideEventsTable.event_type,
        from_status: rideEventsTable.from_status,
        to_status: rideEventsTable.to_status,
        actor_type: rideEventsTable.actor_type,
        actor_id: rideEventsTable.actor_id,
        created_at: rideEventsTable.created_at,
      })
      .from(rideEventsTable)
      .where(eq(rideEventsTable.ride_id, rideId))
      .orderBy(asc(rideEventsTable.created_at)),
  ]);

  const companyName = co[0]?.name ?? null;
  const f = fin[0];
  const vRows = r.company_id
    ? await db
        .select({ plate: fleetVehiclesTable.license_plate })
        .from(fleetVehiclesTable)
        .where(
          and(
            eq(fleetVehiclesTable.company_id, r.company_id),
            sql`lower(trim(${fleetVehiclesTable.license_plate})) = lower(trim(${r.vehicle}))`,
          ),
        )
        .limit(1)
    : [];
  const vehiclePlate = vRows[0]?.plate || r.vehicle;

  const base = mapRowToListItem({
    ride: r,
    companyName,
    financialGross: f?.gross_amount ?? null,
    finBilling: f?.billing_status ?? null,
    finSettlement: f?.settlement_status ?? null,
    vehiclePlate,
    lastExportBatchId: exportMap.get(rideId) ?? null,
  });

  const corrections = corr.map((c) => ({
    id: c.id,
    fieldName: c.field_name,
    oldValue: c.old_value,
    newValue: c.new_value,
    reasonCode: c.reason_code,
    reasonNote: c.reason_note,
    actorType: c.actor_type,
    actorId: c.actor_id ?? null,
    createdAt: c.created_at.toISOString(),
  }));

  const audit = ev.map((e) => ({
    id: e.id,
    eventType: e.event_type,
    fromStatus: e.from_status,
    toStatus: e.to_status,
    actorType: e.actor_type,
    actorId: e.actor_id ?? null,
    createdAt: e.created_at.toISOString(),
  }));

  const executionSummary = executionSummaryFromRows({
    ride: r,
    events: ev.map((x) => ({
      event_type: x.event_type,
      to_status: x.to_status,
      created_at: x.created_at,
    })),
  });

  return {
    ...base,
    distanceKm: r.distance_km,
    durationMinutes: r.duration_minutes,
    pricingMode: r.pricing_mode,
    financial: f
      ? {
          grossAmount: f.gross_amount,
          netAmount: f.net_amount,
          vatAmount: f.vat_amount,
          billingStatus: f.billing_status,
          settlementStatus: f.settlement_status,
          billingMode: f.billing_mode,
          payerType: f.payer_type,
          correctionCount: f.correction_count,
          lastCorrectionAt: f.last_correction_at?.toISOString() ?? null,
        }
      : null,
    corrections,
    audit,
    executionSummary,
  };
}

export async function getInsurerSummary(
  role: AdminRole,
  scopeCompanyId: string | null | undefined,
  from: Date,
  to: Date,
  companyIdFilter?: string,
  payerMode: "insurance" | "all" = "insurance",
): Promise<InsurerSummary> {
  const db = getDb();
  if (!db) {
    return {
      periodHint: { from: from.toISOString(), to: to.toISOString() },
      rideCount: 0,
      completedCount: 0,
      cancelledCount: 0,
      totalGrossAmount: 0,
      avgGrossPerRide: 0,
      openSettlementCount: 0,
    };
  }

  const conds = [gte(ridesTable.created_at, from), lte(ridesTable.created_at, to)];
  if (companyIdFilter) conds.push(eq(ridesTable.company_id, companyIdFilter));
  if (payerMode === "insurance") conds.push(eq(ridesTable.payer_kind, "insurance"));

  const rideRows = await db
    .select({
      id: ridesTable.id,
      status: ridesTable.status,
      estimated_fare: ridesTable.estimated_fare,
      final_fare: ridesTable.final_fare,
      payer_kind: ridesTable.payer_kind,
      company_id: ridesTable.company_id,
    })
    .from(ridesTable)
    .where(and(...conds));

  const visible = rideRows.filter((row) =>
    adminRideRowVisibleToPrincipal(role, scopeCompanyId, { payerKind: row.payer_kind, companyId: row.company_id }),
  );
  const ids = visible.map((x) => x.id);
  const finRows =
    ids.length > 0
      ? await db
          .select()
          .from(rideFinancialsTable)
          .where(inArray(rideFinancialsTable.ride_id, ids))
      : [];
  const finByRide = new Map(finRows.map((x) => [x.ride_id, x]));
  const rideCount = visible.length;
  const completed = visible.filter((r) => r.status === "completed");
  const cancelled = visible.filter((r) => CANCELLED_STATUSES.includes(r.status as (typeof CANCELLED_STATUSES)[number]));
  const completedCount = completed.length;
  const cancelledCount = cancelled.length;
  let totalGross = 0;
  for (const v of visible) {
    const f = finByRide.get(v.id);
    totalGross += rowAmountGross(
      { estimated_fare: v.estimated_fare, final_fare: v.final_fare },
      f?.gross_amount ?? null,
    );
  }
  const avgGross = rideCount > 0 ? totalGross / rideCount : 0;
  const openSettlementCount = finRows.filter((f) => f.settlement_status !== "paid_out").length;

  return {
    periodHint: { from: from.toISOString(), to: to.toISOString() },
    rideCount,
    completedCount,
    cancelledCount,
    totalGrossAmount: Math.round(totalGross * 100) / 100,
    avgGrossPerRide: Math.round(avgGross * 100) / 100,
    openSettlementCount,
  };
}

export async function listInsurerExportBatches(limit = 50): Promise<InsurerExportBatchRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(billingExportBatchesTable)
    .orderBy(desc(billingExportBatchesTable.created_at))
    .limit(Math.min(100, limit));
  return rows.map((b) => ({
    id: b.id,
    createdAt: b.created_at.toISOString(),
    createdByLabel: b.created_by_label,
    periodFrom: b.period_from.toISOString(),
    periodTo: b.period_to.toISOString(),
    companyIdFilter: b.company_id_filter,
    status: b.status,
    rowCount: b.row_count,
    schemaVersion: b.schema_version,
    hasFile: Boolean((b.file_rel_path ?? "").trim()),
  }));
}

export async function createInsurerExportBatch(input: {
  createdByLabel: string;
  periodFrom: Date;
  periodTo: Date;
  companyIdFilter?: string;
  role: AdminRole;
  scopeCompanyId: string | null | undefined;
}): Promise<{ batchId: string; rowCount: number; fileName: string } | null> {
  const db = getDb();
  if (!db) return null;
  const conds = [gte(ridesTable.created_at, input.periodFrom), lte(ridesTable.created_at, input.periodTo)];
  conds.push(eq(ridesTable.payer_kind, "insurance"));
  if (input.companyIdFilter) conds.push(eq(ridesTable.company_id, input.companyIdFilter));
  const rideRows = await db.select().from(ridesTable).where(and(...conds));
  const visible = rideRows.filter((r) =>
    adminRideRowVisibleToPrincipal(input.role, input.scopeCompanyId, { payerKind: r.payer_kind, companyId: r.company_id }),
  );
  const finRows =
    visible.length > 0
      ? await db
          .select()
          .from(rideFinancialsTable)
          .where(
            inArray(
              rideFinancialsTable.ride_id,
              visible.map((r) => r.id),
            ),
          )
      : [];
  const finByRide = new Map(finRows.map((x) => [x.ride_id, x]));
  const coIds = [...new Set(visible.map((r) => r.company_id).filter(Boolean))] as string[];
  const companies =
    coIds.length > 0
      ? await db
          .select({ id: adminCompaniesTable.id, name: adminCompaniesTable.name })
          .from(adminCompaniesTable)
          .where(inArray(adminCompaniesTable.id, coIds))
      : [];
  const coName = new Map(companies.map((c) => [c.id, c.name]));
  const batchId = `insx-${randomUUID()}`;
  const lines: string[] = [];
  lines.push(
    "schema_version;ref_id;company_id;company_name;driver_id;vehicle;datetime_utc;from_plz;from_ort;to_plz;to_ort;amount_gross;ride_status;settlement_status;payer_kind;passenger_pseudonym_id;billing_ref",
  );
  for (const r of visible) {
    const f = finByRide.get(r.id);
    const fromP = parsePlzOrtFromLabel(r.from_label);
    const toP = parsePlzOrtFromLabel(r.to_label);
    const amount = String(rowAmountGross(r, f?.gross_amount ?? null));
    const cell = (s: string) => s.replaceAll(";", " ").replaceAll("\n", " ");
    lines.push(
      [
        "insurer_export_v1",
        r.id,
        r.company_id ?? "",
        cell((r.company_id && coName.get(r.company_id)) || ""),
        (r.driver_id ?? "").replaceAll(";", ""),
        cell(r.vehicle),
        (r.scheduled_at ?? r.created_at).toISOString(),
        fromP.plz ?? "",
        cell(fromP.locality ?? ""),
        toP.plz ?? "",
        cell(toP.locality ?? ""),
        amount,
        r.status,
        f?.settlement_status ?? "",
        r.payer_kind,
        (r.passenger_id ?? "").replaceAll(";", ""),
        cell((r.billing_reference ?? "").trim()),
      ].join(";"),
    );
  }
  const fileName = `insurer-export-${batchId}.csv`;
  const rel = path.join(batchId, fileName);
  const base = insurerExportDir();
  await mkdir(path.join(base, batchId), { recursive: true });
  const abs = path.join(base, rel);
  await writeFile(abs, lines.join("\n"), "utf8");
  const rideIds = visible.map((r) => r.id);
  await db.insert(billingExportBatchesTable).values({
    id: batchId,
    created_by_label: input.createdByLabel,
    period_from: input.periodFrom,
    period_to: input.periodTo,
    company_id_filter: input.companyIdFilter ?? null,
    status: "completed",
    row_count: visible.length,
    file_rel_path: rel,
    included_ride_ids: rideIds,
    schema_version: "insurer_export_v1",
  });
  return { batchId, rowCount: visible.length, fileName };
}

export function resolveInsurerExportFilePath(rel: string | null | undefined): string {
  if (!rel?.trim()) return "";
  return path.join(insurerExportDir(), rel);
}

export async function getInsurerExportBatchById(
  id: string,
): Promise<typeof billingExportBatchesTable.$inferSelect | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db.select().from(billingExportBatchesTable).where(eq(billingExportBatchesTable.id, id)).limit(1);
  return rows[0] ?? null;
}
