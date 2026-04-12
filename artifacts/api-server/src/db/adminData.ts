import { randomUUID } from "node:crypto";
import { and, count, eq, gte, isNotNull, lte, ne, sql } from "drizzle-orm";
import { getDb } from "./client";
import {
  adminCompaniesTable,
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
    is_active: true,
    is_priority_company: true,
    priority_for_live_rides: true,
    priority_for_reservations: false,
    priority_price_threshold: 25,
    priority_timeout_seconds: 90,
    release_radius_km: 12,
    panel_modules: null,
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
}): Promise<FareAreaRow[]> {
  const id = `fa-${Date.now()}`;
  const row: FareAreaRow = {
    id,
    name: body.name,
    ruleType: body.ruleType,
    isRequiredArea: body.isRequiredArea,
    fixedPriceAllowed: body.fixedPriceAllowed,
    status: body.status,
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
  });
  return listFareAreas();
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
      })),
    );
  }
}
