import { count, eq, inArray } from "drizzle-orm";
import { getDb } from "./client";
import { adminCompaniesTable, fareAreasTable, ridesTable } from "./schema";
import type { CompanyRow, FareAreaRow } from "../routes/adminApi.types";

const seedCompanies: CompanyRow[] = [
  {
    id: "co-demo-1",
    name: "Demo Taxi GmbH",
    email: "demo@example.com",
    phone: "+49 711 000000",
    is_active: true,
    is_priority_company: true,
    priority_for_live_rides: true,
    priority_for_reservations: false,
    priority_price_threshold: 25,
    priority_timeout_seconds: 90,
    release_radius_km: 12,
  },
  {
    id: "co-demo-2",
    name: "Musterfahrdienst",
    email: "kontakt@muster.de",
    phone: "+49 711 111111",
    is_active: true,
    is_priority_company: false,
    priority_for_live_rides: false,
    priority_for_reservations: false,
    priority_price_threshold: 18,
    priority_timeout_seconds: 120,
    release_radius_km: 8,
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
    email: r.email,
    phone: r.phone,
    is_active: r.is_active,
    is_priority_company: r.is_priority_company,
    priority_for_live_rides: r.priority_for_live_rides,
    priority_for_reservations: r.priority_for_reservations,
    priority_price_threshold: r.priority_price_threshold,
    priority_timeout_seconds: r.priority_timeout_seconds,
    release_radius_km: r.release_radius_km,
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

export async function getAdminStats(): Promise<{
  offene: number;
  laufend: number;
  erledigt: number;
  unternehmer: number;
  fahrer: number;
  partner: number;
}> {
  const db = getDb();
  if (!db) {
    const { listRides } = await import("./ridesData");
    const rides = await listRides();
    return {
      offene: rides.filter((r) => r.status === "pending").length,
      laufend: rides.filter((r) =>
        ["accepted", "arrived", "in_progress"].includes(r.status),
      ).length,
      erledigt: rides.filter((r) => r.status === "completed").length,
      unternehmer: memCompanies.filter((c) => c.is_active).length,
      fahrer: 8,
      partner: 2,
    };
  }

  const [offene] = await db.select({ n: count() }).from(ridesTable).where(eq(ridesTable.status, "pending"));
  const [laufendRow] = await db
    .select({ n: count() })
    .from(ridesTable)
    .where(inArray(ridesTable.status, ["accepted", "arrived", "in_progress"]));
  const [erledigt] = await db.select({ n: count() }).from(ridesTable).where(eq(ridesTable.status, "completed"));
  const [unternehmer] = await db
    .select({ n: count() })
    .from(adminCompaniesTable)
    .where(eq(adminCompaniesTable.is_active, true));

  return {
    offene: Number(offene?.n ?? 0),
    laufend: Number(laufendRow?.n ?? 0),
    erledigt: Number(erledigt?.n ?? 0),
    unternehmer: Number(unternehmer?.n ?? 0),
    fahrer: 0,
    partner: 0,
  };
}

export async function listCompanies(): Promise<CompanyRow[]> {
  const db = getDb();
  if (!db) return [...memCompanies];
  const rows = await db.select().from(adminCompaniesTable);
  return rows.map(rowToCompany);
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
        email: co.email,
        phone: co.phone,
        is_active: co.is_active,
        is_priority_company: co.is_priority_company,
        priority_for_live_rides: co.priority_for_live_rides,
        priority_for_reservations: co.priority_for_reservations,
        priority_price_threshold: co.priority_price_threshold,
        priority_timeout_seconds: co.priority_timeout_seconds,
        release_radius_km: co.release_radius_km,
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
