import { randomUUID } from "node:crypto";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { RideRequest } from "../domain/rideRequest.js";
import { addCalendarDays } from "../lib/monthlyInvoiceRun.js";
import { getDb } from "./client.js";
import {
  createPartnerMonthlyInvoiceInTx,
  ensureCompanyInvoicePrefixFromKind,
  type PartnerInvoiceGeneratorItem,
} from "./partnerInvoiceGeneratorData.js";
import {
  getInvoiceEligibility,
  getRideFinancialSnapshotByRideId,
  logFinancialAuditForRide,
} from "./rideFinancialsData.js";
import { invoiceItemsTable, invoicesTable, rideFinancialsTable } from "./schema.js";

const INVOICE_DUE_DAYS = 14;

export type CompanyRideInvoiceSummary = {
  eligible: boolean;
  blockers: string[];
  invoiceId: string | null;
  invoiceNumber: string | null;
  billingStatus: string | null;
};

export type CreatePartnerSingleRideInvoiceResult =
  | {
      ok: true;
      invoiceId: string;
      invoiceNumber: string;
      paymentReference: string;
      totalGross: number;
    }
  | { ok: false; error: string; blockers?: string[] };

async function findInvoiceByRideId(rideId: string): Promise<{ invoiceId: string; invoiceNumber: string } | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({
      invoiceId: invoicesTable.id,
      invoiceNumber: invoicesTable.invoice_number,
    })
    .from(invoiceItemsTable)
    .innerJoin(invoicesTable, eq(invoiceItemsTable.invoice_id, invoicesTable.id))
    .where(and(eq(invoiceItemsTable.ride_id, rideId), ne(invoicesTable.status, "cancelled")))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { invoiceId: row.invoiceId, invoiceNumber: row.invoiceNumber };
}

function ridePeriodDate(ride: RideRequest, snapshotCalculatedAt: string | null | undefined): string {
  const raw = snapshotCalculatedAt ?? ride.updatedAt ?? ride.createdAt;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

function buildSingleRideItem(
  ride: RideRequest,
  snapshot: NonNullable<Awaited<ReturnType<typeof getRideFinancialSnapshotByRideId>>>,
): PartnerInvoiceGeneratorItem {
  const fromLabel = String(ride.fromFull || ride.from || "").trim();
  const toLabel = String(ride.toFull || ride.to || "").trim();
  const route = fromLabel && toLabel ? `${fromLabel} → ${toLabel}` : fromLabel || toLabel || "";
  const ref = String(ride.billingReference ?? snapshot.billingReference ?? "").trim();
  const description = route
    ? `Fahrt ${ride.id.slice(0, 8)}…: ${route}${ref ? ` (Ref. ${ref})` : ""}`
    : `Fahrt ${ride.id}${ref ? ` (Ref. ${ref})` : ""}`;
  const lineGross =
    Number(snapshot.grossAmount) > 0
      ? Number(snapshot.grossAmount)
      : Number(ride.finalFare ?? ride.estimatedFare ?? 0);
  const lineNet = Number(snapshot.netAmount) > 0 ? Number(snapshot.netAmount) : lineGross - Number(snapshot.vatAmount);
  const lineVat =
    Number(snapshot.vatAmount) > 0 ? Number(snapshot.vatAmount) : Math.max(0, lineGross - lineNet);
  return {
    rideId: ride.id,
    itemType: "ride",
    description,
    quantity: 1,
    unitNet: lineNet,
    vatRate: Number(snapshot.vatRate) || 0,
    lineNet,
    lineVat,
    lineGross,
    metadata: {
      ride_financial_id: snapshot.id,
      billing_reference: ref || undefined,
      payer_kind: ride.payerKind,
    },
  };
}

export function summarizeCompanyRideInvoice(input: {
  ride: RideRequest;
  snapshot: Awaited<ReturnType<typeof getRideFinancialSnapshotByRideId>>;
  existingInvoice: { invoiceId: string; invoiceNumber: string } | null;
}): CompanyRideInvoiceSummary {
  const meta =
    input.ride.partnerBookingMeta && typeof input.ride.partnerBookingMeta === "object"
      ? (input.ride.partnerBookingMeta as Record<string, unknown>)
      : {};
  if (meta.medical_ride === true) {
    return {
      eligible: false,
      blockers: ["medical_use_ride_invoice_flow"],
      invoiceId: null,
      invoiceNumber: null,
      billingStatus: input.snapshot?.billingStatus ?? null,
    };
  }
  if (input.existingInvoice) {
    return {
      eligible: false,
      blockers: ["invoice_already_created"],
      invoiceId: input.existingInvoice.invoiceId,
      invoiceNumber: input.existingInvoice.invoiceNumber,
      billingStatus: input.snapshot?.billingStatus ?? "invoiced",
    };
  }
  if (input.ride.payerKind !== "company") {
    return {
      eligible: false,
      blockers: ["payer_not_company"],
      invoiceId: null,
      invoiceNumber: null,
      billingStatus: input.snapshot?.billingStatus ?? null,
    };
  }
  const eligibility = getInvoiceEligibility({
    ride: input.ride,
    snapshot: input.snapshot
      ? {
          payerType: input.snapshot.payerType,
          billingMode: input.snapshot.billingMode ?? "invoice",
          billingReference: input.snapshot.billingReference,
          billingStatus: input.snapshot.billingStatus,
        }
      : null,
  });
  return {
    eligible: eligibility.eligible,
    blockers: eligibility.blockers,
    invoiceId: null,
    invoiceNumber: null,
    billingStatus: input.snapshot?.billingStatus ?? null,
  };
}

export async function mapCompanyRideInvoiceSummaries(
  rides: RideRequest[],
): Promise<Map<string, CompanyRideInvoiceSummary>> {
  const out = new Map<string, CompanyRideInvoiceSummary>();
  const db = getDb();
  if (!db || rides.length === 0) return out;

  const rideIds = rides.map((r) => r.id).filter(Boolean);
  const existingRows =
    rideIds.length > 0
      ? await db
          .select({
            rideId: invoiceItemsTable.ride_id,
            invoiceId: invoicesTable.id,
            invoiceNumber: invoicesTable.invoice_number,
          })
          .from(invoiceItemsTable)
          .innerJoin(invoicesTable, eq(invoiceItemsTable.invoice_id, invoicesTable.id))
          .where(inArray(invoiceItemsTable.ride_id, rideIds))
      : [];

  const invoiceByRide = new Map<string, { invoiceId: string; invoiceNumber: string }>();
  for (const row of existingRows) {
    if (row.rideId) {
      invoiceByRide.set(row.rideId, { invoiceId: row.invoiceId, invoiceNumber: row.invoiceNumber });
    }
  }

  for (const ride of rides) {
    const snapshot = await getRideFinancialSnapshotByRideId(ride.id);
    const existing = invoiceByRide.get(ride.id) ?? null;
    out.set(ride.id, summarizeCompanyRideInvoice({ ride, snapshot, existingInvoice: existing }));
  }
  return out;
}

export async function createPartnerSingleRideInvoice(input: {
  ride: RideRequest;
  companyId: string;
  actorLabel: string;
  actorPanelUserId?: string | null;
}): Promise<CreatePartnerSingleRideInvoiceResult> {
  const db = getDb();
  if (!db) return { ok: false, error: "database_not_configured" };

  const ride = input.ride;
  const companyId = input.companyId.trim();
  if ((ride.companyId ?? "").trim() !== companyId) return { ok: false, error: "forbidden" };

  const meta =
    ride.partnerBookingMeta && typeof ride.partnerBookingMeta === "object"
      ? (ride.partnerBookingMeta as Record<string, unknown>)
      : {};
  if (meta.medical_ride === true) return { ok: false, error: "ride_not_medical_use_company_flow" };

  const existing = await findInvoiceByRideId(ride.id);
  if (existing) {
    return { ok: false, error: "invoice_already_created", blockers: ["invoice_already_created"] };
  }

  const snapshot = await getRideFinancialSnapshotByRideId(ride.id);
  const summary = summarizeCompanyRideInvoice({ ride, snapshot, existingInvoice: null });
  if (!summary.eligible) {
    return { ok: false, error: "ride_not_eligible_for_invoice", blockers: summary.blockers };
  }
  if (!snapshot) return { ok: false, error: "missing_financial_snapshot", blockers: ["missing_snapshot"] };

  await ensureCompanyInvoicePrefixFromKind(companyId);

  const periodDate = ridePeriodDate(ride, snapshot.calculatedAt);
  const issueDate = periodDate;
  const dueDate = addCalendarDays(issueDate, INVOICE_DUE_DAYS);
  const item = buildSingleRideItem(ride, snapshot);

  try {
    const created = await db.transaction(async (tx) => {
      const dupItem = await tx
        .select({ id: invoiceItemsTable.id })
        .from(invoiceItemsTable)
        .where(eq(invoiceItemsTable.ride_id, ride.id))
        .limit(1);
      if (dupItem[0]) return { ok: false as const, error: "invoice_already_created" };

      const out = await createPartnerMonthlyInvoiceInTx(tx, {
        companyId,
        billingPeriodStart: periodDate,
        billingPeriodEnd: periodDate,
        issueDate,
        dueDate,
        items: [item],
        status: "issued",
        actorLabel: input.actorLabel,
        allowDuplicatePeriod: true,
        metadataExtra: {
          single_ride_id: ride.id,
          source: "panel_ride_list",
          billing_reference: ride.billingReference ?? snapshot.billingReference ?? "",
        },
        notes: `Einzelfahrt ${ride.id}`,
      });
      if (!out.ok) return out;

      const prev = await tx
        .select({
          id: rideFinancialsTable.id,
          billing_status: rideFinancialsTable.billing_status,
        })
        .from(rideFinancialsTable)
        .where(eq(rideFinancialsTable.ride_id, ride.id))
        .limit(1);
      const finRow = prev[0];
      if (finRow) {
        await tx
          .update(rideFinancialsTable)
          .set({ billing_status: "invoiced", updated_at: new Date() })
          .where(eq(rideFinancialsTable.id, finRow.id));
      }

      return out;
    });

    if (!created.ok) {
      return { ok: false, error: created.error, blockers: created.error === "ride_not_eligible_for_invoice" ? summary.blockers : undefined };
    }

    await logFinancialAuditForRide({
      rideId: ride.id,
      action: "panel_single_ride_invoiced",
      newValue: {
        invoiceId: created.invoiceId,
        invoiceNumber: created.invoiceNumber,
        paymentReference: created.paymentReference,
        totalGross: created.totalGross,
      },
      actorType: "panel_user",
      actorId: input.actorPanelUserId ?? null,
    });

    return {
      ok: true,
      invoiceId: created.invoiceId,
      invoiceNumber: created.invoiceNumber,
      paymentReference: created.paymentReference,
      totalGross: created.totalGross,
    };
  } catch (e: unknown) {
    const err = e as Error;
    return { ok: false, error: err.message || "invoice_create_failed" };
  }
}
