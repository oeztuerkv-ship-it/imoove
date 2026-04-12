import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb } from "./client";
import { partnerRideSeriesTable } from "./schema";

export type PartnerRideSeriesRow = {
  id: string;
  companyId: string;
  createdByPanelUserId: string | null;
  patientReference: string;
  billingReference: string | null;
  validFrom: string | null;
  validUntil: string | null;
  totalRides: number;
  status: string;
  meta: Record<string, unknown>;
  createdAt: string;
};

const memSeries: PartnerRideSeriesRow[] = [];

function rowToSeries(r: typeof partnerRideSeriesTable.$inferSelect): PartnerRideSeriesRow {
  return {
    id: r.id,
    companyId: r.company_id,
    createdByPanelUserId: r.created_by_panel_user_id ?? null,
    patientReference: r.patient_reference ?? "",
    billingReference: r.billing_reference ?? null,
    validFrom: r.valid_from ? new Date(r.valid_from).toISOString() : null,
    validUntil: r.valid_until ? new Date(r.valid_until).toISOString() : null,
    totalRides: r.total_rides,
    status: r.status,
    meta: (r.meta && typeof r.meta === "object" ? r.meta : {}) as Record<string, unknown>,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

export async function insertPartnerRideSeries(input: {
  companyId: string;
  createdByPanelUserId: string;
  patientReference: string;
  billingReference?: string | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
  totalRides: number;
  meta?: Record<string, unknown>;
}): Promise<PartnerRideSeriesRow> {
  const id = `SRS-${randomUUID()}`;
  const db = getDb();
  if (!db) {
    const row: PartnerRideSeriesRow = {
      id,
      companyId: input.companyId,
      createdByPanelUserId: input.createdByPanelUserId,
      patientReference: input.patientReference.trim(),
      billingReference: input.billingReference?.trim() || null,
      validFrom: input.validFrom ? input.validFrom.toISOString() : null,
      validUntil: input.validUntil ? input.validUntil.toISOString() : null,
      totalRides: input.totalRides,
      status: "active",
      meta: input.meta ?? {},
      createdAt: new Date().toISOString(),
    };
    memSeries.unshift(row);
    return row;
  }
  await db.insert(partnerRideSeriesTable).values({
    id,
    company_id: input.companyId,
    created_by_panel_user_id: input.createdByPanelUserId,
    patient_reference: input.patientReference.trim(),
    billing_reference: input.billingReference?.trim() || null,
    valid_from: input.validFrom ?? null,
    valid_until: input.validUntil ?? null,
    total_rides: input.totalRides,
    status: "active",
    meta: input.meta ?? {},
  });
  const [r] = await db.select().from(partnerRideSeriesTable).where(eq(partnerRideSeriesTable.id, id)).limit(1);
  if (!r) throw new Error("partner_ride_series insert failed");
  return rowToSeries(r);
}

export async function listPartnerRideSeriesForCompany(companyId: string): Promise<PartnerRideSeriesRow[]> {
  const db = getDb();
  if (!db) {
    return memSeries.filter((s) => s.companyId === companyId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  const rows = await db
    .select()
    .from(partnerRideSeriesTable)
    .where(eq(partnerRideSeriesTable.company_id, companyId))
    .orderBy(desc(partnerRideSeriesTable.created_at));
  return rows.map(rowToSeries);
}
