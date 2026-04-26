import { and, count, eq, inArray, sql } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { listAccessCodesForCompany } from "./accessCodesData";
import type { CompanyRow } from "../routes/adminApi.types";
import { findCompanyById, getCompanyKpis } from "./adminData";
import { listAdminTaxiFleetDriverRows } from "./fleetDriverReadiness";
import { listFleetVehiclesForCompany } from "./fleetVehiclesData";
import { listPanelAuditForCompany, type PanelAuditLogRow } from "./panelAuditData";
import { listRidesForCompany } from "./ridesData";
import { rideFinancialsTable, ridesTable, settlementsTable } from "./schema";

const OPEN_RIDE_STATUSES = ["pending", "accepted", "arrived", "in_progress"] as const;
const ACTIVE_RIDE_STATUSES = ["accepted", "arrived", "in_progress"] as const;
const SETTLEMENT_OPEN = ["draft", "issued", "approved"] as const;

function n(v: unknown): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

function rideRevenueAmount(r: { finalFare: number | null; estimatedFare: number }): number {
  if (r.finalFare != null && Number.isFinite(r.finalFare)) return r.finalFare;
  return r.estimatedFare;
}

export type CompanyMandateReadRides = {
  total: number;
  openPipeline: number;
  active: number;
  completed: number;
  cancelled: number;
  rejected: number;
  /** Abgeschlossene: Summe Brutto-Fahrpreis (final oder geschätzt). */
  revenueCompletedGross: number;
  /** Krankenfahrten (Fahrtart), ohne medizinische Inhalte. */
  medicalRides: number;
  /** Zahler Krankenkasse/Insurance (Zählung), ohne Diagnosen. */
  insurancePayerRides: number;
};

export type CompanyMandateReadFinancials = {
  openPlatformCommissionEur: number;
  openSettlementsCount: number;
};

export type CompanyMandateTaxiBlock = {
  driversTotal: number;
  driversReady: number;
  driversSuspended: number;
  vehiclesTotal: number;
  vehiclesPendingReview: number;
};

export type CompanyMandateHotelBlock = {
  accessCodesActive: number;
  accessCodeRedemptions: number;
};

export type CompanyMandateInsurerBlock = {
  /** Nur Metadaten / Konfig, keine personenbezogenen Krankheitsdaten. */
  insurerConfigKeys: string[];
  medicalRides: number;
  insurancePayerRides: number;
  /** Stichproben: `billing_reference` von Krankenfahrten (letzte 5, ohne klinische Texte). */
  sampleBillingReferences: string[];
};

export type CompanyMandateDocuments = {
  gewerbeFilePresent: boolean;
  insuranceFilePresent: boolean;
};

export type CompanyMandateRead = {
  company: CompanyRow;
  kpi: Awaited<ReturnType<typeof getCompanyKpis>>;
  rides: CompanyMandateReadRides;
  financials: CompanyMandateReadFinancials;
  taxi: CompanyMandateTaxiBlock | null;
  hotel: CompanyMandateHotelBlock | null;
  insurer: CompanyMandateInsurerBlock | null;
  documents: CompanyMandateDocuments;
  panelAudit: PanelAuditLogRow[];
};

async function memPathRidesSummary(companyId: string): Promise<{
  rides: CompanyMandateReadRides;
  sampleBillingRefs: string[];
}> {
  const rides = await listRidesForCompany(companyId);
  const by = (s: string) => rides.filter((r) => r.status === s).length;
  const openPipeline = rides.filter((r) => (OPEN_RIDE_STATUSES as readonly string[]).includes(r.status)).length;
  const active = rides.filter((r) => (ACTIVE_RIDE_STATUSES as readonly string[]).includes(r.status)).length;
  const completed = by("completed");
  const medicalRides = rides.filter((r) => r.rideKind === "medical").length;
  const insurancePayerRides = rides.filter((r) => r.payerKind === "insurance").length;
  const revenueCompletedGross = rides
    .filter((r) => r.status === "completed")
    .reduce((s, r) => s + rideRevenueAmount({ finalFare: r.finalFare ?? null, estimatedFare: r.estimatedFare }), 0);
  const sampleBillingRefs = rides
    .filter((r) => r.rideKind === "medical" && r.billingReference?.trim())
    .map((r) => String(r.billingReference).trim())
    .slice(0, 5);
  return {
    rides: {
      total: rides.length,
      openPipeline,
      active,
      completed,
      cancelled: by("cancelled"),
      rejected: by("rejected"),
      revenueCompletedGross,
      medicalRides,
      insurancePayerRides,
    },
    sampleBillingRefs,
  };
}

/**
 * Lese-Modell für Plattform-Mandantenzentrale (Admin) — ein Endpunkt, kein PII/Keine Diagnosen.
 */
export async function getCompanyMandateRead(companyId: string): Promise<CompanyMandateRead | null> {
  const company = await findCompanyById(companyId);
  if (!company) return null;

  const kpi = await getCompanyKpis(companyId);

  if (!isPostgresConfigured() || !getDb()) {
    const { rides: rsum, sampleBillingRefs } = await memPathRidesSummary(companyId);
    return {
      company,
      kpi,
      rides: rsum,
      financials: { openPlatformCommissionEur: 0, openSettlementsCount: 0 },
      taxi: company.company_kind === "taxi" ? emptyTaxi() : null,
      hotel: company.company_kind === "hotel" ? emptyHotel() : null,
      insurer:
        company.company_kind === "insurer" || company.company_kind === "medical"
          ? emptyInsurer(company, sampleBillingRefs)
          : null,
      documents: {
        gewerbeFilePresent: Boolean(company.compliance_gewerbe_storage_key),
        insuranceFilePresent: Boolean(company.compliance_insurance_storage_key),
      },
      panelAudit: [],
    };
  }

  const db = getDb();
  if (!db) {
    const { rides: rsum, sampleBillingRefs } = await memPathRidesSummary(companyId);
    return {
      company,
      kpi,
      rides: rsum,
      financials: { openPlatformCommissionEur: 0, openSettlementsCount: 0 },
      taxi: company.company_kind === "taxi" ? emptyTaxi() : null,
      hotel: company.company_kind === "hotel" ? emptyHotel() : null,
      insurer:
        company.company_kind === "insurer" || company.company_kind === "medical"
          ? emptyInsurer(company, sampleBillingRefs)
          : null,
      documents: {
        gewerbeFilePresent: Boolean(company.compliance_gewerbe_storage_key),
        insuranceFilePresent: Boolean(company.compliance_insurance_storage_key),
      },
      panelAudit: [],
    };
  }

  const [statusRows, completedRevRow, finRow, settlementOpenRow, medicalN, insuranceN, sampleBillingRefRows] =
    await Promise.all([
      db
        .select({ status: ridesTable.status, n: count() })
        .from(ridesTable)
        .where(eq(ridesTable.company_id, companyId))
        .groupBy(ridesTable.status),
      db
        .select({
          rev: sql<string>`coalesce(sum(coalesce(${ridesTable.final_fare}, ${ridesTable.estimated_fare})), 0)`,
        })
        .from(ridesTable)
        .where(and(eq(ridesTable.company_id, companyId), eq(ridesTable.status, "completed"))),
      db
        .select({
          openComm: sql<string>`coalesce(sum(case when ${rideFinancialsTable.settlement_status} <> 'paid_out' then ${rideFinancialsTable.commission_amount} else 0 end), 0)`,
        })
        .from(rideFinancialsTable)
        .where(eq(rideFinancialsTable.partner_company_id, companyId)),
      db
        .select({ n: count() })
        .from(settlementsTable)
        .where(
          and(
            eq(settlementsTable.company_id, companyId),
            inArray(settlementsTable.status, [...SETTLEMENT_OPEN]),
          )!,
        ),
      db
        .select({ n: count() })
        .from(ridesTable)
        .where(and(eq(ridesTable.company_id, companyId), eq(ridesTable.ride_kind, "medical"))!),
      db
        .select({ n: count() })
        .from(ridesTable)
        .where(and(eq(ridesTable.company_id, companyId), eq(ridesTable.payer_kind, "insurance"))!),
      db
        .select({ br: ridesTable.billing_reference })
        .from(ridesTable)
        .where(
          and(
            eq(ridesTable.company_id, companyId),
            eq(ridesTable.ride_kind, "medical"),
            sql`trim(coalesce(${ridesTable.billing_reference}, '')) <> ''`,
          )!,
        )
        .limit(5),
    ]);

  const st: Record<string, number> = {};
  let total = 0;
  for (const row of statusRows) {
    const c = Number(row.n ?? 0);
    st[String(row.status)] = c;
    total += c;
  }
  const openPipeline = (OPEN_RIDE_STATUSES as readonly string[]).reduce(
    (acc, s) => acc + (st[s] ?? 0),
    0,
  );
  const active = (ACTIVE_RIDE_STATUSES as readonly string[]).reduce(
    (acc, s) => acc + (st[s] ?? 0),
    0,
  );

  const ridesSummary: CompanyMandateReadRides = {
    total,
    openPipeline,
    active,
    completed: st.completed ?? 0,
    cancelled: st.cancelled ?? 0,
    rejected: st.rejected ?? 0,
    revenueCompletedGross: n(completedRevRow[0]?.rev),
    medicalRides: Number(medicalN[0]?.n ?? 0),
    insurancePayerRides: Number(insuranceN[0]?.n ?? 0),
  };

  const financials: CompanyMandateReadFinancials = {
    openPlatformCommissionEur: n(finRow[0]?.openComm),
    openSettlementsCount: Number(settlementOpenRow[0]?.n ?? 0),
  };

  const kind = company.company_kind;
  let taxi: CompanyMandateTaxiBlock | null = null;
  if (kind === "taxi") {
    const [drivers, vehicles] = await Promise.all([
      listAdminTaxiFleetDriverRows(companyId),
      listFleetVehiclesForCompany(companyId),
    ]);
    const driversTotal = drivers.length;
    const driversReady = drivers.filter((d) => d.readiness?.ready).length;
    const driversSuspended = drivers.filter(
      (d) => d.accessStatus === "suspended" || !d.isActive,
    ).length;
    const vehiclesTotal = vehicles.length;
    const vehiclesPendingReview = vehicles.filter(
      (v) => v.approvalStatus === "draft" || v.approvalStatus === "pending_approval",
    ).length;
    taxi = {
      driversTotal,
      driversReady,
      driversSuspended,
      vehiclesTotal,
      vehiclesPendingReview,
    };
  }

  let hotel: CompanyMandateHotelBlock | null = null;
  if (kind === "hotel") {
    const codes = await listAccessCodesForCompany(companyId);
    const accessCodesActive = codes.filter((c) => c.isActive).length;
    const accessCodeRedemptions = codes.reduce((s, c) => s + (c.usesCount ?? 0), 0);
    hotel = { accessCodesActive, accessCodeRedemptions };
  }

  let insurer: CompanyMandateInsurerBlock | null = null;
  if (kind === "insurer" || kind === "medical") {
    const keys = Object.keys(company.insurer_permissions || {}).filter(
      (k) => k && k !== "diagnoses" && k !== "diagnosis",
    );
    insurer = {
      insurerConfigKeys: keys.slice(0, 24),
      medicalRides: ridesSummary.medicalRides,
      insurancePayerRides: ridesSummary.insurancePayerRides,
      sampleBillingReferences: sampleBillingRefRows
        .map((r) => String(r.br || "").trim())
        .filter(Boolean)
        .slice(0, 5),
    };
  }

  const panelAudit = await listPanelAuditForCompany(companyId, { limit: 40 });

  return {
    company,
    kpi,
    rides: ridesSummary,
    financials,
    taxi,
    hotel,
    insurer,
    documents: {
      gewerbeFilePresent: Boolean(company.compliance_gewerbe_storage_key),
      insuranceFilePresent: Boolean(company.compliance_insurance_storage_key),
    },
    panelAudit,
  };
}

function emptyTaxi(): CompanyMandateTaxiBlock {
  return { driversTotal: 0, driversReady: 0, driversSuspended: 0, vehiclesTotal: 0, vehiclesPendingReview: 0 };
}
function emptyHotel(): CompanyMandateHotelBlock {
  return { accessCodesActive: 0, accessCodeRedemptions: 0 };
}
function emptyInsurer(company: CompanyRow, sampleBillingReferences: string[]): CompanyMandateInsurerBlock {
  const keys = Object.keys(company.insurer_permissions || {}).filter(
    (k) => k && k !== "diagnoses" && k !== "diagnosis",
  );
  return {
    insurerConfigKeys: keys,
    medicalRides: 0,
    insurancePayerRides: 0,
    sampleBillingReferences,
  };
}

