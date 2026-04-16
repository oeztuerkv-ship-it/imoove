import { and, asc, desc, eq, gte, ilike, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { RideRequest } from "../domain/rideRequest";
import type { PayerKind, RideKind } from "../domain/rideBillingProfile";
import type { PartnerBookingFlow } from "../domain/partnerBookingMeta";
import { metaToJson, parsePartnerBookingMeta } from "../domain/partnerBookingMeta";
import {
  DEFAULT_PAYER_KIND,
  DEFAULT_RIDE_KIND,
  isPayerKind,
  isRideKind,
  payerKindForAccessCodeRide,
} from "../domain/rideBillingProfile";
import {
  DEFAULT_AUTHORIZATION_SOURCE,
  isAuthorizationSource,
  normalizeAccessCodeInput,
} from "../domain/rideAuthorization";
import { redeemAccessCodeInTransaction, redeemAccessCodeMemory } from "./accessCodesData";
import { isFarFutureReservation } from "../lib/dispatchStatus";
import { getDb } from "./client";
import { adminCompaniesTable, rideEventsTable, ridesTable } from "./schema";

/** In-Memory-Fallback wenn kein DATABASE_URL (lokal / ohne Postgres). */
let memoryRides: RideRequest[] = [];

/**
 * Legacy-safe company filter:
 * - current schema: rides.company_id is TEXT
 * - legacy drift seen on servers: rides.company_id as INTEGER
 * Cast to text avoids 500 on panel queries for ids like "co-demo-1".
 */
function companyIdMatchCondition(companyId: string): SQL {
  return sql`${ridesTable.company_id}::text = ${companyId}`;
}

function makeEventId(prefix = "REV"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function stripEphemeral(r: RideRequest): RideRequest {
  const { accessCodeSummary: _a, ...rest } = r;
  return rest;
}

function rowToRide(r: typeof ridesTable.$inferSelect): RideRequest {
  const rk = r.ride_kind;
  const pk = r.payer_kind;
  const auth = r.authorization_source;
  return {
    id: r.id,
    companyId: r.company_id ?? null,
    createdByPanelUserId: r.created_by_panel_user_id ?? null,
    rideKind: typeof rk === "string" && isRideKind(rk) ? rk : DEFAULT_RIDE_KIND,
    payerKind: typeof pk === "string" && isPayerKind(pk) ? pk : DEFAULT_PAYER_KIND,
    voucherCode: r.voucher_code ?? null,
    billingReference: r.billing_reference ?? null,
    authorizationSource:
      typeof auth === "string" && isAuthorizationSource(auth) ? auth : DEFAULT_AUTHORIZATION_SOURCE,
    accessCodeId: r.access_code_id ?? null,
    accessCodeNormalizedSnapshot: r.access_code_normalized_snapshot ?? null,
    createdAt: new Date(r.created_at).toISOString(),
    scheduledAt: r.scheduled_at ? new Date(r.scheduled_at).toISOString() : null,
    status: r.status as RideRequest["status"],
    customerName: r.customer_name,
    passengerId: r.passenger_id ?? undefined,
    driverId: r.driver_id,
    from: r.from_label,
    fromFull: r.from_full,
    fromLat: r.from_lat ?? undefined,
    fromLon: r.from_lon ?? undefined,
    to: r.to_label,
    toFull: r.to_full,
    toLat: r.to_lat ?? undefined,
    toLon: r.to_lon ?? undefined,
    distanceKm: r.distance_km,
    durationMinutes: r.duration_minutes,
    estimatedFare: r.estimated_fare,
    finalFare: r.final_fare ?? null,
    paymentMethod: r.payment_method,
    vehicle: r.vehicle,
    pricingMode:
      r.pricing_mode === "taxi_tariff" || r.pricing_mode === "fixed_price"
        ? r.pricing_mode
        : null,
    rejectedBy: Array.isArray(r.rejected_by) ? r.rejected_by : [],
    partnerBookingMeta: parsePartnerBookingMeta(r.partner_booking_meta) ?? null,
  };
}

function rideToUpdate(r: RideRequest) {
  return {
    company_id: r.companyId ?? null,
    created_by_panel_user_id: r.createdByPanelUserId ?? null,
    ride_kind: r.rideKind,
    payer_kind: r.payerKind,
    voucher_code: r.voucherCode ?? null,
    billing_reference: r.billingReference ?? null,
    authorization_source: r.authorizationSource,
    access_code_id: r.accessCodeId ?? null,
    access_code_normalized_snapshot: r.accessCodeNormalizedSnapshot ?? null,
    scheduled_at: r.scheduledAt ? new Date(r.scheduledAt) : null,
    status: r.status,
    customer_name: r.customerName,
    passenger_id: r.passengerId ?? null,
    driver_id: r.driverId ?? null,
    from_label: r.from,
    from_full: r.fromFull,
    from_lat: r.fromLat ?? null,
    from_lon: r.fromLon ?? null,
    to_label: r.to,
    to_full: r.toFull,
    to_lat: r.toLat ?? null,
    to_lon: r.toLon ?? null,
    distance_km: r.distanceKm,
    duration_minutes: r.durationMinutes,
    estimated_fare: r.estimatedFare,
    final_fare: r.finalFare ?? null,
    payment_method: r.paymentMethod,
    vehicle: r.vehicle,
    pricing_mode: r.pricingMode ?? null,
    rejected_by: r.rejectedBy,
    partner_booking_meta: (r.partnerBookingMeta ? metaToJson(r.partnerBookingMeta) : {}) as Record<
      string,
      unknown
    >,
  };
}

function rideToInsert(r: RideRequest): typeof ridesTable.$inferInsert {
  return {
    id: r.id,
    company_id: r.companyId ?? null,
    created_by_panel_user_id: r.createdByPanelUserId ?? null,
    ride_kind: r.rideKind,
    payer_kind: r.payerKind,
    voucher_code: r.voucherCode ?? null,
    billing_reference: r.billingReference ?? null,
    authorization_source: r.authorizationSource,
    access_code_id: r.accessCodeId ?? null,
    access_code_normalized_snapshot: r.accessCodeNormalizedSnapshot ?? null,
    created_at: new Date(r.createdAt),
    scheduled_at: r.scheduledAt ? new Date(r.scheduledAt) : null,
    status: r.status,
    customer_name: r.customerName,
    passenger_id: r.passengerId ?? null,
    driver_id: r.driverId ?? null,
    from_label: r.from,
    from_full: r.fromFull,
    from_lat: r.fromLat ?? null,
    from_lon: r.fromLon ?? null,
    to_label: r.to,
    to_full: r.toFull,
    to_lat: r.toLat ?? null,
    to_lon: r.toLon ?? null,
    distance_km: r.distanceKm,
    duration_minutes: r.durationMinutes,
    estimated_fare: r.estimatedFare,
    final_fare: r.finalFare ?? null,
    payment_method: r.paymentMethod,
    vehicle: r.vehicle,
    pricing_mode: r.pricingMode ?? null,
    rejected_by: r.rejectedBy,
    partner_booking_meta: (r.partnerBookingMeta ? metaToJson(r.partnerBookingMeta) : {}) as Record<
      string,
      unknown
    >,
  };
}

export type CompanyRideListFilters = {
  createdFrom?: Date;
  createdTo?: Date;
  rideKind?: RideKind;
  payerKind?: PayerKind;
  /** Fahrstatus (rides.status), z. B. pending, completed */
  status?: string;
  /** Freitext: Kunde, Auftrags-ID, Abholung, Ziel */
  searchContains?: string;
  billingReferenceContains?: string;
  accessCodeId?: string;
  hasAccessCode?: boolean;
  partnerFlow?: PartnerBookingFlow;
};

function applyMemoryRideFilters(list: RideRequest[], filters: CompanyRideListFilters): RideRequest[] {
  return list.filter((r) => {
    const created = new Date(r.createdAt);
    if (filters.createdFrom && created < filters.createdFrom) return false;
    if (filters.createdTo && created > filters.createdTo) return false;
    if (filters.rideKind && r.rideKind !== filters.rideKind) return false;
    if (filters.payerKind && r.payerKind !== filters.payerKind) return false;
    if (filters.status && r.status !== filters.status) return false;
    if (filters.searchContains?.trim()) {
      const q = filters.searchContains.trim().toLowerCase();
      const blob = [r.id, r.customerName, r.from, r.to].join(" ").toLowerCase();
      if (!blob.includes(q)) return false;
    }
    if (filters.billingReferenceContains?.trim()) {
      const q = filters.billingReferenceContains.trim().toLowerCase();
      const br = (r.billingReference ?? "").toLowerCase();
      if (!br.includes(q)) return false;
    }
    if (filters.accessCodeId && r.accessCodeId !== filters.accessCodeId) return false;
    if (filters.hasAccessCode === true && !r.accessCodeId) return false;
    if (filters.hasAccessCode === false && r.accessCodeId) return false;
    if (filters.partnerFlow && r.partnerBookingMeta?.flow !== filters.partnerFlow) return false;
    return true;
  });
}

/** Gefilterte Mandantenfahrten (Abrechnung, Export). */
export async function listRidesForCompanyFiltered(
  companyId: string,
  filters: CompanyRideListFilters,
): Promise<RideRequest[]> {
  const db = getDb();
  if (!db) {
    const list = memoryRides.filter((r) => r.companyId === companyId);
    const filtered = applyMemoryRideFilters(list, filters);
    return filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  const cond: SQL[] = [companyIdMatchCondition(companyId)];
  if (filters.createdFrom) cond.push(gte(ridesTable.created_at, filters.createdFrom));
  if (filters.createdTo) cond.push(lte(ridesTable.created_at, filters.createdTo));
  if (filters.rideKind) cond.push(eq(ridesTable.ride_kind, filters.rideKind));
  if (filters.payerKind) cond.push(eq(ridesTable.payer_kind, filters.payerKind));
  if (filters.status?.trim()) cond.push(eq(ridesTable.status, filters.status.trim()));
  if (filters.searchContains?.trim()) {
    const raw = filters.searchContains.trim().replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    const pat = `%${raw}%`;
    cond.push(
      or(
        ilike(ridesTable.customer_name, pat),
        ilike(ridesTable.id, pat),
        ilike(ridesTable.from_label, pat),
        ilike(ridesTable.to_label, pat),
      )!,
    );
  }
  if (filters.billingReferenceContains?.trim()) {
    const raw = filters.billingReferenceContains.trim().replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    cond.push(ilike(ridesTable.billing_reference, `%${raw}%`));
  }
  if (filters.accessCodeId) cond.push(eq(ridesTable.access_code_id, filters.accessCodeId));
  if (filters.hasAccessCode === true) cond.push(isNotNull(ridesTable.access_code_id));
  if (filters.hasAccessCode === false) cond.push(isNull(ridesTable.access_code_id));
  if (filters.partnerFlow) {
    cond.push(sql`${ridesTable.partner_booking_meta}->>'flow' = ${filters.partnerFlow}`);
  }

  const rows = await db
    .select()
    .from(ridesTable)
    .where(and(...cond))
    .orderBy(desc(ridesTable.created_at));
  return rows.map(rowToRide);
}

export async function listRides(): Promise<RideRequest[]> {
  const db = getDb();
  if (!db) {
    return [...memoryRides];
  }
  const rows = await db.select().from(ridesTable).orderBy(desc(ridesTable.created_at));
  return rows.map(rowToRide);
}

/** Nur Fahrten mit gesetzter company_id = Mandant (Partner-Panel-Scope). */
export async function listRidesForCompany(companyId: string): Promise<RideRequest[]> {
  const db = getDb();
  if (!db) {
    return memoryRides
      .filter((r) => r.companyId === companyId)
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  const rows = await db
    .select()
    .from(ridesTable)
    .where(companyIdMatchCondition(companyId))
    .orderBy(desc(ridesTable.created_at));
  return rows.map(rowToRide);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function insertRide(r: RideRequest, tx?: any): Promise<void> {
  const persisted = stripEphemeral(r);
  const db = getDb();
  const run = tx ?? db;
  if (!run) {
    memoryRides = [persisted, ...memoryRides];
    return;
  }
  await run.insert(ridesTable).values(rideToInsert(persisted));
  await run.insert(rideEventsTable).values({
    id: makeEventId(),
    ride_id: persisted.id,
    event_type: "ride_created",
    from_status: null,
    to_status: persisted.status,
    actor_type: "system",
    actor_id: null,
    payload: {},
  });
}

/**
 * Buchung mit optionalem Zugangscode: atomare Einlösung (Postgres) bzw. In-Memory.
 * Ohne Code: übernimmt `ride.authorizationSource` (`passenger_direct` | `partner`), kein `access_code_id`.
 *   `access_code` ohne mitgelieferten gültigen Code wird zu `passenger_direct` normalisiert.
 * Mit Code: digitale Kostenübernahme — `payerKind` wird auf `company` gesetzt, wenn ein `companyId` ermittelbar ist.
 */
export async function insertRideWithOptionalAccessCode(
  ride: RideRequest,
  accessCodePlain: string | undefined | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = typeof accessCodePlain === "string" ? accessCodePlain.trim() : "";
  if (!trimmed) {
    let auth = ride.authorizationSource;
    if (auth === "access_code") auth = DEFAULT_AUTHORIZATION_SOURCE;
    else if (!isAuthorizationSource(auth)) auth = DEFAULT_AUTHORIZATION_SOURCE;
    const r: RideRequest = {
      ...stripEphemeral(ride),
      authorizationSource: auth,
      accessCodeId: null,
      accessCodeNormalizedSnapshot: null,
    };
    await insertRide(r);
    return { ok: true };
  }

  const normalized = normalizeAccessCodeInput(trimmed);
  if (!normalized) return { ok: false, error: "access_code_invalid" };

  const bookingCompanyId = ride.companyId ?? null;
  const db = getDb();
  if (!db) {
    const red = redeemAccessCodeMemory(trimmed, bookingCompanyId);
    if (!red.ok) return { ok: false, error: red.error };
    const resolvedCompanyId = ride.companyId ?? red.companyIdOnCode ?? null;
    const r: RideRequest = {
      ...stripEphemeral(ride),
      authorizationSource: "access_code",
      accessCodeId: red.id,
      accessCodeNormalizedSnapshot: normalized,
      companyId: resolvedCompanyId,
      payerKind: payerKindForAccessCodeRide(resolvedCompanyId),
    };
    await insertRide(r);
    return { ok: true };
  }

  try {
    const out = await db.transaction(async (trx) => {
      const red = await redeemAccessCodeInTransaction(trx, normalized, bookingCompanyId);
      if (!red.ok) return { ok: false as const, error: red.error };
      const resolvedCompanyId = ride.companyId ?? red.companyIdOnCode ?? null;
      const r: RideRequest = {
        ...stripEphemeral(ride),
        authorizationSource: "access_code",
        accessCodeId: red.id,
        accessCodeNormalizedSnapshot: normalized,
        companyId: resolvedCompanyId,
        payerKind: payerKindForAccessCodeRide(resolvedCompanyId),
      };
      await insertRide(r, trx);
      return { ok: true as const };
    });
    if (!out.ok) return { ok: false, error: out.error };
    return { ok: true };
  } catch {
    return { ok: false, error: "access_code_invalid" };
  }
}

/**
 * Weitere Fahrt mit derselben Code-Einlösung wie `template` anlegen (eine Einlösung, mehrere Beine).
 * Ohne Code auf `template`: übernimmt nur Zahler/Firma aus Buchungskontext (`ride` bleibt maßgeblich).
 */
export async function insertRideCloningAccessFromTemplate(
  ride: RideRequest,
  template: RideRequest,
): Promise<void> {
  const withAuth: RideRequest = {
    ...stripEphemeral(ride),
    authorizationSource: template.authorizationSource,
    accessCodeId: template.accessCodeId ?? null,
    accessCodeNormalizedSnapshot: template.accessCodeNormalizedSnapshot ?? null,
    companyId: template.companyId ?? ride.companyId ?? null,
    payerKind: template.accessCodeId
      ? payerKindForAccessCodeRide(template.companyId)
      : ride.payerKind,
  };
  await insertRide(withAuth);
}

/** Erste Fahrt optional mit Code; Folgefahrten teilen dieselbe Freigabe (eine Einlösung). */
export async function insertRidesWithSharedAccessCode(
  rides: RideRequest[],
  accessCodePlain: string | undefined | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (rides.length === 0) return { ok: true };
  const [first, ...rest] = rides;
  if (!first) return { ok: true };
  const ins = await insertRideWithOptionalAccessCode(first, accessCodePlain);
  if (!ins.ok) return ins;
  const saved = await findRide(first.id);
  if (!saved) return { ok: false, error: "persist_failed" };
  for (const leg of rest) {
    await insertRideCloningAccessFromTemplate(leg, saved);
  }
  return { ok: true };
}

export async function findRide(id: string): Promise<RideRequest | null> {
  const db = getDb();
  if (!db) {
    return memoryRides.find((x) => x.id === id) ?? null;
  }
  const rows = await db.select().from(ridesTable).where(eq(ridesTable.id, id)).limit(1);
  return rows[0] ? rowToRide(rows[0]) : null;
}

/** Plattform-Admin: Listenfilter + Pagination (kein `stripPartnerOnlyRideFields`). */
export type AdminRideListQuery = {
  companyId?: string;
  status?: string;
  createdFrom?: Date;
  createdTo?: Date;
  rideKind?: RideKind;
  payerKind?: PayerKind;
  driverId?: string;
  /** Freitext über ID, Kunde, Route, Fahrer, passengerId */
  q?: string;
  /** Standard: neueste zuerst (`desc`). */
  sortCreated?: "asc" | "desc";
};

export type AdminRideRow = RideRequest & { companyName: string | null };

function escapeIlikePattern(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function buildAdminRideConditions(query: AdminRideListQuery): SQL[] {
  const cond: SQL[] = [];
  if (query.companyId?.trim()) {
    cond.push(eq(ridesTable.company_id, query.companyId.trim()));
  }
  if (query.status?.trim() && query.status !== "all") {
    cond.push(eq(ridesTable.status, query.status.trim()));
  }
  if (query.createdFrom) {
    cond.push(gte(ridesTable.created_at, query.createdFrom));
  }
  if (query.createdTo) {
    cond.push(lte(ridesTable.created_at, query.createdTo));
  }
  if (query.rideKind) {
    cond.push(eq(ridesTable.ride_kind, query.rideKind));
  }
  if (query.payerKind) {
    cond.push(eq(ridesTable.payer_kind, query.payerKind));
  }
  if (query.driverId?.trim()) {
    cond.push(eq(ridesTable.driver_id, query.driverId.trim()));
  }
  if (query.q?.trim()) {
    const raw = escapeIlikePattern(query.q.trim());
    const p = `%${raw}%`;
    cond.push(
      or(
        ilike(ridesTable.id, p),
        ilike(ridesTable.customer_name, p),
        ilike(ridesTable.from_label, p),
        ilike(ridesTable.to_label, p),
        ilike(ridesTable.from_full, p),
        ilike(ridesTable.to_full, p),
        ilike(ridesTable.driver_id, p),
        ilike(ridesTable.passenger_id, p),
      )!,
    );
  }
  return cond;
}

function matchesAdminMemoryQuery(r: RideRequest, query: AdminRideListQuery): boolean {
  if (query.companyId?.trim() && String(r.companyId ?? "") !== query.companyId.trim()) return false;
  if (query.status?.trim() && query.status !== "all" && r.status !== query.status.trim()) return false;
  if (query.createdFrom && new Date(r.createdAt) < query.createdFrom) return false;
  if (query.createdTo && new Date(r.createdAt) > query.createdTo) return false;
  if (query.rideKind && r.rideKind !== query.rideKind) return false;
  if (query.payerKind && r.payerKind !== query.payerKind) return false;
  if (query.driverId?.trim() && String(r.driverId ?? "") !== query.driverId.trim()) return false;
  if (query.q?.trim()) {
    const q = query.q.trim().toLowerCase();
    const hay = [
      r.id,
      r.customerName,
      r.from,
      r.fromFull,
      r.to,
      r.toFull,
      r.driverId,
      r.passengerId,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export async function countRidesAdmin(query: AdminRideListQuery): Promise<number> {
  const db = getDb();
  const cond = buildAdminRideConditions(query);
  const whereSql = cond.length ? and(...cond) : undefined;
  if (!db) {
    return memoryRides.filter((r) => matchesAdminMemoryQuery(r, query)).length;
  }
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ridesTable)
    .where(whereSql);
  return Number(row?.n ?? 0);
}

export async function listRidesAdminPage(
  query: AdminRideListQuery,
  limit: number,
  offset: number,
): Promise<AdminRideRow[]> {
  const db = getDb();
  const cond = buildAdminRideConditions(query);
  const whereSql = cond.length ? and(...cond) : undefined;
  const sortDesc = query.sortCreated !== "asc";
  if (!db) {
    const filtered = memoryRides.filter((r) => matchesAdminMemoryQuery(r, query));
    filtered.sort((a, b) => {
      const cmp = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
      return sortDesc ? -cmp : cmp;
    });
    return filtered.slice(offset, offset + limit).map((ride) => ({ ...ride, companyName: null }));
  }
  const orderCreated = sortDesc ? desc(ridesTable.created_at) : asc(ridesTable.created_at);
  const rows = await db
    .select({
      ride: ridesTable,
      companyName: adminCompaniesTable.name,
    })
    .from(ridesTable)
    .leftJoin(adminCompaniesTable, eq(ridesTable.company_id, adminCompaniesTable.id))
    .where(whereSql)
    .orderBy(orderCreated)
    .limit(limit)
    .offset(offset);
  return rows.map((x) => ({
    ...rowToRide(x.ride),
    companyName: x.companyName ?? null,
  }));
}

export async function findRideAdminById(id: string): Promise<AdminRideRow | null> {
  const ride = await findRide(id);
  if (!ride) return null;
  const db = getDb();
  if (!db) {
    return { ...ride, companyName: null };
  }
  if (!ride.companyId) {
    return { ...ride, companyName: null };
  }
  const [r] = await db
    .select({ name: adminCompaniesTable.name })
    .from(adminCompaniesTable)
    .where(eq(adminCompaniesTable.id, ride.companyId))
    .limit(1);
  return { ...ride, companyName: r?.name ?? null };
}

/** UTC-Kalendertag für Admin-Dashboard (optional `YYYY-MM-DD`). */
export type AdminDayBounds = { start: Date; end: Date };

export function parseAdminDashboardDayBounds(dateRaw: string | undefined): AdminDayBounds {
  const t = (dateRaw ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  const d = new Date();
  const y0 = d.getUTCFullYear();
  const mo0 = d.getUTCMonth() + 1;
  const da0 = d.getUTCDate();
  const y = m ? Number(m[1]) : y0;
  const mo = m ? Number(m[2]) : mo0;
  const da = m ? Number(m[3]) : da0;
  const start = new Date(Date.UTC(y, mo - 1, da, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, mo - 1, da, 23, 59, 59, 999));
  return { start, end };
}

function rideAgendaTime(r: RideRequest): Date {
  return r.scheduledAt ? new Date(r.scheduledAt) : new Date(r.createdAt);
}

/** Fahrten, deren Fahrtzeit (geplant oder angelegt) im Kalendertag liegt — chronologisch. */
export async function listAdminRidesAgendaForDay(bounds: AdminDayBounds): Promise<AdminRideRow[]> {
  const { start, end } = bounds;
  const db = getDb();
  if (!db) {
    return memoryRides
      .filter((r) => {
        const t = rideAgendaTime(r);
        return t >= start && t <= end;
      })
      .sort((a, b) => rideAgendaTime(a).getTime() - rideAgendaTime(b).getTime())
      .slice(0, 200)
      .map((ride) => ({ ...ride, companyName: null }));
  }
  const coalesceTime = sql<Date>`coalesce(${ridesTable.scheduled_at}, ${ridesTable.created_at})`;
  const rows = await db
    .select({
      ride: ridesTable,
      companyName: adminCompaniesTable.name,
    })
    .from(ridesTable)
    .leftJoin(adminCompaniesTable, eq(ridesTable.company_id, adminCompaniesTable.id))
    .where(and(gte(coalesceTime, start), lte(coalesceTime, end)))
    .orderBy(asc(coalesceTime))
    .limit(200);
  return rows.map((x) => ({
    ...rowToRide(x.ride),
    companyName: x.companyName ?? null,
  }));
}

export type AdminPartnerDayStatRow = {
  companyId: string;
  companyName: string;
  ridesCount: number;
  completedRevenue: number;
  ridesPrev: number;
};

function addDaysUtc(d: Date, delta: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + delta);
  return x;
}

/** Partner nach Fahrtenanzahl am Tag; `prevBounds` = Vortag für Trend. */
export async function listAdminPartnerDayStats(
  bounds: AdminDayBounds,
  prevBounds: AdminDayBounds,
): Promise<AdminPartnerDayStatRow[]> {
  const db = getDb();
  if (!db) {
    const countRange = (from: Date, to: Date) => {
      const m = new Map<string, { n: number; rev: number }>();
      for (const r of memoryRides) {
        if (!r.companyId) continue;
        const t = rideAgendaTime(r);
        if (t < from || t > to) continue;
        const cur = m.get(r.companyId) ?? { n: 0, rev: 0 };
        cur.n += 1;
        if (r.status === "completed") {
          const amt = Number(r.finalFare ?? r.estimatedFare ?? 0);
          if (Number.isFinite(amt)) cur.rev += amt;
        }
        m.set(r.companyId, cur);
      }
      return m;
    };
    const curM = countRange(bounds.start, bounds.end);
    const prevM = countRange(prevBounds.start, prevBounds.end);
    const rows: AdminPartnerDayStatRow[] = [];
    for (const [companyId, v] of curM.entries()) {
      rows.push({
        companyId,
        companyName: companyId,
        ridesCount: v.n,
        completedRevenue: v.rev,
        ridesPrev: prevM.get(companyId)?.n ?? 0,
      });
    }
    return rows.sort((a, b) => b.ridesCount - a.ridesCount).slice(0, 12);
  }

  const rideDay = sql<Date>`coalesce(${ridesTable.scheduled_at}, ${ridesTable.created_at})`;

  const cur = await db
    .select({
      companyId: ridesTable.company_id,
      companyName: adminCompaniesTable.name,
      ridesCount: sql<number>`count(*)::int`,
      completedRevenue: sql<string>`coalesce(sum(case when ${ridesTable.status} = 'completed' then coalesce(${ridesTable.final_fare}, ${ridesTable.estimated_fare}) else 0 end), 0)`,
    })
    .from(ridesTable)
    .innerJoin(adminCompaniesTable, eq(ridesTable.company_id, adminCompaniesTable.id))
    .where(
      and(
        isNotNull(ridesTable.company_id),
        gte(rideDay, bounds.start),
        lte(rideDay, bounds.end),
      ),
    )
    .groupBy(ridesTable.company_id, adminCompaniesTable.name)
    .orderBy(desc(sql`count(*)`))
    .limit(12);

  const prev = await db
    .select({
      companyId: ridesTable.company_id,
      ridesCount: sql<number>`count(*)::int`,
    })
    .from(ridesTable)
    .where(
      and(
        isNotNull(ridesTable.company_id),
        gte(rideDay, prevBounds.start),
        lte(rideDay, prevBounds.end),
      ),
    )
    .groupBy(ridesTable.company_id);

  const prevMap = new Map(prev.map((p) => [String(p.companyId), Number(p.ridesCount ?? 0)]));

  return cur.map((row) => ({
    companyId: String(row.companyId),
    companyName: row.companyName ?? String(row.companyId),
    ridesCount: Number(row.ridesCount ?? 0),
    completedRevenue: Number(row.completedRevenue ?? 0),
    ridesPrev: prevMap.get(String(row.companyId)) ?? 0,
  }));
}

/** Vortag (UTC) zu `bounds`. */
export function adminPreviousDayBounds(bounds: AdminDayBounds): AdminDayBounds {
  const start = addDaysUtc(bounds.start, -1);
  const end = addDaysUtc(bounds.end, -1);
  return { start, end };
}

export async function updateRide(id: string, patch: Partial<RideRequest>): Promise<RideRequest | null> {
  const cur = await findRide(id);
  if (!cur) return null;
  const next: RideRequest = { ...cur, ...patch };
  const db = getDb();
  if (!db) {
    memoryRides = memoryRides.map((x) => (x.id === id ? next : x));
    return next;
  }
  await db.update(ridesTable).set(rideToUpdate(next)).where(eq(ridesTable.id, id));
  if (cur.status !== next.status) {
    await db.insert(rideEventsTable).values({
      id: makeEventId(),
      ride_id: id,
      event_type: "ride_status_changed",
      from_status: cur.status,
      to_status: next.status,
      actor_type: "system",
      actor_id: null,
      payload: {},
    });
  }
  return next;
}

export async function adminReleaseRide(id: string): Promise<RideRequest | null> {
  const cur = await findRide(id);
  if (!cur) return null;
  const nextStatus =
    cur.scheduledAt && isFarFutureReservation(cur.scheduledAt) ? "scheduled" : "pending";
  return updateRide(id, { driverId: null, status: nextStatus });
}

export async function resetRidesDemo(seed: RideRequest[]): Promise<void> {
  const db = getDb();
  if (!db) {
    memoryRides = [...seed];
    return;
  }
  await db.delete(ridesTable);
  if (seed.length > 0) {
    await db.insert(ridesTable).values(seed.map(rideToInsert));
  }
}
