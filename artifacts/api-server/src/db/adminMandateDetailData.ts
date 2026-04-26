import { and, count, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb, isPostgresConfigured } from "./client";
import { listAccessCodesForCompany } from "./accessCodesData";
import { logger } from "../lib/logger";
import type { CompanyRow } from "../routes/adminApi.types";
import { findCompanyById, getCompanyKpis, type CompanyKpis } from "./adminData";
import { listAdminTaxiFleetDriverRows, type AdminTaxiFleetDriverRow } from "./fleetDriverReadiness";
import { listFleetDriversForCompany } from "./fleetDriversData";
import { listFleetVehiclesForCompany } from "./fleetVehiclesData";
import { listPanelAuditForCompany, type PanelAuditLogRow } from "./panelAuditData";
import { listRidesAdminPage, listRidesForCompany } from "./ridesData";
import { billingAccountsTable, rideFinancialsTable, ridesTable, settlementsTable } from "./schema";

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

function utcMonthBounds(d = new Date()): { monthStart: Date; nextMonthStart: Date } {
  return {
    monthStart: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0)),
    nextMonthStart: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0)),
  };
}

function isPScheinIssue(d: AdminTaxiFleetDriverRow): boolean {
  return d.readiness.blockReasons.some(
    (b) =>
      b.code === "p_schein_date_missing" ||
      b.code === "p_schein_expired" ||
      b.code === "p_schein_doc_missing",
  );
}

async function buildMandateRecentRides(companyId: string): Promise<MandateRecentRide[]> {
  const rows = await listRidesAdminPage({ companyId, sortCreated: "desc" }, 20, 0);
  const drivers = await listFleetDriversForCompany(companyId);
  const byId = new Map(drivers.map((d) => [d.id, d]));
  return rows.map((r) => {
    let driverLabel: string | null = null;
    if (r.driverId) {
      const fd = byId.get(r.driverId);
      if (fd) {
        const name = `${fd.firstName} ${fd.lastName}`.trim();
        driverLabel = name || fd.email || r.driverId;
      } else {
        const id = String(r.driverId);
        driverLabel = id.length > 32 ? `${id.slice(0, 12)}…` : id;
      }
    }
    const amount = r.finalFare != null && Number.isFinite(r.finalFare) ? r.finalFare : r.estimatedFare;
    const meta = r.partnerBookingMeta;
    const costCenterId = meta?.insurer?.costCenterId?.trim() || null;
    return {
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      fromLabel: (r.from || "").trim() || "—",
      toLabel: (r.to || "").trim() || "—",
      amountEur: amount,
      paymentMethod: r.paymentMethod,
      driverLabel,
      billingReference: r.billingReference?.trim() || null,
      costCenterId,
      rideKind: r.rideKind,
      payerKind: r.payerKind,
    };
  });
}

async function memMandateRecentRides(companyId: string): Promise<MandateRecentRide[]> {
  const all = await listRidesForCompany(companyId);
  const sorted = [...all].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return sorted.slice(0, 20).map((r) => {
    const amount = r.finalFare != null && Number.isFinite(r.finalFare) ? r.finalFare : r.estimatedFare;
    const meta = r.partnerBookingMeta;
    return {
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      fromLabel: (r.from || "").trim() || "—",
      toLabel: (r.to || "").trim() || "—",
      amountEur: amount,
      paymentMethod: r.paymentMethod,
      driverLabel: r.driverId ? String(r.driverId) : null,
      billingReference: r.billingReference?.trim() || null,
      costCenterId: meta?.insurer?.costCenterId?.trim() || null,
      rideKind: r.rideKind,
      payerKind: r.payerKind,
    };
  });
}

export type CompanyMandateReadRides = {
  total: number;
  /** Fahrten mit `created_at` im laufenden UTC-Kalendermonat. */
  ridesCountCurrentMonth: number;
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
  /** Summe Fahrpreise abgeschlossener Fahrten (gesamt, analog `revenueCompletedGross`). */
  revenueCompletedGrossAllTime: number;
  /** Abgeschlossene Fahrten: Brutto im laufenden Monat (UTC), analog KPI-Kacheln. */
  revenueCompletedGrossCurrentMonth: number;
  openPlatformCommissionEur: number;
  /** Summe `commission_amount` je Zeile, `settlement_status = paid_out`. */
  paidPlatformCommissionEur: number;
  /** Summe aller `commission_amount` für den Mandanten. */
  totalPlatformCommissionEur: number;
  /** Onroda-Provision (Fahrten nach `rides.created_at` im laufenden UTC-Monat). */
  onrodaCommissionCurrentMonthEur: number;
  openSettlementsCount: number;
};

export type CompanyMandateTaxiBlock = {
  driversTotal: number;
  /** `is_active` und Zugang „active“ (nicht suspendiert). */
  driversActive: number;
  driversReady: number;
  /** `access_status = suspended`. */
  driversSuspended: number;
  /** P-Schein: Nachweis/ Datum / Ablauf laut Einsatzbereitschafts-Check. */
  pScheinDeficient: number;
  vehiclesTotal: number;
  /** `approval_status = approved`. */
  vehiclesApproved: number;
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
  /** Unternehmens-Taxikonzession / Nummer in Stammdaten, nicht Fahrzeuge. */
  companyConcessionTextPresent: boolean;
  pScheinDriversWithDocument: number;
  pScheinDriversWithIssue: number;
  /** Fahrzeuge mit mindestens einem Eintrag in `vehicle_documents`. */
  vehiclesWithUploadedDocs: number;
  vehiclesTotalForDocs: number;
};

/** Letzte Fahrten für die Mandantenzentrale: keine Diagnosen, Krankenkasse: Referenz/Kostenstelle. */
export type MandateRecentRide = {
  id: string;
  status: string;
  createdAt: string;
  fromLabel: string;
  toLabel: string;
  amountEur: number;
  paymentMethod: string;
  driverLabel: string | null;
  billingReference: string | null;
  costCenterId: string | null;
  rideKind: string;
  payerKind: string;
};

const KPI_FALLBACK: CompanyKpis = {
  monthlyRevenue: 0,
  openRides: 0,
  voucherLimitAvailable: null,
};

export type CompanyMandateRead = {
  company: CompanyRow;
  kpi: CompanyKpis;
  rides: CompanyMandateReadRides;
  financials: CompanyMandateReadFinancials;
  /** Erste aktive `billing_accounts`-Zeile; sonst `null` (kein Doppel-Import neuer Logik). */
  billingAccountEmail: string | null;
  /** Letzte 20 Fahrten, gleiche Leseregeln wie Listen-API. */
  recentRides: MandateRecentRide[];
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
  const { monthStart, nextMonthStart } = utcMonthBounds();
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
  const ridesCountCurrentMonth = rides.filter((r) => {
    const t = new Date(r.createdAt).getTime();
    return t >= monthStart.getTime() && t < nextMonthStart.getTime();
  }).length;
  return {
    rides: {
      total: rides.length,
      ridesCountCurrentMonth,
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

function memDocumentsBase(company: CompanyRow, taxi: { drivers: AdminTaxiFleetDriverRow[]; vehicles: Awaited<ReturnType<typeof listFleetVehiclesForCompany>> } | null): CompanyMandateDocuments {
  if (!taxi) {
    return {
      gewerbeFilePresent: Boolean(company.compliance_gewerbe_storage_key),
      insuranceFilePresent: Boolean(company.compliance_insurance_storage_key),
      companyConcessionTextPresent: Boolean(company.concession_number?.trim()),
      pScheinDriversWithDocument: 0,
      pScheinDriversWithIssue: 0,
      vehiclesWithUploadedDocs: 0,
      vehiclesTotalForDocs: 0,
    };
  }
  const { drivers, vehicles } = taxi;
  return {
    gewerbeFilePresent: Boolean(company.compliance_gewerbe_storage_key),
    insuranceFilePresent: Boolean(company.compliance_insurance_storage_key),
    companyConcessionTextPresent: Boolean(company.concession_number?.trim()),
    pScheinDriversWithDocument: drivers.filter((d) => d.pScheinDocPresent).length,
    pScheinDriversWithIssue: drivers.filter((d) => isPScheinIssue(d)).length,
    vehiclesWithUploadedDocs: vehicles.filter((v) => v.vehicleDocuments.length > 0).length,
    vehiclesTotalForDocs: vehicles.length,
  };
}

function memFinancialsForMandate(rsum: CompanyMandateReadRides, kpi: CompanyKpis): CompanyMandateReadFinancials {
  return {
    revenueCompletedGrossAllTime: rsum.revenueCompletedGross,
    revenueCompletedGrossCurrentMonth: kpi.monthlyRevenue,
    openPlatformCommissionEur: 0,
    paidPlatformCommissionEur: 0,
    totalPlatformCommissionEur: 0,
    onrodaCommissionCurrentMonthEur: 0,
    openSettlementsCount: 0,
  };
}

/**
 * Lese-Modell für Plattform-Mandantenzentrale (Admin) — ein Endpunkt, kein PII/Keine Diagnosen.
 */
export async function getCompanyMandateRead(companyId: string): Promise<CompanyMandateRead | null> {
  const company = await findCompanyById(companyId);
  if (!company) return null;

  let kpi: CompanyKpis;
  try {
    kpi = await getCompanyKpis(companyId);
  } catch (err) {
    logger.error({ err, companyId }, "getCompanyKpis failed in mandate-read; using zero KPIs");
    kpi = KPI_FALLBACK;
  }

  if (!isPostgresConfigured() || !getDb()) {
    const { rides: rsum, sampleBillingRefs } = await memPathRidesSummary(companyId);
    const [recentRides, taxiTup] = await Promise.all([
      memMandateRecentRides(companyId),
      company.company_kind === "taxi"
        ? Promise.all([listAdminTaxiFleetDriverRows(companyId), listFleetVehiclesForCompany(companyId)]).then(
            ([drivers, vehicles]) => ({ drivers, vehicles }),
          )
        : Promise.resolve(null),
    ]);
    return {
      company,
      kpi,
      rides: rsum,
      financials: memFinancialsForMandate(rsum, kpi),
      billingAccountEmail: null,
      recentRides,
      taxi:
        company.company_kind === "taxi" && taxiTup
          ? (() => {
              const { drivers, vehicles } = taxiTup;
              return {
                driversTotal: drivers.length,
                driversActive: drivers.filter((d) => d.isActive && d.accessStatus === "active").length,
                driversReady: drivers.filter((d) => d.readiness?.ready).length,
                driversSuspended: drivers.filter((d) => d.accessStatus === "suspended").length,
                pScheinDeficient: drivers.filter((d) => isPScheinIssue(d)).length,
                vehiclesTotal: vehicles.length,
                vehiclesApproved: vehicles.filter((v) => v.approvalStatus === "approved").length,
                vehiclesPendingReview: vehicles.filter(
                  (v) => v.approvalStatus === "draft" || v.approvalStatus === "pending_approval",
                ).length,
              };
            })()
          : company.company_kind === "taxi"
            ? emptyTaxi()
            : null,
      hotel: company.company_kind === "hotel" ? emptyHotel() : null,
      insurer:
        company.company_kind === "insurer" || company.company_kind === "medical"
          ? emptyInsurer(company, sampleBillingRefs)
          : null,
      documents: memDocumentsBase(company, taxiTup),
      panelAudit: [],
    };
  }

  const db = getDb();
  if (!db) {
    const { rides: rsum, sampleBillingRefs } = await memPathRidesSummary(companyId);
    const [recentRides, taxiTup] = await Promise.all([
      memMandateRecentRides(companyId),
      company.company_kind === "taxi"
        ? Promise.all([listAdminTaxiFleetDriverRows(companyId), listFleetVehiclesForCompany(companyId)]).then(
            ([d, v]) => ({ drivers: d, vehicles: v }),
          )
        : Promise.resolve(null),
    ]);
    return {
      company,
      kpi,
      rides: rsum,
      financials: memFinancialsForMandate(rsum, kpi),
      billingAccountEmail: null,
      recentRides,
      taxi:
        company.company_kind === "taxi" && taxiTup
          ? (() => {
              const { drivers, vehicles } = taxiTup;
              return {
                driversTotal: drivers.length,
                driversActive: drivers.filter((d) => d.isActive && d.accessStatus === "active").length,
                driversReady: drivers.filter((d) => d.readiness?.ready).length,
                driversSuspended: drivers.filter((d) => d.accessStatus === "suspended").length,
                pScheinDeficient: drivers.filter((d) => isPScheinIssue(d)).length,
                vehiclesTotal: vehicles.length,
                vehiclesApproved: vehicles.filter((v) => v.approvalStatus === "approved").length,
                vehiclesPendingReview: vehicles.filter(
                  (v) => v.approvalStatus === "draft" || v.approvalStatus === "pending_approval",
                ).length,
              };
            })()
          : company.company_kind === "taxi"
            ? emptyTaxi()
            : null,
      hotel: company.company_kind === "hotel" ? emptyHotel() : null,
      insurer:
        company.company_kind === "insurer" || company.company_kind === "medical"
          ? emptyInsurer(company, sampleBillingRefs)
          : null,
      documents: memDocumentsBase(company, taxiTup),
      panelAudit: [],
    };
  }

  const { monthStart, nextMonthStart } = utcMonthBounds();
  const [
    statusRows,
    completedRevRow,
    finAggRow,
    settlementOpenRow,
    medicalN,
    insuranceN,
    sampleBillingRefRows,
    ridesInMonthRow,
    commMonthRow,
    billingRow,
  ] = await Promise.all([
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
          paidComm: sql<string>`coalesce(sum(case when ${rideFinancialsTable.settlement_status} = 'paid_out' then ${rideFinancialsTable.commission_amount} else 0 end), 0)`,
          totalComm: sql<string>`coalesce(sum(${rideFinancialsTable.commission_amount}), 0)`,
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
      db
        .select({
          n: count(),
          monthCompletedRev: sql<string>`coalesce(sum(case when ${ridesTable.status} = 'completed' then coalesce(${ridesTable.final_fare}, ${ridesTable.estimated_fare}) else 0 end), 0)`,
        })
        .from(ridesTable)
        .where(
          and(
            eq(ridesTable.company_id, companyId),
            gte(ridesTable.created_at, monthStart),
            lt(ridesTable.created_at, nextMonthStart),
          )!,
        ),
      db
        .select({
          s: sql<string>`coalesce(sum(${rideFinancialsTable.commission_amount}), 0)`,
        })
        .from(rideFinancialsTable)
        .innerJoin(ridesTable, eq(rideFinancialsTable.ride_id, ridesTable.id))
        .where(
          and(
            eq(rideFinancialsTable.partner_company_id, companyId),
            gte(ridesTable.created_at, monthStart),
            lt(ridesTable.created_at, nextMonthStart),
          )!,
        ),
      db
        .select({ email: billingAccountsTable.billing_email })
        .from(billingAccountsTable)
        .where(
          and(eq(billingAccountsTable.company_id, companyId), eq(billingAccountsTable.is_active, true))!,
        )
        .limit(1),
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
    ridesCountCurrentMonth: Number(ridesInMonthRow[0]?.n ?? 0),
    openPipeline,
    active,
    completed: st.completed ?? 0,
    cancelled: st.cancelled ?? 0,
    rejected: st.rejected ?? 0,
    revenueCompletedGross: n(completedRevRow[0]?.rev),
    medicalRides: Number(medicalN[0]?.n ?? 0),
    insurancePayerRides: Number(insuranceN[0]?.n ?? 0),
  };

  const monthCompletedRev = n(ridesInMonthRow[0]?.monthCompletedRev);
  const financials: CompanyMandateReadFinancials = {
    revenueCompletedGrossAllTime: ridesSummary.revenueCompletedGross,
    revenueCompletedGrossCurrentMonth: monthCompletedRev,
    openPlatformCommissionEur: n(finAggRow[0]?.openComm),
    paidPlatformCommissionEur: n(finAggRow[0]?.paidComm),
    totalPlatformCommissionEur: n(finAggRow[0]?.totalComm),
    onrodaCommissionCurrentMonthEur: n(commMonthRow[0]?.s),
    openSettlementsCount: Number(settlementOpenRow[0]?.n ?? 0),
  };

  const kind = company.company_kind;
  let taxi: CompanyMandateTaxiBlock | null = null;
  let taxiForDocs: { drivers: AdminTaxiFleetDriverRow[]; vehicles: Awaited<ReturnType<typeof listFleetVehiclesForCompany>> } | null = null;
  if (kind === "taxi") {
    const [drivers, vehicles] = await Promise.all([
      listAdminTaxiFleetDriverRows(companyId),
      listFleetVehiclesForCompany(companyId),
    ]);
    taxiForDocs = { drivers, vehicles };
    const driversTotal = drivers.length;
    const driversActive = drivers.filter((d) => d.isActive && d.accessStatus === "active").length;
    const driversReady = drivers.filter((d) => d.readiness?.ready).length;
    const driversSuspended = drivers.filter((d) => d.accessStatus === "suspended").length;
    const pScheinDeficient = drivers.filter((d) => isPScheinIssue(d)).length;
    const vehiclesTotal = vehicles.length;
    const vehiclesApproved = vehicles.filter((v) => v.approvalStatus === "approved").length;
    const vehiclesPendingReview = vehicles.filter(
      (v) => v.approvalStatus === "draft" || v.approvalStatus === "pending_approval",
    ).length;
    taxi = {
      driversTotal,
      driversActive,
      driversReady,
      driversSuspended,
      pScheinDeficient,
      vehiclesTotal,
      vehiclesApproved,
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

  const [panelAudit, recentRides] = await Promise.all([
    listPanelAuditForCompany(companyId, { limit: 40 }),
    buildMandateRecentRides(companyId),
  ]);

  const billingAccountEmail = (() => {
    const raw = billingRow[0]?.email;
    if (raw == null || typeof raw !== "string") return null;
    const t = raw.trim();
    return t || null;
  })();

  return {
    company,
    kpi,
    rides: ridesSummary,
    financials,
    billingAccountEmail,
    recentRides,
    taxi,
    hotel,
    insurer,
    documents: memDocumentsBase(company, taxiForDocs),
    panelAudit,
  };
}

function emptyTaxi(): CompanyMandateTaxiBlock {
  return {
    driversTotal: 0,
    driversActive: 0,
    driversReady: 0,
    driversSuspended: 0,
    pScheinDeficient: 0,
    vehiclesTotal: 0,
    vehiclesApproved: 0,
    vehiclesPendingReview: 0,
  };
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

