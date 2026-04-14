import { randomUUID } from "node:crypto";
import { and, count, eq, gte, isNotNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { getDb } from "./client";
import {
  adminCompaniesTable,
  accessCodesTable,
  fareAreasTable,
  panelUsersTable,
  ridesTable,
} from "./schema";
import { normalizeStoredPanelModules } from "../domain/panelModules";
import type { AdminDashboardStats, CompanyRow, FareAreaRow } from "../routes/adminApi.types";

const seedCompanies: CompanyRow[] = [
  {
    id: "co-demo-1",
    name: "Demo Taxi GmbH",
    contact_name: "",
    email: "demo@example.com",
    phone: "+49 711 000000",
    address_line1: "",
    address_line2: "",
    postal_code: "",
    city: "",
    country: "",
    vat_id: "",
    company_kind: "taxi",
    tax_id: "",
    concession_number: "",
    compliance_gewerbe_storage_key: null,
    compliance_insurance_storage_key: null,
    legal_form: "",
    owner_name: "",
    billing_name: "",
    billing_address_line1: "",
    billing_address_line2: "",
    billing_postal_code: "",
    billing_city: "",
    billing_country: "",
    bank_iban: "",
    bank_bic: "",
    support_email: "",
    dispo_phone: "",
    logo_url: "",
    opening_hours: "",
    business_notes: "",
    verification_status: "verified",
    compliance_status: "compliant",
    contract_status: "active",
    is_blocked: false,
    max_drivers: 100,
    max_vehicles: 100,
    fare_permissions: {},
    insurer_permissions: {},
    area_assignments: [],
    is_active: true,
    is_priority_company: true,
    priority_for_live_rides: true,
    priority_for_reservations: false,
    priority_price_threshold: 25,
    priority_timeout_seconds: 90,
    release_radius_km: 12,
    panel_modules: [
      "overview",
      "rides_list",
      "rides_create",
      "company_profile",
      "team",
      "access_codes",
      "billing",
      "taxi_fleet",
    ],
  },
  {
    id: "co-demo-2",
    name: "Musterfahrdienst",
    contact_name: "",
    email: "kontakt@muster.de",
    phone: "+49 711 111111",
    address_line1: "",
    address_line2: "",
    postal_code: "",
    city: "",
    country: "",
    vat_id: "",
    company_kind: "general",
    tax_id: "",
    concession_number: "",
    compliance_gewerbe_storage_key: null,
    compliance_insurance_storage_key: null,
    legal_form: "",
    owner_name: "",
    billing_name: "",
    billing_address_line1: "",
    billing_address_line2: "",
    billing_postal_code: "",
    billing_city: "",
    billing_country: "",
    bank_iban: "",
    bank_bic: "",
    support_email: "",
    dispo_phone: "",
    logo_url: "",
    opening_hours: "",
    business_notes: "",
    verification_status: "pending",
    compliance_status: "pending",
    contract_status: "inactive",
    is_blocked: false,
    max_drivers: 100,
    max_vehicles: 100,
    fare_permissions: {},
    insurer_permissions: {},
    area_assignments: [],
    is_active: true,
    is_priority_company: false,
    priority_for_live_rides: false,
    priority_for_reservations: false,
    priority_price_threshold: 18,
    priority_timeout_seconds: 120,
    release_radius_km: 8,
    panel_modules: null,
  },
];

const seedFareAreas: FareAreaRow[] = [
  {
    id: "fa-1",
    name: "Stuttgart Zentrum",
    ruleType: "official_metered_tariff",
    isRequiredArea: "Ja",
    fixedPriceAllowed: "Prüfen",
    status: "aktiv",
    isDefault: true,
    baseFareEur: 4.3,
    rateFirstKmEur: 3.0,
    rateAfterKmEur: 2.5,
    thresholdKm: 4,
    waitingPerHourEur: 38,
    serviceFeeEur: 0,
    onrodaBaseFareEur: 3.5,
    onrodaPerKmEur: 2.2,
    onrodaMinFareEur: 0,
    manualFixedPriceEur: null,
  },
];

let memCompanies = [...seedCompanies];
let memFareAreas = [...seedFareAreas];

function rowToCompany(r: typeof adminCompaniesTable.$inferSelect): CompanyRow {
  return {
    id: r.id,
    name: r.name,
    contact_name: r.contact_name,
    email: r.email,
    phone: r.phone,
    address_line1: r.address_line1,
    address_line2: r.address_line2,
    postal_code: r.postal_code,
    city: r.city,
    country: r.country,
    vat_id: r.vat_id,
    company_kind: r.company_kind ?? "general",
    tax_id: r.tax_id ?? "",
    concession_number: r.concession_number ?? "",
    compliance_gewerbe_storage_key: r.compliance_gewerbe_storage_key ?? null,
    compliance_insurance_storage_key: r.compliance_insurance_storage_key ?? null,
    legal_form: r.legal_form ?? "",
    owner_name: r.owner_name ?? "",
    billing_name: r.billing_name ?? "",
    billing_address_line1: r.billing_address_line1 ?? "",
    billing_address_line2: r.billing_address_line2 ?? "",
    billing_postal_code: r.billing_postal_code ?? "",
    billing_city: r.billing_city ?? "",
    billing_country: r.billing_country ?? "",
    bank_iban: r.bank_iban ?? "",
    bank_bic: r.bank_bic ?? "",
    support_email: r.support_email ?? "",
    dispo_phone: r.dispo_phone ?? "",
    logo_url: r.logo_url ?? "",
    opening_hours: r.opening_hours ?? "",
    business_notes: r.business_notes ?? "",
    verification_status: r.verification_status ?? "pending",
    compliance_status: r.compliance_status ?? "pending",
    contract_status: r.contract_status ?? "inactive",
    is_blocked: r.is_blocked ?? false,
    max_drivers: r.max_drivers ?? 100,
    max_vehicles: r.max_vehicles ?? 100,
    fare_permissions: (r.fare_permissions as Record<string, unknown> | null) ?? {},
    insurer_permissions: (r.insurer_permissions as Record<string, unknown> | null) ?? {},
    area_assignments: (r.area_assignments as string[] | null) ?? [],
    is_active: r.is_active,
    is_priority_company: r.is_priority_company,
    priority_for_live_rides: r.priority_for_live_rides,
    priority_for_reservations: r.priority_for_reservations,
    priority_price_threshold: r.priority_price_threshold,
    priority_timeout_seconds: r.priority_timeout_seconds,
    release_radius_km: r.release_radius_km,
    panel_modules: normalizeStoredPanelModules(r.panel_modules ?? null) ?? null,
  };
}

function rowToFareArea(r: typeof fareAreasTable.$inferSelect): FareAreaRow {
  return {
    id: r.id,
    name: r.name,
    ruleType: r.rule_type,
    isRequiredArea: r.is_required_area,
    fixedPriceAllowed: r.fixed_price_allowed,
    status: r.status,
    isDefault: r.is_default,
    baseFareEur: r.base_fare_eur,
    rateFirstKmEur: r.rate_first_km_eur,
    rateAfterKmEur: r.rate_after_km_eur,
    thresholdKm: r.threshold_km,
    waitingPerHourEur: r.waiting_per_hour_eur,
    serviceFeeEur: r.service_fee_eur,
    onrodaBaseFareEur: r.onroda_base_fare_eur,
    onrodaPerKmEur: r.onroda_per_km_eur,
    onrodaMinFareEur: r.onroda_min_fare_eur,
    manualFixedPriceEur: r.manual_fixed_price_eur ?? null,
  };
}

export type PublicFareProfile = {
  areaId: string | null;
  areaName: string;
  baseFareEur: number;
  rateFirstKmEur: number;
  rateAfterKmEur: number;
  thresholdKm: number;
  waitingPerHourEur: number;
  serviceFeeEur: number;
  onrodaBaseFareEur: number;
  onrodaPerKmEur: number;
  onrodaMinFareEur: number;
  manualFixedPriceEur: number | null;
};

function asMoney(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

export async function getPublicFareProfile(): Promise<PublicFareProfile> {
  const defaults: PublicFareProfile = {
    areaId: null,
    areaName: "Standard",
    baseFareEur: 4.3,
    rateFirstKmEur: 3.0,
    rateAfterKmEur: 2.5,
    thresholdKm: 4,
    waitingPerHourEur: 38,
    serviceFeeEur: 0,
    onrodaBaseFareEur: 3.5,
    onrodaPerKmEur: 2.2,
    onrodaMinFareEur: 0,
    manualFixedPriceEur: null,
  };
  const areas = await listFareAreas();
  const active = areas.filter((x) => x.status === "aktiv");
  const row = active.find((x) => x.isDefault) ?? active[0] ?? areas[0];
  if (!row) return defaults;
  return {
    areaId: row.id,
    areaName: row.name,
    baseFareEur: asMoney(row.baseFareEur, defaults.baseFareEur),
    rateFirstKmEur: asMoney(row.rateFirstKmEur, defaults.rateFirstKmEur),
    rateAfterKmEur: asMoney(row.rateAfterKmEur, defaults.rateAfterKmEur),
    thresholdKm: asMoney(row.thresholdKm, defaults.thresholdKm),
    waitingPerHourEur: asMoney(row.waitingPerHourEur, defaults.waitingPerHourEur),
    serviceFeeEur: asMoney(row.serviceFeeEur, defaults.serviceFeeEur),
    onrodaBaseFareEur: asMoney(row.onrodaBaseFareEur, defaults.onrodaBaseFareEur),
    onrodaPerKmEur: asMoney(row.onrodaPerKmEur, defaults.onrodaPerKmEur),
    onrodaMinFareEur: asMoney(row.onrodaMinFareEur, defaults.onrodaMinFareEur),
    manualFixedPriceEur:
      row.manualFixedPriceEur != null && Number.isFinite(Number(row.manualFixedPriceEur))
        ? Number(row.manualFixedPriceEur)
        : null,
  };
}

const ACTIVE_RIDE_STATUSES = ["accepted", "arrived", "in_progress"] as const;

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

function rideRevenueAmount(r: { finalFare: number | null; estimatedFare: number }): number {
  if (r.finalFare != null && Number.isFinite(r.finalFare)) return r.finalFare;
  return r.estimatedFare;
}

export async function getAdminStats(opts?: {
  revenueFrom?: Date;
  revenueTo?: Date;
}): Promise<AdminDashboardStats> {
  const revenueFrom = opts?.revenueFrom;
  const revenueTo = opts?.revenueTo;
  const revenueFiltered = Boolean(revenueFrom && revenueTo);

  const db = getDb();
  if (!db) {
    const { listRides } = await import("./ridesData");
    const rides = await listRides();
    const byStatus = (s: string) => rides.filter((r) => r.status === s).length;
    const active = ACTIVE_RIDE_STATUSES.reduce((acc, s) => acc + byStatus(s), 0);
    const driverIds = new Set(
      rides.map((r) => r.driverId).filter((id): id is string => Boolean(id && String(id).trim())),
    );
    const completedInPeriod = rides.filter((r) => {
      if (r.status !== "completed") return false;
      if (!revenueFiltered || !revenueFrom || !revenueTo) return true;
      const t = new Date(r.createdAt).getTime();
      return t >= revenueFrom.getTime() && t <= revenueTo.getTime();
    });
    const completedSum = completedInPeriod.reduce((s, r) => s + rideRevenueAmount(r), 0);

    return {
      rides: {
        total: rides.length,
        pending: byStatus("pending"),
        active,
        completed: byStatus("completed"),
        cancelled: byStatus("cancelled"),
        rejected: byStatus("rejected"),
      },
      companies: {
        total: memCompanies.length,
        active: memCompanies.filter((c) => c.is_active).length,
      },
      drivers: { distinctWithRide: driverIds.size },
      panelUsers: { active: 0 },
      revenue: {
        currency: "EUR",
        periodFrom: revenueFiltered && revenueFrom ? revenueFrom.toISOString() : null,
        periodTo: revenueFiltered && revenueTo ? revenueTo.toISOString() : null,
        completedSum,
        completedRideCount: completedInPeriod.length,
      },
    };
  }

  const statusRows = await db
    .select({ status: ridesTable.status, n: count() })
    .from(ridesTable)
    .groupBy(ridesTable.status);

  const byStatus: Record<string, number> = {};
  let ridesTotal = 0;
  for (const row of statusRows) {
    const c = Number(row.n ?? 0);
    byStatus[row.status] = c;
    ridesTotal += c;
  }

  const active = ACTIVE_RIDE_STATUSES.reduce((acc, s) => acc + (byStatus[s] ?? 0), 0);

  const [companiesTotalRow] = await db.select({ n: count() }).from(adminCompaniesTable);
  const [companiesActiveRow] = await db
    .select({ n: count() })
    .from(adminCompaniesTable)
    .where(eq(adminCompaniesTable.is_active, true));

  const [driversRow] = await db
    .select({
      n: sql<number>`count(distinct ${ridesTable.driver_id})::int`,
    })
    .from(ridesTable)
    .where(and(isNotNull(ridesTable.driver_id), ne(ridesTable.driver_id, "")));

  const [panelUsersRow] = await db
    .select({ n: count() })
    .from(panelUsersTable)
    .where(eq(panelUsersTable.is_active, true));

  const revConds = [eq(ridesTable.status, "completed")];
  if (revenueFiltered && revenueFrom && revenueTo) {
    revConds.push(gte(ridesTable.created_at, revenueFrom));
    revConds.push(lte(ridesTable.created_at, revenueTo));
  }

  const [revRow] = await db
    .select({
      completedSum: sql<string>`coalesce(sum(coalesce(${ridesTable.final_fare}, ${ridesTable.estimated_fare})), 0)`,
      completedRideCount: count(),
    })
    .from(ridesTable)
    .where(and(...revConds));

  return {
    rides: {
      total: ridesTotal,
      pending: byStatus.pending ?? 0,
      active,
      completed: byStatus.completed ?? 0,
      cancelled: byStatus.cancelled ?? 0,
      rejected: byStatus.rejected ?? 0,
    },
    companies: {
      total: Number(companiesTotalRow?.n ?? 0),
      active: Number(companiesActiveRow?.n ?? 0),
    },
    drivers: { distinctWithRide: num(driversRow?.n) },
    panelUsers: { active: Number(panelUsersRow?.n ?? 0) },
    revenue: {
      currency: "EUR",
      periodFrom: revenueFiltered && revenueFrom ? revenueFrom.toISOString() : null,
      periodTo: revenueFiltered && revenueTo ? revenueTo.toISOString() : null,
      completedSum: num(revRow?.completedSum),
      completedRideCount: Number(revRow?.completedRideCount ?? 0),
    },
  };
}

export async function listCompanies(): Promise<CompanyRow[]> {
  const db = getDb();
  if (!db) return [...memCompanies];
  const rows = await db.select().from(adminCompaniesTable);
  return rows.map(rowToCompany);
}

export type CompanyKpis = {
  monthlyRevenue: number;
  openRides: number;
  voucherLimitAvailable: number | null;
};

export async function getCompanyKpis(companyId: string, now = new Date()): Promise<CompanyKpis> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  const openStatuses = ["pending", "accepted", "arrived", "in_progress"];
  const db = getDb();
  if (!db) {
    const { listRidesForCompany } = await import("./ridesData");
    const rides = await listRidesForCompany(companyId);
    const monthlyRevenue = rides
      .filter((r) => {
        if (r.status !== "completed") return false;
        const t = new Date(r.createdAt).getTime();
        return t >= monthStart.getTime() && t < nextMonthStart.getTime();
      })
      .reduce((sum, r) => sum + rideRevenueAmount(r), 0);
    const openRides = rides.filter((r) => openStatuses.includes(r.status)).length;
    return { monthlyRevenue, openRides, voucherLimitAvailable: null };
  }

  const [revRow, openRow, voucherRow] = await Promise.all([
    db
      .select({
        monthlyRevenue: sql<string>`coalesce(sum(coalesce(${ridesTable.final_fare}, ${ridesTable.estimated_fare})), 0)`,
      })
      .from(ridesTable)
      .where(
        and(
          eq(ridesTable.company_id, companyId),
          eq(ridesTable.status, "completed"),
          gte(ridesTable.created_at, monthStart),
          lt(ridesTable.created_at, nextMonthStart),
        ),
      ),
    db
      .select({ n: count() })
      .from(ridesTable)
      .where(and(eq(ridesTable.company_id, companyId), sql`${ridesTable.status} = any(${openStatuses})`)),
    db
      .select({
        remaining: sql<string>`coalesce(sum(greatest(0, coalesce(${accessCodesTable.max_uses},0) - coalesce(${accessCodesTable.uses_count},0))), 0)`,
      })
      .from(accessCodesTable)
      .where(
        and(
          eq(accessCodesTable.company_id, companyId),
          eq(accessCodesTable.code_type, "voucher"),
          eq(accessCodesTable.is_active, true),
          or(sql`${accessCodesTable.valid_from} is null`, lte(accessCodesTable.valid_from, now)),
          or(sql`${accessCodesTable.valid_until} is null`, gte(accessCodesTable.valid_until, now)),
          isNotNull(accessCodesTable.max_uses),
        ),
      ),
  ]);

  return {
    monthlyRevenue: num(revRow[0]?.monthlyRevenue),
    openRides: Number(openRow[0]?.n ?? 0),
    voucherLimitAvailable: Number(voucherRow[0]?.remaining ?? 0),
  };
}

/** Admin-API: PATCH /admin/companies/:id (ohne panel_modules — weiter eigene Route). */
export type AdminCompanyUpdateBody = Partial<{
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  postal_code: string;
  city: string;
  country: string;
  vat_id: string;
  company_kind: string;
  tax_id: string;
  concession_number: string;
  compliance_gewerbe_storage_key: string | null;
  compliance_insurance_storage_key: string | null;
  legal_form: string;
  owner_name: string;
  billing_name: string;
  billing_address_line1: string;
  billing_address_line2: string;
  billing_postal_code: string;
  billing_city: string;
  billing_country: string;
  bank_iban: string;
  bank_bic: string;
  support_email: string;
  dispo_phone: string;
  logo_url: string;
  opening_hours: string;
  business_notes: string;
  verification_status: string;
  compliance_status: string;
  contract_status: string;
  is_blocked: boolean;
  max_drivers: number;
  max_vehicles: number;
  fare_permissions: Record<string, unknown>;
  insurer_permissions: Record<string, unknown>;
  area_assignments: string[];
  is_active: boolean;
  is_priority_company: boolean;
  priority_for_live_rides: boolean;
  priority_for_reservations: boolean;
  priority_price_threshold: number;
  priority_timeout_seconds: number;
  release_radius_km: number;
}>;

export async function findCompanyById(companyId: string): Promise<CompanyRow | null> {
  const db = getDb();
  if (!db) {
    return memCompanies.find((c) => c.id === companyId) ?? null;
  }
  const rows = await db.select().from(adminCompaniesTable).where(eq(adminCompaniesTable.id, companyId)).limit(1);
  return rows[0] ? rowToCompany(rows[0]) : null;
}

function companyRowToDbValues(c: CompanyRow) {
  return {
    id: c.id,
    name: c.name,
    contact_name: c.contact_name,
    email: c.email,
    phone: c.phone,
    address_line1: c.address_line1,
    address_line2: c.address_line2,
    postal_code: c.postal_code,
    city: c.city,
    country: c.country,
    vat_id: c.vat_id,
    company_kind: c.company_kind,
    tax_id: c.tax_id,
    concession_number: c.concession_number,
    compliance_gewerbe_storage_key: c.compliance_gewerbe_storage_key,
    compliance_insurance_storage_key: c.compliance_insurance_storage_key,
    legal_form: c.legal_form,
    owner_name: c.owner_name,
    billing_name: c.billing_name,
    billing_address_line1: c.billing_address_line1,
    billing_address_line2: c.billing_address_line2,
    billing_postal_code: c.billing_postal_code,
    billing_city: c.billing_city,
    billing_country: c.billing_country,
    bank_iban: c.bank_iban,
    bank_bic: c.bank_bic,
    support_email: c.support_email,
    dispo_phone: c.dispo_phone,
    logo_url: c.logo_url,
    opening_hours: c.opening_hours,
    business_notes: c.business_notes,
    verification_status: c.verification_status,
    compliance_status: c.compliance_status,
    contract_status: c.contract_status,
    is_blocked: c.is_blocked,
    max_drivers: c.max_drivers,
    max_vehicles: c.max_vehicles,
    fare_permissions: c.fare_permissions,
    insurer_permissions: c.insurer_permissions,
    area_assignments: c.area_assignments,
    is_active: c.is_active,
    is_priority_company: c.is_priority_company,
    priority_for_live_rides: c.priority_for_live_rides,
    priority_for_reservations: c.priority_for_reservations,
    priority_price_threshold: c.priority_price_threshold,
    priority_timeout_seconds: c.priority_timeout_seconds,
    release_radius_km: c.release_radius_km,
    panel_modules: c.panel_modules ?? null,
  };
}

function applyAdminCompanyPatch(cur: CompanyRow, body: AdminCompanyUpdateBody): CompanyRow {
  const next: CompanyRow = { ...cur };
  if (typeof body.name === "string") {
    const t = body.name.trim();
    if (t) next.name = t;
  }
  if (typeof body.contact_name === "string") next.contact_name = body.contact_name.trim();
  if (typeof body.email === "string") next.email = body.email.trim();
  if (typeof body.phone === "string") next.phone = body.phone.trim();
  if (typeof body.address_line1 === "string") next.address_line1 = body.address_line1.trim();
  if (typeof body.address_line2 === "string") next.address_line2 = body.address_line2.trim();
  if (typeof body.postal_code === "string") next.postal_code = body.postal_code.trim();
  if (typeof body.city === "string") next.city = body.city.trim();
  if (typeof body.country === "string") next.country = body.country.trim();
  if (typeof body.vat_id === "string") next.vat_id = body.vat_id.trim();
  if (typeof body.company_kind === "string") {
    const k = body.company_kind.trim();
    if (["taxi", "general", "voucher_client", "insurer", "hotel", "corporate"].includes(k)) {
      next.company_kind = k;
    }
  }
  if (typeof body.tax_id === "string") next.tax_id = body.tax_id.trim();
  if (typeof body.concession_number === "string") next.concession_number = body.concession_number.trim();
  if (body.compliance_gewerbe_storage_key === null) next.compliance_gewerbe_storage_key = null;
  if (typeof body.compliance_gewerbe_storage_key === "string") {
    next.compliance_gewerbe_storage_key = body.compliance_gewerbe_storage_key.trim() || null;
  }
  if (body.compliance_insurance_storage_key === null) next.compliance_insurance_storage_key = null;
  if (typeof body.compliance_insurance_storage_key === "string") {
    next.compliance_insurance_storage_key = body.compliance_insurance_storage_key.trim() || null;
  }
  if (typeof body.legal_form === "string") next.legal_form = body.legal_form.trim();
  if (typeof body.owner_name === "string") next.owner_name = body.owner_name.trim();
  if (typeof body.billing_name === "string") next.billing_name = body.billing_name.trim();
  if (typeof body.billing_address_line1 === "string") next.billing_address_line1 = body.billing_address_line1.trim();
  if (typeof body.billing_address_line2 === "string") next.billing_address_line2 = body.billing_address_line2.trim();
  if (typeof body.billing_postal_code === "string") next.billing_postal_code = body.billing_postal_code.trim();
  if (typeof body.billing_city === "string") next.billing_city = body.billing_city.trim();
  if (typeof body.billing_country === "string") next.billing_country = body.billing_country.trim();
  if (typeof body.bank_iban === "string") next.bank_iban = body.bank_iban.trim();
  if (typeof body.bank_bic === "string") next.bank_bic = body.bank_bic.trim();
  if (typeof body.support_email === "string") next.support_email = body.support_email.trim();
  if (typeof body.dispo_phone === "string") next.dispo_phone = body.dispo_phone.trim();
  if (typeof body.logo_url === "string") next.logo_url = body.logo_url.trim();
  if (typeof body.opening_hours === "string") next.opening_hours = body.opening_hours.trim();
  if (typeof body.business_notes === "string") next.business_notes = body.business_notes.trim();
  if (typeof body.verification_status === "string") {
    const v = body.verification_status.trim();
    if (["pending", "in_review", "verified", "rejected"].includes(v)) next.verification_status = v;
  }
  if (typeof body.compliance_status === "string") {
    const v = body.compliance_status.trim();
    if (["pending", "in_review", "compliant", "non_compliant"].includes(v)) next.compliance_status = v;
  }
  if (typeof body.contract_status === "string") {
    const v = body.contract_status.trim();
    if (["inactive", "active", "suspended", "terminated"].includes(v)) next.contract_status = v;
  }
  if (typeof body.is_blocked === "boolean") next.is_blocked = body.is_blocked;
  if (typeof body.max_drivers === "number" && Number.isFinite(body.max_drivers)) {
    next.max_drivers = Math.max(0, Math.floor(body.max_drivers));
  }
  if (typeof body.max_vehicles === "number" && Number.isFinite(body.max_vehicles)) {
    next.max_vehicles = Math.max(0, Math.floor(body.max_vehicles));
  }
  if (body.fare_permissions && typeof body.fare_permissions === "object" && !Array.isArray(body.fare_permissions)) {
    next.fare_permissions = body.fare_permissions as Record<string, unknown>;
  }
  if (
    body.insurer_permissions &&
    typeof body.insurer_permissions === "object" &&
    !Array.isArray(body.insurer_permissions)
  ) {
    next.insurer_permissions = body.insurer_permissions as Record<string, unknown>;
  }
  if (Array.isArray(body.area_assignments)) {
    next.area_assignments = body.area_assignments.filter((x): x is string => typeof x === "string");
  }
  if (typeof body.is_active === "boolean") next.is_active = body.is_active;
  if (typeof body.is_priority_company === "boolean") next.is_priority_company = body.is_priority_company;
  if (typeof body.priority_for_live_rides === "boolean") next.priority_for_live_rides = body.priority_for_live_rides;
  if (typeof body.priority_for_reservations === "boolean") next.priority_for_reservations = body.priority_for_reservations;
  if (typeof body.priority_price_threshold === "number" && Number.isFinite(body.priority_price_threshold)) {
    next.priority_price_threshold = body.priority_price_threshold;
  }
  if (typeof body.priority_timeout_seconds === "number" && Number.isFinite(body.priority_timeout_seconds)) {
    next.priority_timeout_seconds = Math.max(0, Math.floor(body.priority_timeout_seconds));
  }
  if (typeof body.release_radius_km === "number" && Number.isFinite(body.release_radius_km)) {
    next.release_radius_km = Math.max(0, body.release_radius_km);
  }
  return next;
}

export async function insertAdminCompany(
  body: { name: string } & AdminCompanyUpdateBody,
): Promise<CompanyRow | { error: string }> {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return { error: "name_required" };

  const id = `co-${randomUUID()}`;
  const base: CompanyRow = {
    id,
    name,
    contact_name: "",
    email: "",
    phone: "",
    address_line1: "",
    address_line2: "",
    postal_code: "",
    city: "",
    country: "",
    vat_id: "",
    company_kind: "general",
    tax_id: "",
    concession_number: "",
    compliance_gewerbe_storage_key: null,
    compliance_insurance_storage_key: null,
    legal_form: "",
    owner_name: "",
    billing_name: "",
    billing_address_line1: "",
    billing_address_line2: "",
    billing_postal_code: "",
    billing_city: "",
    billing_country: "",
    bank_iban: "",
    bank_bic: "",
    support_email: "",
    dispo_phone: "",
    logo_url: "",
    opening_hours: "",
    business_notes: "",
    verification_status: "pending",
    compliance_status: "pending",
    contract_status: "inactive",
    is_blocked: false,
    max_drivers: 100,
    max_vehicles: 100,
    fare_permissions: {},
    insurer_permissions: {},
    area_assignments: [],
    is_active: true,
    is_priority_company: false,
    priority_for_live_rides: false,
    priority_for_reservations: false,
    priority_price_threshold: 25,
    priority_timeout_seconds: 90,
    release_radius_km: 10,
    panel_modules: null,
  };
  const next = applyAdminCompanyPatch(base, body);

  const db = getDb();
  if (!db) {
    memCompanies = [...memCompanies, next];
    return next;
  }
  await db.insert(adminCompaniesTable).values(companyRowToDbValues(next));
  return next;
}

export async function updateAdminCompany(
  companyId: string,
  body: AdminCompanyUpdateBody,
): Promise<CompanyRow | null> {
  const cur = await findCompanyById(companyId);
  if (!cur) return null;
  const next = applyAdminCompanyPatch(cur, body);

  const db = getDb();
  if (!db) {
    const idx = memCompanies.findIndex((c) => c.id === companyId);
    if (idx < 0) return null;
    memCompanies[idx] = next;
    return next;
  }
  await db.update(adminCompaniesTable).set(companyRowToDbValues(next)).where(eq(adminCompaniesTable.id, companyId));
  return next;
}

export async function patchCompanyPriority(
  companyId: string,
  body: Partial<{
    is_priority_company: boolean;
    priority_for_live_rides: boolean;
    priority_for_reservations: boolean;
  }>,
): Promise<CompanyRow | null> {
  const db = getDb();
  if (!db) {
    const idx = memCompanies.findIndex((c) => c.id === companyId);
    if (idx < 0) return null;
    const cur = memCompanies[idx]!;
    const next: CompanyRow = {
      ...cur,
      ...(typeof body.is_priority_company === "boolean"
        ? { is_priority_company: body.is_priority_company }
        : {}),
      ...(typeof body.priority_for_live_rides === "boolean"
        ? { priority_for_live_rides: body.priority_for_live_rides }
        : {}),
      ...(typeof body.priority_for_reservations === "boolean"
        ? { priority_for_reservations: body.priority_for_reservations }
        : {}),
    };
    memCompanies[idx] = next;
    return next;
  }
  const rows = await db.select().from(adminCompaniesTable).where(eq(adminCompaniesTable.id, companyId)).limit(1);
  const r0 = rows[0];
  if (!r0) return null;
  const cur = rowToCompany(r0);
  const next: CompanyRow = {
    ...cur,
    ...(typeof body.is_priority_company === "boolean"
      ? { is_priority_company: body.is_priority_company }
      : {}),
    ...(typeof body.priority_for_live_rides === "boolean"
      ? { priority_for_live_rides: body.priority_for_live_rides }
      : {}),
    ...(typeof body.priority_for_reservations === "boolean"
      ? { priority_for_reservations: body.priority_for_reservations }
      : {}),
  };
  await db
    .update(adminCompaniesTable)
    .set({
      is_priority_company: next.is_priority_company,
      priority_for_live_rides: next.priority_for_live_rides,
      priority_for_reservations: next.priority_for_reservations,
    })
    .where(eq(adminCompaniesTable.id, companyId));
  return next;
}

export async function patchCompanyPanelModules(
  companyId: string,
  modules: string[] | null,
): Promise<CompanyRow | null> {
  const db = getDb();
  const normalized = modules == null ? null : normalizeStoredPanelModules(modules);
  if (!db) {
    const idx = memCompanies.findIndex((c) => c.id === companyId);
    if (idx < 0) return null;
    const cur = memCompanies[idx]!;
    const next: CompanyRow = { ...cur, panel_modules: normalized };
    memCompanies[idx] = next;
    return next;
  }
  const rows = await db.select().from(adminCompaniesTable).where(eq(adminCompaniesTable.id, companyId)).limit(1);
  if (!rows[0]) return null;
  await db
    .update(adminCompaniesTable)
    .set({ panel_modules: normalized })
    .where(eq(adminCompaniesTable.id, companyId));
  const again = await db.select().from(adminCompaniesTable).where(eq(adminCompaniesTable.id, companyId)).limit(1);
  return again[0] ? rowToCompany(again[0]) : null;
}

export async function listFareAreas(): Promise<FareAreaRow[]> {
  const db = getDb();
  if (!db) return [...memFareAreas];
  const rows = await db.select().from(fareAreasTable);
  return rows.map(rowToFareArea);
}

export async function addFareArea(body: {
  name: string;
  ruleType: string;
  isRequiredArea: string;
  fixedPriceAllowed: string;
  status: string;
  isDefault?: boolean;
  baseFareEur?: number;
  rateFirstKmEur?: number;
  rateAfterKmEur?: number;
  thresholdKm?: number;
  waitingPerHourEur?: number;
  serviceFeeEur?: number;
  onrodaBaseFareEur?: number;
  onrodaPerKmEur?: number;
  onrodaMinFareEur?: number;
  manualFixedPriceEur?: number | null;
}): Promise<FareAreaRow[]> {
  const id = `fa-${Date.now()}`;
  const row: FareAreaRow = {
    id,
    name: body.name,
    ruleType: body.ruleType,
    isRequiredArea: body.isRequiredArea,
    fixedPriceAllowed: body.fixedPriceAllowed,
    status: body.status,
    isDefault: body.isDefault === true,
    baseFareEur: asMoney(body.baseFareEur, 4.3),
    rateFirstKmEur: asMoney(body.rateFirstKmEur, 3.0),
    rateAfterKmEur: asMoney(body.rateAfterKmEur, 2.5),
    thresholdKm: asMoney(body.thresholdKm, 4),
    waitingPerHourEur: asMoney(body.waitingPerHourEur, 38),
    serviceFeeEur: asMoney(body.serviceFeeEur, 0),
    onrodaBaseFareEur: asMoney(body.onrodaBaseFareEur, 3.5),
    onrodaPerKmEur: asMoney(body.onrodaPerKmEur, 2.2),
    onrodaMinFareEur: asMoney(body.onrodaMinFareEur, 0),
    manualFixedPriceEur:
      body.manualFixedPriceEur == null ? null : asMoney(body.manualFixedPriceEur, 0),
  };
  const db = getDb();
  if (!db) {
    memFareAreas = [...memFareAreas, row];
    return [...memFareAreas];
  }
  await db.insert(fareAreasTable).values({
    id: row.id,
    name: row.name,
    rule_type: row.ruleType,
    is_required_area: row.isRequiredArea,
    fixed_price_allowed: row.fixedPriceAllowed,
    status: row.status,
    is_default: row.isDefault,
    base_fare_eur: row.baseFareEur,
    rate_first_km_eur: row.rateFirstKmEur,
    rate_after_km_eur: row.rateAfterKmEur,
    threshold_km: row.thresholdKm,
    waiting_per_hour_eur: row.waitingPerHourEur,
    service_fee_eur: row.serviceFeeEur,
    onroda_base_fare_eur: row.onrodaBaseFareEur,
    onroda_per_km_eur: row.onrodaPerKmEur,
    onroda_min_fare_eur: row.onrodaMinFareEur,
    manual_fixed_price_eur: row.manualFixedPriceEur,
  });
  if (row.isDefault) {
    await db
      .update(fareAreasTable)
      .set({ is_default: false })
      .where(and(ne(fareAreasTable.id, row.id), eq(fareAreasTable.is_default, true)));
    await db
      .update(fareAreasTable)
      .set({ is_default: true })
      .where(eq(fareAreasTable.id, row.id));
  }
  return listFareAreas();
}

export type FareAreaPatchBody = Partial<{
  name: string;
  ruleType: string;
  isRequiredArea: string;
  fixedPriceAllowed: string;
  status: string;
  isDefault: boolean;
  baseFareEur: number;
  rateFirstKmEur: number;
  rateAfterKmEur: number;
  thresholdKm: number;
  waitingPerHourEur: number;
  serviceFeeEur: number;
  onrodaBaseFareEur: number;
  onrodaPerKmEur: number;
  onrodaMinFareEur: number;
  manualFixedPriceEur: number | null;
}>;

export async function updateFareArea(id: string, patch: FareAreaPatchBody): Promise<FareAreaRow | null> {
  const db = getDb();
  if (!db) {
    const idx = memFareAreas.findIndex((a) => a.id === id);
    if (idx < 0) return null;
    const cur = memFareAreas[idx]!;
    const next: FareAreaRow = {
      ...cur,
      ...(typeof patch.name === "string" ? { name: patch.name.trim() || cur.name } : {}),
      ...(typeof patch.ruleType === "string" ? { ruleType: patch.ruleType } : {}),
      ...(typeof patch.isRequiredArea === "string" ? { isRequiredArea: patch.isRequiredArea } : {}),
      ...(typeof patch.fixedPriceAllowed === "string" ? { fixedPriceAllowed: patch.fixedPriceAllowed } : {}),
      ...(typeof patch.status === "string" ? { status: patch.status } : {}),
      ...(typeof patch.isDefault === "boolean" ? { isDefault: patch.isDefault } : {}),
      ...(typeof patch.baseFareEur === "number" ? { baseFareEur: patch.baseFareEur } : {}),
      ...(typeof patch.rateFirstKmEur === "number" ? { rateFirstKmEur: patch.rateFirstKmEur } : {}),
      ...(typeof patch.rateAfterKmEur === "number" ? { rateAfterKmEur: patch.rateAfterKmEur } : {}),
      ...(typeof patch.thresholdKm === "number" ? { thresholdKm: patch.thresholdKm } : {}),
      ...(typeof patch.waitingPerHourEur === "number" ? { waitingPerHourEur: patch.waitingPerHourEur } : {}),
      ...(typeof patch.serviceFeeEur === "number" ? { serviceFeeEur: patch.serviceFeeEur } : {}),
      ...(typeof patch.onrodaBaseFareEur === "number" ? { onrodaBaseFareEur: patch.onrodaBaseFareEur } : {}),
      ...(typeof patch.onrodaPerKmEur === "number" ? { onrodaPerKmEur: patch.onrodaPerKmEur } : {}),
      ...(typeof patch.onrodaMinFareEur === "number" ? { onrodaMinFareEur: patch.onrodaMinFareEur } : {}),
      ...(patch.manualFixedPriceEur === null || typeof patch.manualFixedPriceEur === "number"
        ? { manualFixedPriceEur: patch.manualFixedPriceEur }
        : {}),
    };
    memFareAreas = memFareAreas.map((a, i) => (i === idx ? next : a));
    return next;
  }
  const rows = await db.select().from(fareAreasTable).where(eq(fareAreasTable.id, id)).limit(1);
  const r0 = rows[0];
  if (!r0) return null;
  const cur = rowToFareArea(r0);
  const next: FareAreaRow = {
    ...cur,
    ...(typeof patch.name === "string" ? { name: patch.name.trim() || cur.name } : {}),
    ...(typeof patch.ruleType === "string" ? { ruleType: patch.ruleType } : {}),
    ...(typeof patch.isRequiredArea === "string" ? { isRequiredArea: patch.isRequiredArea } : {}),
    ...(typeof patch.fixedPriceAllowed === "string" ? { fixedPriceAllowed: patch.fixedPriceAllowed } : {}),
    ...(typeof patch.status === "string" ? { status: patch.status } : {}),
    ...(typeof patch.isDefault === "boolean" ? { isDefault: patch.isDefault } : {}),
    ...(typeof patch.baseFareEur === "number" ? { baseFareEur: patch.baseFareEur } : {}),
    ...(typeof patch.rateFirstKmEur === "number" ? { rateFirstKmEur: patch.rateFirstKmEur } : {}),
    ...(typeof patch.rateAfterKmEur === "number" ? { rateAfterKmEur: patch.rateAfterKmEur } : {}),
    ...(typeof patch.thresholdKm === "number" ? { thresholdKm: patch.thresholdKm } : {}),
    ...(typeof patch.waitingPerHourEur === "number" ? { waitingPerHourEur: patch.waitingPerHourEur } : {}),
    ...(typeof patch.serviceFeeEur === "number" ? { serviceFeeEur: patch.serviceFeeEur } : {}),
    ...(typeof patch.onrodaBaseFareEur === "number" ? { onrodaBaseFareEur: patch.onrodaBaseFareEur } : {}),
    ...(typeof patch.onrodaPerKmEur === "number" ? { onrodaPerKmEur: patch.onrodaPerKmEur } : {}),
    ...(typeof patch.onrodaMinFareEur === "number" ? { onrodaMinFareEur: patch.onrodaMinFareEur } : {}),
    ...(patch.manualFixedPriceEur === null || typeof patch.manualFixedPriceEur === "number"
      ? { manualFixedPriceEur: patch.manualFixedPriceEur }
      : {}),
  };
  if (next.isDefault) {
    await db
      .update(fareAreasTable)
      .set({ is_default: false })
      .where(and(ne(fareAreasTable.id, id), eq(fareAreasTable.is_default, true)));
  }
  await db
    .update(fareAreasTable)
    .set({
      name: next.name,
      rule_type: next.ruleType,
      is_required_area: next.isRequiredArea,
      fixed_price_allowed: next.fixedPriceAllowed,
      status: next.status,
      is_default: next.isDefault,
      base_fare_eur: next.baseFareEur,
      rate_first_km_eur: next.rateFirstKmEur,
      rate_after_km_eur: next.rateAfterKmEur,
      threshold_km: next.thresholdKm,
      waiting_per_hour_eur: next.waitingPerHourEur,
      service_fee_eur: next.serviceFeeEur,
      onroda_base_fare_eur: next.onrodaBaseFareEur,
      onroda_per_km_eur: next.onrodaPerKmEur,
      onroda_min_fare_eur: next.onrodaMinFareEur,
      manual_fixed_price_eur: next.manualFixedPriceEur,
    })
    .where(eq(fareAreasTable.id, id));
  return next;
}

/**
 * Fahrten, die dieses Gebiet in `partner_booking_meta.fareAreaId` tragen (optional, für spätere Zuordnung).
 * Ohne gesetztes Feld ist die Zahl typischerweise 0 — Löschen ist dann möglich.
 */
export async function countRidesReferencingFareAreaId(fareAreaId: string): Promise<number> {
  const db = getDb();
  if (!db) {
    void fareAreaId;
    return 0;
  }
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ridesTable)
    .where(sql`${ridesTable.partner_booking_meta}->>'fareAreaId' = ${fareAreaId}`);
  return Number(row?.n ?? 0);
}

export async function deleteFareArea(id: string): Promise<{ ok: true } | { ok: false; error: "not_found" | "fare_area_in_use"; rideCount: number }> {
  const db = getDb();
  const idx = memFareAreas.findIndex((a) => a.id === id);
  if (!db) {
    if (idx < 0) return { ok: false, error: "not_found", rideCount: 0 };
    const blocked = await countRidesReferencingFareAreaId(id);
    if (blocked > 0) return { ok: false, error: "fare_area_in_use", rideCount: blocked };
    memFareAreas = memFareAreas.filter((a) => a.id !== id);
    return { ok: true };
  }
  const rows = await db.select().from(fareAreasTable).where(eq(fareAreasTable.id, id)).limit(1);
  if (!rows[0]) return { ok: false, error: "not_found", rideCount: 0 };
  const blocked = await countRidesReferencingFareAreaId(id);
  if (blocked > 0) return { ok: false, error: "fare_area_in_use", rideCount: blocked };
  await db.delete(fareAreasTable).where(eq(fareAreasTable.id, id));
  return { ok: true };
}

/** Postgres: leere Tabellen mit Demo-Zeilen füllen (einmalig nach Migration). */
export async function seedAdminDefaultsIfEmpty(): Promise<void> {
  const db = getDb();
  if (!db) return;
  const [c] = await db.select({ n: count() }).from(adminCompaniesTable);
  if (Number(c?.n ?? 0) === 0) {
    await db.insert(adminCompaniesTable).values(
      seedCompanies.map((co) => ({
        id: co.id,
        name: co.name,
        contact_name: co.contact_name,
        email: co.email,
        phone: co.phone,
        address_line1: co.address_line1,
        address_line2: co.address_line2,
        postal_code: co.postal_code,
        city: co.city,
        country: co.country,
        vat_id: co.vat_id,
        is_active: co.is_active,
        is_priority_company: co.is_priority_company,
        priority_for_live_rides: co.priority_for_live_rides,
        priority_for_reservations: co.priority_for_reservations,
        priority_price_threshold: co.priority_price_threshold,
        priority_timeout_seconds: co.priority_timeout_seconds,
        release_radius_km: co.release_radius_km,
        panel_modules: co.panel_modules ?? null,
      })),
    );
  }
  const [f] = await db.select({ n: count() }).from(fareAreasTable);
  if (Number(f?.n ?? 0) === 0) {
    await db.insert(fareAreasTable).values(
      seedFareAreas.map((a) => ({
        id: a.id,
        name: a.name,
        rule_type: a.ruleType,
        is_required_area: a.isRequiredArea,
        fixed_price_allowed: a.fixedPriceAllowed,
        status: a.status,
        is_default: a.isDefault,
        base_fare_eur: a.baseFareEur,
        rate_first_km_eur: a.rateFirstKmEur,
        rate_after_km_eur: a.rateAfterKmEur,
        threshold_km: a.thresholdKm,
        waiting_per_hour_eur: a.waitingPerHourEur,
        service_fee_eur: a.serviceFeeEur,
        onroda_base_fare_eur: a.onrodaBaseFareEur,
        onroda_per_km_eur: a.onrodaPerKmEur,
        onroda_min_fare_eur: a.onrodaMinFareEur,
        manual_fixed_price_eur: a.manualFixedPriceEur,
      })),
    );
  }
}
